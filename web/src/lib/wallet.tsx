"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getAddress,
  getNetwork,
  isAllowed,
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import { NETWORK_PASSPHRASE } from "./stellar";

type WalletStatus = "idle" | "connecting" | "connected";

type WalletContextValue = {
  address: string | null;
  status: WalletStatus;
  network: string | null;
  wrongNetwork: boolean;
  hasFreighter: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sign: (
    xdr: string,
    opts: { networkPassphrase: string; address: string },
  ) => Promise<{ signedTxXdr: string; error?: string | { message?: string } }>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_KEY = "showup:wallet-connected";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [network, setNetwork] = useState<string | null>(null);
  const [hasFreighter, setHasFreighter] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshNetwork = useCallback(async () => {
    const net = await getNetwork();
    if (!net.error) setNetwork(net.network ?? null);
  }, []);

  // Silent reconnect on load if previously connected and still allowed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const conn = await isConnected();
      if (!conn.isConnected) {
        if (!cancelled) setHasFreighter(false);
        return;
      }
      const shouldReconnect =
        typeof window !== "undefined" &&
        window.localStorage.getItem(STORAGE_KEY) === "1";
      if (!shouldReconnect) return;
      const allowed = await isAllowed();
      if (!allowed.isAllowed) return;
      const addr = await getAddress();
      if (!cancelled && addr.address) {
        setAddress(addr.address);
        setStatus("connected");
        await refreshNetwork();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshNetwork]);

  const connect = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    try {
      const conn = await isConnected();
      if (!conn.isConnected) {
        setHasFreighter(false);
        throw new Error("Freighter wallet not detected. Install it to continue.");
      }
      const access = await requestAccess();
      if (access.error || !access.address) {
        throw new Error(
          typeof access.error === "string"
            ? access.error
            : "Connection request was rejected.",
        );
      }
      setAddress(access.address);
      setStatus("connected");
      window.localStorage.setItem(STORAGE_KEY, "1");
      await refreshNetwork();
    } catch (e) {
      setStatus("idle");
      setError(e instanceof Error ? e.message : "Failed to connect wallet.");
    }
  }, [refreshNetwork]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setStatus("idle");
    setNetwork(null);
    setError(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const sign = useCallback(
    async (
      xdr: string,
      opts: { networkPassphrase: string; address: string },
    ) => {
      const res = await signTransaction(xdr, opts);
      return { signedTxXdr: res.signedTxXdr, error: res.error };
    },
    [],
  );

  const wrongNetwork = status === "connected" && network !== null && network !== "TESTNET";

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      status,
      network,
      wrongNetwork,
      hasFreighter,
      error,
      connect,
      disconnect,
      sign,
    }),
    [address, status, network, wrongNetwork, hasFreighter, error, connect, disconnect, sign],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export { NETWORK_PASSPHRASE };
