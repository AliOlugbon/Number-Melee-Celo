import { motion, AnimatePresence } from "motion/react";
import { useStore } from "../store/useStore.js";

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const sc2s  = (s) => (Number(s) / 100).toFixed(2);

// ─── HistoryPanel ─────────────────────────────────────────────────────────────
export function HistoryPanel() {
  const { history } = useStore();

  const badgeLabel = (hint) =>
    hint === "higher"  ? "⬆ HIGHER"
    : hint === "lower" ? "⬇ LOWER"
    : hint === "correct" ? "✓ WIN"
    : "…";

  return (
    <div className="side-card">
      <div className="sc-head">
        <span className="sc-title">GUESS HISTORY</span>
        <span className="sc-meta">{history.length} guesses</span>
      </div>
      <div className="hist-scroll">
        {history.length === 0 && (
          <div className="hist-empty">No guesses yet this round</div>
        )}
        <AnimatePresence initial={false}>
          {history.map((item) => {
            const cls = item.hint === "correct" ? "correct" : (item.hint || "pending");
            return (
              <motion.div
                key={`${item.idx}-${item.player}`}
                className={`hist-item ${cls}`}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="hi-num">{sc2s(item.guess_scaled)}</div>
                <div className="hi-who">{short(item.player)}</div>
                <div className={`hi-badge ${cls}`}>{badgeLabel(item.hint)}</div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── FeedPanel ────────────────────────────────────────────────────────────────
export function FeedPanel() {
  const { feed } = useStore();
  return (
    <div className="side-card">
      <div className="sc-head">
        <span className="sc-title">LIVE FEED</span>
        <span className="live-pip" />
      </div>
      <ul className="feed-list">
        <AnimatePresence initial={false}>
          {feed.map((item) => (
            <motion.li
              key={item.id}
              className="feed-li"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <span className="fl-ico">{item.icon}</span>
              <div>
                <div className="fl-who">{item.who}</div>
                <div className={`fl-msg${item.cls ? ` ${item.cls}` : ""}`}>{item.msg}</div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
