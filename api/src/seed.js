/* The two coffees logged in the original Sip Log artifact, carried over on first open. */
export const SEED = {
  settings: { names: ["Aaryaa", "Maitha"], tz: { p1: "America/Los_Angeles", p2: "Asia/Dubai" } },
  entries: [
    // Maitha, Flat White, 8:00 to 10:15 AM in Abu Dhabi on 21 October 2026
    { id: "1792555200000-imp1", who: "p2", drink: "Flat White", oz: 8, shots: 3, start: 1792555200000, end: 1792563300000, rating: 5, note: "", tz: "Asia/Dubai" },
    // Aaryaa, Drip Coffee, 9:36 to 9:47 AM in Pacific time on 21 October 2026
    { id: "1792600560000-imp2", who: "p1", drink: "Drip Coffee", oz: 12, shots: 1, start: 1792600560000, end: 1792601268000, rating: 0, note: "", tz: "America/Los_Angeles" },
  ],
};
