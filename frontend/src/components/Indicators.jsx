import { useEffect, useRef, useState } from "react";
import { useStore, PHASE_SOLO, PHASE_COMPETITIVE, PHASE_DONE } from "../store/useStore.js";

// ── Solo countdown (ticks locally between server polls) ───────────────────────
function useSoloCountdown() {
  const { phase, soloRemaining } = useStore();
  const [display, setDisplay]    = useState(0);
  const base = useRef({ ts: 0, secs: 0 });

  useEffect(() => {
    if (phase !== PHASE_SOLO) { setDisplay(0); return; }
    if (soloRemaining > 0) {
      base.current = { ts: Date.now(), secs: soloRemaining };
      setDisplay(soloRemaining);
    }
  }, [phase, soloRemaining]);

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

function fmt(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

// ── StatsGrid ─────────────────────────────────────────────────────────────────
// 4 dark cards matching the reference: MODE | PLAYERS | TIMER | MY GUESSES
// Timer value uses the exact same font-size as PLAYERS (sg-value).

export function StatsGrid() {
  const { roundId, phase, playerCount, guessCount } = useStore();
  const soloSecs = useSoloCountdown();

  const modeLabel =
    phase === PHASE_SOLO        ? "Solo"
    : phase === PHASE_COMPETITIVE ? "Compet."
    : "—";

  const modeClass =
    phase === PHASE_SOLO        ? "sg-val--solo"
    : phase === PHASE_COMPETITIVE ? "sg-val--comp"
    : "sg-val--dim";

  const timerVal     = phase === PHASE_SOLO ? fmt(soloSecs) : "—";
  const timerExpired = phase === PHASE_SOLO && soloSecs <= 0;

  const players = (roundId && phase !== PHASE_DONE)
    ? `${playerCount}/25`
    : "0/25";

  return (
    <div className="sg-grid">
      <div className="sg-card">
        <span className="sg-label">MODE</span>
        <span className={`sg-val ${modeClass}`}>{modeLabel}</span>
      </div>
      <div className="sg-card">
        <span className="sg-label">PLAYERS</span>
        <span className="sg-val">{players}</span>
      </div>
      <div className="sg-card">
        <span className="sg-label">TIMER</span>
        <span className={`sg-val${timerExpired ? " sg-val--expired" : ""}`}>
          {timerVal}
        </span>
      </div>
      <div className="sg-card">
        <span className="sg-label">{"MY\nGUESSES"}</span>
        <span className="sg-val">{guessCount}</span>
      </div>
    </div>
  );
}

// ── HintBar ───────────────────────────────────────────────────────────────────

export function HintBar() {
  const { lastHint, lastGuess, guessCount } = useStore();
  if (!lastHint) return null;

  const map = {
    higher:  { cls: "hb--higher",  icon: "↑", text: "Go higher"  },
    lower:   { cls: "hb--lower",   icon: "↓", text: "Go lower"   },
    correct: { cls: "hb--correct", icon: "✓", text: "Correct!"   },
  };
  const { cls, icon, text } = map[lastHint] ?? {};

  return (
    <div className={`hb ${cls}`}>
      <span className="hb-icon">{icon}</span>
      <span className="hb-text">{text}</span>
      {lastGuess && <span className="hb-guess">{lastGuess}</span>}
      <span className="hb-count">#{guessCount}</span>
    </div>
  );
}

// ── CooldownBar ───────────────────────────────────────────────────────────────

export function CooldownBar() {
  const { cooldownSecs, setCooldown } = useStore();
  const [pct, setPct]   = useState(0);
  const [label, setLbl] = useState("");
  const raf  = useRef(null);
  const base = useRef({ ts: 0, init: 0 });

  useEffect(() => {
    if (cooldownSecs <= 0) { setPct(0); return; }
    base.current = { ts: Date.now(), init: cooldownSecs };
    function tick() {
      const elapsed   = (Date.now() - base.current.ts) / 1000;
      const remaining = Math.max(0, base.current.init - elapsed);
      setPct((remaining / 5) * 100);
      setLbl(`${remaining.toFixed(1)} s`);
      if (remaining > 0) raf.current = requestAnimationFrame(tick);
      else { setPct(0); setCooldown(0); }
    }
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [cooldownSecs]);

  if (pct <= 0) return null;

  return (
    <div className="cd-wrap">
      <div className="cd-track"><div className="cd-fill" style={{ width: `${pct}%` }} /></div>
      <span className="cd-label">{label}</span>
    </div>
  );
}
