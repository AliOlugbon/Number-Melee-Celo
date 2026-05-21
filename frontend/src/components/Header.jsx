import { useStore } from "../store/useStore.js";

export default function Header() {
  const { address, isMiniPay, medals, activeTab, setTab } = useStore();
  const short = address ? `${address.slice(0,6)}…${address.slice(-4)}` : null;

  return (
    <header className="hdr">
      <div className="hdr-brand">
        <h1 className="hdr-title">
          <span className="hdr-num">NUM</span><span className="hdr-melee">MELEE</span>
        </h1>
        <p className="hdr-sub">Celo&nbsp;·&nbsp;Medal&nbsp;Challenge</p>
      </div>

      <nav className="hdr-nav">
        <button className={`nav-btn${activeTab==="play"?"  nav-btn--on":""}`} onClick={() => setTab("play")}>
          <span>🎮</span> Play
        </button>
        <button className={`nav-btn${activeTab==="leaderboard"?" nav-btn--on":""}`} onClick={() => setTab("leaderboard")}>
          <span>🏆</span> Board
        </button>
      </nav>

      <div className="hdr-row">
        <span className="hdr-medal hdr-d">💎 {medals.diamond}</span>
        <span className="hdr-medal hdr-g">🥇 {medals.gold}</span>
        <span className="hdr-medal hdr-s">🥈 {medals.silver}</span>

        {address ? (
          <>
            <span className="hdr-dot" />
            <span className="hdr-addr">{short}</span>
            {isMiniPay && <span className="hdr-mp">MiniPay</span>}
          </>
        ) : (
          <span className="hdr-nowallet">No wallet</span>
        )}
      </div>

      <div className="hdr-divider" />
    </header>
  );
}
