import { useState } from "react";
import { useStore } from "../store/useStore.js";
import { makePublicClient, makeWalletClient } from "../lib/viem.js";

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function Header() {
  const {
    account, isMiniPay, autoConnecting,
    myMedals, activeTab, setActiveTab, setWallet, addFeed,
  } = useStore();
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      if (!window.ethereum) throw new Error("No wallet found. Install MetaMask or use MiniPay.");
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      const { getAddress } = await import("viem");
      const acc = getAddress(accs[0]);
      setWallet({ account: acc, pubClient: makePublicClient(), walClient: makeWalletClient(acc) });
      addFeed("🔗", "Wallet", `${acc.slice(0, 6)}…${acc.slice(-4)} connected`);
    } catch (e) {
      alert(e.message);
    } finally {
      setConnecting(false);
    }
  }

  const isConnecting = connecting || autoConnecting;

  return (
    <header className="hdr">
      <div className="hdr-brand">
        <span className="hdr-logo">NUM<em>MELEE</em></span>
        <span className="hdr-sub">Celo · Medal Challenge · Free to Play</span>
      </div>

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
        {account && (
          <div className="my-medals">
            <span title="Diamond medals">💎 {myMedals.diamond}</span>
            <span title="Gold medals">🥇 {myMedals.gold}</span>
            <span title="Silver medals">🥈 {myMedals.silver}</span>
          </div>
        )}

        {isConnecting ? (
          <div className="wallet-chip">
            <span className="wc-dot" style={{ background: "var(--gold)" }} />
            <span>Connecting…</span>
          </div>
        ) : account ? (
          <div className="wallet-chip">
            <span className="wc-dot" />
            <span>{short(account)}</span>
            {isMiniPay && <span className="mp-badge">MiniPay</span>}
          </div>
        ) : (
          /* Only show connect button if NOT MiniPay — MiniPay auto-connects */
          !isMiniPay && (
            <button className="btn-connect" onClick={handleConnect}>
              Connect
            </button>
          )
        )}
      </div>
    </header>
  );
}
