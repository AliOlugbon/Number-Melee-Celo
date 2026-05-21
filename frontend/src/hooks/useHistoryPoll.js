// src/hooks/useHistoryPoll.js
// Polls /api/history incrementally while joined and round is live.
// Uses refs inside a single long-running loop to avoid effect restarts
// (which caused the polling storm in previous versions).

import { useEffect, useRef } from "react";
import { useStore, PHASE_DONE } from "../store/useStore.js";
import { getHistory } from "../lib/api.js";

const POLL_MS = 3_000;

export function useHistoryPoll() {
  // Snapshot refs — updated via a separate effect, never cause the loop to restart
  const phaseRef   = useRef(PHASE_DONE);
  const joinedRef  = useRef(false);
  const idxRef     = useRef(0);
  const prevPhase  = useRef(PHASE_DONE);

  // Keep refs in sync with store on every render (cheap, no subscriptions needed)
  const phase  = useStore((s) => s.phase);
  const joined = useStore((s) => s.joined);
  const idx    = useStore((s) => s.historyIdx);

  useEffect(() => {
    // Clear history when transitioning from DONE → live
    if (prevPhase.current === PHASE_DONE && phase !== PHASE_DONE) {
      useStore.getState().clearHistory();
      idxRef.current = 0;
    }
    prevPhase.current = phase;
    phaseRef.current  = phase;
    joinedRef.current = joined;
    idxRef.current    = idx;
  });

  useEffect(() => {
    let timer;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;

      if (phaseRef.current !== PHASE_DONE && joinedRef.current) {
        try {
          const { items } = await getHistory(idxRef.current);
          if (!cancelled && items?.length) {
            useStore.getState().appendHistory(items);
          }
        } catch (err) {
          console.warn("[useHistoryPoll]", err.message ?? err);
        }
      }

      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }

    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []); // single loop, refs handle liveness
}
