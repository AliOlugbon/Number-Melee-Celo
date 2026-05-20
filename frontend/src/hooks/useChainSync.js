// src/hooks/useChainSync.js
//

import { useEffect, useRef } from "react";
import { useStore, PHASE_DONE, PHASE_SOLO } from "../store/useStore.js";
import { getRound, getMedals } from "../lib/api.js";
import { readIsJoined } from "../lib/viem.js";

const POLL_MS      = 4_000;
const MEDALS_EVERY = 3;

// ── sessionStorage helpers ────────────────────────────────────────────────────

function joinedKey(address, roundId) {
  return `ng_joined_${address?.toLowerCase()}_${roundId}`;
}

function loadJoined(address, roundId) {
  if (!address || !roundId) return false;
  try { return sessionStorage.getItem(joinedKey(address, roundId)) === "1"; }
  catch { return false; }
}

function saveJoined(address, roundId, value) {
  if (!address || !roundId) return;
  try {
    if (value) sessionStorage.setItem(joinedKey(address, roundId), "1");
    else       sessionStorage.removeItem(joinedKey(address, roundId));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────

export function useChainSync() {
  const store = useStore();

  const addressRef   = useRef(store.address);
  const joinedRef    = useRef(false);
  const prevRoundRef = useRef(-1);   // -1 = not yet seen (distinguishes from roundId=0)
  const prevPhaseRef = useRef(PHASE_DONE);
  const pollCountRef = useRef(0);

  // Keep addressRef current; reset joined when wallet changes
  useEffect(() => {
    const prev = addressRef.current;
    addressRef.current = store.address;
    if (prev !== store.address) {
      joinedRef.current = false;
    }
  }, [store.address]);

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

        const address = addressRef.current;

        // ── New round detected ───────────────────────────────────────────────
        const isNewRound = prevRoundRef.current !== -1 &&
                           roundId !== prevRoundRef.current;
        if (isNewRound) {
          joinedRef.current = false;
          useStore.getState().resetRound();
          useStore.getState().pushFeed({ type: "round_opened", roundId, ts: Date.now() });
        }

        // ── First load: restore joined from sessionStorage ───────────────────
        if (prevRoundRef.current === -1 && roundId > 0 && address) {
          const restored = loadJoined(address, roundId);
          if (restored) joinedRef.current = true;
        }

        // ── Phase transitions ────────────────────────────────────────────────
        if (phase === 1 && prevPhaseRef.current === PHASE_SOLO) {
          useStore.getState().pushFeed({ type: "competitive", playerCount, ts: Date.now() });
        }
        if (phase === PHASE_DONE && prevPhaseRef.current !== PHASE_DONE) {
          useStore.getState().pushFeed({ type: "round_done", roundId, ts: Date.now() });
        }

        prevRoundRef.current = roundId;
        prevPhaseRef.current = phase;

        // ── Joined check — only when not already confirmed ───────────────────
        let joined = joinedRef.current;
        if (address && roundId > 0 && phase !== PHASE_DONE && !joinedRef.current) {
          try {
            const onChain = await readIsJoined(address);
            if (cancelled) return;
            if (onChain) {
              joinedRef.current = true;
              joined = true;
              saveJoined(address, roundId, true);   // persist for this tab
            }
          } catch (_) { /* keep existing */ }
        }

        // ── Single batched store write ───────────────────────────────────────
        useStore.getState().setRound({
          roundId, phase, playerCount,
          openedAt, startedAt, soloRemaining,
          joined,
        });

        // ── Medals (throttled) ───────────────────────────────────────────────
        pollCountRef.current += 1;
        if (address && pollCountRef.current % MEDALS_EVERY === 1) {
          try {
            const m = await getMedals(address);
            if (!cancelled) useStore.getState().setMedals(m);
          } catch (_) {}
        }

      } catch (err) {
        console.warn("[useChainSync] poll error:", err.message ?? err);
        useStore.getState().setServerOnline(false);
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_MS);
      }
    }

    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);
}
