import { useEffect } from "react";
import { useStore } from "../store/useStore.js";

export function useMiniPay() {
  const setWallet = useStore((s) => s.setWallet);

  useEffect(() => {
    async function connect() {
      if (!window.ethereum) return;
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (accounts?.[0]) {
          setWallet(accounts[0], !!window.ethereum.isMiniPay);
        }
      } catch (err) {
        console.warn("[useMiniPay]", err);
      }
    }

    connect();

    const handler = (accounts) => setWallet(accounts?.[0] ?? null);
    window.ethereum?.on?.("accountsChanged", handler);
    return () => window.ethereum?.removeListener?.("accountsChanged", handler);
  }, []);
}
