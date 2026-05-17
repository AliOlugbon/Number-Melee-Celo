import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useStore } from "../store/useStore.js";
import { fetchLeaderboard } from "../lib/api.js";

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const RANK_ICONS = ["🥇", "🥈", "🥉"];

// Score helper: diamond worth 3, gold 2, silver 1
const score = (p) => p.diamond * 3 + p.gold * 2 + p.silver;

export default function Leaderboard() {
  const { account, leaderboard, leaderboardTotal, setLeaderboard } = useStore();
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState("all"); // "all" | "diamond" | "gold" | "silver"
  const [lastFetch, setLastFetch] = useState(0);

  const load = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch < 10_000) return; // 10s cache
    setLoading(true);
    try {
      const data = await fetchLeaderboard();
      setLeaderboard(data.players || [], data.total || 0);
      setLastFetch(Date.now());
    } catch (e) {
      console.warn("leaderboard:", e);
    } finally {
      setLoading(false);
    }
  }, [lastFetch, setLeaderboard]);

  useEffect(() => { load(true); }, []);

  // Apply filter + sort
  const filtered = leaderboard
    .filter((p) => {
      if (filter === "diamond") return p.diamond > 0;
      if (filter === "gold")    return p.gold    > 0;
      if (filter === "silver")  return p.silver  > 0;
      return true;
    })
    .sort((a, b) => score(b) - score(a));

  const myEntry = account
    ? leaderboard.find((p) => p.address.toLowerCase() === account.toLowerCase())
    : null;

  return (
    <div className="leaderboard">
      {/* Header */}
      <div className="lb-header">
        <div className="lb-title">🏆 Leaderboard</div>
        <div className="lb-sub">{leaderboardTotal} players · sorted by medal score</div>
        <button className="btn-refresh" onClick={() => load(true)} disabled={loading}>
          {loading ? "⟳" : "↻ Refresh"}
        </button>
      </div>

      {/* My position callout */}
      {myEntry && (
        <motion.div className="my-rank-card"
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <span className="mrc-label">Your rank</span>
          <span className="mrc-rank">#{myEntry.rank}</span>
          <span className="mrc-medals">
            💎{myEntry.diamond} · 🥇{myEntry.gold} · 🥈{myEntry.silver}
          </span>
          <span className="mrc-score">{score(myEntry)} pts</span>
        </motion.div>
      )}

      {/* Filter tabs */}
      <div className="lb-filters">
        {[
          { key: "all",     label: "All" },
          { key: "diamond", label: "💎 Diamond" },
          { key: "gold",    label: "🥇 Gold" },
          { key: "silver",  label: "🥈 Silver" },
        ].map((f) => (
          <button
            key={f.key}
            className={`lbf-btn${filter === f.key ? " active" : ""}`}
            onClick={() => setFilter(f.key)}
          >{f.label}</button>
        ))}
      </div>

      {/* Table header */}
      <div className="lb-row lb-head">
        <span className="lbc-rank">#</span>
        <span className="lbc-addr">Player</span>
        <span className="lbc-medals">💎 Gold Silver</span>
        <span className="lbc-score">Score</span>
      </div>

      {/* Rows */}
      <div className="lb-body">
        {loading && filtered.length === 0 && (
          <div className="lb-loading">
            <div className="ring sm" />
            <span>Loading…</span>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="lb-empty">No players yet — be the first to win a medal!</div>
        )}
        <AnimatePresence initial={false}>
          {filtered.map((p, i) => {
            const isMe = account && p.address.toLowerCase() === account.toLowerCase();
            const rankIcon = i < 3 ? RANK_ICONS[i] : null;
            return (
              <motion.div
                key={p.address}
                className={`lb-row lb-data${isMe ? " is-me" : ""}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.02 }}
              >
                <span className="lbc-rank">
                  {rankIcon || <span className="rank-num">#{i + 1}</span>}
                </span>
                <span className="lbc-addr">
                  {short(p.address)}
                  {isMe && <span className="you-badge">YOU</span>}
                </span>
                <span className="lbc-medals">
                  <span className="medal-val diamond">{p.diamond}</span>
                  <span className="medal-val gold">{p.gold}</span>
                  <span className="medal-val silver">{p.silver}</span>
                </span>
                <span className="lbc-score">{score(p)}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="lb-legend">
        <span>Score: 💎×3 + 🥇×2 + 🥈×1</span>
      </div>
    </div>
  );
}
