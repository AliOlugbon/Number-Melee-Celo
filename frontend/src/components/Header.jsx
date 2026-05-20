// src/components/Header.jsx
import { useStore, MEDAL_EMOJI } from "../store/useStore.js";

export default function Header() {
  const { address, isMiniPay, medals, activeTab, setTab } = useStore();

  const shortAddr = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  return (
    <header className="header">
      <div className="header-brand">
        <span className="header-logo">🔢</span>
        <span className="header-title">NumMelee</span>
      </div>

      <nav className="header-tabs">
        <button
          className={`tab-btn ${activeTab === "play" ? "active" : ""}`}
          onClick={() => setTab("play")}
        >
          Play
        </button>
        <button
          className={`tab-btn ${activeTab === "leaderboard" ? "active" : ""}`}
          onClick={() => setTab("leaderboard")}
        >
          Board
        </button>
      </nav>

      <div className="header-right">
        {address ? (
          <>
            {/* Medal badges */}
            <div className="header-medals">
              {medals.diamond > 0 && (
                <span className="medal-badge diamond" title="Diamond">
                  {MEDAL_EMOJI[2]} {medals.diamond}
                </span>
              )}
              {medals.gold > 0 && (
                <span className="medal-badge gold" title="Gold">
                  {MEDAL_EMOJI[1]} {medals.gold}
                </span>
              )}
              {medals.silver > 0 && (
                <span className="medal-badge silver" title="Silver">
                  {MEDAL_EMOJI[0]} {medals.silver}
                </span>
              )}
            </div>

            <span className={`wallet-badge ${isMiniPay ? "minipay" : ""}`}>
              {isMiniPay && <span className="minipay-dot" title="MiniPay" />}
              {shortAddr}
            </span>
          </>
        ) : (
          <span className="wallet-badge disconnected">No wallet</span>
        )}
      </div>
    </header>
  );
}
