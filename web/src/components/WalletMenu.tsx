"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Droplets,
  LogOut,
} from "lucide-react";
import { useWallet } from "@/lib/wallet";
import {
  fundWithFriendbot,
  EXPLORER_ACCOUNT,
  errMessage,
} from "@/lib/stellar";
import { formatXlm, shortAddr } from "@/lib/format";
import { Button } from "./ui";

type FaucetMsg = { ok: boolean; text: string } | null;

export function WalletMenu() {
  const {
    address,
    balance,
    balanceLoading,
    balanceError,
    refreshBalance,
    disconnect,
  } = useWallet();

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [funding, setFunding] = useState(false);
  const [faucet, setFaucet] = useState<FaucetMsg>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!address) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const requestFaucet = async () => {
    setFunding(true);
    setFaucet(null);
    try {
      const result = await fundWithFriendbot(address);
      await refreshBalance();
      setFaucet(
        result === "funded"
          ? { ok: true, text: "Funded — 10,000 test XLM added." }
          : {
              ok: false,
              text: "Already funded. Friendbot only funds a new account once.",
            },
      );
    } catch (e) {
      setFaucet({ ok: false, text: errMessage(e) || "Faucet request failed." });
    } finally {
      setFunding(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm transition-colors hover:border-muted"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="font-mono text-xs text-foreground">
          {shortAddr(address)}
        </span>
        <span className="hidden text-xs text-muted sm:inline">
          {balance?.funded ? `${formatXlm(balance.xlm, 2)} XLM` : "—"}
        </span>
        <ChevronDown
          className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-border bg-surface p-4 shadow-2xl shadow-black/40">
          {/* Balance */}
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                Balance
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tracking-tight tabular-nums">
                  {balanceLoading && !balance
                    ? "—"
                    : balance?.funded
                      ? formatXlm(balance.xlm)
                      : "0"}
                </span>
                <span className="text-sm font-medium text-muted">XLM</span>
              </div>
            </div>
            <button
              onClick={refreshBalance}
              className="mt-1 text-muted transition-colors hover:text-foreground"
              aria-label="Refresh balance"
            >
              <RefreshCw
                className={`size-4 ${balanceLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          {balanceError && (
            <p className="mt-2 text-xs text-danger">{balanceError}</p>
          )}

          {/* Address */}
          <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2.5">
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 font-mono text-xs text-foreground transition-colors hover:text-accent"
            >
              {shortAddr(address, 6, 6)}
              {copied ? (
                <Check className="size-3.5 text-accent" />
              ) : (
                <Copy className="size-3.5 text-muted" />
              )}
            </button>
            <a
              href={EXPLORER_ACCOUNT(address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground"
            >
              Explorer
              <ExternalLink className="size-3.5" />
            </a>
          </div>

          {/* Faucet */}
          <div className="mt-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Test faucet
            </span>
            <Button
              variant="secondary"
              className="mt-2"
              fullWidth
              onClick={requestFaucet}
              loading={funding}
            >
              <Droplets className="size-4" />
              Request test XLM
            </Button>
            {faucet && (
              <p
                className={`mt-2 text-xs ${faucet.ok ? "text-accent" : "text-muted"}`}
              >
                {faucet.text}
              </p>
            )}
          </div>

          <div className="my-4 h-px bg-border" />

          <Button variant="danger" fullWidth onClick={disconnect}>
            <LogOut className="size-4" />
            Disconnect
          </Button>
        </div>
      )}
    </div>
  );
}
