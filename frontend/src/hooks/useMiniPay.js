// src/hooks/useMiniPay.js
// Detects MiniPay (window.ethereum injected by the mini app shell) and
// requests account access once on mount.

import { useEffect } from "react";
import { useStore } from "../store/useStore.js";

export function useMiniPay() {
  const setWallet = useStore((s) => s.setWallet);

  useEffect(() => {
    async function connect() {
      if (!window.ethereum) return;

      try {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        if (accounts?.[0]) {
          const isMiniPay = !!window.ethereum.isMiniPay;
          setWallet(accounts[0], isMiniPay);
        }
      } catch (err) {
        console.warn("[useMiniPay] connect failed:", err);
      }
    }

    connect();

    // Re-connect if user switches account inside MiniPay
    window.ethereum?.on?.("accountsChanged", (accounts) => {
      setWallet(accounts?.[0] ?? null);
    });

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", setWallet);
    };
  }, []);
}
