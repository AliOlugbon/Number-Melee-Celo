import { useState, useRef } from "react";
import { useStore, PHASE_DONE } from "../store/useStore.js";
import { joinRound } from "../lib/viem.js";
import { postGuess, getCooldown } from "../lib/api.js";

function joinedKey(address, roundId) {
  return `ng_joined_${address?.toLowerCase()}_${roundId}`;
}

export default function ActionPanel() {
  const {
    address, phase, joined, roundId,
    isJoining, isGuessing,
    setJoining, setGuessing,
    setHint, setCooldown, pushFeed, setRound,
  } = useStore();

  const [input,    setInput]    = useState("");
  const [txErr,    setTxErr]    = useState(null);
  const [guessErr, setGuessErr] = useState(null);
  const inputRef = useRef(null);

  // ── No wallet ───────────────────────────────────────────────────────────────
  if (!address) {
    return (
      <div className="ap ap--notice">
        <p className="ap-notice">Connect a wallet to play.</p>
        <p className="ap-sub">Open this page inside MiniPay.</p>
      </div>
    );
  }

  // ── Join ────────────────────────────────────────────────────────────────────
  async function handleJoin() {
    setTxErr(null);
    setJoining(true);
    try {
      await joinRound(address);
      try { sessionStorage.setItem(joinedKey(address, roundId || 1), "1"); } catch {}
      setRound({ joined: true });
      pushFeed({ type: "join", player: address, ts: Date.now() });
    } catch (err) {
      setTxErr(err.shortMessage ?? err.message ?? "Transaction failed");
    } finally {
      setJoining(false);
    }
  }

  // ── Guess ───────────────────────────────────────────────────────────────────
  async function handleGuess() {
    const raw = input.trim();
    if (!raw) return;
    const val = parseFloat(raw);
    if (isNaN(val) || val < 10 || val > 99.99) {
      setGuessErr("Enter a number between 10.00 and 99.99");
      return;
    }
    setGuessErr(null);
    setGuessing(true);
    try {
      const res = await postGuess(address, raw);
      setHint(res.hint, raw);
      setInput("");
      inputRef.current?.focus();
      if (res.hint !== "correct") {
        const cd = await getCooldown(address);
        setCooldown(cd.remaining);
      }
    } catch (err) {
      if (err.status === 429 && err.body?.wait_seconds) {
        setCooldown(err.body.wait_seconds);
        setGuessErr(`Wait ${err.body.wait_seconds.toFixed(1)} s`);
      } else {
        setGuessErr(err.body?.error ?? err.message ?? "Guess failed");
      }
    } finally {
      setGuessing(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!roundId || phase === PHASE_DONE) {
    return (
      <div className="ap">
        <button className="btn btn-join" onClick={handleJoin} disabled={isJoining}>
          {isJoining ? "Opening round…" : "Open Round"}
        </button>
        {txErr && <p className="ap-err">{txErr}</p>}
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="ap">
        <button className="btn btn-join" onClick={handleJoin} disabled={isJoining}>
          {isJoining ? "Joining…" : "Join Round"}
        </button>
        <p className="ap-sub">Pure gas tx — no payment required</p>
        {txErr && <p className="ap-err">{txErr}</p>}
      </div>
    );
  }

  return (
    <div className="ap ap--guess">
      <div className="guess-row">
        <input
          ref={inputRef}
          className="guess-input"
          type="number"
          min="10" max="99.99" step="0.01"
          placeholder="42.00"
          value={input}
          onChange={(e) => { setInput(e.target.value); setGuessErr(null); }}
          onKeyDown={(e) => e.key === "Enter" && handleGuess()}
          disabled={isGuessing}
          autoFocus
        />
        <button
          className="btn btn-guess"
          onClick={handleGuess}
          disabled={isGuessing || !input.trim()}
        >
          {isGuessing ? "…" : "Guess"}
        </button>
      </div>
      <p className="ap-sub">Range: 10.00 – 99.99 · 5 s cooldown</p>
      {guessErr && <p className="ap-err">{guessErr}</p>}
    </div>
  );
}
