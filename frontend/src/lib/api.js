// All fetch calls go to /api/… — Vite proxies these to http://localhost:3001
// in dev. In production set VITE_API_URL to the deployed backend URL.

const BASE = import.meta.env.VITE_API_URL ?? "";

async function req(path, opts = {}) {
  const res  = await fetch(`${BASE}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = Object.assign(new Error(json.error ?? "api error"), {
      status: res.status,
      body:   json,
    });
    throw err;
  }
  return json;
}

export const getCommitment = ()              => req("/api/commitment");
export const getRound      = ()              => req("/api/round");
export const getHistory    = (since = 0)     => req(`/api/history?since=${since}`);
export const getCooldown   = (address)       => req(`/api/cooldown?address=${encodeURIComponent(address)}`);
export const getLeaderboard= ()              => req("/api/leaderboard");
export const getMedals     = (address)       => req(`/api/medals/${address}`);

export function postGuess(address, guess) {
  return req("/api/guess", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ address, guess }),
  });
}
