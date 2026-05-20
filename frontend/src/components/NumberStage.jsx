// src/components/NumberStage.jsx
//
// Timer now seeds from soloRemaining (server-computed from chain opened_at).
// This is reliable since server.py was fixed to use info[3] (block.timestamp)
// not game_state["opened_at"] (the async-set float).
//
// Layout change: timer is compact/secondary. The hint response is the hero.

import { useEffect, useRef, useState } from "react";
import { useStore, PHASE_SOLO, PHASE_COMPETITIVE, PHASE_DONE } from "../store/useStore.js";

const SOLO_TIMEOUT = 300;

// ── Countdown hook ────────────────────────────────────────────────────────────
// Seeds from soloRemaining on each server update; ticks locally in between.
function useSoloCountdown() {
  const { phase, soloRemaining } = useStore();
  const [display, setDisplay]    = useState(soloRemaining);
  const base = useRef({ ts: 0, secs: 0 });

  // Sync baseline whenever server sends a new value
  useEffect(() => {
    if (phase !== PHASE_SOLO) { setDisplay(0); return; }
    if (soloRemaining > 0) {
      base.current = { ts: Date.now(), secs: soloRemaining };
      setDisplay(soloRemaining);
    }
  }, [phase, soloRemaining]);

  // Tick locally
  useEffect(() => {
    if (phase !== PHASE_SOLO) return;
    const id = setInterval(() => {
      const elapsed   = (Date.now() - base.current.ts) / 1000;
      const remaining = Math.max(0, base.current.secs - elapsed);
      setDisplay(Math.ceil(remaining));
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  return display;
}

function fmt(totalSecs) {
  const s = Math.max(0, Math.ceil(totalSecs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function medalPace(soloSecs) {
  // Based on remaining time — what medal is the player currently on track for?
  if (soloSecs <= 0)              return null;
  if (soloSecs > SOLO_TIMEOUT - 60)  return { emoji: "💎", cls: "pace-diamond", label: "Diamond pace" };
  if (soloSecs > SOLO_TIMEOUT - 180) return { emoji: "🥇", cls: "pace-gold",    label: "Gold pace"    };
  return                                     { emoji: "🥈", cls: "pace-silver",  label: "Silver pace"  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NumberStage() {
  const { phase, playerCount, roundId, lastHint, lastGuess } = useStore();
  const soloSecs = useSoloCountdown();

  // ── No active round ───────────────────────────────────────────────────────
  if (!roundId || phase === PHASE_DONE) {
    return (
      <div className="stage stage--idle">
        <span className="stage-idle-icon">🎯</span>
        <p className="stage-idle-label">No active round</p>
        <p className="stage-idle-sub">Be the first to open one below</p>
      </div>
    );
  }

  // ── Solo ──────────────────────────────────────────────────────────────────
  if (phase === PHASE_SOLO) {
    const expired = soloSecs <= 0;
    const pace    = medalPace(soloSecs);

    return (
      <div className={`stage stage--solo${expired ? " stage--expired" : ""}`}>

        {/* Row 1: mode chip + compact timer */}
        <div className="stage-top-row">
          <span className="mode-chip mode-chip--solo">Solo</span>
          <span className={`solo-timer${expired ? " solo-timer--expired" : ""}`}>
            ⏱ {fmt(soloSecs)}
          </span>
          {pace && !expired && (
            <span className={`pace-chip ${pace.cls}`}>
              {pace.emoji} {pace.label}
            </span>
          )}
        </div>

        {/* Row 2: hint (hero) or waiting message */}
        {lastHint ? (
          <div className={`hint-hero hint-hero--${lastHint}`}>
            <span className="hint-hero-arrow">
              {lastHint === "higher" ? "↑" : lastHint === "lower" ? "↓" : "✓"}
            </span>
            <span className="hint-hero-text">
              {lastHint === "higher"  && "Go higher"}
              {lastHint === "lower"   && "Go lower"}
              {lastHint === "correct" && "Correct!"}
            </span>
            {lastGuess && (
              <span className="hint-hero-guess">your guess: {lastGuess}</span>
            )}
          </div>
        ) : (
          <p className={`stage-waiting${expired ? " stage-waiting--expired" : ""}`}>
            {expired
              ? "Window closing — round ending soon…"
              : "Waiting for challengers… make your first guess!"}
          </p>
        )}

      </div>
    );
  }

  // ── Competitive ───────────────────────────────────────────────────────────
  if (phase === PHASE_COMPETITIVE) {
    return (
      <div className="stage stage--competitive">

        <div className="stage-top-row">
          <span className="mode-chip mode-chip--competitive">⚔️ Competitive</span>
          <span className="player-count-chip">👥 {playerCount}</span>
        </div>

        {lastHint ? (
          <div className={`hint-hero hint-hero--${lastHint}`}>
            <span className="hint-hero-arrow">
              {lastHint === "higher" ? "↑" : lastHint === "lower" ? "↓" : "✓"}
            </span>
            <span className="hint-hero-text">
              {lastHint === "higher"  && "Go higher"}
              {lastHint === "lower"   && "Go lower"}
              {lastHint === "correct" && "Correct!"}
            </span>
            {lastGuess && (
              <span className="hint-hero-guess">your guess: {lastGuess}</span>
            )}
          </div>
        ) : (
          <p className="stage-waiting">
            Round is live — enter your guess below!
          </p>
        )}

      </div>
    );
  }

  return null;
}
