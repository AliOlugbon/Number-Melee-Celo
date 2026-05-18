import { create } from "zustand";

// phase: null=not loaded yet, 0=lobby, 1=active, 2=done
const defaultTierState = () => ({
  roundId:     0n,
  phase:       null,
  playerCount: 0,
  startedAt:   0n,
  joined:      false,
  myGuesses:   0,
});

export const useStore = create((set, get) => ({
  // ── Wallet ─────────────────────────────────────────────────────────────────
  account:      null,
  pubClient:    null,
  walClient:    null,
  isMiniPay:    false,
  autoConnecting: false,

  setWallet: ({ account, pubClient, walClient }) =>
    set({ account, pubClient, walClient }),
  setIsMiniPay:    (v) => set({ isMiniPay: v }),
  setAutoConnecting:(v) => set({ autoConnecting: v }),

  // ── Navigation ─────────────────────────────────────────────────────────────
  activeTier: 0,
  activeTab:  "play",

  setActiveTier: (tier) =>
    set({
      activeTier: tier,
      hint:        { type: "", icon: "●", msg: "Waiting for round…" },
      digits:      ["?", "?", "?", "?"],
      digitClass:  "idle",
      history:     [],
      histFetched: 0,
    }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ── Tier round states ──────────────────────────────────────────────────────
  tiers: [defaultTierState(), defaultTierState(), defaultTierState()],

  updateTier: (tier, patch) =>
    set((s) => {
      const tiers = [...s.tiers];
      tiers[tier] = { ...tiers[tier], ...patch };
      return { tiers };
    }),

  // ── Number display ─────────────────────────────────────────────────────────
  digits:     ["?", "?", "?", "?"],
  digitClass: "idle",

  setDigits: (digits, cls) => set({ digits, digitClass: cls }),

  revealNumber: (scaled) => {
    const s = String(scaled).padStart(4, "0");
    set({ digits: [s[0], s[1], s[2], s[3]], digitClass: "solved" });
  },

  resetDisplay: () =>
    set({
      digits:     ["?", "?", "?", "?"],
      digitClass: "idle",
      hint:       { type: "", icon: "●", msg: "Waiting for round…" },
    }),

  // ── Hint ───────────────────────────────────────────────────────────────────
  hint: { type: "", icon: "●", msg: "Waiting for round…" },
  setHint: (type, icon, msg) => set({ hint: { type, icon, msg } }),

  // ── History ────────────────────────────────────────────────────────────────
  history:     [],
  histFetched: 0,
  appendHistory: (items) =>
    set((s) => ({
      history:     [...items, ...s.history],
      histFetched: s.histFetched + items.length,
    })),
  clearHistory: () => set({ history: [], histFetched: 0 }),

  // ── Feed ───────────────────────────────────────────────────────────────────
  feed: [],
  addFeed: (icon, who, msg, cls = "") =>
    set((s) => ({
      feed: [
        { id: Date.now() + Math.random(), icon, who, msg, cls },
        ...s.feed,
      ].slice(0, 60),
    })),

  // ── Cooldown ───────────────────────────────────────────────────────────────
  cooldownEnd: 0,
  startCooldown: (secs) => set({ cooldownEnd: Date.now() + secs * 1000 }),

  // ── My medals ──────────────────────────────────────────────────────────────
  myMedals: { silver: 0, gold: 0, diamond: 0 },
  setMyMedals: (m) => set({ myMedals: m }),

  // ── Leaderboard ────────────────────────────────────────────────────────────
  leaderboard:      [],
  leaderboardTotal: 0,
  setLeaderboard: (players, total) =>
    set({ leaderboard: players, leaderboardTotal: total }),
}));
