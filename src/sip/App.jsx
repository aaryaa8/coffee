import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { store } from "./store/index.js";
import { newId } from "./store/model.js";
import { getMe, setMe as saveMe, getCache, setCache } from "./device.js";
import { deviceTz, dayKey, shiftDay, weekdayShort, dateLabel, fmtTime, tzShort } from "./time.js";
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
const PCOL = { p1: C.espresso, p2: C.caramel };
const FONT = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

/* ---------- helpers ---------- */
const DRINKS = {
  Espresso: [2, 1], "Double Espresso": [2, 2], Americano: [12, 2], "Flat White": [8, 2],
  Latte: [12, 2], Cappuccino: [6, 2], Cortado: [4, 2], Macchiato: [3, 1], Mocha: [12, 2],
  "Drip Coffee": [12, 1], "Cold Brew": [16, 1], "Iced Latte": [16, 2], "Iced Americano": [16, 2], Other: [8, 1],
};
const SIZES = [2, 4, 6, 8, 12, 16, 20];
const durMin = (e) => (e.end - e.start) / 60000;
const nameOf = (names, k) => names[k === "p1" ? 0 : 1];
const tzOf = (settings, k) => settings?.tz?.[k] || deviceTz();
const entryDay = (e) => dayKey(e.start, e.tz || deviceTz());
/** Each person's own calendar date right now, in their own time zone. */
const todays = (settings, now) => ({ p1: dayKey(now, tzOf(settings, "p1")), p2: dayKey(now, tzOf(settings, "p2")) });
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
      <h1 style={{ textAlign: "center", fontSize: 28, fontWeight: 600, margin: "8px 0 4px", color: C.ink }}>Sip Log</h1>
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
function LogTab({ me, names, active, entries, act, flash, onSaved }) {
  const mine = active[me];
  const otherKey = me === "p1" ? "p2" : "p1";
  const theirs = active[otherKey];
  const [drink, setDrink] = useState("Flat White");
  const [oz, setOz] = useState(8);
  const [shots, setShots] = useState(2);
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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const pick = (d) => { setDrink(d); setOz(DRINKS[d][0]); setShots(DRINKS[d][1]); };

  /* Runs one save at a time, so a double tap can't log the same coffee twice. */
  const once = (fn) => async () => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const start = once(async () => {
    await act("startSip", me, { drink, oz, shots, start: Date.now(), tz: deviceTz() });
  });

  const makeEntry = (base, startMs, endMs, tz) => ({
    id: newId(), who: me, drink: base.drink, oz: base.oz, shots: base.shots,
    start: startMs, end: endMs, rating, note: note.trim(), tz,
  });

  const finish = once(async () => {
    const endMs = Date.now();
    if (await act("finishSip", me, makeEntry(mine, mine.start, endMs, mine.tz || deviceTz()))) {
      setRating(0); setNote(""); setConfirmCancel(false);
      flash(`Finished: ${mine.drink} in ${fmtDur((endMs - mine.start) / 60000)}`);
    }
  });

  const cancel = once(async () => {
    if (await act("cancelSip", me)) setConfirmCancel(false);
  });

  const savePast = once(async () => {
    const s = new Date(`${date}T${st}`).getTime();
    let e = new Date(`${date}T${et}`).getTime();
    if (!date || !st || !et || isNaN(s) || isNaN(e)) { flash("Pick a date, start time and finish time first."); return; }
    if (e <= s) e += 86400000;
    if (await act("addEntry", makeEntry({ drink, oz, shots }, s, e, deviceTz()))) {
      setRating(0); setNote(""); setPast(false);
      flash(`Saved: ${drink}, ${fmtDur((e - s) / 60000)}`);
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

  const friendBanner = theirs && (
    <div style={{ ...card, background: C.latte, border: "none", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <span className="pulse" style={{ width: 10, height: 10, flex: "0 0 10px", borderRadius: 5, background: PCOL[otherKey] }} />
      <span style={{ fontSize: 15 }}>
        <b>{nameOf(names, otherKey)}</b> is sipping {theirs.drink} · {fmtClock(Math.max(0, Math.floor((now - theirs.start) / 1000)))}
      </span>
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
            {mine.drink} · {mine.oz} oz · {mine.shots} {mine.shots === 1 ? "shot" : "shots"}
          </div>
          <div style={{ fontSize: 64, fontWeight: 500, color: C.ink, fontVariantNumeric: "tabular-nums", letterSpacing: -1, margin: "6px 0" }}>
            {fmtClock(secs)}
          </div>
          <div style={{ color: C.dim, fontSize: 14 }}>Started {fmtTime(mine.start)}</div>
        </div>
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

      <div style={label}>Drink</div>
      <div style={row}>
        {Object.keys(DRINKS).map((d) => <Chip key={d} on={drink === d} onClick={() => pick(d)}>{d}</Chip>)}
      </div>

      <div style={label}>Size (oz)</div>
      <div style={row}>
        {SIZES.map((s) => <Chip key={s} on={oz === s} onClick={() => setOz(s)}>{s}</Chip>)}
      </div>

      <div style={label}>Shots of espresso</div>
      <div style={row}>
        {[1, 2, 3, 4].map((s) => <Chip key={s} on={shots === s} onClick={() => setShots(s)}>{s}</Chip>)}
      </div>

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

/* ---------- Entry row ---------- */
function EntryRow({ e, names, onDelete }) {
  const [ask, setAsk] = useState(false);
  const tz = e.tz || deviceTz();
  const zone = tz !== deviceTz() ? ` (${tzShort(tz, e.start)})` : "";
  return (
    <div style={{ ...card, padding: 12, display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
      <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: PCOL[e.who] }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{e.drink}</div>
        <div style={{ color: C.dim, fontSize: 13 }}>
          {nameOf(names, e.who)} · {e.oz} oz · {e.shots} {e.shots === 1 ? "shot" : "shots"}
        </div>
        <div style={{ color: C.dim, fontSize: 13 }}>
          {fmtTime(e.start, tz)} to {fmtTime(e.end, tz)}{zone}{e.rating ? ` · rated ${e.rating}/5` : ""}
        </div>
        {e.note ? <div style={{ fontSize: 13, marginTop: 2, overflowWrap: "anywhere" }}>{e.note}</div> : null}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontWeight: 600, color: C.ink, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{fmtDur(durMin(e))}</div>
        {ask ? (
          <button onClick={() => onDelete(e)} style={{ border: "none", background: "none", color: C.espresso, fontFamily: FONT, fontWeight: 700, textDecoration: "underline", fontSize: 13, minHeight: 36, cursor: "pointer" }}>
            Confirm delete
          </button>
        ) : (
          <button onClick={() => setAsk(true)} aria-label={`Delete ${e.drink}`} style={{ border: "none", background: "none", color: C.dim, fontFamily: FONT, fontSize: 13, minHeight: 36, cursor: "pointer" }}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Today tab ---------- */
function TodayTab({ entries, names, settings, onDelete }) {
  const now = Date.now();
  const today = todays(settings, now);
  const mineToday = dayKey(now);
  const list = entries.filter((e) => entryDay(e) === today[e.who]);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 10 }}>
        {["p1", "p2"].map((k, i) => {
          const theirs = list.filter((e) => e.who === k);
          return (
            <div key={k} style={{ ...card, flex: 1, minWidth: 0 }}>
              <div style={{ color: C.dim, fontSize: 14, fontWeight: 500 }}><span style={dot(PCOL[k])} />{names[i]}</div>
              <div style={{ fontSize: 36, fontWeight: 500, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{theirs.length}</div>
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
        list.map((e) => <EntryRow key={e.id} e={e} names={names} onDelete={onDelete} />)
      )}
    </div>
  );
}

/* ---------- Week tab ---------- */
function WeekTab({ entries, names, settings, saveNames, flash }) {
  /* The name fields follow saved changes from the other phone until you start typing. */
  const [draft, setDraft] = useState(null);
  const n1 = draft ? draft[0] : names[0];
  const n2 = draft ? draft[1] : names[1];
  const edit = (i, v) => setDraft((d) => { const next = [...(d || names)]; next[i] = v; return next; });
  const [csv, setCsv] = useState("");

  /* Seven calendar days per person, each ending on that person's own today. */
  const now = Date.now();
  const today = todays(settings, now);
  const viewerToday = dayKey(now);
  const windows = useMemo(() => {
    const w = { p1: new Set(), p2: new Set() };
    for (let i = 0; i < 7; i++) { w.p1.add(shiftDay(today.p1, -i)); w.p2.add(shiftDay(today.p2, -i)); }
    return w;
  }, [today.p1, today.p2]);
  const wk = useMemo(() => entries.filter((e) => windows[e.who].has(entryDay(e))), [entries, windows]);

  const days = useMemo(() => {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const key = shiftDay(viewerToday, -i);
      out.push({
        key, short: weekdayShort(key),
        p1: wk.filter((e) => e.who === "p1" && entryDay(e) === shiftDay(today.p1, -i)).length,
        p2: wk.filter((e) => e.who === "p2" && entryDay(e) === shiftDay(today.p2, -i)).length,
      });
    }
    return out;
  }, [wk, viewerToday, today.p1, today.p2]);
  const maxDay = Math.max(1, ...days.map((d) => Math.max(d.p1, d.p2)));

  const byDrink = useMemo(() => {
    const m = {};
    wk.forEach((e) => { (m[e.drink] = m[e.drink] || []).push(e); });
    return Object.entries(m)
      .map(([drink, arr]) => ({ drink, n: arr.length, avgMin: avg(arr.map(durMin)) }))
      .sort((a, b) => b.n - a.n);
  }, [wk]);

  const download = () => {
    downloadCsv(toCsv(entries, names), `sip-log-${viewerToday}.csv`);
    flash("CSV downloaded.");
  };
  const copy = async () => {
    const text = toCsv(entries, names);
    setCsv(text);
    try { await navigator.clipboard.writeText(text); flash("Copied. Paste it into any spreadsheet."); } catch { flash("Select the text below and copy it."); }
  };
  const save = async () => {
    if (await saveNames([n1.trim(), n2.trim()])) setDraft(null);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 10 }}>
        {["p1", "p2"].map((k, i) => {
          const theirs = wk.filter((e) => e.who === k);
          const durs = theirs.map(durMin);
          return (
            <div key={k} style={{ ...card, flex: 1, minWidth: 0 }}>
              <div style={{ color: C.dim, fontSize: 14, fontWeight: 500 }}><span style={dot(PCOL[k])} />{names[i]}</div>
              <div style={{ fontSize: 34, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{theirs.length}</div>
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
      <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "flex-end", height: 130, paddingTop: 20 }}>
        {days.map((d) => (
          <div key={d.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 74 }}>
              {["p1", "p2"].map((k) => (
                <div key={k} title={`${nameOf(names, k)}: ${d[k]}`} style={{ width: 10, height: (d[k] / maxDay) * 70 + (d[k] ? 4 : 0), background: PCOL[k], borderRadius: 2 }} />
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.dim }}>{d.short}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 13, color: C.dim, marginTop: 8 }}>
        <span><span style={dot(PCOL.p1)} />{names[0]}</span>
        <span><span style={dot(PCOL.p2)} />{names[1]}</span>
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
  const [data, setData] = useState({ settings: null, active: { p1: null, p2: null }, entries: [] });
  const [me, setMe] = useState(getMe);
  const [tab, setTab] = useState("log");
  const [toast, setToast] = useState("");
  const [offlineSince, setOfflineSince] = useState(null);
  const toastTimer = useRef(null);

  const flash = useCallback((m) => {
    clearTimeout(toastTimer.current);
    setToast(m);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await store.load();
      setData(d);
      setCache(d);
      setOfflineSince(null);
    } catch (e) {
      const cached = getCache();
      setData((cur) => (cur.settings || !cached ? cur : cached.data));
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
  const { settings, active, entries } = data;
  useEffect(() => {
    if (!ready || !me || !settings || offlineSince) return;
    if (settings.tz?.[me] !== deviceTz()) store.apply("setSettings", { ...settings, tz: { ...settings.tz, [me]: deviceTz() } }).then(load);
  }, [ready, me, settings, offlineSince, load]);

  const saveNames = async (names) => {
    const ok = await act("setSettings", { ...settings, names, tz: settings?.tz || {} });
    if (ok) flash("Names saved");
    return ok;
  };
  const chooseMe = (k) => { setMe(k); saveMe(k); };
  const deleteEntry = async (e) => { if (await act("deleteEntry", e)) flash("Deleted"); };

  const shell = (children) => (
    <div style={{ fontFamily: FONT, background: C.oat, minHeight: "100vh", color: C.ink }}>
      <style>{`
        @keyframes steam { 0% { transform: translateY(2px); opacity: .3 } 50% { opacity: 1 } 100% { transform: translateY(-3px); opacity: .3 } }
        .steam path { animation: steam 2.2s ease-in-out infinite; }
        .steam path:nth-child(2) { animation-delay: .4s } .steam path:nth-child(3) { animation-delay: .8s }
        @keyframes pulse { 50% { opacity: .3 } } .pulse { animation: pulse 1.6s ease-in-out infinite; }
        button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid ${C.espresso}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .steam path, .pulse { animation: none } }
      `}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 84 }}>{children}</div>
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
        <div style={{ marginTop: 24 }}><Cup steam size={84} /></div>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: C.ink, margin: "8px 0 20px" }}>Who's sipping?</h1>
        <Big onClick={() => chooseMe("p1")}>{names[0]}</Big>
        <div style={{ height: 12 }} />
        <Big tone="caramel" onClick={() => chooseMe("p2")}>{names[1]}</Big>
      </div>
    );
  }

  const tabs = [["log", "Log"], ["today", "Today"], ["week", "Week"]];
  return shell(
    <>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.rule}` }}>
        <Cup steam={!!active[me]} size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Sip Log</div>
          <div style={{ fontSize: 13, color: C.dim }}>Logging as {nameOf(names, me)}</div>
        </div>
        <button
          onClick={() => { setMe(null); saveMe(null); }}
          style={{ minHeight: 40, padding: "0 12px", borderRadius: 12, border: `1px solid ${C.edge}`, background: "transparent", color: C.ink, fontFamily: FONT, fontSize: 13, cursor: "pointer" }}
        >
          Switch person
        </button>
      </div>

      {offlineSince && (
        <div role="status" style={{ margin: "12px 16px 0", padding: "10px 14px", borderRadius: 12, background: C.latte, color: C.ink, fontSize: 13 }}>
          Can't reach the coffee log right now, so you're seeing this phone's copy from {fmtTime(offlineSince)}. Saving works again once the connection is back.
        </div>
      )}
      {tab === "log" && <LogTab me={me} names={names} active={active} entries={entries} act={act} flash={flash} onSaved={() => setTab("today")} />}
      {tab === "today" && <TodayTab entries={entries} names={names} settings={settings} onDelete={deleteEntry} />}
      {tab === "week" && <WeekTab entries={entries} names={names} settings={settings} saveNames={saveNames} flash={flash} />}

      {toast && (
        <div role="status" style={{ position: "fixed", left: 16, right: 16, bottom: 92, maxWidth: 448, margin: "0 auto", background: C.ink, color: C.oat, padding: "12px 16px", borderRadius: 12, fontSize: 15, textAlign: "center" }}>
          {toast}
        </div>
      )}

      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.oat, borderTop: `1px solid ${C.rule}`, display: "flex", justifyContent: "center", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div style={{ display: "flex", width: "100%", maxWidth: 480 }}>
          {tabs.map(([k, t]) => (
            <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} style={{
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
