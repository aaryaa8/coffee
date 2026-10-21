/* Things that belong to this phone only: who is holding it, and the last log it saw. */
const ME = "sip:me";
const CACHE = "sip:cache";

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

export const getMe = () => safe(() => localStorage.getItem(ME), null);
export const setMe = (k) => safe(() => (k ? localStorage.setItem(ME, k) : localStorage.removeItem(ME)));

export const getCache = () => safe(() => JSON.parse(localStorage.getItem(CACHE)), null);
export const setCache = (data) => safe(() => localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), data })));
