// src/lib/viem.js
// All viem imports come from the npm package (not CDN).
// publicClient is created lazily (inside functions) — NOT at module level.
// Module-level object creation was crashing the entire import chain if
// viem's internal polyfills weren't ready yet.

import { createPublicClient, createWalletClient, custom, http } from "viem";
import { celo, celoAlfajores } from "viem/chains";
import { ABI, CONTRACT_ADDRESS } from "./contracts.js";
import { getCommitment } from "./api.js";

const IS_TESTNET = import.meta.env.VITE_NETWORK === "testnet";
export const chain = IS_TESTNET ? celoAlfajores : celo;

// cUSD as feeCurrency for MiniPay legacy tx format
const CUSD = IS_TESTNET
  ? "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1"
  : "0x765DE816845861e75A25fCA122bb6898B8B1282a";

// Lazy — created on first call so no module-level side effects
let _publicClient = null;
function publicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({ chain, transport: http() });
  }
  return _publicClient;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function readIsJoined(player) {
  return publicClient().readContract({
    address: CONTRACT_ADDRESS, abi: ABI,
    functionName: "is_joined", args: [player],
  });
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function joinRound(address) {
  if (!window.ethereum) throw new Error("No wallet found — open in MiniPay");

  const wc = createWalletClient({ chain, transport: custom(window.ethereum) });

  // Fetch on-chain round state to decide if we need a fresh commitment
  const [round_id, phase] = await publicClient().readContract({
    address: CONTRACT_ADDRESS, abi: ABI, functionName: "get_round",
  });

  const needsCommitment = Number(round_id) === 0 || Number(phase) === 2;

  let commitment;
  if (needsCommitment) {
    const { commitment: hex } = await getCommitment();
    commitment = hex; // "0x…" 66-char bytes32 string
  } else {
    commitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  const hash = await wc.writeContract({
    address:      CONTRACT_ADDRESS,
    abi:          ABI,
    functionName: "join",
    args:         [commitment],
    account:      address,
    feeCurrency:  CUSD,
  });

  return hash;
}
