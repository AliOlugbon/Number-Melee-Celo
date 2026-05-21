// src/hooks/useChainSync.js
// Polls /api/round every 4 s.
// No store.subscribe() calls — uses normal React useEffect with dependencies.
// joined is persisted in sessionStorage to survive page refresh without flicker.

import { useEffect, useRef } from "react";
import { useStore, PHASE_DONE, PHASE_SOLO } from "../store/useStore.js";
import { getRound, getMedals } from "../lib/api.js";
import { readIsJoined } from "../lib/viem.js";

const POLL_MS      = 4_000;
const MEDALS_EVERY = 3;

function joinedKey(addr, rid) { return `ng_j_${addr}_${rid}`; }
function loadJoined(addr, rid) {
  try { return !!addr && !!rid && sessionStorage.getItem(joinedKey(addr, rid)) === "1"; }
  catch { return false; }
}
function saveJoined(addr, rid) {
  try { sessionStorage.setItem(joinedKey(addr, rid), "1"); } catch {}
}

export function useChainSync() {
  // Read address directly each render — used as dep for the poll effect
  const address = useStore((s) => s.address);

  // Refs that the async poll loop reads without needing effect restarts
  const joinedRef    = useRef(false);
  const prevRoundRef = useRef(-1);
  const prevPhaseRef = useRef(PHASE_DONE);
  const pollCount    = useRef(0);

  // Reset joined when wallet changes
  useEffect(() => { joinedRef.current = false; }, [address]);

  useEffect(() => {
    let timer;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const data = await getRound();
        if (cancelled) return;

        const {
          round_id:       roundId,
          phase,
          player_count:   playerCount,
          opened_at:      openedAt,
          started_at:     startedAt,
          solo_remaining: soloRemaining,
        } = data;

        const store = useStore.getState();

        // New round
        if (prevRoundRef.current !== -1 && roundId !== prevRoundRef.current) {
          joinedRef.current = false;
          store.resetRound();
          store.pushFeed({ type: "round_opened", roundId, ts: Date.now() });
        }

        // First load: restore joined from sessionStorage instantly
        if (prevRoundRef.current === -1 && roundId > 0 && address) {
          if (loadJoined(address, roundId)) joinedRef.current = true;
        }

        // Phase transitions
        if (phase === 1 && prevPhaseRef.current === PHASE_SOLO)
          store.pushFeed({ type: "competitive", playerCount, ts: Date.now() });
        if (phase === PHASE_DONE && prevPhaseRef.current !== PHASE_DONE)
          store.pushFeed({ type: "round_done", roundId, ts: Date.now() });

        prevRoundRef.current = roundId;
        prevPhaseRef.current = phase;

        // Confirm joined on-chain only when still unknown
        let joined = joinedRef.current;
        if (address && roundId > 0 && phase !== PHASE_DONE && !joinedRef.current) {
          try {
            const onChain = await readIsJoined(address);
            if (cancelled) return;
            if (onChain) { joinedRef.current = true; joined = true; saveJoined(address, roundId); }
          } catch (_) {}
        }

        // Single batched write — setRound diffs internally
        store.setRound({ roundId, phase, playerCount, openedAt, startedAt, soloRemaining, joined });

        // Medals, throttled
        pollCount.current += 1;
        if (address && pollCount.current % MEDALS_EVERY === 1) {
          try {
            const m = await getMedals(address);
            if (!cancelled) store.setMedals({ silver: m.silver, gold: m.gold, diamond: m.diamond });
          } catch (_) {}
        }

      } catch (err) {
        console.warn("[useChainSync]", err.message ?? err);
        useStore.getState().setServerOnline(false);
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_MS);
      }
    }

    poll();
    return () => { cancelled = true; clearTimeout(timer); };

  // Restart poll loop when wallet changes so joined is re-checked for new address
  }, [address]);
}
