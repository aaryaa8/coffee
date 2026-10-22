import { DurableObject } from "cloudflare:workers";
import { SEED } from "./seed.js";

/* ---------- Sip Log store ----------
   One Durable Object holds the whole shared log, keyed the same way the original
   artifact's storage was: "settings", "active:p1", "active:p2", "active:p3", "entry:<id>".
   p1 is Aaryaa, p2 Maitha and p3 Viva; each Sip Log page shows Aaryaa with one friend.
   Deleted coffees move to "trash:<id>" so a mistaken delete can be recovered, and
   "drinks" holds the drink names the two of you added beyond the presets. */

const ORIGINS = [
  /^https:\/\/coffee\.aaryaakamdar\.com$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

/* ---------- validation ---------- */
const WHO = new Set(["p1", "p2", "p3"]);
const isStr = (v, max) => typeof v === "string" && v.length <= max;
const isNum = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const isTz = (v) => isStr(v, 64) && /^[A-Za-z0-9_+\-/]+$/.test(v);
const isTime = (v) => isNum(v, 1.5e12, 4e12);

function cleanSip(v) {
  if (!v || !isStr(v.drink, 40) || !v.drink || !isNum(v.oz, 0, 64) || !isNum(v.shots, 0, 12) || !isTime(v.start)) return null;
  if (v.tz !== undefined && !isTz(v.tz)) return null;
  const milk = v.milk ?? "", sweetener = v.sweetener ?? "";
  if (!isStr(milk, 24) || !isStr(sweetener, 24)) return null;
  return { drink: v.drink, oz: v.oz, shots: v.shots, milk: milk.trim(), sweetener: sweetener.trim(), start: v.start, tz: v.tz };
}

function cleanEntry(v) {
  const sip = cleanSip(v);
  if (!sip || !isStr(v.id, 40) || !/^[0-9a-z-]{6,40}$/.test(v.id) || !WHO.has(v.who)) return null;
  if (!isTime(v.end) || v.end < v.start || v.end - v.start > 2 * 86400000) return null;
  if (!Number.isInteger(v.rating) || v.rating < 0 || v.rating > 5) return null;
  if (!isStr(v.note ?? "", 200)) return null;
  return { id: v.id, who: v.who, ...sip, end: v.end, rating: v.rating, note: v.note ?? "" };
}

const MAX_DRINKS = 16;
function cleanDrink(v) {
  const name = typeof v?.name === "string" ? v.name.trim() : "";
  if (!name || name.length > 24 || !isNum(v.oz, 0, 64) || !isNum(v.shots, 0, 12)) return null;
  return { name, oz: v.oz, shots: v.shots };
}
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

function cleanSettings(v) {
  const names = v?.names;
  if (!Array.isArray(names) || (names.length !== 2 && names.length !== 3) || !names.every((n) => isStr(n, 20) && n.trim())) return null;
  const tz = {};
  for (const k of WHO) {
    if (v.tz?.[k] === undefined) continue;
    if (!isTz(v.tz[k])) return null;
    tz[k] = v.tz[k];
  }
  return { names: names.map((n) => n.trim()), tz };
}

export class SipLog extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /* The first time the log is opened it starts with the coffees carried over from the artifact. */
    ctx.blockConcurrencyWhile(async () => {
      if (await ctx.storage.get("seeded")) return;
      await ctx.storage.put({
        seeded: true,
        settings: SEED.settings,
        ...Object.fromEntries(SEED.entries.map((e) => [`entry:${e.id}`, e])),
      });
    });
  }

  async state() {
    const [fixed, entries] = await Promise.all([
      this.ctx.storage.get(["settings", "active:p1", "active:p2", "active:p3", "drinks"]),
      this.ctx.storage.list({ prefix: "entry:" }),
    ]);
    return {
      settings: fixed.get("settings") ?? null,
      active: { p1: fixed.get("active:p1") ?? null, p2: fixed.get("active:p2") ?? null, p3: fixed.get("active:p3") ?? null },
      entries: [...entries.values()],
      drinks: fixed.get("drinks") ?? [],
    };
  }

  async apply(op, args = []) {
    const s = this.ctx.storage;
    const bad = (why) => ({ ok: false, error: why });
    switch (op) {
      case "setSettings": {
        const v = cleanSettings(args[0]);
        if (!v) return bad("those names don't look right");
        await s.put("settings", v);
        return { ok: true };
      }
      case "startSip": {
        const [who, raw] = args;
        const v = cleanSip(raw);
        if (!WHO.has(who) || !v) return bad("that sip doesn't look right");
        await s.put(`active:${who}`, v);
        return { ok: true };
      }
      case "cancelSip": {
        if (!WHO.has(args[0])) return bad("unknown person");
        await s.delete(`active:${args[0]}`);
        return { ok: true };
      }
      case "addEntry":
      case "finishSip": {
        const who = op === "finishSip" ? args[0] : args[0]?.who;
        const e = cleanEntry(op === "finishSip" ? args[1] : args[0]);
        if (!e || e.who !== who) return bad("that coffee doesn't look right");
        await s.put(`entry:${e.id}`, e);
        if (op === "finishSip") {
          /* Clears the running sip only when it is the one being finished. */
          const running = await s.get(`active:${who}`);
          if (running?.start === e.start) await s.delete(`active:${who}`);
        }
        return { ok: true };
      }
      case "updateEntry": {
        const e = cleanEntry(args[0]);
        const current = e && (await s.get(`entry:${e.id}`));
        if (!e || !current || current.who !== e.who) return bad("that coffee doesn't look right");
        await s.put(`entry:${e.id}`, e);
        return { ok: true };
      }
      case "restoreEntry": {
        const id = args[0]?.id;
        if (!isStr(id, 40)) return bad("unknown coffee");
        const t = await s.get(`trash:${id}`);
        if (t) {
          const { deletedAt, ...e } = t;
          await s.put(`entry:${id}`, e);
          await s.delete(`trash:${id}`);
        }
        return { ok: true };
      }
      case "addDrink": {
        const d = cleanDrink(args[0]);
        if (!d) return bad("that drink name doesn't look right");
        const list = ((await s.get("drinks")) || []).filter((x) => !sameName(x.name, d.name));
        if (list.length >= MAX_DRINKS) return bad(`you already have ${MAX_DRINKS} of your own drinks`);
        await s.put("drinks", [...list, d]);
        return { ok: true };
      }
      case "removeDrink": {
        if (!isStr(args[0], 24)) return bad("unknown drink");
        await s.put("drinks", ((await s.get("drinks")) || []).filter((x) => !sameName(x.name, args[0])));
        return { ok: true };
      }
      case "deleteEntry": {
        const id = args[0]?.id;
        if (!isStr(id, 40)) return bad("unknown coffee");
        const e = await s.get(`entry:${id}`);
        if (e) {
          await s.put(`trash:${id}`, { ...e, deletedAt: Date.now() });
          await s.delete(`entry:${id}`);
        }
        return { ok: true };
      }
      default:
        return bad("unknown action");
    }
  }
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin");
    const allowed = !!origin && ORIGINS.some((r) => r.test(origin));
    const cors = allowed
      ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" }
      : { Vary: "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    if (origin && !allowed) return json({ ok: false, error: "this site can't use the coffee log" }, 403, cors);

    const { pathname } = new URL(req.url);
    const log = env.LOG.get(env.LOG.idFromName("sip"));

    if (pathname === "/sip/state" && req.method === "GET") return json(await log.state(), 200, cors);

    if (pathname === "/sip/op" && req.method === "POST") {
      const text = await req.text();
      if (text.length > 8192) return json({ ok: false, error: "too large" }, 413, cors);
      let body;
      try { body = JSON.parse(text); } catch { return json({ ok: false, error: "not JSON" }, 400, cors); }
      const r = await log.apply(body?.op, Array.isArray(body?.args) ? body.args : []);
      return json(r, r.ok ? 200 : 400, cors);
    }

    return json({ ok: false, error: "not found" }, 404, cors);
  },
};
