// src/lib/api.js
// HTTP client for the NumberGuess backend. No tiers.

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? "api error"), { status: res.status, body: json });
  return json;
}

// ── Round ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/commitment
 * Backend generates secret, returns commitment bytes32 hex.
 * The first joiner passes this into join() on-chain.
 * @returns {{ commitment: string, already_open: boolean }}
 */
export function getCommitment() {
  return req("/api/commitment");
}

/**
 * GET /api/round
 * @returns {{
 *   round_id: number, phase: number, player_count: number,
 *   opened_at: number, started_at: number,
 *   max_players: number, solo_remaining: number, is_competitive: boolean
 * }}
 */
export function getRound() {
  return req("/api/round");
}

// ── Guess ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/guess
 * @param {string} address  checksummed player address
 * @param {string} guess    display string e.g. "42.75"
 * @returns {{ hint: "higher"|"lower"|"correct", guess_scaled: number, idx: number }}
 */
export function postGuess(address, guess) {
  return req("/api/guess", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ address, guess }),
  });
}

// ── History ───────────────────────────────────────────────────────────────────

/**
 * GET /api/history?since=N
 * @param {number} since  start index (0-based)
 * @returns {{ total: number, items: Array }}
 */
export function getHistory(since = 0) {
  return req(`/api/history?since=${since}`);
}

// ── Cooldown ──────────────────────────────────────────────────────────────────

/**
 * GET /api/cooldown?address=0x…
 * @returns {{ remaining: number }}
 */
export function getCooldown(address) {
  return req(`/api/cooldown?address=${encodeURIComponent(address)}`);
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

/**
 * GET /api/leaderboard
 * @returns {{ players: Array, total: number }}
 */
export function getLeaderboard() {
  return req("/api/leaderboard");
}

// ── Medals ────────────────────────────────────────────────────────────────────

/**
 * GET /api/medals/:address
 * @returns {{ address: string, silver: number, gold: number, diamond: number }}
 */
export function getMedals(address) {
  return req(`/api/medals/${address}`);
}
