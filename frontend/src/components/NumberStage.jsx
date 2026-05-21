import { useStore, PHASE_DONE, PHASE_SOLO, PHASE_COMPETITIVE } from "../store/useStore.js";

const BOX_CLS = {
  higher:  "db--higher",
  lower:   "db--lower",
  correct: "db--correct",
};

const HINT_INFO = {
  higher:  { arrow: "↑", label: "Go higher",  cls: "sh--higher"  },
  lower:   { arrow: "↓", label: "Go lower",   cls: "sh--lower"   },
  correct: { arrow: "✓", label: "Correct!",   cls: "sh--correct" },
};

export default function NumberStage() {
  const { phase, roundId, lastHint, lastGuess } = useStore();

  const boxCls  = lastHint ? BOX_CLS[lastHint]  : "";
  const hintInf = lastHint ? HINT_INFO[lastHint] : null;

  // ── Idle ───────────────────────────────────────────────────────────────────
  if (!roundId || phase === PHASE_DONE) {
    return (
      <div className="ns ns--idle">
        <span className="ns-idle-icon">🎯</span>
        <p className="ns-idle-label">No active round</p>
        <p className="ns-idle-sub">Be the first to open one</p>
      </div>
    );
  }

  return (
    <div className={`ns ns--live${phase === PHASE_COMPETITIVE ? " ns--comp" : ""}`}>

      {/* Mode pill */}
      <span className={`ns-mode-pill${phase === PHASE_COMPETITIVE ? " ns-mode-pill--comp" : ""}`}>
        {phase === PHASE_SOLO ? "Solo" : "⚔️ Competitive"}
      </span>

      {/* Digit boxes: [?][?].[?][?] */}
      <div className="digit-row">
        <div className={`db ${boxCls}`}>?</div>
        <div className={`db ${boxCls}`}>?</div>
        <div className="digit-dot">.</div>
        <div className={`db ${boxCls}`}>?</div>
        <div className={`db ${boxCls}`}>?</div>
      </div>

      {/* Hint or sub-label */}
      {hintInf ? (
        <div className={`sh ${hintInf.cls}`}>
          <span className="sh-arrow">{hintInf.arrow}</span>
          <span className="sh-label">{hintInf.label}</span>
          {lastGuess && <span className="sh-guess">your guess: {lastGuess}</span>}
        </div>
      ) : (
        <p className="ns-sublabel">range 10.00 – 99.99 · 2 decimal places</p>
      )}

    </div>
  );
}
