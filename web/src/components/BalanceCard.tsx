"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Check, RefreshCw, ExternalLink, Droplets } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import {
  fetchAccountState,
  fundWithFriendbot,
  EXPLORER_ACCOUNT,
  errMessage,
  type AccountState,
} from "@/lib/stellar";
import { formatXlm, shortAddr } from "@/lib/format";
import { Button, Card } from "./ui";

export function BalanceCard({ onBalanceChange }: { onBalanceChange?: () => void }) {
  const { address } = useWallet();
  const [state, setState] = useState<AccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [funding, setFunding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!address) return;
    setError(null);
    setLoading(true);
    try {
      const s = await fetchAccountState(address);
      setState(s);
    } catch (e) {
      setError(errMessage(e) || "Couldn't load balance.");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    // Legitimate data fetch on mount / address change; load() manages its own loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const fund = async () => {
    if (!address) return;
    setFunding(true);
    setError(null);
    try {
      await fundWithFriendbot(address);
      await load();
      onBalanceChange?.();
    } catch (e) {
      setError(errMessage(e) || "Friendbot funding failed.");
    } finally {
      setFunding(false);
    }
  };

  const refresh = async () => {
    await load();
    onBalanceChange?.();
  };

  const copy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Your balance
        </span>
        <button
          onClick={refresh}
          className="text-muted hover:text-foreground transition-colors"
          aria-label="Refresh balance"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-5xl font-bold tracking-tight tabular-nums">
          {loading && !state ? "—" : state?.funded ? formatXlm(state.xlm) : "0"}
        </span>
        <span className="text-lg font-medium text-muted">XLM</span>
      </div>

      {address && (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted">
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 font-mono hover:text-foreground transition-colors"
          >
            {shortAddr(address, 6, 6)}
            {copied ? (
              <Check className="size-3.5 text-accent" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
          <a
            href={EXPLORER_ACCOUNT(address)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            Explorer
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      )}

      {!loading && state && !state.funded && (
        <div className="mt-5 rounded-xl border border-border bg-surface-2 p-4">
          <p className="text-sm text-foreground">
            This account isn&apos;t funded yet.
          </p>
          <p className="mt-1 text-xs text-muted">
            Get free Testnet XLM from Friendbot to start.
          </p>
          <Button className="mt-3" onClick={fund} loading={funding} fullWidth>
            <Droplets className="size-4" />
            Fund with Friendbot
          </Button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
    </Card>
  );
}
