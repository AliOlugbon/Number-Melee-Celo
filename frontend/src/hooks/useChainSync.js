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
  const pubRef       = useRef(null);

  // Keep a stable ref to the public client — recreate only when needed
  if (!pubRef.current) pubRef.current = makePublicClient();
  const pub = pubClient || pubRef.current;

  const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const sc2s  = (s) => (Number(s) / 100).toFixed(2);

  // ── Fetch tier state from chain ────────────────────────────────────────────
  const refreshTier = useCallback(async (tier) => {
    // Bail out if contract address is still the placeholder
    if (CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
      // Set phase to 2 (done/no round) so UI shows the join button
      updateTier(tier, { phase: 2, playerCount: 0 });
      return;
    }
    try {
      const info = await pub.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "get_round",
        args: [tier],
      });
      // returns (round_id, phase, player_count, started_at)
      // If round_id is 0 and phase is 0, no round has ever been opened
      const roundId     = info[0];
      const phase       = Number(info[1]);
      const playerCount = Number(info[2]);
      const startedAt   = info[3];

      const patch = {
        roundId,
        // If round_id == 0 and phase == 0, treat as "no round yet" → show join to open
        phase:       (roundId === 0n && phase === 0) ? 2 : phase,
        playerCount,
        startedAt,
      };

      if (account) {
        try {
          patch.joined = await pub.readContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: "is_joined",
            args: [tier, account],
          });
        } catch { patch.joined = false; }
      }

      updateTier(tier, patch);
    } catch (e) {
      console.warn("refreshTier error:", e.shortMessage || e.message);
      // On error, show join button (phase=2) rather than infinite spinner
      updateTier(tier, { phase: 2, playerCount: 0 });
    }
  }, [pub, account, updateTier]);

  // ── Medals ────────────────────────────────────────────────────────────────
  const refreshMedals = useCallback(async () => {
    if (!account) return;
    try {
      const m = await fetchMedals(account);
      setMyMedals({ silver: m.silver || 0, gold: m.gold || 0, diamond: m.diamond || 0 });
    } catch {}
  }, [account, setMyMedals]);

  // ── Event handler (called from scanEvents) ─────────────────────────────────
  function handleEvent(name, args) {
    const { activeTier: at, account: acc } = useStore.getState();
    const tier = Number(args.tier ?? -1);
    if (tier < 0 || tier > 2) return;

    switch (name) {
      case "RoundOpened":
        updateTier(tier, { phase: 0, playerCount: 1, roundId: args.round_id });
        if (tier === at) {
          resetDisplay();
          clearHistory();
          addFeed("🎮", "SYSTEM", `${["Silver","Gold","Diamond"][tier]} lobby opened!`);
        }
        break;

      case "PlayerJoined":
        updateTier(tier, { playerCount: Number(args.count) });
        if (tier === at)
          addFeed("👤", short(args.player), `joined (${args.count} players)`);
        break;

      case "RoundStarted":
        updateTier(tier, { phase: 1 });
        if (tier === at) {
          setHint("", "🎲", "Round started! Submit your first guess.");
          addFeed("🚀", "SYSTEM", `${["Silver","Gold","Diamond"][tier]} game is live!`);
        }
        break;

      case "RoundWon": {
        updateTier(tier, { phase: 2 });
        if (tier !== at) break;
        revealNumber(args.number_scaled);
        addFeed("🏆", short(args.winner), `WON! Number: ${sc2s(args.number_scaled)}`, "win");
        const isMe = acc && args.winner.toLowerCase() === acc.toLowerCase();
        if (isMe) {
          const medal = ["🥈 Silver","🥇 Gold","💎 Diamond"][tier];
          window.__numduel_won = { number: sc2s(args.number_scaled), medal, tier };
          window.dispatchEvent(new CustomEvent("numduel:won"));
          refreshMedals();
        } else {
          setHint("solved", "🏆", `${short(args.winner)} won! The number was ${sc2s(args.number_scaled)}`);
        }
        break;
      }

      case "RoundAborted":
        updateTier(tier, { phase: 2 });
        if (tier === at) {
          resetDisplay();
          addFeed("⚠️", "SYSTEM", "Round aborted.");
        }
        break;
    }
  }

  // ── Scan new blocks for events ─────────────────────────────────────────────
  const scanEvents = useCallback(async () => {
    if (CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") return;
    try {
      const latest = await pub.getBlockNumber();
      if (lastBlockRef.current === 0n)
        lastBlockRef.current = latest > 300n ? latest - 300n : 0n;
      if (latest <= lastBlockRef.current) return;

      const logs = await pub.getLogs({
        address: CONTRACT_ADDRESS,
        fromBlock: lastBlockRef.current + 1n,
        toBlock: latest,
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
  }, [pub]);

  // ── Main poll loop — runs regardless of wallet connection ──────────────────
  useEffect(() => {
    async function tick() {
      await refreshTier(activeTier);
      await scanEvents();
    }

    tick(); // immediate first load
    timerRef.current = setInterval(tick, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [activeTier, account]); // re-run when tier changes OR wallet connects

  // ── Medals on wallet connect ───────────────────────────────────────────────
  useEffect(() => {
    if (account) refreshMedals();
  }, [account]);
}
