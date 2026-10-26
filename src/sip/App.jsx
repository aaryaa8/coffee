import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { store } from "./store/index.js";
import { newId } from "./store/model.js";
import { getMe, setMe as saveMe, getCache, setCache } from "./device.js";
import { deviceTz, dayKey, shiftDay, weekdayShort, dateLabel, fmtTime, fmtTime24, tzShort, zonedTime } from "./time.js";
import { toCsv, downloadCsv } from "./csv.js";

/* ---------- palette ----------
   Oat paper, espresso and caramel for the two people, ink for text.
   Secondary text and hairlines are ink at lower alpha, never a second grey. */
const C = {
  oat: "#F5EFE4",
  latte: "#DCC6AB",
  caramel: "#B98D70",
  espresso: "#654735",
  ink: "#29241F",
  dim: "rgba(41, 36, 31, .68)",
  rule: "rgba(41, 36, 31, .14)",
  edge: "rgba(41, 36, 31, .30)",
};
const PCOL = { p1: C.espresso, p2: C.caramel, p3: "#A8875F" };

/* ---------- who this log is for ----------
   One shared database holds three people. /sip/ is Aaryaa with Maitha and /sip/viva/ is Aaryaa
   with Viva; each page shows only its own pair, while Aaryaa's coffees appear in both. */
const FRIEND = /^\/sip\/viva(\/|$)/.test(location.pathname) ? "p3" : "p2";
const PAIR = ["p1", FRIEND];
const IDX = { p1: 0, p2: 1, p3: 2 };
const DEFAULT_NAMES = { p1: "Aaryaa", p2: "Maitha", p3: "Viva" };
const FONT = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
/* Anton for titles and big numbers; the system sans keeps buttons and small text easy to read. */
const DISPLAY = { fontFamily: `"Anton", Impact, "Arial Narrow", sans-serif`, fontWeight: 400, letterSpacing: ".01em" };

/* ---------- helpers ---------- */
const DRINKS = {
  Espresso: [2, 1], "Double Espresso": [2, 2], Americano: [12, 2], "Flat White": [8, 2],
  Latte: [12, 2], Cappuccino: [6, 2], Cortado: [4, 2], Macchiato: [3, 1], Mocha: [12, 2],
  "Drip Coffee": [12, 1], "Cold Brew": [16, 1], "Iced Latte": [16, 2], "Iced Americano": [16, 2], Other: [8, 1],
};
const SIZES = [2, 4, 6, 8, 12, 16, 20];
const isPreset = (name) => Object.keys(DRINKS).some((d) => d.toLowerCase() === name.trim().toLowerCase());
/** Presets, then the drinks the two of you added, with Other last. */
const drinkNames = (custom) => [...Object.keys(DRINKS).filter((d) => d !== "Other"), ...custom.map((d) => d.name), "Other"];
const MILKS = ["Regular", "Oat", "Almond", "Soy"];
const SWEETENERS = ["Sugar", "Honey", "Vanilla syrup"];
const BLACK = new Set(["Espresso", "Double Espresso", "Americano", "Drip Coffee", "Cold Brew", "Iced Americano"]);
const LAST_MILK = "sip:last-milk";
const lastMilk = () => { try { return localStorage.getItem(LAST_MILK) || "Regular"; } catch { return "Regular"; } };
/** "Oat milk · Honey", for a coffee's details line. */
const extras = (c) => [c.milk && (/milk$/i.test(c.milk) ? c.milk : `${c.milk} milk`), c.sweetener].filter(Boolean).join(" · ");
/** A chip row value ("None", a preset, or "Other" plus typed text) as the stored string. */
const chosen = (value, other) => (value === "None" ? "" : value === "Other" ? other.trim() : value);
const drinkDefaults = (name, custom) => {
  const c = custom.find((d) => d.name === name);
  return c ? [c.oz, c.shots] : DRINKS[name] || DRINKS.Other;
};
const durMin = (e) => (e.end - e.start) / 60000;
const nameOf = (names, k) => names?.[IDX[k]] || DEFAULT_NAMES[k];
const tzOf = (settings, k) => settings?.tz?.[k] || deviceTz();
const entryDay = (e) => dayKey(e.start, e.tz || deviceTz());
/** Each person's own calendar date right now, in their own time zone. */
const todays = (settings, now) => Object.fromEntries(PAIR.map((k) => [k, dayKey(now, tzOf(settings, k))]));
function fmtDur(min) {
  if (min == null || isNaN(min)) return "–";
  if (min < 1) return `${Math.max(1, Math.round(min * 60))} sec`;
  if (min >= 60) return `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;
  return `${Math.round(min * 10) / 10} min`;
}
function fmtClock(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

/* ---------- small UI pieces ---------- */
function Cup({ steam, size = 52 }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <g className={steam ? "steam" : ""} stroke={C.caramel} strokeWidth="3" strokeLinecap="round" fill="none" opacity={steam ? 1 : 0.4}>
        <path d="M22 17c-3-3 3-5 0-9" /><path d="M32 17c-3-3 3-5 0-9" /><path d="M42 17c-3-3 3-5 0-9" />
      </g>
      <path d="M12 24h40v12a16 16 0 0 1-16 16h-8a16 16 0 0 1-16-16z" fill={C.latte} />
      <path d="M52 28h4a6 6 0 0 1 0 12h-5" fill="none" stroke={C.latte} strokeWidth="4" />
      <rect x="8" y="56" width="48" height="4" rx="2" fill={C.espresso} />
    </svg>
  );
}

function Chip({ on, children, onClick, wide }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={!!on}
      style={{
        minHeight: 44, padding: "0 14px", borderRadius: 999, fontFamily: FONT, fontSize: 15, fontWeight: 500,
        border: `1px solid ${on ? C.espresso : C.edge}`, background: on ? C.espresso : "transparent",
        color: on ? C.oat : C.ink, cursor: "pointer", flex: wide ? "1 1 45%" : "0 0 auto",
      }}
    >
      {children}
    </button>
  );
}

function Big({ children, onClick, tone = "green", disabled }) {
  const bg = tone === "green" ? C.espresso : tone === "caramel" ? C.caramel : "transparent";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", minHeight: 56, borderRadius: 14, border: tone === "ghost" ? `1px solid ${C.edge}` : "none",
        background: bg, color: tone === "ghost" ? C.ink : tone === "caramel" ? C.ink : C.oat,
        fontFamily: FONT, fontSize: 17, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

/* The cup icon leads back to coffee.aaryaakamdar.com. */
const homeLink = { display: "inline-flex", lineHeight: 0, borderRadius: 8 };
const label = { fontSize: 13, fontWeight: 600, color: C.dim, margin: "22px 0 10px", letterSpacing: ".02em" };
const row = { display: "flex", flexWrap: "wrap", gap: 8 };
const card = { background: "transparent", borderRadius: 14, padding: 16, border: `1px solid ${C.rule}` };
const dot = (color) => ({ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: color, marginRight: 6, verticalAlign: 1 });
const textInput = {
  width: "100%", minHeight: 50, borderRadius: 12, border: `1px solid ${C.edge}`, padding: "0 14px",
  fontFamily: FONT, fontSize: 17, boxSizing: "border-box", background: "transparent", color: C.ink,
};
const timeInput = {
  width: "100%", boxSizing: "border-box", minHeight: 48, borderRadius: 12, border: `1px solid ${C.edge}`,
  padding: "0 12px", fontFamily: FONT, fontSize: 16, color: C.ink, background: "transparent", marginTop: 4,
};

/* ---------- first-run setup ---------- */
function Setup({ onSave }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}><Cup steam size={84} /></div>
      <h1 style={{ ...DISPLAY, textAlign: "center", fontSize: 44, margin: "8px 0 4px", color: C.ink }}>Sip Log</h1>
      <p style={{ textAlign: "center", color: C.dim, margin: "0 0 24px" }}>
        Who is logging coffees? You can change these later.
      </p>
      <div style={label}>First person</div>
      <input style={textInput} value={a} onChange={(e) => setA(e.target.value)} placeholder="Your name" maxLength={20} />
      <div style={label}>Second person</div>
      <input style={textInput} value={b} onChange={(e) => setB(e.target.value)} placeholder="Your friend's name" maxLength={20} />
      <div style={{ height: 24 }} />
      <Big disabled={!a.trim() || !b.trim() || a.trim() === b.trim()} onClick={() => onSave([a.trim(), b.trim()])}>
        Start logging
      </Big>
      <p style={{ color: C.dim, fontSize: 13, textAlign: "center", marginTop: 16 }}>
        Everything you log here is shared with anyone who opens this app.
      </p>
    </div>
  );
}

/* ---------- Log tab ---------- */
function LogTab({ me, names, active, entries, drinks, act, flash, onSaved }) {
  const mine = active[me];
  const otherKey = me === "p1" ? FRIEND : "p1";
  const theirs = active[otherKey];
  const [drink, setDrink] = useState("Flat White");
  const [customName, setCustomName] = useState("");
  const [oz, setOz] = useState(8);
  const [shots, setShots] = useState(2);
  const [milk, setMilk] = useState(lastMilk);
  const [milkOther, setMilkOther] = useState("");
  const [sweet, setSweet] = useState("None");
  const [sweetOther, setSweetOther] = useState("");
  const [past, setPast] = useState(false);
  const [date, setDate] = useState(() => dayKey(Date.now()));
  const hm = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const [st, setSt] = useState(() => hm(Date.now() - 20 * 60000));
  const [et, setEt] = useState(() => hm(Date.now()));
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(Date.now());
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [earlierAt, setEarlierAt] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* Black drinks start with no milk; milky ones start with the milk used last on this phone. */
  const pick = (d) => {
    const [o, sh] = drinkDefaults(d, drinks);
    setDrink(d); setOz(o); setShots(sh);
    if (BLACK.has(d)) setMilk("None");
    else if (isPreset(d) && d !== "Other") setMilk(lastMilk());
  };
  const milkName = chosen(milk, milkOther);
  const sweetName = chosen(sweet, sweetOther);
  const rememberMilk = () => { try { if (milkName) localStorage.setItem(LAST_MILK, MILKS.includes(milkName) ? milkName : "Regular"); } catch { /* ignore */ } };
  /* "Other" with a typed name becomes that drink, and the name is kept as a new button for both of you. */
  const drinkName = drink === "Other" ? customName.trim() || "Other" : drink;
  const rememberDrink = async () => {
    if (drink !== "Other" || !customName.trim() || isPreset(customName)) return;
    await act("addDrink", { name: customName.trim(), oz, shots });
    setDrink(customName.trim()); setCustomName("");
  };

  /* Runs one save at a time, so a double tap can't log the same coffee twice. */
  const once = (fn) => async () => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const start = once(async () => {
    if (await act("startSip", me, { drink: drinkName, oz, shots, milk: milkName, sweetener: sweetName, start: Date.now(), tz: deviceTz() })) {
      rememberMilk();
      await rememberDrink();
    }
  });

  const makeEntry = (base, startMs, endMs, tz) => ({
    id: newId(), who: me, drink: base.drink, oz: base.oz, shots: base.shots,
    milk: base.milk || "", sweetener: base.sweetener || "",
    start: startMs, end: endMs, rating, note: note.trim(), tz,
  });

  const finishAt = async (endMs) => {
    if (await act("finishSip", me, makeEntry(mine, mine.start, endMs, mine.tz || deviceTz()))) {
      setRating(0); setNote(""); setConfirmCancel(false); setEarlierAt("");
      flash(`Finished: ${mine.drink} in ${fmtDur((endMs - mine.start) / 60000)}`);
    }
  };
  const finish = once(() => finishAt(Date.now()));

  /* For a sip left running: the chosen clock time, on the most recent day it has happened. */
  const finishEarlier = once(async () => {
    const tz = mine.tz || deviceTz();
    const t0 = Date.now();
    let t = zonedTime(dayKey(t0, tz), earlierAt, tz);
    if (t > t0) t -= 86400000;
    if (!earlierAt || isNaN(t) || t <= mine.start) { flash(`Pick a time after you started at ${fmtTime(mine.start, tz)}.`); return; }
    await finishAt(t);
  });

  const cancel = once(async () => {
    if (await act("cancelSip", me)) setConfirmCancel(false);
  });

  const savePast = once(async () => {
    const s = new Date(`${date}T${st}`).getTime();
    let e = new Date(`${date}T${et}`).getTime();
    if (!date || !st || !et || isNaN(s) || isNaN(e)) { flash("Pick a date, start time and finish time first."); return; }
    if (e <= s) e += 86400000;
    if (await act("addEntry", makeEntry({ drink: drinkName, oz, shots, milk: milkName, sweetener: sweetName }, s, e, deviceTz()))) {
      rememberMilk();
      await rememberDrink();
      setRating(0); setNote(""); setPast(false);
      flash(`Saved: ${drinkName}, ${fmtDur((e - s) / 60000)}`);
      if (onSaved) onSaved();
    }
  });

  const todayCount = entries.filter((e) => e.who === me && entryDay(e) === dayKey(now)).length;

  const noteInput = (
    <input
      value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" maxLength={80}
      style={{ width: "100%", boxSizing: "border-box", marginTop: 12, minHeight: 48, borderRadius: 12, border: `1px solid ${C.edge}`, padding: "0 14px", fontFamily: FONT, fontSize: 16, color: C.ink, background: "transparent" }}
    />
  );
  const ratingChips = (
    <div style={row}>
      {[1, 2, 3, 4, 5].map((n) => <Chip key={n} on={rating === n} onClick={() => setRating(rating === n ? 0 : n)}>{n}</Chip>)}
    </div>
  );

  const theirClock = theirs && fmtClock(Math.max(0, Math.floor((now - theirs.start) / 1000)));
  const friendBanner = theirs && (
    <div style={{ ...card, background: C.latte, border: "none", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <span className="pulse" style={{ width: 10, height: 10, flex: "0 0 10px", borderRadius: 5, background: PCOL[otherKey] }} />
      {mine ? (
        <span style={{ fontSize: 15 }}>
          <b>Sipping together.</b> {nameOf(names, otherKey)} has a {theirs.drink} going too · {theirClock}
        </span>
      ) : (
        <span style={{ fontSize: 15 }}>
          <b>{nameOf(names, otherKey)}</b> is sipping {theirs.drink} · {theirClock}
        </span>
      )}
    </div>
  );

  /* active sip view */
  if (mine) {
    const secs = Math.max(0, Math.floor((now - mine.start) / 1000));
    return (
      <div style={{ padding: 16 }}>
        {friendBanner}
        <div style={{ ...card, textAlign: "center", padding: "28px 16px" }}>
          <Cup steam size={72} />
          <div style={{ color: C.dim, fontSize: 15, marginTop: 4 }}>
            {mine.drink} · {mine.oz} oz · {mine.shots} {mine.shots === 1 ? "shot" : "shots"}{extras(mine) ? ` · ${extras(mine)}` : ""}
          </div>
          <div style={{ ...DISPLAY, fontSize: 72, color: C.ink, fontVariantNumeric: "tabular-nums", margin: "6px 0" }}>
            {fmtClock(secs)}
          </div>
          <div style={{ color: C.dim, fontSize: 14 }}>Started {fmtTime(mine.start)}</div>
        </div>
        {secs >= 3600 && (
          <div style={{ ...card, background: C.latte, border: "none", marginTop: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Forgot to finish?</div>
            <div style={{ fontSize: 14, color: C.dim, margin: "4px 0 10px" }}>
              This sip has been running for {fmtDur(secs / 60)}. If you finished earlier, pick the time.
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <input type="time" value={earlierAt} onChange={(e) => setEarlierAt(e.target.value)} aria-label="Time you finished"
                style={{ ...timeInput, marginTop: 0, flex: 1, minWidth: 0, borderColor: C.edge }} />
              <button onClick={finishEarlier} disabled={busy || !earlierAt}
                style={{ flex: "0 0 auto", minHeight: 48, padding: "0 16px", borderRadius: 12, border: "none", background: C.ink, color: C.oat, fontFamily: FONT, fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: busy || !earlierAt ? 0.45 : 1 }}>
                Finish then
              </button>
            </div>
          </div>
        )}
        <div style={label}>Rating (optional)</div>
        {ratingChips}
        {noteInput}
        <div style={{ height: 18 }} />
        <Big tone="caramel" onClick={finish} disabled={busy}>Finish sip</Big>
        <div style={{ height: 10 }} />
        {confirmCancel ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Big tone="ghost" onClick={() => setConfirmCancel(false)}>Keep sipping</Big>
            <Big tone="ghost" onClick={cancel} disabled={busy}>Discard this sip</Big>
          </div>
        ) : (
          <Big tone="ghost" onClick={() => setConfirmCancel(true)}>Cancel sip</Big>
        )}
      </div>
    );
  }

  /* new coffee form */
  return (
    <div style={{ padding: 16 }}>
      {friendBanner}
      <div style={{ color: C.dim, fontSize: 15 }}>
        {todayCount === 0 ? "No coffees logged today yet." : `${todayCount} ${todayCount === 1 ? "coffee" : "coffees"} logged today.`}
      </div>

      <div style={label} id="lbl-drink">Drink</div>
      <div style={row} role="group" aria-labelledby="lbl-drink">
        {drinkNames(drinks).map((d) => <Chip key={d} on={drink === d} onClick={() => pick(d)}>{d}</Chip>)}
      </div>
      {drink === "Other" && (
        <input value={customName} onChange={(e) => setCustomName(e.target.value)} maxLength={24}
          placeholder="Name it, like Spanish Latte or Karak" aria-label="Drink name"
          style={{ ...textInput, marginTop: 10, fontSize: 16, minHeight: 48 }} />
      )}

      <div style={label} id="lbl-size">Size (oz)</div>
      <div style={row} role="group" aria-labelledby="lbl-size">
        {SIZES.map((s) => <Chip key={s} on={oz === s} onClick={() => setOz(s)}>{s}</Chip>)}
      </div>

      <div style={label} id="lbl-shots">Shots of espresso</div>
      <div style={row} role="group" aria-labelledby="lbl-shots">
        {[1, 2, 3, 4].map((s) => <Chip key={s} on={shots === s} onClick={() => setShots(s)}>{s}</Chip>)}
      </div>

      <div style={label} id="lbl-milk">Milk</div>
      <div style={row} role="group" aria-labelledby="lbl-milk">
        {["None", ...MILKS, "Other"].map((m) => <Chip key={m} on={milk === m} onClick={() => setMilk(m)}>{m}</Chip>)}
      </div>
      {milk === "Other" && (
        <input value={milkOther} onChange={(e) => setMilkOther(e.target.value)} maxLength={24} placeholder="Which milk? Coconut, cashew…" aria-label="Milk name"
          style={{ ...textInput, marginTop: 10, fontSize: 16, minHeight: 48 }} />
      )}

      <div style={label} id="lbl-sweet">Sweetener</div>
      <div style={row} role="group" aria-labelledby="lbl-sweet">
        {["None", ...SWEETENERS, "Other"].map((m) => <Chip key={m} on={sweet === m} onClick={() => setSweet(m)}>{m}</Chip>)}
      </div>
      {sweet === "Other" && (
        <input value={sweetOther} onChange={(e) => setSweetOther(e.target.value)} maxLength={24} placeholder="Which one? Caramel, maple…" aria-label="Sweetener name"
          style={{ ...textInput, marginTop: 10, fontSize: 16, minHeight: 48 }} />
      )}

      {past && (
        <div style={{ ...card, marginTop: 18 }}>
          <div style={{ ...label, margin: "0 0 8px" }}>When did you drink it?</div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={timeInput} aria-label="Date" />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <label style={{ flex: 1, fontSize: 13, color: C.dim }}>Start
              <input type="time" value={st} onChange={(e) => setSt(e.target.value)} style={timeInput} />
            </label>
            <label style={{ flex: 1, fontSize: 13, color: C.dim }}>Finish
              <input type="time" value={et} onChange={(e) => setEt(e.target.value)} style={timeInput} />
            </label>
          </div>
          <div style={{ ...label, margin: "14px 0 8px" }}>Rating (optional)</div>
          {ratingChips}
          {noteInput}
        </div>
      )}

      <div style={{ height: 22 }} />
      {past ? (
        <>
          <Big onClick={savePast} disabled={busy}>Save coffee</Big>
          <div style={{ height: 10 }} />
          <Big tone="ghost" onClick={() => setPast(false)}>Use the live timer instead</Big>
        </>
      ) : (
        <>
          <Big onClick={start} disabled={busy}>Start sip</Big>
          <div style={{ height: 10 }} />
          <Big tone="ghost" onClick={() => setPast(true)}>Log a coffee I already finished</Big>
        </>
      )}
    </div>
  );
}

/* ---------- Entry editor ----------
   Times are edited in the time zone the coffee was drunk in. */
const selectInput = { ...timeInput, marginTop: 4, appearance: "auto" };
function EntryEditor({ e, drinks, onSave, onCancel }) {
  const tz = e.tz || deviceTz();
  const [drink, setDrink] = useState(e.drink);
  const [oz, setOz] = useState(e.oz);
  const [shots, setShots] = useState(e.shots);
  const [date, setDate] = useState(dayKey(e.start, tz));
  const [st, setSt] = useState(fmtTime24(e.start, tz));
  const [et, setEt] = useState(fmtTime24(e.end, tz));
  const [rating, setRating] = useState(e.rating || 0);
  const [note, setNote] = useState(e.note || "");
  const [milk, setMilk] = useState(e.milk || "");
  const [sweetener, setSweetener] = useState(e.sweetener || "");
  const [busy, setBusy] = useState(false);
  const names = drinkNames(drinks).filter((d) => d !== "Other");
  const options = names.includes(e.drink) ? names : [e.drink, ...names];
  const field = { flex: 1, minWidth: 0, fontSize: 13, color: C.dim };

  const save = async () => {
    const start = zonedTime(date, st, tz);
    let end = zonedTime(date, et, tz);
    if (!date || !st || !et || isNaN(start) || isNaN(end)) return;
    if (end <= start) end += 86400000;
    setBusy(true);
    await onSave({ ...e, drink, oz: Number(oz), shots: Number(shots), milk: milk.trim(), sweetener: sweetener.trim(), start, end, rating, note: note.trim() });
    setBusy(false);
  };

  return (
    <div style={{ ...card, padding: 14, marginBottom: 8, borderColor: C.edge }}>
      <div style={{ display: "flex", gap: 8 }}>
        <label style={{ ...field, flex: 2 }}>Drink
          <select value={drink} onChange={(ev) => setDrink(ev.target.value)} style={selectInput}>
            {options.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label style={field}>Oz
          <select value={oz} onChange={(ev) => setOz(ev.target.value)} style={selectInput}>
            {[...new Set([...SIZES, e.oz])].sort((a, b) => a - b).map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <label style={field}>Shots
          <select value={shots} onChange={(ev) => setShots(ev.target.value)} style={selectInput}>
            {[...new Set([0, 1, 2, 3, 4, e.shots])].sort((a, b) => a - b).map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <ChoiceField label="Milk" value={milk} onChange={setMilk} presets={MILKS} />
        <ChoiceField label="Sweetener" value={sweetener} onChange={setSweetener} presets={SWEETENERS} />
      </div>
      <label style={{ ...field, display: "block", marginTop: 10 }}>Date
        <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} style={timeInput} />
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <label style={field}>Start
          <input type="time" value={st} onChange={(ev) => setSt(ev.target.value)} style={timeInput} />
        </label>
        <label style={field}>Finish
          <input type="time" value={et} onChange={(ev) => setEt(ev.target.value)} style={timeInput} />
        </label>
      </div>
      {tz !== deviceTz() && <div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>Times are in {tzShort(tz, e.start)}, where this coffee was drunk.</div>}
      <div style={{ ...label, margin: "14px 0 8px" }}>Rating</div>
      <div style={row}>
        {[1, 2, 3, 4, 5].map((n) => <Chip key={n} on={rating === n} onClick={() => setRating(rating === n ? 0 : n)}>{n}</Chip>)}
      </div>
      <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Note (optional)" maxLength={80} aria-label="Note"
        style={{ ...timeInput, marginTop: 12 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Big tone="ghost" onClick={onCancel}>Cancel</Big>
        <Big onClick={save} disabled={busy || !date || !st || !et}>Save</Big>
      </div>
    </div>
  );
}

/* A dropdown of presets with None and Other; Other opens a text box for any name. */
function ChoiceField({ label: text, value, onChange, presets }) {
  const [typing, setTyping] = useState(!!value && !presets.includes(value));
  const sel = typing ? "__other" : value || "";
  return (
    <label style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.dim }}>{text}
      <select value={sel} style={selectInput}
        onChange={(ev) => { const v = ev.target.value; if (v === "__other") { setTyping(true); onChange(""); } else { setTyping(false); onChange(v); } }}>
        <option value="">None</option>
        {presets.map((p) => <option key={p} value={p}>{p}</option>)}
        <option value="__other">Other…</option>
      </select>
      {typing && <input value={value} onChange={(ev) => onChange(ev.target.value)} maxLength={24} placeholder="Type it" aria-label={`${text} name`} style={timeInput} />}
    </label>
  );
}

/* ---------- Entry row ---------- */
const textButton = { border: "none", background: "none", fontFamily: FONT, fontSize: 13, minHeight: 36, padding: "0 2px", cursor: "pointer" };
function EntryRow({ e, names, drinks, onDelete, onUpdate }) {
  const [ask, setAsk] = useState(false);
  const [editing, setEditing] = useState(false);
  const tz = e.tz || deviceTz();
  const zone = tz !== deviceTz() ? ` (${tzShort(tz, e.start)})` : "";
  if (editing) {
    return <EntryEditor e={e} drinks={drinks} onCancel={() => setEditing(false)} onSave={async (next) => { if (await onUpdate(next)) setEditing(false); }} />;
  }
  return (
    <div style={{ ...card, padding: 12, display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
      <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: PCOL[e.who] }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{e.drink}</div>
        <div style={{ color: C.dim, fontSize: 13 }}>
          {nameOf(names, e.who)} · {e.oz} oz · {e.shots} {e.shots === 1 ? "shot" : "shots"}{extras(e) ? ` · ${extras(e)}` : ""}
        </div>
        <div style={{ color: C.dim, fontSize: 13 }}>
          {fmtTime(e.start, tz)} to {fmtTime(e.end, tz)}{zone}{e.rating ? ` · rated ${e.rating}/5` : ""}
        </div>
        {e.note ? <div style={{ fontSize: 13, marginTop: 2, overflowWrap: "anywhere" }}>{e.note}</div> : null}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontWeight: 600, color: C.ink, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{fmtDur(durMin(e))}</div>
        {ask ? (
          <button onClick={() => onDelete(e)} style={{ ...textButton, color: C.espresso, fontWeight: 700, textDecoration: "underline" }}>
            Confirm delete
          </button>
        ) : (
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button onClick={() => setEditing(true)} aria-label={`Edit ${e.drink}`} style={{ ...textButton, color: C.dim }}>Edit</button>
            <button onClick={() => setAsk(true)} aria-label={`Delete ${e.drink}`} style={{ ...textButton, color: C.dim }}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Today tab ---------- */
function TodayTab({ entries, names, settings, drinks, onDelete, onUpdate }) {
  const now = Date.now();
  const today = todays(settings, now);
  const mineToday = dayKey(now);
  const list = entries.filter((e) => entryDay(e) === today[e.who]);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 10 }}>
        {PAIR.map((k) => {
          const theirs = list.filter((e) => e.who === k);
          return (
            <div key={k} style={{ ...card, flex: 1, minWidth: 0 }}>
              <div style={{ color: C.dim, fontSize: 14, fontWeight: 500 }}><span style={dot(PCOL[k])} />{nameOf(names, k)}</div>
              <div style={{ ...DISPLAY, fontSize: 40, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{theirs.length}</div>
              <div style={{ color: C.dim, fontSize: 13 }}>
                {theirs.reduce((a, e) => a + e.oz, 0)} oz · {plural(theirs.reduce((a, e) => a + e.shots, 0), "shot")}
              </div>
              {today[k] !== mineToday && (
                <div style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>Their today: {dateLabel(today[k])}</div>
              )}
            </div>
          );
        })}
      </div>
      <div style={label}>Today's coffees</div>
      {list.length === 0 ? (
        <div style={{ ...card, color: C.dim, textAlign: "center" }}>Nothing yet. Head to Log and start a sip.</div>
      ) : (
        list.map((e) => <EntryRow key={e.id} e={e} names={names} drinks={drinks} onDelete={onDelete} onUpdate={onUpdate} />)
      )}
    </div>
  );
}

/* ---------- Week tab ---------- */
function WeekTab({ entries, names, settings, drinks, saveNames, removeDrink, flash }) {
  /* The name fields follow saved changes from the other phone until you start typing. */
  const [draft, setDraft] = useState(null);
  const n1 = draft ? draft[0] : nameOf(names, "p1");
  const n2 = draft ? draft[1] : nameOf(names, FRIEND);
  const edit = (i, v) => setDraft((d) => { const next = [...(d || [n1, n2])]; next[i] = v; return next; });
  const [csv, setCsv] = useState("");

  /* Seven calendar days per person, each ending on that person's own today. */
  const now = Date.now();
  const today = todays(settings, now);
  const viewerToday = dayKey(now);
  const windows = useMemo(() => {
    const w = Object.fromEntries(PAIR.map((k) => [k, new Set()]));
    for (let i = 0; i < 7; i++) PAIR.forEach((k) => w[k].add(shiftDay(today[k], -i)));
    return w;
  }, [today.p1, today[FRIEND]]);
  const wk = useMemo(() => entries.filter((e) => windows[e.who].has(entryDay(e))), [entries, windows]);

  const days = useMemo(() => {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const key = shiftDay(viewerToday, -i);
      out.push({
        key, short: weekdayShort(key),
        ...Object.fromEntries(PAIR.map((k) => [k, wk.filter((e) => e.who === k && entryDay(e) === shiftDay(today[k], -i)).length])),
      });
    }
    return out;
  }, [wk, viewerToday, today.p1, today[FRIEND]]);
  const maxDay = Math.max(1, ...days.map((d) => Math.max(...PAIR.map((k) => d[k]))));
  /* Whole-cup ticks: every cup up to 6, then about four evenly spaced steps. */
  const PLOT = 96;
  const step = maxDay <= 6 ? 1 : Math.ceil(maxDay / 4);
  const top = Math.max(2, step * Math.ceil(maxDay / step));
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  /* Coffees of yours and your friend's whose times overlapped. */
  const together = useMemo(() => {
    const a = wk.filter((e) => e.who === "p1"), b = wk.filter((e) => e.who === FRIEND);
    return a.reduce((n, x) => n + b.filter((y) => x.start < y.end && y.start < x.end).length, 0);
  }, [wk]);

  const byDrink = useMemo(() => {
    const m = {};
    wk.forEach((e) => { (m[e.drink] = m[e.drink] || []).push(e); });
    return Object.entries(m)
      .map(([drink, arr]) => ({ drink, n: arr.length, avgMin: avg(arr.map(durMin)) }))
      .sort((a, b) => b.n - a.n);
  }, [wk]);

  const download = () => {
    downloadCsv(toCsv(entries, (k) => nameOf(names, k)), `sip-log-${viewerToday}.csv`);
    flash("CSV downloaded.");
  };
  const copy = async () => {
    const text = toCsv(entries, (k) => nameOf(names, k));
    setCsv(text);
    try { await navigator.clipboard.writeText(text); flash("Copied. Paste it into any spreadsheet."); } catch { flash("Select the text below and copy it."); }
  };
  const save = async () => {
    const full = ["p1", "p2", "p3"].map((k) => nameOf(names, k));
    full[0] = n1.trim();
    full[IDX[FRIEND]] = n2.trim();
    if (await saveNames(full)) setDraft(null);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 10 }}>
        {PAIR.map((k) => {
          const theirs = wk.filter((e) => e.who === k);
          const durs = theirs.map(durMin);
          return (
            <div key={k} style={{ ...card, flex: 1, minWidth: 0 }}>
              <div style={{ color: C.dim, fontSize: 14, fontWeight: 500 }}><span style={dot(PCOL[k])} />{nameOf(names, k)}</div>
              <div style={{ ...DISPLAY, fontSize: 40, fontVariantNumeric: "tabular-nums" }}>{theirs.length}</div>
              <div style={{ color: C.dim, fontSize: 13 }}>coffees this week</div>
              <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
                Avg sip: <b>{fmtDur(avg(durs))}</b><br />
                Longest: <b>{durs.length ? fmtDur(Math.max(...durs)) : "–"}</b><br />
                Total: <b>{theirs.reduce((a, e) => a + e.oz, 0)} oz</b>
              </div>
            </div>
          );
        })}
      </div>

      <div style={label}>Coffees per day</div>
      <div style={{ ...card, paddingTop: 12 }}>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>cups</div>
        <div style={{ display: "flex", gap: 8 }}>
          {/* y-axis: cups, in whole numbers */}
          <div style={{ position: "relative", width: 18, height: PLOT, flex: "0 0 18px" }} aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} style={{ position: "absolute", right: 0, bottom: (t / top) * PLOT, transform: "translateY(50%)", fontSize: 11, color: C.dim, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{t}</span>
            ))}
          </div>
          <div style={{ position: "relative", flex: 1, height: PLOT, display: "flex", alignItems: "flex-end" }}>
            {ticks.map((t) => (
              <div key={t} style={{ position: "absolute", left: 0, right: 0, bottom: (t / top) * PLOT, borderTop: `1px solid ${t === 0 ? C.edge : C.rule}` }} />
            ))}
            {days.map((d) => (
              <div key={d.key} style={{ position: "relative", flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 3, height: "100%" }}>
                {PAIR.map((k) => (
                  <div key={k} title={`${nameOf(names, k)}: ${plural(d[k], "cup")}`} style={{ width: 10, height: (d[k] / top) * PLOT, background: PCOL[k], borderRadius: "2px 2px 0 0" }} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <div style={{ width: 18, flex: "0 0 18px" }} />
          <div style={{ flex: 1, display: "flex" }}>
            {days.map((d) => <div key={d.key} style={{ flex: 1, textAlign: "center", fontSize: 11, color: C.dim }}>{d.short}</div>)}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 13, color: C.dim, marginTop: 8 }}>
        {PAIR.map((k) => <span key={k}><span style={dot(PCOL[k])} />{nameOf(names, k)}</span>)}
      </div>

      <div style={{ ...card, marginTop: 14, display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ ...DISPLAY, fontSize: 32, fontVariantNumeric: "tabular-nums" }}>{together}</span>
        <span style={{ fontSize: 14, color: C.dim }}>
          {together === 1 ? "time you sipped together this week" : "times you sipped together this week"}
        </span>
      </div>

      <div style={label}>How long each drink takes</div>
      {byDrink.length === 0 ? (
        <div style={{ ...card, color: C.dim }}>Log a few coffees to compare drinks.</div>
      ) : (
        <div style={card}>
          {byDrink.map((d, i) => (
            <div key={d.drink} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: i ? `1px solid ${C.rule}` : "none" }}>
              <span style={{ fontWeight: 600 }}>{d.drink} <span style={{ color: C.dim, fontWeight: 400, fontSize: 13 }}>× {d.n}</span></span>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtDur(d.avgMin)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={label}>Names</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={n1} onChange={(e) => edit(0, e.target.value)} maxLength={20} aria-label="First person's name" style={{ ...timeInput, marginTop: 0, flex: 1, minWidth: 0 }} />
        <input value={n2} onChange={(e) => edit(1, e.target.value)} maxLength={20} aria-label="Second person's name" style={{ ...timeInput, marginTop: 0, flex: 1, minWidth: 0 }} />
      </div>
      <div style={{ height: 8 }} />
      <Big tone="ghost" disabled={!draft || !n1.trim() || !n2.trim() || n1.trim() === n2.trim()} onClick={save}>Save names</Big>

      {drinks.length > 0 && (
        <>
          <div style={label}>Drinks you added</div>
          <div style={card}>
            {drinks.map((d, i) => (
              <div key={d.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: i ? `1px solid ${C.rule}` : "none" }}>
                <span>{d.name} <span style={{ color: C.dim, fontSize: 13 }}>{d.oz} oz · {plural(d.shots, "shot")}</span></span>
                <button onClick={() => removeDrink(d.name)} aria-label={`Remove ${d.name}`} style={{ ...textButton, color: C.dim }}>Remove</button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={label}>Take your data with you</div>
      <Big tone="ghost" onClick={download}>Download all coffees as CSV</Big>
      <div style={{ height: 10 }} />
      <Big tone="ghost" onClick={copy}>Copy all coffees as CSV</Big>
      {csv && (
        <textarea readOnly value={csv} onFocus={(e) => e.target.select()} aria-label="Coffees as CSV"
          style={{ width: "100%", boxSizing: "border-box", height: 120, marginTop: 10, borderRadius: 12, border: `1px solid ${C.edge}`, padding: 10, fontSize: 12, fontFamily: "ui-monospace, monospace" }} />
      )}
      <p style={{ color: C.dim, fontSize: 12, marginTop: 16 }}>Everything logged here is shared with anyone who opens this app.</p>
    </div>
  );
}

/* ---------- App ---------- */
export default function App() {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState({ settings: null, active: { p1: null, p2: null, p3: null }, entries: [], drinks: [] });
  const [me, setMe] = useState(() => { const m = getMe(FRIEND); return PAIR.includes(m) ? m : null; });
  const [tab, setTab] = useState("log");
  const [toast, setToast] = useState(null);
  const [offlineSince, setOfflineSince] = useState(null);
  const toastTimer = useRef(null);

  /* A toast can carry one action, such as Undo, and then stays up a little longer. */
  const flash = useCallback((text, action) => {
    clearTimeout(toastTimer.current);
    setToast({ text, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 6000 : 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await store.load();
      setData(d);
      setCache(d);
      setOfflineSince(null);
    } catch (e) {
      const cached = getCache();
      setData((cur) => (cur.settings || !cached ? cur : { drinks: [], ...cached.data }));
      setOfflineSince((t) => t ?? (cached?.at || Date.now()));
    }
  }, []);

  /* Every write goes through here: one save, then one fresh load. */
  const act = useCallback(async (op, ...args) => {
    const r = await store.apply(op, ...args);
    if (!r.ok) { flash(`Couldn't save: ${r.error || "the log is unreachable"}`); return false; }
    await load();
    return true;
  }, [flash, load]);

  useEffect(() => {
    let alive = true;
    load().then(() => alive && setReady(true));
    const t = setInterval(load, 15000);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  /* Keeps each person's time zone current, so "today" follows them when they travel. */
  const { settings, active, drinks = [] } = data;
  const entries = useMemo(() => data.entries.filter((e) => PAIR.includes(e.who)), [data.entries]);
  useEffect(() => {
    if (!ready || !me || !settings || offlineSince) return;
    if (settings.tz?.[me] !== deviceTz()) store.apply("setSettings", { ...settings, tz: { ...settings.tz, [me]: deviceTz() } }).then(load);
  }, [ready, me, settings, offlineSince, load]);

  const saveNames = async (names) => {
    const ok = await act("setSettings", { ...settings, names, tz: settings?.tz || {} });
    if (ok) flash("Names saved");
    return ok;
  };
  const chooseMe = (k) => { setMe(k); saveMe(k, FRIEND); };
  const deleteEntry = async (e) => {
    if (!(await act("deleteEntry", e))) return;
    flash(`Deleted ${e.drink}`, { label: "Undo", run: async () => { if (await act("restoreEntry", e)) flash(`Restored ${e.drink}`); } });
  };
  const updateEntry = async (e) => {
    const ok = await act("updateEntry", e);
    if (ok) flash("Changes saved");
    return ok;
  };
  const removeDrink = async (name) => { if (await act("removeDrink", name)) flash(`Removed ${name}`); };

  const shell = (children) => (
    <div style={{ fontFamily: FONT, background: C.oat, minHeight: "100vh", color: C.ink, paddingTop: "env(safe-area-inset-top)" }}>
      <style>{`
        @keyframes steam { 0% { transform: translateY(2px); opacity: .3 } 50% { opacity: 1 } 100% { transform: translateY(-3px); opacity: .3 } }
        .steam path { animation: steam 2.2s ease-in-out infinite; }
        .steam path:nth-child(2) { animation-delay: .4s } .steam path:nth-child(3) { animation-delay: .8s }
        @keyframes pulse { 50% { opacity: .3 } } .pulse { animation: pulse 1.6s ease-in-out infinite; }
        button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible { outline: 2px solid ${C.espresso}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .steam path, .pulse { animation: none } }
      `}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 84 }}>
        {children}
        {FRIEND === "p2" && (
          <footer style={{ padding: "24px 16px 16px", textAlign: "center", fontSize: 12, color: C.dim }}>
            thanks to maitha for vibecoding this
          </footer>
        )}
      </div>
    </div>
  );

  if (!ready) return shell(<div style={{ padding: 40, textAlign: "center", color: C.dim }}>Warming up…</div>);
  if (!settings) {
    if (offlineSince) return shell(<div style={{ padding: 40, textAlign: "center", color: C.dim }}>Can't reach the coffee log. Check your connection and reopen the app.</div>);
    return shell(<Setup onSave={saveNames} />);
  }
  const names = settings.names;

  if (!me) {
    return shell(
      <div style={{ padding: 20, textAlign: "center" }}>
        <div style={{ marginTop: 24 }}><a href="/" aria-label="Back to coffee" style={homeLink}><Cup steam size={84} /></a></div>
        <h1 style={{ ...DISPLAY, fontSize: 44, color: C.ink, margin: "8px 0 20px" }}>Who's sipping?</h1>
        <Big onClick={() => chooseMe("p1")}>{nameOf(names, "p1")}</Big>
        <div style={{ height: 12 }} />
        <Big tone="caramel" onClick={() => chooseMe(FRIEND)}>{nameOf(names, FRIEND)}</Big>
      </div>
    );
  }

  const tabs = [["log", "Log"], ["today", "Today"], ["week", "Week"]];
  return shell(
    <>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.rule}` }}>
        <a href="/" aria-label="Back to coffee" style={homeLink}><Cup steam={!!active[me]} size={36} /></a>
        <div style={{ flex: 1 }}>
          <div style={{ ...DISPLAY, fontSize: 24, lineHeight: 1.1 }}>Sip Log</div>
          <div style={{ fontSize: 13, color: C.dim }}>Logging as {nameOf(names, me)}</div>
        </div>
        <button
          onClick={() => { setMe(null); saveMe(null, FRIEND); }}
          style={{ minHeight: 40, padding: "0 12px", borderRadius: 12, border: `1px solid ${C.edge}`, background: "transparent", color: C.ink, fontFamily: FONT, fontSize: 13, cursor: "pointer" }}
        >
          Switch person
        </button>
      </div>

      {me === "p1" && (
        <nav aria-label="Whose log" style={{ display: "flex", gap: 6, margin: "12px 16px 0" }}>
          {[["p2", "/sip/"], ["p3", "/sip/viva/"]].map(([k, href]) => (
            <a key={k} href={href} aria-current={k === FRIEND ? "page" : undefined} onClick={() => saveMe("p1", k)}
              style={{ flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 999, fontSize: 14, textDecoration: "none",
                border: `1px solid ${k === FRIEND ? C.espresso : C.edge}`, background: k === FRIEND ? C.espresso : "transparent", color: k === FRIEND ? C.oat : C.ink }}>
              with {nameOf(names, k)}
            </a>
          ))}
        </nav>
      )}
      {offlineSince && (
        <div role="status" style={{ margin: "12px 16px 0", padding: "10px 14px", borderRadius: 12, background: C.latte, color: C.ink, fontSize: 13 }}>
          Can't reach the coffee log right now, so you're seeing this phone's copy from {fmtTime(offlineSince)}. Saving works again once the connection is back.
        </div>
      )}
      {tab === "log" && <LogTab me={me} names={names} active={active} entries={entries} drinks={drinks} act={act} flash={flash} onSaved={() => setTab("today")} />}
      {tab === "today" && <TodayTab entries={entries} names={names} settings={settings} drinks={drinks} onDelete={deleteEntry} onUpdate={updateEntry} />}
      {tab === "week" && <WeekTab entries={entries} names={names} settings={settings} drinks={drinks} saveNames={saveNames} removeDrink={removeDrink} flash={flash} />}

      {toast && (
        <div role="status" style={{ position: "fixed", left: 16, right: 16, bottom: 92, maxWidth: 448, margin: "0 auto", background: C.ink, color: C.oat, padding: toast.action ? "4px 8px 4px 16px" : "12px 16px", borderRadius: 12, fontSize: 15, textAlign: toast.action ? "left" : "center", display: "flex", alignItems: "center", justifyContent: toast.action ? "space-between" : "center", gap: 12 }}>
          <span>{toast.text}</span>
          {toast.action && (
            <button onClick={() => { const { run } = toast.action; clearTimeout(toastTimer.current); setToast(null); run(); }}
              style={{ minHeight: 44, padding: "0 12px", border: "none", background: "none", color: C.latte, fontFamily: FONT, fontSize: 15, fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.oat, borderTop: `1px solid ${C.rule}`, display: "flex", justifyContent: "center", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div style={{ display: "flex", width: "100%", maxWidth: 480 }}>
          {tabs.map(([k, t]) => (
            <button key={k} onClick={() => { setTab(k); load(); }} aria-current={tab === k ? "page" : undefined} style={{
              flex: 1, minHeight: 64, border: "none", background: "none", fontFamily: FONT, fontSize: 16,
              fontWeight: tab === k ? 600 : 500, color: tab === k ? C.ink : C.dim, cursor: "pointer",
              borderTop: `2px solid ${tab === k ? C.espresso : "transparent"}`,
            }}>
              {t}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
