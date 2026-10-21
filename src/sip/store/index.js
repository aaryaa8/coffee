import { createLocalStore } from "./local.js";
import { createRemoteStore } from "./remote.js";

/* Add ?local to the address to try the app with a log kept only in this browser. */
const local = new URLSearchParams(location.search).has("local");

export const store = local ? createLocalStore() : createRemoteStore();
