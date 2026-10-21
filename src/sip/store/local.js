import { emptyState, normalize, ops } from "./model.js";

/* Keeps the whole log in this browser. Used for local development and tests. */
const KEY = "sip:local-data";

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || emptyState(); } catch { return emptyState(); }
}

export function createLocalStore() {
  return {
    kind: "local",
    needsUnlock: () => false,
    async unlock() { return true; },
    async load() { return normalize(read()); },
    async apply(op, ...args) {
      try {
        localStorage.setItem(KEY, JSON.stringify(ops[op](read(), ...args)));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e?.message || e).slice(0, 80) };
      }
    },
  };
}
