/**
 * viem.js — chain-aware client factory
 *
 * Reads the actual chain from window.ethereum at runtime so the app works
 * on BOTH Celo mainnet and Alfajores testnet without a rebuild.
 *
 * MiniPay on mainnet injects chainId 42220.
 * MiniPay on testnet injects chainId 44787.
 */
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  defineChain,
} from "viem";
import { celo, celoAlfajores } from "viem/chains";

// ── Detect chain from wallet or env ──────────────────────────────────────────
function detectChain() {
  // 1. Prefer explicit env var set at build time
  const envChainId = import.meta.env.VITE_CHAIN_ID
    ? parseInt(import.meta.env.VITE_CHAIN_ID)
    : null;

  if (envChainId === 42220) return celo;
  if (envChainId === 44787) return celoAlfajores;

  // 2. Read chainId from injected wallet synchronously (hex string)
  try {
    const hexId = window.ethereum?.chainId;
    if (hexId) {
      const id = parseInt(hexId, 16);
      if (id === 42220) return celo;
      if (id === 44787) return celoAlfajores;
    }
  } catch {}

  // 3. Default to mainnet — production app
  return celo;
}

export function getChain() {
  return detectChain();
}

// ── RPC URL (can override via env for a custom node) ─────────────────────────
function getRpcUrl(chain) {
  const envRpc = import.meta.env.VITE_RPC_URL;
  if (envRpc) return envRpc;
  // Official Celo public RPCs
  return chain.id === 42220
    ? "https://forno.celo.org"
    : "https://alfajores-forno.celo-testnet.org";
}

export function makePublicClient() {
  const chain = getChain();
  return createPublicClient({
    chain,
    transport: http(getRpcUrl(chain)),
  });
}

export function makeWalletClient(account) {
  const chain = getChain();
  return createWalletClient({
    account,
    chain,
    transport: custom(window.ethereum),
  });
}
