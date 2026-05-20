// src/components/Indicators.jsx

import { useEffect, useRef, useState } from "react";
import { useStore, PHASE_SOLO, PHASE_COMPETITIVE, PHASE_DONE } from "../store/useStore.js";

// ── StatsBar ──────────────────────────────────────────────────────────────────
// Shows: round mode, player count, round ID.

export function StatsBar() {
  const { roundId, phase, playerCount, isCompetitive } = useStore();

  if (!roundId || phase === PHASE_DONE) return null;

  const modeLabel = phase === PHASE_SOLO
    ? "Solo"
    : `Competitive`;

  const modeClass = phase === PHASE_SOLO ? "stat-solo" : "stat-competitive";

  return (
    <div className="stats-bar">
      <span className={`stat-chip ${modeClass}`}>{modeLabel}</span>
      <span className="stat-chip">
        👥 {playerCount} / 25
      </span>
      <span className="stat-chip stat-dim">
        Round #{roundId}
      </span>
    </div>
  );
}

// ── HintBar ───────────────────────────────────────────────────────────────────
// Shows the last hint in a coloured strip below the number stage.

export function HintBar() {
  const { lastHint, lastGuess, guessCount } = useStore();

  if (!lastHint) return null;

  const config = {
    higher:  { cls: "hint-higher",  icon: "↑", text: "Go higher" },
    lower:   { cls: "hint-lower",   icon: "↓", text: "Go lower"  },
    correct: { cls: "hint-correct", icon: "✓", text: "Correct!"  },
  }[lastHint] ?? {};

  return (
    <div className={`hint-bar ${config.cls}`}>
      <span className="hint-icon">{config.icon}</span>
      <span className="hint-text">{config.text}</span>
      {lastGuess && <span className="hint-guess-tag">{lastGuess}</span>}
      <span className="hint-count">#{guessCount}</span>
    </div>
  );
}

// ── CooldownBar ───────────────────────────────────────────────────────────────
// Ticking progress bar for the 5-second guess cooldown.

export function CooldownBar() {
  const { cooldownSecs, setCooldown } = useStore();
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef({ ts: 0, initial: 0 });

  useEffect(() => {
    if (cooldownSecs <= 0) {
      setDisplay(0);
      return;
    }
    startRef.current = { ts: Date.now(), initial: cooldownSecs };

    function tick() {
      const elapsed = (Date.now() - startRef.current.ts) / 1000;
      const remaining = Math.max(0, startRef.current.initial - elapsed);
      setDisplay(remaining);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setCooldown(0);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cooldownSecs]);

  if (display <= 0) return null;

  const pct = (display / 5) * 100;

  return (
    <div className="cooldown-bar-wrap">
      <div className="cooldown-bar" style={{ width: `${pct}%` }} />
      <span className="cooldown-label">{display.toFixed(1)} s</span>
    </div>
  );
}
