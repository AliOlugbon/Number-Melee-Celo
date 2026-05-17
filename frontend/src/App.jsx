import { useStore } from "./store/useStore.js";
import { useChainSync } from "./hooks/useChainSync.js";
import { useHistoryPoll } from "./hooks/useHistoryPoll.js";
import { useMiniPay } from "./hooks/useMiniPay.js";
import Header from "./components/Header.jsx";
import TierNav from "./components/TierNav.jsx";
import NumberStage from "./components/NumberStage.jsx";
import { HintBar, CooldownBar, StatsBar } from "./components/Indicators.jsx";
import ActionPanel from "./components/ActionPanel.jsx";
import { HistoryPanel, FeedPanel } from "./components/Panels.jsx";
import Leaderboard from "./components/Leaderboard.jsx";
import ParticleCanvas from "./components/ParticleCanvas.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

function GameApp() {
  useMiniPay();
  useChainSync();
  useHistoryPoll();

  const { activeTab } = useStore();

  return (
    <>
      <div className="scanlines" />
      <ParticleCanvas />

      <ErrorBoundary>
        <Header />
      </ErrorBoundary>

      {activeTab === "play" ? (
        <>
          <TierNav />
          <main className="layout">
            <div className="col-main">
              <ErrorBoundary>
                <StatsBar />
                <NumberStage />
                <HintBar />
                <CooldownBar />
                <ActionPanel />
              </ErrorBoundary>
            </div>
            <div className="col-side">
              <ErrorBoundary>
                <HistoryPanel />
                <FeedPanel />
              </ErrorBoundary>
            </div>
          </main>
        </>
      ) : (
        <div className="lb-page">
          <ErrorBoundary>
            <Leaderboard />
          </ErrorBoundary>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GameApp />
    </ErrorBoundary>
  );
}
