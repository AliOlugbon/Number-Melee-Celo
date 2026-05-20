// src/components/Leaderboard.jsx
import { useState, useEffect } from "react";
import { getLeaderboard } from "../lib/api.js";
import { MEDAL_EMOJI } from "../store/useStore.js";

export default function Leaderboard() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const { players } = await getLeaderboard();
        if (!cancelled) setPlayers(players ?? []);
      } catch (err) {
        if (!cancelled) setError(err.message ?? "Failed to load leaderboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <section className="leaderboard">
      <h2 className="lb-title">Leaderboard</h2>

      {loading && <p className="lb-loading">Loading…</p>}
      {error   && <p className="lb-error">{error}</p>}

      {!loading && players.length === 0 && (
        <p className="lb-empty">No medals awarded yet. Be first!</p>
      )}

      {players.length > 0 && (
        <table className="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th title="Diamond">{MEDAL_EMOJI[2]}</th>
              <th title="Gold">{MEDAL_EMOJI[1]}</th>
              <th title="Silver">{MEDAL_EMOJI[0]}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.address} className={p.rank <= 3 ? `lb-top-${p.rank}` : ""}>
                <td className="lb-rank">
                  {p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : p.rank === 3 ? "🥉" : p.rank}
                </td>
                <td className="lb-addr">
                  {p.address.slice(0, 6)}…{p.address.slice(-4)}
                </td>
                <td className="lb-medal lb-diamond">{p.diamond || "—"}</td>
                <td className="lb-medal lb-gold">{p.gold    || "—"}</td>
                <td className="lb-medal lb-silver">{p.silver  || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
