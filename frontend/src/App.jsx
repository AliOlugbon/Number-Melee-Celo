import { useStore } from "./store/useStore.js";
import { useChainSync }    from "./hooks/useChainSync.js";
import { useHistoryPoll }  from "./hooks/useHistoryPoll.js";
import { useMiniPay }      from "./hooks/useMiniPay.js";
import Header              from "./components/Header.jsx";
import NumberStage         from "./components/NumberStage.jsx";
import { StatsGrid, HintBar, CooldownBar } from "./components/Indicators.jsx";
import ActionPanel         from "./components/ActionPanel.jsx";
import { HistoryPanel, FeedPanel } from "./components/Panels.jsx";
import Leaderboard         from "./components/Leaderboard.jsx";
import ParticleCanvas      from "./components/ParticleCanvas.jsx";
import ErrorBoundary       from "./components/ErrorBoundary.jsx";

function OfflineBanner() {
  return (
    <div className="offline">
      <span>📡</span>
      <div>
        <p className="offline-title">Backend offline</p>
        <p className="offline-sub">Run <code>python server.py</code> and refresh.</p>
      </div>
    </div>
  );
}

function GameApp() {
  useMiniPay();
  useChainSync();
  useHistoryPoll();

  const { activeTab, serverOnline } = useStore();

  return (
    <>
      <div className="scanlines" />
      <ParticleCanvas />

      <ErrorBoundary><Header /></ErrorBoundary>

      {!serverOnline && <OfflineBanner />}

      {activeTab === "play" ? (
        <main className="layout">
          <ErrorBoundary><StatsGrid /></ErrorBoundary>

          <div className="play-cols">
            <div className="col-main">
              <ErrorBoundary>
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
          </div>
        </main>
      ) : (
        <div className="lb-page">
          <ErrorBoundary><Leaderboard /></ErrorBoundary>
        </div>
      )}
    </>
  );
}

export default function App() {
  return <ErrorBoundary><GameApp /></ErrorBoundary>;
}
