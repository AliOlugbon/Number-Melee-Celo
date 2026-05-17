import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useStore } from "../store/useStore.js";
import { TIERS } from "../lib/contracts.js";

// ─── HintBar ─────────────────────────────────────────────────────────────────
export function HintBar() {
  const { hint } = useStore();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={hint.type + hint.msg}
        className={`hint-bar${hint.type ? ` ${hint.type}` : ""}`}
        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.22 }}
      >
        <span className="hint-ico">{hint.icon}</span>
        <span className="hint-lbl">{hint.msg}</span>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── CooldownBar ─────────────────────────────────────────────────────────────
export function CooldownBar() {
  const { cooldownEnd } = useStore();
  const [rem, setRem] = useState(0);
  const TOTAL = 5;

  useEffect(() => {
    if (!cooldownEnd) { setRem(0); return; }
    const id = setInterval(() => {
      const r = Math.max(0, (cooldownEnd - Date.now()) / 1000);
      setRem(r);
      if (r <= 0) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, [cooldownEnd]);

  if (!cooldownEnd || rem <= 0) return null;

  return (
    <div className="cd-row">
      <span className="cd-text">Next guess in <b>{rem.toFixed(1)}s</b></span>
      <div className="cd-track">
        <motion.div className="cd-fill"
          animate={{ width: `${(rem / TOTAL) * 100}%` }}
          transition={{ duration: 0.08, ease: "linear" }} />
      </div>
    </div>
  );
}

// ─── StatsBar ─────────────────────────────────────────────────────────────────
export function StatsBar() {
  const { activeTier, tiers } = useStore();
  const t     = TIERS[activeTier];
  const state = tiers[activeTier];

  return (
    <div className="stats-bar">
      <div className="sb-item">
        <div className="sb-lbl">TIER</div>
        <div className="sb-val" style={{ color: t.accent }}>{t.emoji} {t.name}</div>
      </div>
      <div className="sb-item">
        <div className="sb-lbl">PLAYERS</div>
        <div className="sb-val">{state?.playerCount || 0}/{t.maxPlayers}</div>
      </div>
      <div className="sb-item">
        <div className="sb-lbl">STATUS</div>
        <div className={`sb-val ${state?.phase === 1 ? "green" : state?.phase === 0 ? "gold" : ""}`}>
          {state?.phase === 0 ? "Lobby"
           : state?.phase === 1 ? "Live 🔴"
           : state?.phase === 2 ? "Done"
           : "—"}
        </div>
      </div>
      <div className="sb-item">
        <div className="sb-lbl">MY GUESSES</div>
        <div className="sb-val">{state?.myGuesses || 0}</div>
      </div>
    </div>
  );
}
