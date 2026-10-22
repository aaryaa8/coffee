/* Things that belong to this phone only: who is holding it, and the last log it saw. */
const ME = "sip:me";
const CACHE = "sip:cache";

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

/* Each log remembers its own person: the Maitha log keeps the original key, the Viva log its own. */
const meKey = (friend) => (friend === "p3" ? `${ME}:viva` : ME);
export const getMe = (friend) => safe(() => localStorage.getItem(meKey(friend)), null);
export const setMe = (k, friend) => safe(() => (k ? localStorage.setItem(meKey(friend), k) : localStorage.removeItem(meKey(friend))));

export const getCache = () => safe(() => JSON.parse(localStorage.getItem(CACHE)), null);
export const setCache = (data) => safe(() => localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), data })));
