import { useEffect, useRef } from "react";
import { useStore } from "../store/useStore.js";
import { fetchHistory } from "../lib/api.js";

const POLL_MS = 2500;

export function useHistoryPoll() {
  const { account, activeTier, tiers, history, histFetched, appendHistory } = useStore();
  const timerRef = useRef(null);

  useEffect(() => {
    if (!account) return;

    async function tick() {
      const phase = tiers[activeTier]?.phase;
      if (phase !== 1) return; // only poll during active round
      try {
        const data = await fetchHistory(activeTier, histFetched);
        if (data.items?.length) appendHistory(data.items);
      } catch {}
    }

    tick();
    timerRef.current = setInterval(tick, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [account, activeTier, tiers[activeTier]?.phase, histFetched]);
}
