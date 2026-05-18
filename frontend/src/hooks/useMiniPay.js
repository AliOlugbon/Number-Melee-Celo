import { useEffect } from "react";
import { getAddress } from "viem";
import { makePublicClient, makeWalletClient } from "../lib/viem.js";
import { useStore } from "../store/useStore.js";

export function useMiniPay() {
  const { setWallet, setIsMiniPay, setAutoConnecting, addFeed } = useStore();

  useEffect(() => {
    const isMp = Boolean(window.ethereum?.isMiniPay);
    setIsMiniPay(isMp);

    if (isMp) {
      setAutoConnecting(true);
      silentConnect().finally(() => setAutoConnecting(false));
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    const handler = (accs) => {
      if (accs.length > 0) silentConnect();
    };
    window.ethereum.on("accountsChanged", handler);
    return () => window.ethereum.removeListener("accountsChanged", handler);
  }, []);

  async function silentConnect() {
    try {
      if (!window.ethereum) throw new Error("No wallet detected");
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accs?.length) throw new Error("No accounts returned");
      const acc = getAddress(accs[0]);
      const pub = makePublicClient();
      const wal = makeWalletClient(acc);
      setWallet({ account: acc, pubClient: pub, walClient: wal });
      addFeed("🔗", "Wallet", `${acc.slice(0, 6)}…${acc.slice(-4)} connected`);
      return acc;
    } catch (e) {
      console.warn("silentConnect:", e.message);
      throw e;
    }
  }

  // Manual connect (for non-MiniPay users clicking the button)
  async function connect() {
    setAutoConnecting(true);
    try {
      return await silentConnect();
    } finally {
      setAutoConnecting(false);
    }
  }

  return { connect };
}
