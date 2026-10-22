/* ---------- data model ----------
   settings: { names: [p1, p2, p3], tz: { p1, p2, p3 } }   p1 Aaryaa, p2 Maitha, p3 Viva
   active:   { p1, p2, p3 }   each a sip or null; sip = { drink, oz, shots, milk, sweetener, start, tz }
   entries:  [{ id, who, drink, oz, shots, milk, sweetener, start, end, rating, note, tz }]
   drinks:   [{ name, oz, shots }]   drinks the two of you added beyond the presets
   Every backend loads this shape and applies the same named operations to it. */

export const emptyState = () => ({ settings: null, active: { p1: null, p2: null, p3: null }, entries: [], drinks: [], trash: [] });

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const ops = {
  setSettings: (s, settings) => ({ ...s, settings }),
  startSip: (s, who, sip) => ({ ...s, active: { ...s.active, [who]: sip } }),
  cancelSip: (s, who) => ({ ...s, active: { ...s.active, [who]: null } }),
  finishSip: (s, who, entry) => ({
    ...s,
    active: { ...s.active, [who]: s.active?.[who]?.start === entry.start ? null : s.active?.[who] ?? null },
    entries: [...s.entries.filter((e) => e.id !== entry.id), entry],
  }),
  addEntry: (s, entry) => ({ ...s, entries: [...s.entries.filter((e) => e.id !== entry.id), entry] }),
  updateEntry: (s, entry) => ({ ...s, entries: s.entries.map((e) => (e.id === entry.id ? { ...entry, who: e.who } : e)) }),
  deleteEntry: (s, entry) => ({
    ...s,
    entries: s.entries.filter((e) => e.id !== entry.id),
    trash: [...(s.trash || []), ...s.entries.filter((e) => e.id === entry.id)],
  }),
  restoreEntry: (s, entry) => ({
    ...s,
    entries: [...s.entries, ...(s.trash || []).filter((e) => e.id === entry.id)],
    trash: (s.trash || []).filter((e) => e.id !== entry.id),
  }),
  addDrink: (s, drink) => ({ ...s, drinks: [...(s.drinks || []).filter((d) => !sameName(d.name, drink.name)), drink] }),
  removeDrink: (s, name) => ({ ...s, drinks: (s.drinks || []).filter((d) => !sameName(d.name, name)) }),
};

/** Sorts newest first, and hides a running sip that was already saved as an entry. */
export function normalize(raw) {
  const s = { ...emptyState(), ...raw };
  const entries = [...(s.entries || [])].sort((a, b) => b.start - a.start);
  const active = { p1: null, p2: null, p3: null };
  for (const k of ["p1", "p2", "p3"]) {
    const a = s.active?.[k];
    if (a && !entries.some((e) => e.who === k && e.start === a.start)) active[k] = a;
  }
  return { settings: s.settings, active, entries, drinks: s.drinks || [] };
}

export const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
