import { API_BASE } from "./contracts.js";

const get  = (path) => fetch(`${API_BASE}${path}`);
const post = (path, body) =>
  fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export async function fetchRound(tier) {
  const res = await get(`/api/round/${tier}`);
  return res.json();
}

export async function sendGuess({ tier, address, guess }) {
  const res = await post("/api/guess", {
    tier,
    address,
    guess: parseFloat(guess).toFixed(2),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = Object.assign(
      new Error(data.error || "Guess failed"),
      { status: res.status, data }
    );
    throw err;
  }
  return data;
}

export async function fetchHistory(tier, since = 0) {
  const res = await get(`/api/history/${tier}?since=${since}`);
  if (!res.ok) return { items: [], total: 0 };
  return res.json();
}

export async function fetchLeaderboard() {
  const res = await get("/api/leaderboard");
  return res.json(); // { players: [...], total }
}

export async function fetchMedals(address) {
  const res = await get(`/api/medals/${address}`);
  if (!res.ok) return { silver: 0, gold: 0, diamond: 0 };
  return res.json();
}
