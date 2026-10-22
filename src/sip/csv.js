import { dayKey, fmtTime24 } from "./time.js";

/* Text that a spreadsheet would run as a formula gets a leading apostrophe. */
const FORMULA = /^[=+\-@\t\r]/;
const q = (s) => {
  const v = String(s ?? "");
  return `"${(FORMULA.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
};

export function toCsv(entries, nameFor) {
  const lines = ["Date,Who,Drink,Size (oz),Shots,Milk,Sweetener,Start time,Finish time,Time zone,Duration (min),Rating,Notes"];
  [...entries].sort((a, b) => a.start - b.start).forEach((e) => {
    const tz = e.tz || "UTC";
    lines.push([
      dayKey(e.start, tz), q(nameFor(e.who)), q(e.drink), e.oz, e.shots, q(e.milk), q(e.sweetener),
      fmtTime24(e.start, tz), fmtTime24(e.end, tz), q(tz),
      Math.round(((e.end - e.start) / 60000) * 10) / 10, e.rating || "", q(e.note),
    ].join(","));
  });
  return lines.join("\n");
}

export function downloadCsv(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
