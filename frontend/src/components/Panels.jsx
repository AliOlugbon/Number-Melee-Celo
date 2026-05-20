// src/components/Panels.jsx

import { useStore, MEDAL_EMOJI } from "../store/useStore.js";

// ── HistoryPanel ──────────────────────────────────────────────────────────────
// Shows guess history for this round (from /api/history poll).

export function HistoryPanel() {
  const { history, joined } = useStore();

  if (!joined) return null;

  const recent = [...history].reverse().slice(0, 50);

  return (
    <section className="panel history-panel">
      <h3 className="panel-title">Guesses</h3>
      {recent.length === 0 ? (
        <p className="panel-empty">No guesses yet.</p>
      ) : (
        <ul className="history-list">
          {recent.map((r) => (
            <li key={r.idx} className={`history-item hint-${r.hint}`}>
              <span className="h-player">
                {r.player.slice(0, 6)}…{r.player.slice(-3)}
              </span>
              <span className="h-guess">{(r.guess_scaled / 100).toFixed(2)}</span>
              <span className="h-hint">
                {r.hint === "higher"  && "↑"}
                {r.hint === "lower"   && "↓"}
                {r.hint === "correct" && "✓"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── FeedPanel ─────────────────────────────────────────────────────────────────
// Shows live round events: joins, mode changes, wins, aborts.

const FEED_ICONS = {
  round_opened:  "🆕",
  competitive:   "⚔️",
  join:          "👤",
  round_done:    "🏁",
};

function feedLabel(entry) {
  switch (entry.type) {
    case "round_opened":
      return `Round #${entry.roundId} opened`;
    case "competitive":
      return `Competitive! ${entry.playerCount} players`;
    case "join":
      return `${entry.player?.slice(0, 6) ?? ""}… joined`;
    case "round_done":
      return `Round #${entry.roundId} ended`;
    default:
      return entry.type;
  }
}

export function FeedPanel() {
  const { feed } = useStore();

  return (
    <section className="panel feed-panel">
      <h3 className="panel-title">Feed</h3>
      {feed.length === 0 ? (
        <p className="panel-empty">Nothing yet.</p>
      ) : (
        <ul className="feed-list">
          {feed.map((entry, i) => (
            <li key={i} className="feed-item">
              <span className="feed-icon">{FEED_ICONS[entry.type] ?? "•"}</span>
              <span className="feed-label">{feedLabel(entry)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
