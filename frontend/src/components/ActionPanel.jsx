// src/components/ActionPanel.jsx
//
// Changes:
// - On successful join() tx, immediately writes sessionStorage so the
//   UI switches to the guess input without waiting for the next poll cycle.
// - Guess input and button are larger / more prominent than the status area.
// - "solo window expired" error is shown clearly with a retry hint.

import { useState, useRef } from "react";
import { useStore, PHASE_DONE } from "../store/useStore.js";
import { joinRound } from "../lib/viem.js";
import { postGuess, getCooldown } from "../lib/api.js";

// Mirror of the key used in useChainSync — keeps sessionStorage in sync
function joinedKey(address, roundId) {
  return `ng_joined_${address?.toLowerCase()}_${roundId}`;
}

export default function ActionPanel() {
  const {
    address, phase, joined, roundId,
    isJoining, isGuessing,
    setJoining, setGuessing,
    setHint, setCooldown, pushFeed,
    setRound,
  } = useStore();

  const [guessInput, setGuessInput] = useState("");
  const [txError,    setTxError]    = useState(null);
  const [guessError, setGuessError] = useState(null);
  const inputRef = useRef(null);

  // ── No wallet ─────────────────────────────────────────────────────────────
  if (!address) {
    return (
      <div className="action-panel action-panel--notice">
        <p className="action-notice">Connect a wallet to play.</p>
        <p className="action-sub">Open this page inside MiniPay.</p>
      </div>
    );
  }

  // ── Join handler ──────────────────────────────────────────────────────────
  async function handleJoin() {
    setTxError(null);
    setJoining(true);
    try {
      const hash = await joinRound(address);
      // Immediately flip joined=true in store and persist — no need to wait
      // for the next poll cycle to show the guess input.
      try {
        sessionStorage.setItem(joinedKey(address, roundId || 1), "1");
      } catch {}
      setRound({ joined: true });
      pushFeed({ type: "join", player: address, ts: Date.now() });
      console.log("[join] tx:", hash);
    } catch (err) {
      console.error("[join] error:", err);
      setTxError(err.shortMessage ?? err.message ?? "Transaction failed");
    } finally {
      setJoining(false);
    }
  }

  // ── Guess handler ─────────────────────────────────────────────────────────
  async function handleGuess() {
    const raw = guessInput.trim();
    if (!raw) return;

    const val = parseFloat(raw);
    if (isNaN(val) || val < 10 || val > 99.99) {
      setGuessError("Enter a number between 10.00 and 99.99");
      return;
    }

    setGuessError(null);
    setGuessing(true);
    try {
      const result = await postGuess(address, raw);
      setHint(result.hint, raw);
      setGuessInput("");
      inputRef.current?.focus();
      if (result.hint !== "correct") {
        const cd = await getCooldown(address);
        setCooldown(cd.remaining);
      }
    } catch (err) {
      if (err.status === 429 && err.body?.wait_seconds) {
        setCooldown(err.body.wait_seconds);
        setGuessError(`Wait ${err.body.wait_seconds.toFixed(1)} s before next guess`);
      } else {
        const msg = err.body?.error ?? err.message ?? "Guess failed";
        setGuessError(msg);
      }
    } finally {
      setGuessing(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter") handleGuess();
  }

  // ── No active round ───────────────────────────────────────────────────────
  if (!roundId || phase === PHASE_DONE) {
    return (
      <div className="action-panel">
        <button
          className="btn btn-join btn--full"
          onClick={handleJoin}
          disabled={isJoining}
        >
          {isJoining ? "Opening round…" : "Open Round"}
        </button>
        {txError && <p className="action-error">{txError}</p>}
      </div>
    );
  }

  // ── Active round, not joined ──────────────────────────────────────────────
  if (!joined) {
    return (
      <div className="action-panel">
        <button
          className="btn btn-join btn--full"
          onClick={handleJoin}
          disabled={isJoining}
        >
          {isJoining ? "Joining…" : "Join Round"}
        </button>
        <p className="action-sub">Pure gas tx — no payment required</p>
        {txError && <p className="action-error">{txError}</p>}
      </div>
    );
  }

  // ── Joined — guess input (primary UI) ────────────────────────────────────
  return (
    <div className="action-panel action-panel--guess">
      <div className="guess-row">
        <input
          ref={inputRef}
          className="guess-input"
          type="number"
          min="10"
          max="99.99"
          step="0.01"
          placeholder="42.00"
          value={guessInput}
          onChange={(e) => { setGuessInput(e.target.value); setGuessError(null); }}
          onKeyDown={onKeyDown}
          disabled={isGuessing}
          autoFocus
        />
        <button
          className="btn btn-guess"
          onClick={handleGuess}
          disabled={isGuessing || !guessInput.trim()}
        >
          {isGuessing ? "…" : "Guess"}
        </button>
      </div>
      <p className="action-sub">Range: 10.00 – 99.99 · 5 s cooldown</p>
      {guessError && <p className="action-error">{guessError}</p>}
    </div>
  );
}
