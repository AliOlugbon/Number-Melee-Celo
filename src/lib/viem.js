import { createPublicClient, createWalletClient, custom, http } from "viem";
import { celo } from "viem/chains";

export const chain = celo;

export const makePublicClient = () =>
  createPublicClient({ chain, transport: http() });

export const makeWalletClient = (account) =>
  createWalletClient({ account, chain, transport: custom(window.ethereum) });
