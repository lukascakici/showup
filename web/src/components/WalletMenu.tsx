"use client";

import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  LogOut,
  Trash2,
  Wallet,
} from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { EXPLORER_ACCOUNT } from "@/lib/networks";
import { useNetwork } from "@/lib/network-context";
import { formatXlm, shortAddr } from "@/lib/format";
import { Button, ButtonLink, Skeleton, SectionLabel } from "./ui";
import { FaucetButton } from "./Faucet";
import { LocalWalletKey } from "./LocalWalletKey";

export function WalletMenu() {
  const {
    address,
    balance,
    balanceLoading,
    balanceError,
    refreshBalance,
    disconnect,
    isLocal,
    forgetLocal,
    openPicker,
  } = useWallet();
  const network = useNetwork();

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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

  // Guarded: writeText rejects on an insecure origin or a denied permission, and
  // unguarded it left the button doing nothing at all, silently.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          // Reopening the menu must not land on an armed delete confirmation.
          setConfirmingDelete(false);
        }}
        className="flex h-11 items-center gap-3"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Wallet"
      >
        {/* "—" used to mean both "still fetching" and "this account doesn't
            exist", which are different answers to different questions. */}
        {/* The figure alone: the accent dot that used to sit in front of it was
            decoration, and this design language does not have indicator dots. */}
        <span className="hidden items-center rounded-full border border-border-strong bg-surface px-2.5 py-1.5 transition-colors hover:border-border-hover sm:flex">
          <span className="font-mono text-[12.5px] text-foreground">
            {balance?.funded
              ? `${formatXlm(balance.xlm, 2)} XLM`
              : balance
                ? "Not funded"
                : balanceLoading
                  ? "…"
                  : "—"}
          </span>
        </span>
        <span
          aria-hidden
          className="size-7 shrink-0 rounded-full bg-[linear-gradient(150deg,#3A3A3E,#B9BBC2)]"
        />
      </button>

      {open && (
        // A hard w-80 is 320px, and it hangs off the *left* edge of anything
        // narrower than about 352px with no scrollbar to bring it back — the
        // balance and the faucet simply weren't there. It gives up width to the
        // viewport now instead of leaving the page.
        //
        // The height cap is the same problem on the other axis, and it bites
        // harder: the header is `sticky`, so a menu taller than the viewport is
        // not merely below the fold, it is **unreachable** — scrolling the page
        // moves the header and the menu with it. Measured on a 375×667 viewport
        // once the in-app wallet section was added: 696px of menu in 667px of
        // screen, with "Delete this wallet" in the 95px that could never be
        // scrolled to. It scrolls inside itself now. `dvh` rather than `vh`
        // because iOS Safari's `vh` counts the URL bar's space whether or not
        // the bar is there.
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-5.5rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border-strong bg-surface p-5 shadow-2xl shadow-black/50">
          {/* Balance */}
          <div className="flex items-start justify-between">
            <div>
              <SectionLabel>BALANCE</SectionLabel>
              {/* An account that doesn't exist on the ledger yet is not an
                  account holding zero. Printing "0" for both meant the faucet
                  below looked optional to the one person who needs it. */}
              {balanceLoading && !balance ? (
                <Skeleton className="mt-2 h-9 w-32" />
              ) : balance?.funded ? (
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="font-mono text-3xl leading-none tabular-nums">
                    {formatXlm(balance.xlm)}
                  </span>
                  <span className="text-sm text-muted">XLM</span>
                </div>
              ) : (
                <div className="mt-2">
                  <span className="font-display text-xl font-bold tracking-tight">
                    Not funded yet
                  </span>
                  {/* "Use the faucet below" is only true where there is one, and
                      Mainnet has none — the section is already hidden there, so
                      pointing at it would be pointing at nothing. */}
                  <p className="mt-1 text-xs text-muted">
                    This account doesn’t exist on {network.label} until it holds some
                    XLM.{network.friendbotUrl ? " Use the faucet below." : ""}
                  </p>
                </div>
              )}
            </div>
            {/* Was a bare 16px icon — a third of the 44px a thumb needs, on the
                one control that answers "did my refund arrive". The negative
                margins keep it visually where it was while the hit area grows
                out to the panel's padding. */}
            <button
              onClick={refreshBalance}
              className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:text-foreground"
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
          {/* Both of these were ~36px tall because the row's padding was doing
              the sizing. They set their own height now, so the row is 44px and
              so is each half of it. */}
          <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3">
            <button
              onClick={copy}
              className="inline-flex min-h-11 min-w-0 items-center gap-1.5 font-mono text-xs text-foreground transition-colors hover:text-accent-soft"
            >
              <span className="truncate">{shortAddr(address, 6, 6)}</span>
              {copied ? (
                <Check className="size-3.5 shrink-0 text-success" />
              ) : (
                <Copy className="size-3.5 shrink-0 text-muted" />
              )}
            </button>
            <a
              href={EXPLORER_ACCOUNT(network, address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs text-muted transition-colors hover:text-foreground"
            >
              Explorer
              <ExternalLink className="size-3.5" />
            </a>
          </div>

          {/* The button above shows a shortened address, so "select it yourself"
              would hand over something truncated and useless. The full one gets
              rendered instead, selectable. */}
          {copyFailed && (
            <div className="mt-2">
              <p className="text-xs text-danger">
                Couldn’t reach the clipboard. Copy it by hand:
              </p>
              <code className="mt-1 block select-all break-all rounded-lg border border-border bg-surface-2 p-2 font-mono text-[11px] text-foreground">
                {address}
              </code>
            </div>
          )}

          {/* The ledger has been readable from the chain since the first week and
              readable by a person only since the record page existed. This is the
              one place somebody would look for their own. */}
          <div className="mt-5">
            <SectionLabel>YOUR RECORD</SectionLabel>
            <div className="mt-2.5">
              {/* Closed on click, or navigating to the page you are already on
                  leaves the menu hanging open over it. */}
              <ButtonLink
                href={`/u/${address}`}
                variant="secondary"
                fullWidth
                onClick={() => setOpen(false)}
              >
                <BadgeCheck className="size-4" />
                Show-up record
              </ButtonLink>
            </div>
          </div>

          {/* Only where there is one. Mainnet has no faucet, and a section
              headed TEST FAUCET on the network holding real deposits would be
              both useless and alarming. */}
          {network.friendbotUrl !== null && (
            <div className="mt-5">
              <SectionLabel>TEST FAUCET</SectionLabel>
              <div className="mt-2.5">
                <FaucetButton />
              </div>
            </div>
          )}

          {/* The in-app wallet is never left looking like an extension. It holds
              its own key, the person is the only one who can back it up, and both
              of those facts belong on the screen they would go looking for. */}
          {isLocal && (
            <div className="mt-5">
              <SectionLabel>IN-APP WALLET</SectionLabel>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                This key was generated in this browser and is stored here. Save it
                somewhere safe — Showup has no copy and cannot restore it.
              </p>
              <div className="mt-2.5">
                <LocalWalletKey compact />
              </div>
            </div>
          )}

          <div className="my-5 h-px bg-border" />

          {/* Two different actions, deliberately not one button.
              Disconnecting a wallet app is reversible; deleting a local key is
              not, and takes whatever the account holds with it. */}
          {isLocal ? (
            <div className="space-y-2">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setOpen(false);
                  openPicker();
                }}
              >
                <Wallet className="size-4" />
                Use a different wallet
              </Button>

              {confirmingDelete ? (
                <div className="rounded-xl border border-border-strong bg-surface-2 p-3">
                  <p className="text-xs leading-relaxed text-foreground-2">
                    Delete this wallet from this browser? The key goes with it, and
                    so does the{" "}
                    {balance?.funded ? `${formatXlm(balance.xlm, 2)} XLM` : "balance"}{" "}
                    it holds. This cannot be undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Keep it
                    </Button>
                    <Button
                      variant="danger"
                      fullWidth
                      onClick={() => {
                        forgetLocal();
                        setConfirmingDelete(false);
                        setOpen(false);
                      }}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="danger"
                  fullWidth
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="size-4" />
                  Delete this wallet
                </Button>
              )}
            </div>
          ) : (
            <Button variant="danger" fullWidth onClick={disconnect}>
              <LogOut className="size-4" />
              Disconnect
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
