import { normalize } from "./model.js";

/* Talks to the coffee-api Cloudflare Worker, which holds the shared log. */
const API = import.meta.env.VITE_SIP_API || "https://coffee-api.aaryaa-kamdar.workers.dev";

async function call(path, init) {
  const res = await fetch(`${API}${path}`, { cache: "no-store", signal: AbortSignal.timeout(10000), ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `the log answered ${res.status}`);
  return body;
}

export function createRemoteStore() {
  return {
    kind: "remote",
    async load() { return normalize(await call("/sip/state")); },
    async apply(op, ...args) {
      try {
        await call("/sip/op", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, args }) });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.name === "TimeoutError" ? "the log took too long to answer" : String(e.message).slice(0, 80) };
      }
    },
  };
}
