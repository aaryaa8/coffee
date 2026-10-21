/* ---------- data model ----------
   settings: { names: [p1, p2], tz: { p1, p2 } }
   active:   { p1: sip | null, p2: sip | null }   sip = { drink, oz, shots, start, tz }
   entries:  [{ id, who, drink, oz, shots, start, end, rating, note, tz }]
   Every backend loads this shape and applies the same named operations to it. */

export const emptyState = () => ({ settings: null, active: { p1: null, p2: null }, entries: [] });

export const ops = {
  setSettings: (s, settings) => ({ ...s, settings }),
  startSip: (s, who, sip) => ({ ...s, active: { ...s.active, [who]: sip } }),
  cancelSip: (s, who) => ({ ...s, active: { ...s.active, [who]: null } }),
  finishSip: (s, who, entry) => ({
    ...s,
    active: { ...s.active, [who]: null },
    entries: [...s.entries.filter((e) => e.id !== entry.id), entry],
  }),
  addEntry: (s, entry) => ({ ...s, entries: [...s.entries.filter((e) => e.id !== entry.id), entry] }),
  deleteEntry: (s, entry) => ({ ...s, entries: s.entries.filter((e) => e.id !== entry.id) }),
};

/** Sorts newest first, and hides a running sip that was already saved as an entry. */
export function normalize(raw) {
  const s = { ...emptyState(), ...raw };
  const entries = [...(s.entries || [])].sort((a, b) => b.start - a.start);
  const active = { p1: null, p2: null };
  for (const k of ["p1", "p2"]) {
    const a = s.active?.[k];
    if (a && !entries.some((e) => e.who === k && e.start === a.start)) active[k] = a;
  }
  return { settings: s.settings, active, entries };
}

export const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
