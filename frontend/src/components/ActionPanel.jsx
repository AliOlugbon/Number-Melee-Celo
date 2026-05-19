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

  useEffect(() => {
    const handler = () => setWonData({ ...window.__numduel_won });
    window.addEventListener("numduel:won", handler);
    return () => window.removeEventListener("numduel:won", handler);
  }, []);

  useEffect(() => { setWonData(null); setGuessVal(""); }, [activeTier]);

  function getPub() { return pubClient || makePublicClient(); }
  function getWal() {
    if (walClient) return walClient;
    if (!account) throw new Error("Wallet not connected");
    return makeWalletClient(account);
  }

  // ── CONNECT ───────────────────────────────────────────────────────────────
  async function handleConnect() {
    setConnecting(true);
    try {
      if (!window.ethereum) throw new Error("No wallet found. Use MiniPay or MetaMask.");
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      const { getAddress } = await import("viem");
      const acc = getAddress(accs[0]);
      setWallet({
        account:   acc,
        pubClient: makePublicClient(),
        walClient: makeWalletClient(acc),
      });
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

      addFeed("⏳", short(account), `joining ${tier.name}… confirming`);
      await pub.waitForTransactionReceipt({ hash });

      // ── Optimistic update — don't re-read chain, just apply what we know ──
      // The tx confirmed, so:
      //   - We are definitely joined
      //   - If phase was 2 (no round), it's now 0 (lobby) with count 1
      //   - If phase was 0 (lobby), count incremented by 1
      //   - If phase was 1 (active), count incremented by 1
      const current = useStore.getState().tiers[activeTier];
      const wasNoRound = current.phase === 2 || current.phase === null;

      updateTier(activeTier, {
        joined:      true,
        phase:       wasNoRound ? 0 : current.phase,
        playerCount: wasNoRound ? 1 : (current.playerCount || 0) + 1,
        // roundId will be corrected by the next poll cycle (within 3s)
      });

      addFeed("👤", short(account), `joined ${tier.name} challenge`);

    } catch (e) {
      console.error("Join error:", e);
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
  // RENDER STATES
  // ════════════════════════════════════════════════════════════════════════════

  if (phase === null) return (
    <Wrap><div className="ring" /><p className="ap-hint">Loading round status…</p></Wrap>
  );

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
      }}>Play Again</button>
    </Wrap>
  );

  // Active + joined → guess
  if (phase === 1 && joined) return (
    <Wrap>
      <div className="guess-row">
        <input
          className="guess-inp"
          type="number" min="10" max="99.99" step="0.01"
          placeholder="10.00 – 99.99"
          value={guessVal}
          onChange={(e) => setGuessVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !guessing && !isCooling) handleGuess();
          }}
          autoFocus
        />
        <button className="btn-fire" style={{ "--fire-bg": tier.accent }}
          disabled={guessing || isCooling} onClick={handleGuess}>
          {guessing ? "…" : "FIRE"}
        </button>
      </div>
      <p className="ap-micro">
        Free · no gas · {tierState.playerCount} players · Enter to fire
      </p>
    </Wrap>
  );

  // Active + not joined → late join
  if (phase === 1 && !joined) return (
    <Wrap>
      <JoinCard tier={tier} tierState={tierState}
        note="Join now and start guessing immediately!" />
      <JoinBtn
        label={`Join ${tier.name} Round`}
        joining={joining} connecting={connecting}
        autoConnecting={autoConnecting} account={account}
        accent={tier.accent} onJoin={handleJoin} onConnect={handleConnect}
      />
      <p className="ap-micro">One gas tx · all guesses are free</p>
    </Wrap>
  );

  // Lobby + joined → waiting
  if (phase === 0 && joined) return (
    <Wrap>
      <div className="ring" />
      <p className="ap-hint">
        You're in! Waiting for {tierState.playerCount < 2 ? "one more player" : "game to start"}…
      </p>
      <div className="player-pip-row">
        {Array.from({ length: Math.min(tier.maxPlayers, 12) }).map((_, i) => (
          <span key={i} className={`pip${i < tierState.playerCount ? " filled" : ""}`} />
        ))}
      </div>
      <p className="ap-micro">{tierState.playerCount} / {tier.maxPlayers} players</p>
    </Wrap>
  );

  // Lobby + not joined → join existing lobby
  if (phase === 0 && !joined) return (
    <Wrap>
      <JoinCard tier={tier} tierState={tierState}
        note={tierState.playerCount < 2
          ? "Be the 2nd player to trigger game start!"
          : "Lobby filling up — join now!"} />
      <JoinBtn
        label={`Join ${tier.name} Lobby`}
        joining={joining} connecting={connecting}
        autoConnecting={autoConnecting} account={account}
        accent={tier.accent} onJoin={handleJoin} onConnect={handleConnect}
      />
      <p className="ap-micro">One gas tx · all guesses free</p>
    </Wrap>
  );

  // Phase 2 or no round → open new lobby
  return (
    <Wrap>
      <div className="ap-icon">{tier.emoji}</div>
      <p className="ap-hint">
        {tierState.roundId === 0n || !tierState.roundId
          ? `No ${tier.name} round open yet. Be the first!`
          : `Last ${tier.name} round ended. Start the next lobby!`}
      </p>
      <JoinBtn
        label={`Open ${tier.name} Lobby`}
        joining={joining} connecting={connecting}
        autoConnecting={autoConnecting} account={account}
        accent={tier.accent} onJoin={handleJoin} onConnect={handleConnect}
      />
      <p className="ap-micro">You pay only gas — no deposit required</p>
    </Wrap>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function JoinCard({ tier, tierState, note }) {
  return (
    <div className="join-card" style={{ "--t-accent": tier.accent }}>
      <div className="jc-medal">{tier.emoji}</div>
      <div className="jc-name">{tier.name} Challenge</div>
      <div className="jc-detail">
        <span>Players joined</span>
        <span>{tierState.playerCount} / {tier.maxPlayers}</span>
      </div>
      <div className="jc-detail">
        <span>Entry fee</span><span className="green">Free 🎉</span>
      </div>
      <div className="jc-note">{note}</div>
    </div>
  );
}

function JoinBtn({ label, joining, connecting, autoConnecting, account, accent, onJoin, onConnect }) {
  const busy = joining || connecting || autoConnecting;
  const text = joining                       ? "Joining…"
             : (connecting || autoConnecting) ? "Connecting…"
             : !account                       ? "Connect Wallet to Join"
             : label;
  return (
    <button className="btn-primary" style={{ "--btn-bg": accent }}
      disabled={busy} onClick={account ? onJoin : onConnect}>
      {text}
    </button>
  );
}

function Wrap({ children }) {
  return (
    <motion.div className="action-panel ap-block"
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {children}
    </motion.div>
  );
}
