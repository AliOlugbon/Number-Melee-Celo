import { motion, AnimatePresence } from "motion/react";
import { useStore } from "../store/useStore.js";
import { TIERS } from "../lib/contracts.js";

export default function NumberStage() {
  const { digits, digitClass, activeTier } = useStore();
  const tier = TIERS[activeTier];

  const boxStyle = {
    idle:   { borderColor: "var(--border)",      color: "var(--border-2)" },
    higher: { borderColor: tier.accent,           color: tier.accent,   boxShadow: `0 0 18px ${tier.accentGlow}` },
    lower:  { borderColor: "var(--red)",          color: "var(--red)",  boxShadow: "0 0 18px rgba(255,56,96,.2)" },
    solved: { borderColor: "var(--green)",        color: "var(--green)",boxShadow: "0 0 24px rgba(0,239,130,.32)" },
  }[digitClass] || {};

  const yAnim = digitClass === "higher" ? [0, -8, 0]
              : digitClass === "lower"  ? [0,  8, 0]
              : 0;

  return (
    <div className="number-stage">
      <div className="ns-medal">{tier.emoji} {tier.name}</div>
      <div className="ns-display">
        {digits.map((d, i) => (
          <>
            {i === 2 && (
              <motion.span key="dot" className="ndot"
                animate={{ color: digitClass === "solved" ? "var(--green)" : "var(--border-2)" }}
                transition={{ duration: 0.4 }}>.
              </motion.span>
            )}
            <motion.div
              key={i}
              className={`nb${digitClass === "solved" ? " solved" : ""}`}
              animate={{ ...boxStyle, y: yAnim, scale: digitClass === "solved" ? 1.08 : 1 }}
              transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <AnimatePresence mode="wait">
                <motion.span key={d}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                  {d}
                </motion.span>
              </AnimatePresence>
            </motion.div>
          </>
        ))}
      </div>
      <div className="ns-range">range 10.00 → 99.99 · 2 decimal places</div>
    </div>
  );
}
