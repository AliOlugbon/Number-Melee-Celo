import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useStore } from "../store/useStore.js";
import { useMiniPay } from "../hooks/useMiniPay.js";
import { makePublicClient, makeWalletClient } from "../lib/viem.js";
import { CONTRACT_ADDRESS, ABI, TIERS } from "../lib/contracts.js";
import { sendGuess } from "../lib/api.js";
import { burst } from "./ParticleCanvas.jsx";

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function ActionPanel() {
  const {
    account, pubClient, walClient, activeTier, tiers,
    setHint, setDigits, updateTier, addFeed, startCooldown, cooldownEnd,
  } = useStore();
  const { connect, autoConnecting } = useMiniPay();

  const [joining,    setJoining]   = useState(false);
  const [guessing,   setGuessing]  = useState(false);
  const [guessVal,   setGuessVal]  = useState("");
  const [wonData,    setWonData]   = useState(null);
  const [connecting, setConnecting] = useState(false);

  const tier      = TIERS[activeTier];
  const tierState = tiers[activeTier];
  const phase     = tierState?.phase;
  const joined    = tierState?.joined;
  const isCooling = cooldownEnd && Date.now() < cooldownEnd;

  // Listen for win
  useEffect(() => {
    const handler = () => setWonData(window.__numduel_won);
    window.addEventListener("numduel:won", handler);
    return () => window.removeEventListener("numduel:won", handler);
  }, []);

  // Reset won when tier changes
  useEffect(() => { setWonData(null); setGuessVal(""); }, [activeTier]);

  function getPub() { return pubClient || makePublicClient(); }
  function getWal() { return walClient || makeWalletClient(account); }

  // ── JOIN (pure gas tx — no value transfer) ─────────────────────────────────
  async function handleJoin() {
    setJoining(true);
    try {
      const pub = getPub();
      const wal = getWal();
      const h = await wal.writeContract({
        address: CONTRACT_ADDRESS, abi: ABI,
        functionName: "join", args: [activeTier],
        // No feeCurrency needed — no cUSD payment
        // But MiniPay still works fine with plain gas txs
      });
      await pub.waitForTransactionReceipt({ hash: h });
      updateTier(activeTier, { joined: true });
      addFeed("👤", short(account), `joined ${tier.name} challenge`);
    } catch (e) {
      alert(e.shortMessage || e.message);
    } finally {
      setJoining(false);
    }
  }

  // ── GUESS (free HTTP — no tx at all) ──────────────────────────────────────
  async function handleGuess() {
    const val = parseFloat(guessVal);
    if (isNaN(val) || val < 10 || val > 99.99) {
      alert("Enter a number between 10.00 and 99.99");
      return;
    }
    setGuessing(true);
    try {
      const data = await sendGuess({ tier: activeTier, address: account, guess: val });
      setGuessVal("");
      startCooldown(5);
      updateTier(activeTier, { myGuesses: (tierState.myGuesses || 0) + 1 });

      const disp = val.toFixed(2);
      if (data.hint === "higher") {
        setHint("higher", "⬆", "GO HIGHER — try a bigger number!");
        setDigits(["?","?","?","?"], "higher");
        addFeed("⬆️", short(account), `${disp} → higher`);
      } else if (data.hint === "lower") {
        setHint("lower", "⬇", "GO LOWER — try a smaller number!");
        setDigits(["?","?","?","?"], "lower");
        addFeed("⬇️", short(account), `${disp} → lower`);
      } else if (data.hint === "correct") {
        setHint("solved", "✓", "CORRECT! Confirming on-chain…");
        addFeed("✅", short(account), `${disp} → CORRECT!`);
      }
    } catch (e) {
      if (e.status === 429) startCooldown(Math.ceil(e.data?.wait_seconds || 5));
      else alert(e.message);
    } finally {
      setGuessing(false);
    }
  }

  // ── States ─────────────────────────────────────────────────────────────────

  if (!account) return (
    <Panel>
      {autoConnecting ? (
        <><div className="ring" /><p className="ap-hint">Connecting wallet…</p></>
      ) : (
        <>
          <p className="ap-hint">Connect your wallet to play — no deposit required</p>
          <button className="btn-primary" disabled={connecting} onClick={async () => {
            setConnecting(true);
            try { await connect(); } catch (e) { alert(e.message); }
            finally { setConnecting(false); }
          }}>{connecting ? "Connecting…" : "Connect Wallet"}</button>
          <p className="ap-micro">MiniPay supported · Celo network · just gas</p>
        </>
      )}
    </Panel>
  );

  if (phase === null || phase === undefined) return (
    <Panel><div className="ring" /><p className="ap-hint">Loading round…</p></Panel>
  );

  // Won
  if (wonData) return (
    <Panel>
      <motion.div className="won-medal"
        animate={{ rotate: [-10, 10, -10], scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 1.2 }}>
        {tier.medalEmoji}
      </motion.div>
      <div className="won-title">YOU WON a {tier.name} Medal!</div>
      <p className="won-detail">
        The number was {wonData.number}.{"\n"}
        {wonData.medal} medal added to your record!
      </p>
      <button className="btn-outline" onClick={() => {
        setWonData(null);
        updateTier(activeTier, { myGuesses: 0 });
      }}>Play Again</button>
    </Panel>
  );

  // Round concluded
  if (phase === 2) return (
    <Panel>
      <div className="ap-icon">🔄</div>
      <p className="ap-hint">Round concluded! The next lobby opens automatically when someone joins.</p>
      {!joined && (
        <button className="btn-primary" disabled={joining} onClick={handleJoin}>
          {joining ? "Opening lobby…" : `Open ${tier.name} Lobby`}
        </button>
      )}
      <p className="ap-micro">You pay only gas — no deposit</p>
    </Panel>
  );

  // Lobby — not joined yet
  if (!joined) return (
    <Panel>
      <div className="join-card" style={{ "--t-accent": tier.accent }}>
        <div className="jc-medal">{tier.emoji}</div>
        <div className="jc-name">{tier.name} Challenge</div>
        <div className="jc-detail">
          <span>Max players</span><span>{tier.maxPlayers}</span>
        </div>
        <div className="jc-detail">
          <span>Players joined</span><span>{tierState.playerCount}/{tier.maxPlayers}</span>
        </div>
        <div className="jc-detail">
          <span>Entry fee</span><span className="green">Free 🎉</span>
        </div>
        <div className="jc-note">
          {phase === 0
            ? tierState.playerCount < 2
              ? "Be the 2nd player to start the game!"
              : "Waiting for game to start…"
            : "Round in progress — join now!"}
        </div>
      </div>
      <button className="btn-primary" disabled={joining} onClick={handleJoin}
        style={{ "--btn-bg": tier.accent }}>
        {joining ? "Joining…" : `Join ${tier.name} Challenge`}
      </button>
      <p className="ap-micro">One gas tx to join · all guesses are free</p>
    </Panel>
  );

  // Lobby — joined, waiting for 2nd player
  if (phase === 0) return (
    <Panel>
      <div className="ring" />
      <p className="ap-hint">
        You're in the {tier.name} lobby!{" "}
        {tierState.playerCount < 2
          ? "Waiting for one more player to start…"
          : "Starting game…"}
      </p>
      <div className="player-pip-row">
        {Array.from({ length: tier.maxPlayers }).map((_, i) => (
          <span key={i} className={`pip${i < tierState.playerCount ? " filled" : ""}`} />
        ))}
      </div>
      <p className="ap-micro">{tierState.playerCount}/{tier.maxPlayers} players</p>
    </Panel>
  );

  // Active — guess
  return (
    <Panel>
      <div className="guess-row">
        <input
          className="guess-inp"
          type="number" min="10" max="99.99" step="0.01"
          placeholder="e.g. 42.75"
          value={guessVal}
          onChange={(e) => setGuessVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !guessing && !isCooling && handleGuess()}
        />
        <button
          className="btn-fire"
          disabled={guessing || !!isCooling}
          onClick={handleGuess}
          style={{ "--fire-bg": tier.accent }}
        >
          {guessing ? "…" : "FIRE"}
        </button>
      </div>
      <p className="ap-micro">
        Free · no gas · Enter to guess · {tierState.playerCount} players competing
      </p>
    </Panel>
  );
}

function Panel({ children }) {
  return (
    <motion.div className="action-panel ap-block"
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {children}
    </motion.div>
  );
}
