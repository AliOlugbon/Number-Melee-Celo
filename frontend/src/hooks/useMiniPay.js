import { useEffect, useState } from "react";
import { getAddress } from "viem";
import { makePublicClient, makeWalletClient } from "../lib/viem.js";
import { useStore } from "../store/useStore.js";

export function useMiniPay() {
  const { setWallet, setIsMiniPay, addFeed } = useStore();
  const [autoConnecting, setAutoConnecting] = useState(false);
  const [connectError,   setConnectError]   = useState(null);

  // ── Detect + auto-connect on mount ─────────────────────────────────────────
  useEffect(() => {
    const isMp = Boolean(window.ethereum?.isMiniPay);
    setIsMiniPay(isMp);
    if (isMp) {
      setAutoConnecting(true);
      silentConnect().finally(() => setAutoConnecting(false));
    }
  }, []);

  // ── React to account switches ───────────────────────────────────────────────
  useEffect(() => {
    if (!window.ethereum) return;
    const handler = (accs) => { if (accs.length > 0) silentConnect(); };
    window.ethereum.on("accountsChanged", handler);
    return () => window.ethereum.removeListener("accountsChanged", handler);
  }, []);

  // ── Core connect ───────────────────────────────────────────────────────────
  async function silentConnect() {
    try {
      if (!window.ethereum) throw new Error("No wallet detected");
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accs?.length) throw new Error("No accounts");
      const acc = getAddress(accs[0]);
      const pub = makePublicClient();
      const wal = makeWalletClient(acc);
      setWallet({ account: acc, pubClient: pub, walClient: wal });
      setConnectError(null);
      addFeed("🔗", "Wallet", `${acc.slice(0, 6)}…${acc.slice(-4)} connected`);
      return acc;
    } catch (e) {
      setConnectError(e.message || "Connection failed");
      throw e;
    }
  }

  async function connect() {
    setAutoConnecting(true);
    try { return await silentConnect(); }
    finally { setAutoConnecting(false); }
  }

  return { connect, autoConnecting, connectError };
}
