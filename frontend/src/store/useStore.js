// Plain zustand create() — no subscribeWithSelector middleware.
// subscribeWithSelector changes the subscribe API and can cause silent failures
// if the zustand version doesn't match expectations. Not needed here.

import { create } from "zustand";

export const PHASE_SOLO        = 0;
export const PHASE_COMPETITIVE = 1;
export const PHASE_DONE        = 2;

export const MEDAL_EMOJI = { 0: "🥈", 1: "🥇", 2: "💎" };
export const MEDAL_LABEL = { 0: "Silver", 1: "Gold", 2: "Diamond" };

const useStore = create((set) => ({
  // ── Server ─────────────────────────────────────────────────────────────────
  serverOnline: true,
  setServerOnline: (v) => set({ serverOnline: v }),

  // ── Wallet ─────────────────────────────────────────────────────────────────
  address:   null,
  isMiniPay: false,
  setWallet: (address, isMiniPay = false) =>
    set({ address: address?.toLowerCase() ?? null, isMiniPay }),

  // ── Round ──────────────────────────────────────────────────────────────────
  roundId:       0,
  phase:         PHASE_DONE,
  playerCount:   0,
  openedAt:      0,
  startedAt:     0,
  isCompetitive: false,
  soloRemaining: 0,
  joined:        false,

  // Diff before writing — avoids re-rendering when nothing changed
  setRound: (next) =>
    set((prev) => {
      const p = {};
      const w = (k) => { if (next[k] !== undefined && next[k] !== prev[k]) p[k] = next[k]; };
      w("roundId"); w("phase"); w("playerCount");
      w("openedAt"); w("startedAt"); w("soloRemaining"); w("joined");
      if (p.phase !== undefined) p.isCompetitive = p.phase === PHASE_COMPETITIVE;
      p.serverOnline = true;
      return p;
    }),

  // ── Hint / guess ───────────────────────────────────────────────────────────
  lastHint:     null,
  lastGuess:    null,
  guessCount:   0,
  cooldownSecs: 0,
  setHint:     (hint, guess) => set((s) => ({ lastHint: hint, lastGuess: guess, guessCount: s.guessCount + 1 })),
  setCooldown: (secs)        => set({ cooldownSecs: Math.max(0, secs) }),
  clearHint:   ()            => set({ lastHint: null, lastGuess: null }),

  // ── History ────────────────────────────────────────────────────────────────
  history:    [],
  historyIdx: 0,
  appendHistory: (items) =>
    set((s) => ({ history: [...s.history, ...items], historyIdx: s.historyIdx + items.length })),
  clearHistory: () => set({ history: [], historyIdx: 0 }),

  // ── Feed ───────────────────────────────────────────────────────────────────
  feed: [],
  pushFeed:  (e) => set((s) => ({ feed: [e, ...s.feed].slice(0, 20) })),
  clearFeed: ()  => set({ feed: [] }),

  // ── Medals ─────────────────────────────────────────────────────────────────
  medals: { silver: 0, gold: 0, diamond: 0 },
  setMedals: (m) => set({ medals: m }),

  // ── UI ─────────────────────────────────────────────────────────────────────
  activeTab:   "play",
  setTab:      (t) => set({ activeTab: t }),
  isJoining:   false,
  isGuessing:  false,
  setJoining:  (v) => set({ isJoining: v }),
  setGuessing: (v) => set({ isGuessing: v }),

  // ── Reset ──────────────────────────────────────────────────────────────────
  resetRound: () => set({
    phase: PHASE_DONE, playerCount: 0, openedAt: 0, startedAt: 0,
    isCompetitive: false, soloRemaining: 0, joined: false,
    lastHint: null, lastGuess: null, guessCount: 0,
    cooldownSecs: 0, history: [], historyIdx: 0,
  }),
}));

export { useStore };
