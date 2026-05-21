export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000";

export const ABI = [
  // join(commitment)
  { name: "join", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "bytes32" }], outputs: [] },

  // get_round() → (round_id, phase, player_count, opened_at, started_at)
  { name: "get_round", type: "function", stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "round_id",     type: "uint256" },
      { name: "phase",        type: "uint8"   },
      { name: "player_count", type: "uint256" },
      { name: "opened_at",    type: "uint256" },
      { name: "started_at",   type: "uint256" },
    ]},

  // get_medals(player) → (silver, gold, diamond)
  { name: "get_medals", type: "function", stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      { name: "silver",  type: "uint256" },
      { name: "gold",    type: "uint256" },
      { name: "diamond", type: "uint256" },
    ]},

  // is_joined(player) → bool
  { name: "is_joined", type: "function", stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "bool" }] },

  // solo_time_remaining() → uint256
  { name: "solo_time_remaining", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
];
