import { useEffect, useRef, useCallback } from "react";
import { decodeEventLog } from "viem";
import { makePublicClient } from "../lib/viem.js";
import { CONTRACT_ADDRESS, ABI } from "../lib/contracts.js";
import { useStore } from "../store/useStore.js";
import { fetchMedals } from "../lib/api.js";

const POLL_MS = 3000;

export function useChainSync() {
  const {
    account, pubClient, activeTier,
    updateTier, setHint, revealNumber, resetDisplay,
    addFeed, clearHistory, setMyMedals,
  } = useStore();

  const lastBlockRef = useRef(0n);
  const timerRef     = useRef(null);

  const pub = pubClient || makePublicClient();

  const short  = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const sc2s   = (s) => (Number(s) / 100).toFixed(2);

  // ── Refresh one tier ──────────────────────────────────────────────────────
  const refreshTier = useCallback(async (tier) => {
    try {
      const info = await pub.readContract({
        address: CONTRACT_ADDRESS, abi: ABI,
        functionName: "get_round", args: [tier],
      });
      const patch = {
        roundId:     info[0],
        phase:       Number(info[1]),
        playerCount: Number(info[2]),
        startedAt:   info[3],
      };
      if (account) {
        patch.joined = await pub.readContract({
          address: CONTRACT_ADDRESS, abi: ABI,
          functionName: "is_joined", args: [tier, account],
        });
      }
      updateTier(tier, patch);
    } catch (e) { console.warn("refreshTier:", e); }
  }, [pub, account, updateTier]);

  // ── Refresh my medals ─────────────────────────────────────────────────────
  const refreshMedals = useCallback(async () => {
    if (!account) return;
    try {
      const m = await fetchMedals(account);
      setMyMedals({ silver: m.silver, gold: m.gold, diamond: m.diamond });
    } catch {}
  }, [account, setMyMedals]);

  // ── Event handler ─────────────────────────────────────────────────────────
  function handleEvent(name, args) {
    const { activeTier: at, account: acc } = useStore.getState();
    const tier = Number(args.tier ?? args.level ?? -1);

    switch (name) {

      case "RoundOpened":
        updateTier(tier, { phase: 0, playerCount: 1, roundId: args.round_id });
        if (tier === at) {
          resetDisplay();
          clearHistory();
          addFeed("🎮", "SYSTEM", `${at === 0 ? "🥈 Silver" : at === 1 ? "🥇 Gold" : "💎 Diamond"} lobby opened`);
        }
        break;

      case "PlayerJoined":
        updateTier(tier, { playerCount: Number(args.count) });
        if (tier === at)
          addFeed("👤", short(args.player), `joined ${at === 0 ? "Silver" : at === 1 ? "Gold" : "Diamond"} (${args.count} players)`);
        break;

      case "RoundStarted":
        updateTier(tier, { phase: 1 });
        if (tier === at) {
          setHint("", "🎲", "Round started! Submit your first guess.");
          addFeed("🚀", "SYSTEM", `${at === 0 ? "Silver" : at === 1 ? "Gold" : "Diamond"} game is live!`);
        }
        break;

      case "RoundWon": {
        updateTier(tier, { phase: 2 });
        if (tier !== at) break;
        revealNumber(args.number_scaled);
        addFeed("🏆", short(args.winner), `WON! Number was ${sc2s(args.number_scaled)}`,"win");
        const isMe = acc && args.winner.toLowerCase() === acc.toLowerCase();
        if (isMe) {
          const medal = tier === 0 ? "🥈 Silver" : tier === 1 ? "🥇 Gold" : "💎 Diamond";
          window.__numduel_won = {
            number: sc2s(args.number_scaled),
            medal,
            tier,
          };
          window.dispatchEvent(new CustomEvent("numduel:won"));
          refreshMedals();
        } else {
          setHint("solved", "🏆", `${short(args.winner)} won! Number was ${sc2s(args.number_scaled)}`);
        }
        break;
      }

      case "RoundAborted":
        updateTier(tier, { phase: 2 });
        if (tier === at) {
          resetDisplay();
          addFeed("⚠️", "SYSTEM", `Round aborted`);
        }
        break;
    }
  }

  // ── Scan events ───────────────────────────────────────────────────────────
  const scanEvents = useCallback(async () => {
    try {
      const latest = await pub.getBlockNumber();
      if (lastBlockRef.current === 0n)
        lastBlockRef.current = latest > 500n ? latest - 500n : 0n;
      if (latest <= lastBlockRef.current) return;

      const logs = await pub.getLogs({
        address: CONTRACT_ADDRESS,
        fromBlock: lastBlockRef.current + 1n,
        toBlock: latest,
      });
      lastBlockRef.current = latest;

      for (const log of logs) {
        try {
          const { eventName, args } = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics });
          handleEvent(eventName, args);
        } catch {}
      }
    } catch (e) { console.warn("scanEvents:", e); }
  }, [pub, activeTier, account]);

  // ── Poll loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!account) return;

    async function tick() {
      await refreshTier(activeTier);
      await scanEvents();
    }

    tick();
    timerRef.current = setInterval(tick, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [account, activeTier]);

  // ── Load medals on connect ────────────────────────────────────────────────
  useEffect(() => {
    if (account) refreshMedals();
  }, [account]);
}
