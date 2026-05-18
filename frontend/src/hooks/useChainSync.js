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
  // Stable pub client reference — don't recreate on every render
  const pubRef = useRef(null);

  function getPub() {
    if (pubClient) return pubClient;
    if (!pubRef.current) pubRef.current = makePublicClient();
    return pubRef.current;
  }

  const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const sc2s  = (s) => (Number(s) / 100).toFixed(2);

  // ── Read one tier from chain ────────────────────────────────────────────────
  const refreshTier = useCallback(async (tier) => {
    const pub = getPub();

    if (CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
      updateTier(tier, { phase: 2, playerCount: 0, roundId: 0n });
      return;
    }

    try {
      const info = await pub.readContract({
        address: CONTRACT_ADDRESS, abi: ABI,
        functionName: "get_round", args: [tier],
      });
      const roundId     = info[0];
      const rawPhase    = Number(info[1]);
      const playerCount = Number(info[2]);
      const startedAt   = info[3];

      // round_id==0 && phase==0 → no round ever opened
      const phase = (roundId === 0n && rawPhase === 0) ? 2 : rawPhase;

      const patch = { roundId, phase, playerCount, startedAt };

      if (account) {
        try {
          patch.joined = await pub.readContract({
            address: CONTRACT_ADDRESS, abi: ABI,
            functionName: "is_joined", args: [tier, account],
          });
        } catch {
          patch.joined = false;
        }
      }

      updateTier(tier, patch);
    } catch (e) {
      console.warn("refreshTier:", e.shortMessage || e.message);
      // On RPC error fall back to "no round" state to show join button
      updateTier(tier, { phase: 2, playerCount: 0 });
    }
  }, [account, updateTier, pubClient]);

  // ── Event handler ──────────────────────────────────────────────────────────
  function handleEvent(name, args) {
    const { activeTier: at, account: acc } = useStore.getState();
    const tier = Number(args.tier ?? -1);
    if (tier < 0 || tier > 2) return;

    switch (name) {

      case "RoundOpened":
        updateTier(tier, {
          phase: 0,
          playerCount: 1,
          roundId: args.round_id,
          joined: false,
        });
        if (tier === at) {
          resetDisplay();
          clearHistory();
          addFeed("🎮", "SYSTEM", `${["🥈 Silver","🥇 Gold","💎 Diamond"][tier]} lobby opened!`);
        }
        break;

      case "PlayerJoined": {
        const newCount = Number(args.count);
        updateTier(tier, { playerCount: newCount });
        if (tier === at) {
          addFeed("👤", short(args.player), `joined (${newCount} players)`);
        }
        // Mark as joined if it's our account
        if (acc && args.player.toLowerCase() === acc.toLowerCase()) {
          updateTier(tier, { joined: true });
        }
        break;
      }

      case "RoundStarted":
        updateTier(tier, { phase: 1 });
        if (tier === at) {
          setHint("", "🎲", "Round started! Submit your first guess.");
          addFeed("🚀", "SYSTEM", `${["Silver","Gold","Diamond"][tier]} is LIVE!`);
        }
        break;

      case "RoundWon": {
        updateTier(tier, { phase: 2 });
        if (tier !== at) break;
        revealNumber(args.number_scaled);
        addFeed("🏆", short(args.winner), `WON! The number was ${sc2s(args.number_scaled)}`, "win");
        const isMe = acc && args.winner.toLowerCase() === acc.toLowerCase();
        if (isMe) {
          const medal = ["🥈 Silver","🥇 Gold","💎 Diamond"][tier];
          window.__numduel_won = {
            number: sc2s(args.number_scaled),
            medal,
            tier,
          };
          window.dispatchEvent(new CustomEvent("numduel:won"));
          // Refresh medals after win
          if (account) fetchMedals(account)
            .then((m) => setMyMedals({ silver: m.silver||0, gold: m.gold||0, diamond: m.diamond||0 }))
            .catch(() => {});
        } else {
          setHint("solved", "🏆",
            `${short(args.winner)} won! Number was ${sc2s(args.number_scaled)}`);
        }
        break;
      }

      case "RoundAborted":
        updateTier(tier, { phase: 2 });
        if (tier === at) {
          resetDisplay();
          addFeed("⚠️", "SYSTEM", `Round aborted.`);
        }
        break;
    }
  }

  // ── Scan new events ─────────────────────────────────────────────────────────
  const scanEvents = useCallback(async () => {
    if (CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") return;
    const pub = getPub();
    try {
      const latest = await pub.getBlockNumber();
      if (lastBlockRef.current === 0n) {
        // On first run, look back 200 blocks to catch recent activity
        lastBlockRef.current = latest > 200n ? latest - 200n : 0n;
      }
      if (latest <= lastBlockRef.current) return;

      const logs = await pub.getLogs({
        address:   CONTRACT_ADDRESS,
        fromBlock: lastBlockRef.current + 1n,
        toBlock:   latest,
      });
      lastBlockRef.current = latest;

      for (const log of logs) {
        try {
          const { eventName, args } = decodeEventLog({
            abi: ABI, data: log.data, topics: log.topics,
          });
          handleEvent(eventName, args);
        } catch {}
      }
    } catch (e) {
      console.warn("scanEvents:", e.shortMessage || e.message);
    }
  }, [pubClient]);

  // ── Poll loop — starts immediately, no wallet required ────────────────────
  useEffect(() => {
    async function tick() {
      await refreshTier(activeTier);
      await scanEvents();
    }

    tick(); // immediate
    clearInterval(timerRef.current);
    timerRef.current = setInterval(tick, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [activeTier, account]); // restart when tier or wallet changes

  // ── Load medals when wallet connects ──────────────────────────────────────
  useEffect(() => {
    if (!account) return;
    fetchMedals(account)
      .then((m) => setMyMedals({ silver: m.silver||0, gold: m.gold||0, diamond: m.diamond||0 }))
      .catch(() => {});
  }, [account]);
}
