import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { useStore } from "../store/useStore.js";
import { makePublicClient, makeWalletClient } from "../lib/viem.js";
import { CONTRACT_ADDRESS, ABI, TIERS } from "../lib/contracts.js";
import { sendGuess } from "../lib/api.js";

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ── Read current tier state directly from chain ──────────────────────────────
async function fetchTierState(pub, tier, account) {
  if (CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    return { phase: 2, playerCount: 0, roundId: 0n, startedAt: 0n, joined: false };
  }
  const info = await pub.readContract({
    address: CONTRACT_ADDRESS, abi: ABI,
    functionName: "get_round", args: [tier],
  });
  const roundId     = info[0];
  const rawPhase    = Number(info[1]);
  const playerCount = Number(info[2]);
  const startedAt   = info[3];
  // round_id=0 + phase=0 means never opened → treat as "no round"
  const phase = (roundId === 0n && rawPhase === 0) ? 2 : rawPhase;

  let joined = false;
  if (account) {
    joined = await pub.readContract({
      address: CONTRACT_ADDRESS, abi: ABI,
      functionName: "is_joined", args: [tier, account],
    });
  }
  return { phase, playerCount, roundId, startedAt, joined };
}

export default function ActionPanel() {
  const {
    account, pubClient, walClient,
    isMiniPay, autoConnecting,
    activeTier, tiers,
    setHint, setDigits, updateTier, addFeed,
    startCooldown, cooldownEnd,
    setWallet,
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

  // ── Get or make clients ───────────────────────────────────────────────────
  function getPub() { return pubClient || makePublicClient(); }
  function getWal() {
    if (walClient) return walClient;
    if (!account) throw new Error("Wallet not connected");
    return makeWalletClient(account);
  }

  // ── Refresh this tier immediately from chain ──────────────────────────────
  const refreshNow = useCallback(async () => {
    const pub = getPub();
    try {
      const state = await fetchTierState(pub, activeTier, account);
      updateTier(activeTier, state);
    } catch (e) {
      console.warn("refreshNow:", e);
    }
  }, [activeTier, account, pubClient]);

  // ── CONNECT ───────────────────────────────────────────────────────────────
  async function handleConnect() {
    setConnecting(true);
    try {
      if (!window.ethereum) throw new Error("No wallet found. Install MetaMask or use MiniPay.");
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      const { getAddress } = await import("viem");
      const acc = getAddress(accs[0]);
      const pub = makePublicClient();
      const wal = makeWalletClient(acc);
      setWallet({ account: acc, pubClient: pub, walClient: wal });
      addFeed("🔗", "Wallet", `${acc.slice(0, 6)}…${acc.slice(-4)} connected`);
    } catch (e) {
      alert(e.message);
    } finally {
      setConnecting(false);
    }
  }

  // ── JOIN ──────────────────────────────────────────────────────────────────
  async function handleJoin() {
    if (!account) { await handleConnect(); return; }
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

      // Show optimistic update immediately
      addFeed("⏳", short(account), `joining ${tier.name}… tx sent`);

      await pub.waitForTransactionReceipt({ hash });

      // ✅ Immediately re-read chain state after tx confirms
      addFeed("👤", short(account), `joined ${tier.name} challenge`);
      await refreshNow();

    } catch (e) {
      console.error(e);
      alert(e.shortMessage || e.message || "Transaction failed");
    } finally {
      setJoining(false);
    }
  }

  // ── GUESS ─────────────────────────────────────────────────────────────────
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
        alert(e.message || "Guess failed — is the backend running?");
      }
    } finally {
      setGuessing(false);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER STATES — explicit, no dead ends
  // ════════════════════════════════════════════════════════════════════════════

  // ── Still loading from chain ───────────────────────────────────────────────
  if (phase === null) return (
    <Wrap>
      <div className="ring" />
      <p className="ap-hint">Loading round status…</p>
    </Wrap>
  );

  // ── Won! ──────────────────────────────────────────────────────────────────
  if (wonData) return (
    <Wrap>
      <motion.div className="won-medal"
        animate={{ rotate: [-10, 10, -10], scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 1.2 }}>
        {tier.medalEmoji}
      </motion.div>
      <div className="won-title">YOU WON a {tier.name} Medal!</div>
      <p className="won-detail">
        {`The number was ${wonData.number}.\n${wonData.medal} medal added to your record! 🎉`}
      </p>
      <button className="btn-outline" onClick={() => {
        setWonData(null);
        updateTier(activeTier, { myGuesses: 0 });
        refreshNow();
      }}>Play Again</button>
    </Wrap>
  );

  // ── ACTIVE + JOINED → Guess input ─────────────────────────────────────────
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

  // ── ACTIVE + NOT JOINED → Late-join ───────────────────────────────────────
  if (phase === 1 && !joined) return (
    <Wrap>
      <div className="join-card" style={{ "--t-accent": tier.accent }}>
        <div className="jc-medal">{tier.emoji}</div>
        <div className="jc-name">{tier.name} — Round in Progress</div>
        <div className="jc-detail"><span>Players</span><span>{tierState.playerCount} / {tier.maxPlayers}</span></div>
        <div className="jc-detail"><span>Entry fee</span><span className="green">Free 🎉</span></div>
        <div className="jc-note">Join now and start guessing immediately!</div>
      </div>
      <JoinOrConnectBtn
        label={`Join ${tier.name} Round`}
        joining={joining} connecting={connecting}
        autoConnecting={autoConnecting} account={account}
        accent={tier.accent}
        onJoin={handleJoin} onConnect={handleConnect}
      />
      <p className="ap-micro">One gas tx · all guesses are free</p>
    </Wrap>
  );

  // ── LOBBY + JOINED → Waiting for 2nd player ───────────────────────────────
  if (phase === 0 && joined) return (
    <Wrap>
      <div className="ring" />
      <p className="ap-hint">
        You're in the lobby! Waiting for one more player to start the game…
      </p>
      <PlayerPips total={tier.maxPlayers} filled={tierState.playerCount} />
      <p className="ap-micro">{tierState.playerCount} / {tier.maxPlayers} players joined</p>
    </Wrap>
  );

  // ── LOBBY + NOT JOINED → Join existing lobby ──────────────────────────────
  if (phase === 0 && !joined) return (
    <Wrap>
      <div className="join-card" style={{ "--t-accent": tier.accent }}>
        <div className="jc-medal">{tier.emoji}</div>
        <div className="jc-name">{tier.name} Challenge — Lobby Open</div>
        <div className="jc-detail"><span>Max players</span><span>{tier.maxPlayers}</span></div>
        <div className="jc-detail"><span>Joined so far</span><span>{tierState.playerCount} / {tier.maxPlayers}</span></div>
        <div className="jc-detail"><span>Entry fee</span><span className="green">Free 🎉</span></div>
        <div className="jc-note">
          {tierState.playerCount < 2
            ? "2nd player triggers game start!"
            : "Lobby filling up — join now!"}
        </div>
      </div>
      <JoinOrConnectBtn
        label={`Join ${tier.name} Lobby`}
        joining={joining} connecting={connecting}
        autoConnecting={autoConnecting} account={account}
        accent={tier.accent}
        onJoin={handleJoin} onConnect={handleConnect}
      />
      <p className="ap-micro">One gas tx to join · all guesses free</p>
    </Wrap>
  );

  // ── PHASE 2 / NO ROUND → Open new lobby ───────────────────────────────────
  return (
    <Wrap>
      <div className="ap-icon">{tier.emoji}</div>
      <p className="ap-hint">
        {tierState.roundId === 0n || tierState.playerCount === 0
          ? `No ${tier.name} round is open yet.`
          : `The last ${tier.name} round has ended.`}
        {" "}Be the first to open the lobby!
      </p>
      <JoinOrConnectBtn
        label={`Open ${tier.name} Lobby`}
        joining={joining} connecting={connecting}
        autoConnecting={autoConnecting} account={account}
        accent={tier.accent}
        onJoin={handleJoin} onConnect={handleConnect}
      />
      <p className="ap-micro">You pay only gas — no deposit required</p>
    </Wrap>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function JoinOrConnectBtn({ label, joining, connecting, autoConnecting, account, accent, onJoin, onConnect }) {
  const busy = joining || connecting || autoConnecting;
  const btnLabel = joining         ? "Joining…"
                 : connecting || autoConnecting ? "Connecting…"
                 : !account       ? "Connect Wallet to Join"
                 : label;

  return (
    <button
      className="btn-primary"
      style={{ "--btn-bg": accent }}
      disabled={busy}
      onClick={account ? onJoin : onConnect}
    >
      {btnLabel}
    </button>
  );
}

function PlayerPips({ total, filled }) {
  const show = Math.min(total, 12);
  return (
    <div className="player-pip-row">
      {Array.from({ length: show }).map((_, i) => (
        <span key={i} className={`pip${i < filled ? " filled" : ""}`} />
      ))}
      {total > 12 && <span className="ap-micro">+{total - 12} more slots</span>}
    </div>
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
