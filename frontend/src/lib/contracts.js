// src/lib/contracts.js
// ABI for NumberGuess.vy — single round, no tiers.

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000";

export const ABI = [
  // ── Write ────────────────────────────────────────────────────────────────
  {
    name: "join",
    type: "function",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ── Views ─────────────────────────────────────────────────────────────────
  {
    name: "get_round",
    type: "function",
    inputs: [],
    outputs: [
      { name: "round_id",     type: "uint256" },
      { name: "phase",        type: "uint8"   },
      { name: "player_count", type: "uint256" },
      { name: "opened_at",    type: "uint256" },
      { name: "started_at",   type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    name: "get_medals",
    type: "function",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      { name: "silver",  type: "uint256" },
      { name: "gold",    type: "uint256" },
      { name: "diamond", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    name: "is_joined",
    type: "function",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "solo_time_remaining",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "get_constants",
    type: "function",
    inputs: [],
    outputs: [
      { name: "max_players",   type: "uint256" },
      { name: "solo_diamond",  type: "uint256" },
      { name: "solo_gold",     type: "uint256" },
      { name: "solo_timeout",  type: "uint256" },
    ],
    stateMutability: "view",
  },
  // ── Events ────────────────────────────────────────────────────────────────
  {
    name: "RoundOpened",
    type: "event",
    inputs: [
      { name: "round_id",   type: "uint256", indexed: true  },
      { name: "opener",     type: "address", indexed: false },
      { name: "commitment", type: "bytes32", indexed: false },
    ],
  },
  {
    name: "PlayerJoined",
    type: "event",
    inputs: [
      { name: "round_id", type: "uint256", indexed: true  },
      { name: "player",   type: "address", indexed: true  },
      { name: "count",    type: "uint256", indexed: false },
    ],
  },
  {
    name: "CompetitiveModeActivated",
    type: "event",
    inputs: [
      { name: "round_id", type: "uint256", indexed: true  },
      { name: "count",    type: "uint256", indexed: false },
    ],
  },
  {
    name: "RoundWon",
    type: "event",
    inputs: [
      { name: "round_id",      type: "uint256", indexed: true  },
      { name: "winner",        type: "address", indexed: true  },
      { name: "medal",         type: "uint8",   indexed: false },
      { name: "number_scaled", type: "uint256", indexed: false },
      { name: "salt",          type: "bytes32", indexed: false },
      { name: "total_players", type: "uint256", indexed: false },
    ],
  },
  {
    name: "MedalAwarded",
    type: "event",
    inputs: [
      { name: "player",  type: "address", indexed: true  },
      { name: "medal",   type: "uint8",   indexed: true  },
      { name: "silver",  type: "uint256", indexed: false },
      { name: "gold",    type: "uint256", indexed: false },
      { name: "diamond", type: "uint256", indexed: false },
    ],
  },
  {
    name: "RoundAborted",
    type: "event",
    inputs: [
      { name: "round_id", type: "uint256", indexed: true },
    ],
  },
];
