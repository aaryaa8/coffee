import { dayKey, shiftDay, fmtTime, deviceTz } from "../sip/time.js";

/* ---------- Coffee rings ----------
   Aaryaa's coffees from the Sip Log, drawn on a 24-hour clock in her own time, midnight at the top.
   Each day is one hairline ring, the first day at the center and today on the outside.
   Each coffee is an arc from start to finish; thicker means a bigger cup. */

const API = import.meta.env.VITE_SIP_API || "https://coffee-api.aaryaa-kamdar.workers.dev";
const ME = "p1";
const NS = "http://www.w3.org/2000/svg";
const C = { latte: "#DCC6AB", caramel: "#B98D70", espresso: "#654735", rule: "rgba(41,36,31,.14)", dim: "rgba(41,36,31,.68)" };
const S = 400, CX = 200, CY = 200, R0 = 30, R = 168, MAX_GAP = 7;

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};

let data = null;
let view = "all";

const tzOfEntry = (e) => e.tz || data?.settings?.tz?.[ME] || deviceTz();
const myTz = () => data?.settings?.tz?.[ME] || deviceTz();
const minuteOfDay = (ms, tz) => {
  const [h, m] = new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).split(":").map(Number);
  return h * 60 + m;
};
const monthLabel = (key) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dateLabel = (key) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
function fmtDur(min) {
  if (min == null || isNaN(min)) return "–";
  if (min < 1) return `${Math.max(1, Math.round(min * 60))} sec`;
  if (min >= 60) return `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;
  return `${Math.round(min)} min`;
}
function fmtHours(min) {
  if (min < 60) return `${Math.round(min)} min`;
  return min < 600 ? `${(min / 60).toFixed(1)} h` : `${Math.round(min / 60)} h`;
}

/** Every coffee of mine, plus a running sip drawn up to now. */
function myCoffees() {
  const done = data.entries.filter((e) => e.who === ME).map((e) => ({ ...e, day: dayKey(e.start, tzOfEntry(e)) }));
  const a = data.active?.[ME];
  if (a) done.push({ ...a, end: Date.now(), running: true, day: dayKey(a.start, a.tz || myTz()) });
  return done;
}

function renderMonths(coffees) {
  const today = dayKey(Date.now(), myTz());
  const months = [...new Set([today.slice(0, 7), ...coffees.map((c) => c.day.slice(0, 7))])].sort().reverse();
  const sel = $("month");
  const keep = view;
  sel.innerHTML = `<option value="all">All time</option>` + months.map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join("");
  view = keep === "all" || months.includes(keep) ? keep : "all";
  sel.value = view;
}

/** The days drawn as rings: first coffee to today for all time, or the chosen month up to today. */
function dayRange(coffees) {
  const today = dayKey(Date.now(), myTz());
  let first, last;
  if (view === "all") {
    first = coffees.reduce((m, c) => (c.day < m ? c.day : m), today);
    last = today;
  } else {
    first = `${view}-01`;
    const end = shiftDay(`${shiftDay(`${view}-28`, 4).slice(0, 7)}-01`, -1);
    last = end < today ? end : today;
  }
  const days = [];
  for (let d = first; d <= last; d = shiftDay(d, 1)) days.push(d);
  return days;
}

function render() {
  const fig = $("rings");
  fig.textContent = "";
  const all = myCoffees();
  renderMonths(all);
  const days = dayRange(all);
  const index = new Map(days.map((d, i) => [d, i]));
  const shown = all.filter((c) => index.has(c.day));
  const today = dayKey(Date.now(), myTz());

  const gap = days.length > 1 ? Math.min(MAX_GAP, (R - R0) / (days.length - 1)) : 0;
  const ringR = (i) => R0 + i * gap;
  const ang = (m) => (m / 1440) * 2 * Math.PI - Math.PI / 2;
  const pt = (rad, m) => [CX + rad * Math.cos(ang(m)), CY + rad * Math.sin(ang(m))];

  const svg = el("svg", { viewBox: `0 0 ${S} ${S}`, role: "img", "aria-label": `Coffee rings: ${shown.length} coffees over ${days.length} days` }, fig);
  for (let h = 0; h < 24; h++) {
    const [x1, y1] = pt(R0 - 8, h * 60), [x2, y2] = pt(R + (h % 6 ? 4 : 9), h * 60);
    el("line", { x1, y1, x2, y2, stroke: C.rule, "stroke-width": h % 6 ? 0.5 : 0.8 }, svg);
  }
  [["midnight", 0], ["6 am", 360], ["noon", 720], ["6 pm", 1080]].forEach(([t, m]) => {
    const [x, y] = pt(R + 20, m);
    el("text", { x, y, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": 10, fill: C.dim }, svg).textContent = t;
  });
  /* With many days the rings pack tighter, so the arcs thin out with them. */
  const ringStroke = gap > 2.5 ? 0.5 : 0.3;
  days.forEach((d, i) => el("circle", { cx: CX, cy: CY, r: ringR(i), fill: "none", stroke: d === today ? C.caramel : C.rule, "stroke-width": d === today ? 0.9 : ringStroke }, svg));
  el("text", { x: CX, y: CY + 3, "text-anchor": "middle", "font-size": 9, fill: C.dim }, svg).textContent = days.length ? dateLabel(days[0]) : "";

  const maxW = gap ? Math.max(0.7, gap * 0.85) : 4.4;
  const arcs = el("g", {}, svg);
  for (const c of shown) {
    const tz = c.tz || myTz();
    const rad = ringR(index.get(c.day));
    const m1 = minuteOfDay(c.start, tz);
    const m2 = Math.max(m1 + 1.5, Math.min(1440, m1 + (c.end - c.start) / 60000));
    const [x1, y1] = pt(rad, m1), [x2, y2] = pt(rad, m2);
    const d = `M${x1} ${y1} A${rad} ${rad} 0 ${m2 - m1 > 720 ? 1 : 0} 1 ${x2} ${y2}`;
    const width = Math.min(maxW, 1.2 + (c.oz / 20) * 3.2);
    el("path", { d, fill: "none", stroke: c.running || c.day === today ? C.caramel : C.espresso, "stroke-width": width, "stroke-linecap": "round", class: c.running ? "running" : "" }, arcs);
    const hit = el("path", { d, fill: "none", stroke: "transparent", "stroke-width": Math.max(10, width), tabindex: 0, role: "button", "aria-label": describe(c) }, arcs);
    el("title", {}, hit).textContent = describe(c);
    const show = () => { $("detail").textContent = describe(c); };
    hit.addEventListener("click", show);
    hit.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); show(); } });
  }

  const cap = $("caption");
  if (!shown.length) cap.textContent = view === "all" ? "There are no coffees here yet, and the first one will start the first ring." : `There were no coffees in ${monthLabel(view)}.`;
  else cap.textContent = "bean juice, bean juice";
  $("detail").textContent = "";
  renderCounts(shown.filter((c) => !c.running));
}

function describe(c) {
  const tz = c.tz || myTz();
  const length = c.running ? `${fmtDur((Date.now() - c.start) / 60000)} so far` : fmtDur((c.end - c.start) / 60000);
  return `${c.drink}, ${dateLabel(c.day)}, ${fmtTime(c.start, tz)}${c.running ? "" : ` to ${fmtTime(c.end, tz)}`}, ${length}`;
}

function renderCounts(list) {
  const mins = list.map((c) => (c.end - c.start) / 60000);
  const total = mins.reduce((a, b) => a + b, 0);
  const shots = list.reduce((a, c) => a + c.shots, 0);
  const items = [
    [list.length, list.length === 1 ? "coffee" : "coffees"],
    [`${(list.reduce((a, c) => a + c.oz, 0) * 0.0295735).toFixed(1)} L`, "volume"],
    [shots, shots === 1 ? "shot" : "shots"],
    [list.length ? fmtHours(total) : "–", "spent sipping"],
    [list.length ? fmtDur(total / list.length) : "–", "average drink time"],
  ];
  $("counted").innerHTML = items.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
}

async function load() {
  try {
    const res = await fetch(`${API}/sip/state`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
    $("status").textContent = "";
    render();
  } catch {
    if (!data) $("status").textContent = "The coffee log is out of reach right now. Try again in a minute.";
  }
}

$("month").addEventListener("change", (ev) => { view = ev.target.value; render(); });
load();
setInterval(load, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
