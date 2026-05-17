import { useStore } from "../store/useStore.js";
import { useMiniPay } from "../hooks/useMiniPay.js";
import { useState } from "react";

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function Header() {
  const { account, isMiniPay, myMedals, activeTab, setActiveTab } = useStore();
  const { connect, autoConnecting } = useMiniPay();
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try { await connect(); } catch (e) { alert(e.message); }
    finally { setConnecting(false); }
  }

  return (
    <header className="hdr">
      <div className="hdr-brand">
        <span className="hdr-logo">NUM<em>MELEE</em></span>
        <span className="hdr-sub">Celo · Medal Challenge</span>
      </div>

      {/* Tab switcher */}
      <div className="hdr-tabs">
        <button
          className={`htab${activeTab === "play" ? " active" : ""}`}
          onClick={() => setActiveTab("play")}
        >🎮 Play</button>
        <button
          className={`htab${activeTab === "leaderboard" ? " active" : ""}`}
          onClick={() => setActiveTab("leaderboard")}
        >🏆 Board</button>
      </div>

      <div className="hdr-right">
        {/* My medals quick-view */}
        {account && (
          <div className="my-medals">
            <span>💎{myMedals.diamond}</span>
            <span>🥇{myMedals.gold}</span>
            <span>🥈{myMedals.silver}</span>
          </div>
        )}

        {autoConnecting || connecting ? (
          <div className="wallet-chip">
            <span className="wc-dot" style={{ background: "var(--gold)" }} />
            <span>Connecting…</span>
          </div>
        ) : !account ? (
          !isMiniPay && (
            <button className="btn-connect" onClick={handleConnect}>Connect</button>
          )
        ) : (
          <div className="wallet-chip">
            <span className="wc-dot" />
            <span>{short(account)}</span>
            {isMiniPay && <span className="mp-badge">MiniPay</span>}
          </div>
        )}
      </div>
    </header>
  );
}
