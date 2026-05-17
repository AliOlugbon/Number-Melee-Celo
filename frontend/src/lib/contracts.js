import { parseAbi } from "viem";

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
export const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:3001";

// ─── Tier config ──────────────────────────────────────────────────────────────
export const TIERS = [
  {
    id: 0, name: "Silver", emoji: "🥈", maxPlayers: 25,
    accent: "#94a3b8", accentGlow: "rgba(148,163,184,.25)",
    medalEmoji: "🥈",
  },
  {
    id: 1, name: "Gold", emoji: "🥇", maxPlayers: 18,
    accent: "#f0b429", accentGlow: "rgba(240,180,41,.25)",
    medalEmoji: "🥇",
  },
  {
    id: 2, name: "Diamond", emoji: "💎", maxPlayers: 10,
    accent: "#67e8f9", accentGlow: "rgba(103,232,249,.25)",
    medalEmoji: "💎",
  },
];

// ─── ABI ─────────────────────────────────────────────────────────────────────
export const ABI = parseAbi([
  // views
  "function get_round(uint8 tier) view returns (uint256, uint8, uint256, uint256)",
  "function get_medals(address player) view returns (uint256, uint256, uint256)",
  "function is_joined(uint8 tier, address player) view returns (bool)",
  "function max_players(uint8 tier) view returns (uint256)",
  // writes  — NO value transfers, pure gas
  "function join(uint8 tier)",
  // events
  "event RoundOpened(uint8 indexed tier, uint256 indexed round_id, address opener)",
  "event PlayerJoined(uint8 indexed tier, uint256 indexed round_id, address indexed player, uint256 count)",
  "event RoundStarted(uint8 indexed tier, uint256 indexed round_id, bytes32 commitment)",
  "event RoundWon(uint8 indexed tier, uint256 indexed round_id, address indexed winner, uint256 number_scaled, bytes32 salt, uint256 total_players)",
  "event MedalAwarded(address indexed player, uint8 indexed tier, uint256 silver, uint256 gold, uint256 diamond)",
  "event RoundAborted(uint8 indexed tier, uint256 indexed round_id)",
]);
