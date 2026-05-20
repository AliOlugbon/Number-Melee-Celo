// src/store/useStore.js
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// Phase constants mirror the contract
export const PHASE_SOLO        = 0;
export const PHASE_COMPETITIVE = 1;
export const PHASE_DONE        = 2;

export const MEDAL_SILVER  = 0;
export const MEDAL_GOLD    = 1;
export const MEDAL_DIAMOND = 2;

export const MEDAL_LABEL = { 0: "Silver",  1: "Gold",    2: "Diamond" };
export const MEDAL_EMOJI = { 0: "🥈",     1: "🥇",     2: "💎"     };

const useStore = create(
  subscribeWithSelector((set, get) => ({
    // ── Server health ────────────────────────────────────────────────────────
    serverOnline: true,
    setServerOnline: (v) => set({ serverOnline: v }),

    // ── Wallet ───────────────────────────────────────────────────────────────
    address:   null,      // lowercase hex
    isMiniPay: false,

    setWallet: (address, isMiniPay = false) =>
      set({ address: address?.toLowerCase() ?? null, isMiniPay }),

    // ── Round ────────────────────────────────────────────────────────────────
    roundId:       0,
    phase:         PHASE_DONE,
    playerCount:   0,
    openedAt:      0,     // block.timestamp of first join (unix seconds)
    startedAt:     0,
    isCompetitive: false,
    soloRemaining: 0,     // seconds — server-provided, client ticks down locally
    joined:        false,

    // Batched update — only writes keys that actually changed to keep
    // renders minimal.
    setRound: (next) =>
      set((prev) => {
        const patch = {};
        if (next.roundId       !== undefined && next.roundId       !== prev.roundId)       patch.roundId       = next.roundId;
        if (next.phase         !== undefined && next.phase         !== prev.phase)         patch.phase         = next.phase;
        if (next.playerCount   !== undefined && next.playerCount   !== prev.playerCount)   patch.playerCount   = next.playerCount;
        if (next.openedAt      !== undefined && next.openedAt      !== prev.openedAt)      patch.openedAt      = next.openedAt;
        if (next.startedAt     !== undefined && next.startedAt     !== prev.startedAt)     patch.startedAt     = next.startedAt;
        if (next.soloRemaining !== undefined && next.soloRemaining !== prev.soloRemaining) patch.soloRemaining = next.soloRemaining;
        if (next.joined        !== undefined && next.joined        !== prev.joined)        patch.joined        = next.joined;
        // Derived
        if (patch.phase !== undefined) patch.isCompetitive = patch.phase === PHASE_COMPETITIVE;
        // Mark server as online on successful poll
        patch.serverOnline = true;
        return patch;
      }),

    // ── Guess / hint ─────────────────────────────────────────────────────────
    lastHint:     null,   // "higher" | "lower" | "correct"
    lastGuess:    null,   // display string e.g. "42.75"
    guessCount:   0,
    cooldownSecs: 0,

    setHint: (hint, guess) =>
      set((s) => ({ lastHint: hint, lastGuess: guess, guessCount: s.guessCount + 1 })),

    setCooldown: (secs) => set({ cooldownSecs: Math.max(0, secs) }),
    clearHint:   ()     => set({ lastHint: null, lastGuess: null }),

    // ── History ──────────────────────────────────────────────────────────────
    history:    [],
    historyIdx: 0,

    appendHistory: (items) =>
      set((s) => ({
        history:    [...s.history, ...items],
        historyIdx: s.historyIdx + items.length,
      })),

    clearHistory: () => set({ history: [], historyIdx: 0 }),

    // ── Feed ─────────────────────────────────────────────────────────────────
    feed: [],

    pushFeed: (entry) =>
      set((s) => ({ feed: [entry, ...s.feed].slice(0, 20) })),

    clearFeed: () => set({ feed: [] }),

    // ── Medals ───────────────────────────────────────────────────────────────
    medals: { silver: 0, gold: 0, diamond: 0 },
    setMedals: (medals) => set({ medals }),

    // ── UI ───────────────────────────────────────────────────────────────────
    activeTab:  "play",
    setTab:     (tab) => set({ activeTab: tab }),
    isJoining:  false,
    isGuessing: false,
    setJoining:  (v) => set({ isJoining: v }),
    setGuessing: (v) => set({ isGuessing: v }),

    // ── Round reset ───────────────────────────────────────────────────────────
    resetRound: () =>
      set({
        phase:         PHASE_DONE,
        playerCount:   0,
        openedAt:      0,
        startedAt:     0,
        isCompetitive: false,
        soloRemaining: 0,
        joined:        false,
        lastHint:      null,
        lastGuess:     null,
        guessCount:    0,
        cooldownSecs:  0,
        history:       [],
        historyIdx:    0,
      }),
  }))
);

export { useStore };
