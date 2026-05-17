import { TIERS } from "../lib/contracts.js";
import { useStore } from "../store/useStore.js";

export default function TierNav() {
  const { activeTier, tiers, setActiveTier } = useStore();

  return (
    <nav className="tier-nav">
      {TIERS.map((t) => {
        const state = tiers[t.id];
        const phase = state?.phase;
        const count = state?.playerCount || 0;

        const statusLabel =
          phase === 0 ? `Lobby ${count}/${t.maxPlayers}`
          : phase === 1 ? `Live ${count}/${t.maxPlayers}`
          : "—";

        const statusCls =
          phase === 1 ? "ts-live"
          : phase === 0 ? "ts-lobby"
          : "";

        return (
          <button
            key={t.id}
            className={`tier-btn${t.id === activeTier ? " active" : ""}`}
            style={t.id === activeTier
              ? { "--t-accent": t.accent, "--t-glow": t.accentGlow }
              : {}}
            onClick={() => setActiveTier(t.id)}
          >
            <span className="tb-medal">{t.emoji}</span>
            <span className="tb-name">{t.name}</span>
            <span className={`tb-status ${statusCls}`}>{statusLabel}</span>
          </button>
        );
      })}
    </nav>
  );
}
