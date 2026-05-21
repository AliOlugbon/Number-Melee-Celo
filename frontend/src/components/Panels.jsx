import { useStore } from "../store/useStore.js";

// ── HistoryPanel ──────────────────────────────────────────────────────────────

export function HistoryPanel() {
  const { history, joined } = useStore();
  if (!joined) return null;

  const rows = [...history].reverse().slice(0, 50);

  return (
    <section className="panel">
      <h3 className="panel-title">GUESSES</h3>
      {rows.length === 0 ? (
        <p className="panel-empty">No guesses yet.</p>
      ) : (
        <ul className="hist-list">
          {rows.map((r) => (
            <li key={r.idx} className={`hist-item hb--${r.hint}`}>
              <span className="hist-player">
                {r.player.slice(0,6)}…{r.player.slice(-3)}
              </span>
              <span className="hist-val">{(r.guess_scaled / 100).toFixed(2)}</span>
              <span className="hist-arrow">
                {r.hint === "higher" ? "↑" : r.hint === "lower" ? "↓" : "✓"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── FeedPanel ─────────────────────────────────────────────────────────────────

const FEED_ICON = {
  round_opened: "🆕",
  competitive:  "⚔️",
  join:         "👤",
  round_done:   "🏁",
};

function feedLabel(e) {
  switch (e.type) {
    case "round_opened": return `Round #${e.roundId} opened`;
    case "competitive":  return `Competitive! ${e.playerCount} players`;
    case "join":         return `${e.player?.slice(0,6) ?? ""}… joined`;
    case "round_done":   return `Round #${e.roundId} ended`;
    default:             return e.type;
  }
}

export function FeedPanel() {
  const { feed } = useStore();
  return (
    <section className="panel">
      <h3 className="panel-title">FEED</h3>
      {feed.length === 0 ? (
        <p className="panel-empty">Nothing yet.</p>
      ) : (
        <ul className="feed-list">
          {feed.map((e, i) => (
            <li key={i} className="feed-item">
              <span className="feed-icon">{FEED_ICON[e.type] ?? "•"}</span>
              <span className="feed-label">{feedLabel(e)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
