import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useStore } from "../store/useStore.js";
import { makePublicClient, makeWalletClient } from "../lib/viem.js";
import { CONTRACT_ADDRESS, ABI, TIERS } from "../lib/contracts.js";
import { sendGuess } from "../lib/api.js";

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function ActionPanel() {
  const {
    account, pubClient, walClient,
    isMiniPay, autoConnecting,
    activeTier, tiers,
    setHint, setDigits, updateTier, addFeed,
    startCooldown, cooldownEnd,
  } = useStore();

  const [joining,    setJoining]    = useState(false);
  const [guessing,   setGuessing]   = useState(false);
  const [guessVal,   setGuessVal]   = useState("");
  const [wonData,    setWonData]    = useState(null);
  const [connecting, setConnecting] = useState(false);

  const tier      = TIERS[activeTier];
  const tierState = tiers[activeTier];
  const phase     = tierState?.phase;
  const joined    = tierState?.joined ?? false;
  const isCooling = cooldownEnd > 0 && Date.now() < cooldownEnd;

  // Listen for win event
  useEffect(() => {
    const handler = () => setWonData({ ...window.__numduel_won });
    window.addEventListener("numduel:won", handler);
    return () => window.removeEventListener("numduel:won", handler);
  }, []);

  // Reset when switching tiers
  useEffect(() => {
    setWonData(null);
    setGuessVal("");
  }, [activeTier]);

  function getPub() { return pubClient || makePublicClient(); }
  function getWal() {
    if (walClient) return walClient;
    if (!account) throw new Error("Wallet not connected");
    return makeWalletClient(account);
  }

  // ── CONNECT ────────────────────────────────────────────────────────────────
  async function handleConnect() {
    setConnecting(true);
    try {
      if (!window.ethereum) throw new Error("No wallet found. Use MiniPay or MetaMask.");
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      const { getAddress } = await import("viem");
      const { makePublicClient: mkPub, makeWalletClient: mkWal } =
        await import("../lib/viem.js");
      const acc = getAddress(accs[0]);
      useStore.getState().setWallet({
        account: acc,
        pubClient: mkPub(),
        walClient: mkWal(acc),
      });
      addFeed("🔗", "Wallet", `${acc.slice(0, 6)}…${acc.slice(-4)} connected`);
    } catch (e) {
      alert(e.message);
    } finally {
      setConnecting(false);
    }
  }

  // ── JOIN ───────────────────────────────────────────────────────────────────
  async function handleJoin() {
    if (!account) { handleConnect(); return; }
    setJoining(true);
    try {
      const pub = getPub();
      const wal = getWal();
      const hash = await wal.writeContract({
        address:      CONTRACT_ADDRESS,
        abi:          ABI,
        functionName: "join",
        args:         [activeTier],
      });
      await pub.waitForTransactionReceipt({ hash });
      updateTier(activeTier, { joined: true });
      addFeed("👤", short(account), `joined ${tier.name} challenge`);
    } catch (e) {
      alert(e.shortMessage || e.message || "Transaction failed");
    } finally {
      setJoining(false);
    }
  }

  // ── GUESS ──────────────────────────────────────────────────────────────────
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
      if (e.status === 429) {
        startCooldown(Math.ceil(e.data?.wait_seconds || 5));
      } else {
        alert(e.message || "Guess failed");
      }
    } finally {
      setGuessing(false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER STATES
  // ══════════════════════════════════════════════════════════════════════════

  // ── Loading: phase not yet known ──────────────────────────────────────────
  if (phase === null) return (
    <Wrap>
      <div className="ring" />
      <p className="ap-hint">Loading round status…</p>
    </Wrap>
  );

  // ── Won ───────────────────────────────────────────────────────────────────
  if (wonData) return (
    <Wrap>
      <motion.div className="won-medal"
        animate={{ rotate: [-10, 10, -10], scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 1.2 }}>
        {tier.medalEmoji}
      </motion.div>
      <div className="won-title">YOU WON a {tier.name} Medal!</div>
      <p className="won-detail">
        {`The number was ${wonData.number}.\n${wonData.medal} medal added to your record!`}
      </p>
      <button className="btn-outline" onClick={() => {
        setWonData(null);
        updateTier(activeTier, { myGuesses: 0 });
      }}>Play Again</button>
    </Wrap>
  );

  // ── Active round + joined → GUESS INPUT ───────────────────────────────────
  if (phase === 1 && joined) return (
    <Wrap>
      <div className="guess-row">
        <input
          className="guess-inp"
          type="number"
          min="10" max="99.99" step="0.01"
          placeholder="10.00 – 99.99"
          value={guessVal}
          onChange={(e) => setGuessVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !guessing && !isCooling) handleGuess();
          }}
          autoFocus
        />
        <button
          className="btn-fire"
          style={{ "--fire-bg": tier.accent }}
          disabled={guessing || isCooling}
          onClick={handleGuess}
        >
          {guessing ? "…" : "FIRE"}
        </button>
      </div>
      <p className="ap-micro">
        Free · no gas · {tierState.playerCount} players · Enter to fire
      </p>
    </Wrap>
  );

  // ── Active round + NOT joined → Late-join ─────────────────────────────────
  if (phase === 1 && !joined) return (
    <Wrap>
      <div className="join-card" style={{ "--t-accent": tier.accent }}>
        <div className="jc-medal">{tier.emoji}</div>
        <div className="jc-name">{tier.name} — Round in Progress</div>
        <div className="jc-detail"><span>Players</span><span>{tierState.playerCount}/{tier.maxPlayers}</span></div>
        <div className="jc-detail"><span>Entry fee</span><span className="green">Free 🎉</span></div>
        <div className="jc-note">Join now and start guessing immediately!</div>
      </div>
      {!account ? (
        <button className="btn-primary" disabled={connecting || autoConnecting}
          style={{ "--btn-bg": tier.accent }} onClick={handleConnect}>
          {connecting || autoConnecting ? "Connecting…" : "Connect & Join"}
        </button>
      ) : (
        <button className="btn-primary" disabled={joining}
          style={{ "--btn-bg": tier.accent }} onClick={handleJoin}>
          {joining ? "Joining…" : `Join ${tier.name} Round`}
        </button>
      )}
      <p className="ap-micro">One gas tx · all guesses are free</p>
    </Wrap>
  );

  // ── Lobby: joined, waiting for game to start ───────────────────────────────
  if (phase === 0 && joined) return (
    <Wrap>
      <div className="ring" />
      <p className="ap-hint">
        You're in! Waiting for one more player…
      </p>
      <div className="player-pip-row">
        {Array.from({ length: Math.min(tier.maxPlayers, 10) }).map((_, i) => (
          <span key={i} className={`pip${i < tierState.playerCount ? " filled" : ""}`} />
        ))}
        {tier.maxPlayers > 10 && (
          <span className="ap-micro">+{tier.maxPlayers - 10} more slots</span>
        )}
      </div>
      <p className="ap-micro">{tierState.playerCount}/{tier.maxPlayers} players joined</p>
    </Wrap>
  );

  // ── Lobby: not joined yet ──────────────────────────────────────────────────
  if (phase === 0 && !joined) return (
    <Wrap>
      <div className="join-card" style={{ "--t-accent": tier.accent }}>
        <div className="jc-medal">{tier.emoji}</div>
        <div className="jc-name">{tier.name} Challenge</div>
        <div className="jc-detail"><span>Max players</span><span>{tier.maxPlayers}</span></div>
        <div className="jc-detail"><span>Joined so far</span><span>{tierState.playerCount}/{tier.maxPlayers}</span></div>
        <div className="jc-detail"><span>Entry fee</span><span className="green">Free 🎉</span></div>
        <div className="jc-note">
          {tierState.playerCount < 2
            ? "Be the 2nd player to trigger the game start!"
            : "Game starts when 2+ players join — round in lobby!"}
        </div>
      </div>
      {!account ? (
        <button className="btn-primary" disabled={connecting || autoConnecting}
          style={{ "--btn-bg": tier.accent }} onClick={handleConnect}>
          {connecting || autoConnecting ? "Connecting…" : "Connect Wallet to Join"}
        </button>
      ) : (
        <button className="btn-primary" disabled={joining}
          style={{ "--btn-bg": tier.accent }} onClick={handleJoin}>
          {joining ? "Joining…" : `Join ${tier.name} Challenge`}
        </button>
      )}
      <p className="ap-micro">One gas tx to join · all guesses are free</p>
    </Wrap>
  );

  // ── Phase 2 / No round: show join to open a new lobby ─────────────────────
  return (
    <Wrap>
      <div className="ap-icon">{tier.emoji}</div>
      <p className="ap-hint">
        {tierState.playerCount === 0
          ? `No ${tier.name} round is open. Be the first to start the lobby!`
          : `The last ${tier.name} round has ended.`}
      </p>
      {!account ? (
        <>
          <button className="btn-primary" disabled={connecting || autoConnecting}
            style={{ "--btn-bg": tier.accent }} onClick={handleConnect}>
            {connecting || autoConnecting ? "Connecting…" : "Connect Wallet to Play"}
          </button>
          <p className="ap-micro">MiniPay supported · Celo network · just gas</p>
        </>
      ) : (
        <>
          <button className="btn-primary" disabled={joining}
            style={{ "--btn-bg": tier.accent }} onClick={handleJoin}>
            {joining ? "Opening lobby…" : `Open ${tier.name} Lobby`}
          </button>
          <p className="ap-micro">You pay only gas — no deposit required</p>
        </>
      )}
    </Wrap>
  );
}

function Wrap({ children }) {
  return (
    <motion.div
      className="action-panel ap-block"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}
