import { useState, useEffect } from "react";
import { getLeaderboard } from "../lib/api.js";

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
        if (!cancelled) setError(err.message ?? "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <section className="lb">
      <h2 className="lb-title">Leaderboard</h2>
      {loading && <p className="lb-msg">Loading…</p>}
      {error   && <p className="lb-msg lb-err">{error}</p>}
      {!loading && !error && players.length === 0 && (
        <p className="lb-msg">No medals yet — be first!</p>
      )}
      {players.length > 0 && (
        <table className="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>💎</th>
              <th>🥇</th>
              <th>🥈</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.address} className={p.rank <= 3 ? `lb-top${p.rank}` : ""}>
                <td className="lb-rank">
                  {p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : p.rank === 3 ? "🥉" : p.rank}
                </td>
                <td className="lb-addr">{p.address.slice(0,6)}…{p.address.slice(-4)}</td>
                <td className="lb-d">{p.diamond || "—"}</td>
                <td className="lb-g">{p.gold    || "—"}</td>
                <td className="lb-s">{p.silver  || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
