// src/lib/viem.js
// viem client setup + on-chain write helpers for MiniPay.
//
// MiniPay legacy tx format: feeCurrency must be set to the USDT address
// (or omitted on testnet). On Celo mainnet the wallet injects feeCurrency
// automatically, but we set it explicitly to be safe.

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseUnits,
} from "https://esm.sh/viem@2";
import { celo, celoAlfajores } from "https://esm.sh/viem@2/chains";
import { ABI, CONTRACT_ADDRESS } from "./contracts.js";
import { getCommitment } from "./api.js";

// ── Chain config ──────────────────────────────────────────────────────────────

const IS_TESTNET = import.meta.env.VITE_NETWORK === "testnet";
export const chain = IS_TESTNET ? celoAlfajores : celo;

// cUSD on Celo mainnet — used as feeCurrency for MiniPay gas
const CUSD_MAINNET  = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const CUSD_ALFAJORES = "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1";
export const CUSD   = IS_TESTNET ? CUSD_ALFAJORES : CUSD_MAINNET;

// ── Clients ───────────────────────────────────────────────────────────────────

export const publicClient = createPublicClient({
  chain,
  transport: http(),
});

/** walletClient is created on-demand once window.ethereum is available. */
export function makeWalletClient() {
  return createWalletClient({
    chain,
    transport: custom(window.ethereum),
  });
}

// ── Read helpers ──────────────────────────────────────────────────────────────

export async function readRound() {
  const [round_id, phase, player_count, opened_at, started_at] =
    await publicClient.readContract({
      address:      CONTRACT_ADDRESS,
      abi:          ABI,
      functionName: "get_round",
    });
  return {
    roundId:     Number(round_id),
    phase:       Number(phase),
    playerCount: Number(player_count),
    openedAt:    Number(opened_at),
    startedAt:   Number(started_at),
  };
}

export async function readIsJoined(player) {
  return publicClient.readContract({
    address:      CONTRACT_ADDRESS,
    abi:          ABI,
    functionName: "is_joined",
    args:         [player],
  });
}

export async function readSoloTimeRemaining() {
  const secs = await publicClient.readContract({
    address:      CONTRACT_ADDRESS,
    abi:          ABI,
    functionName: "solo_time_remaining",
  });
  return Number(secs);
}

export async function readMedals(player) {
  const [silver, gold, diamond] = await publicClient.readContract({
    address:      CONTRACT_ADDRESS,
    abi:          ABI,
    functionName: "get_medals",
    args:         [player],
  });
  return {
    silver:  Number(silver),
    gold:    Number(gold),
    diamond: Number(diamond),
  };
}

// ── Write: join ───────────────────────────────────────────────────────────────

/**
 * joinRound()
 *
 * Full join flow:
 *   1. Read on-chain phase. If no live round (phase=2 or roundId=0):
 *      → GET /api/commitment to generate backend secret + commitment.
 *      → call join(commitment) on-chain.
 *   2. If a live round already exists:
 *      → call join(0x000…000) on-chain (commitment ignored by contract).
 *
 * Uses MiniPay legacy feeCurrency format (cUSD).
 *
 * @param {string} address  checksummed caller address
 * @returns {string}  transaction hash
 */
export async function joinRound(address) {
  const walletClient = makeWalletClient();

  // Determine whether we need a fresh commitment (opening a new round)
  const onChain = await readRound();
  const needsCommitment = onChain.roundId === 0 || onChain.phase === 2;

  let commitment;
  if (needsCommitment) {
    const { commitment: hex } = await getCommitment();
    // hex is "0x…" 66-char string — viem expects a 0x-prefixed hex bytes32
    commitment = hex;
  } else {
    // Subsequent joiner — contract ignores the value, pass zero bytes32
    commitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  const hash = await walletClient.writeContract({
    address:      CONTRACT_ADDRESS,
    abi:          ABI,
    functionName: "join",
    args:         [commitment],
    account:      address,
    // MiniPay legacy gas token — USDT/cUSD as feeCurrency
    feeCurrency:  CUSD,
  });

  return hash;
}
