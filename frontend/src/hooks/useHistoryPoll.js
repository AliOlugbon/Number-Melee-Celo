// src/hooks/useHistoryPoll.js
//
// Polls /api/history incrementally while a round is live and joined=true.
//
// Fix: historyIdx was read from the store inside an effect that listed it
// as a dependency — every append caused the effect to re-run, creating a
// polling storm. Now historyIdx is read via a ref so the effect never
// restarts due to index changes.

import { useEffect, useRef } from "react";
import { useStore, PHASE_DONE } from "../store/useStore.js";
import { getHistory } from "../lib/api.js";

const POLL_MS = 3_000;

export function useHistoryPoll() {
  const { phase, joined } = useStore();

  // Read historyIdx via ref — avoids re-triggering the effect on every append
  const idxRef     = useRef(0);
  const phaseRef   = useRef(phase);
  const joinedRef  = useRef(joined);

  // Keep refs current without restarting the poll loop
  useEffect(() => {
    phaseRef.current  = phase;
    joinedRef.current = joined;
  }, [phase, joined]);

  // Sync idxRef with store without causing the poll effect to re-fire
  useEffect(() => {
    return useStore.subscribe(
      (s) => s.historyIdx,
      (idx) => { idxRef.current = idx; }
    );
  }, []);

  // Clear history when transitioning from DONE → live
  const prevPhaseRef = useRef(PHASE_DONE);
  useEffect(() => {
    if (prevPhaseRef.current === PHASE_DONE && phase !== PHASE_DONE) {
      useStore.getState().clearHistory();
      idxRef.current = 0;
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    // Only start the loop once — liveness is checked inside via refs
    let timer;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;

      const live   = phaseRef.current !== PHASE_DONE;
      const active = joinedRef.current;

      if (live && active) {
        try {
          const { items } = await getHistory(idxRef.current);
          if (!cancelled && items?.length) {
            useStore.getState().appendHistory(items);
          }
        } catch (err) {
          console.warn("[useHistoryPoll] error:", err.message ?? err);
        }
      }

      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []); // runs once — liveness checked via refs inside
}
