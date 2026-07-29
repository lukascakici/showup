"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Loader2, X } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { DETECTS_INSTALL, WALLET_DISPLAY, type ISupportedWallet } from "@/lib/kit";

/**
 * Our own wallet picker, rather than the kit's built-in modal.
 *
 * The kit's modal hardcodes a blurred header and footer and a translucent scrim,
 * and none of its theme tokens reach them — so it can't be brought onto a flat
 * palette. It also renders into document.body, outside this tree.
 */
export function WalletPicker() {
  const { pickerOpen } = useWallet();
  // Mounted only while open, so the panel's own state starts fresh every time
  // instead of needing to be reset.
  return pickerOpen ? <Picker /> : null;
}

function Picker() {
  const { closePicker, wallets, walletsLoading, select, error } = useWallet();
  const [pending, setPending] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePicker();
    };
    const onDown = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) closePicker();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    // Keep the page behind from scrolling under the panel.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.body.style.overflow = overflow;
    };
  }, [closePicker]);

  useEffect(() => {
    if (!walletsLoading) firstItem.current?.focus();
  }, [walletsLoading]);

  const choose = (wallet: ISupportedWallet) => {
    setPending(wallet.id);
    // Deliberately not awaited before touching the wallet: xBull and Albedo open
    // a popup, and the browser only allows that while the click is still fresh.
    void select(wallet.id);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-picker-title"
    >
      <div
        ref={panel}
        className="relative w-full max-w-sm rounded-2xl border border-border bg-surface shadow-2xl shadow-black/60"
      >
        <svg
          className="runner runner-loop pointer-events-none absolute inset-0 size-full"
          aria-hidden="true"
        >
          <rect pathLength={100} />
          <rect pathLength={100} />
        </svg>

        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="wallet-picker-title" className="text-base font-bold tracking-tight">
            Connect a wallet
          </h2>
          <button
            onClick={closePicker}
            aria-label="Close"
            className="-mr-1 rounded-lg p-1 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {walletsLoading && wallets.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            Checking which wallets you have…
          </p>
        ) : wallets.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No Stellar wallet found. Install one to continue.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {wallets.map((wallet, i) => (
              <WalletRow
                key={wallet.id}
                ref={i === 0 ? firstItem : undefined}
                wallet={wallet}
                pending={pending === wallet.id}
                disabled={pending !== null}
                onChoose={() => choose(wallet)}
              />
            ))}
          </ul>
        )}

        {error && (
          <p className="border-t border-border px-5 py-3 text-sm text-danger">{error}</p>
        )}

        <p className="border-t border-border px-5 py-3 text-xs text-muted-2">
          Showup runs on Stellar Testnet. Your wallet must be on Testnet too.
        </p>
      </div>
    </div>
  );
}

function WalletRow({
  ref,
  wallet,
  pending,
  disabled,
  onChoose,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  wallet: ISupportedWallet;
  pending: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  const display = WALLET_DISPLAY[wallet.id];
  const kind = display?.kind ?? "Wallet";
  const monogram = display?.monogram ?? wallet.name.slice(0, 1);
  // Only Freighter and Hana report this honestly; the others are always available.
  const missing = !wallet.isAvailable && DETECTS_INSTALL.has(wallet.id);

  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-2 font-mono text-base text-foreground">
        {monogram}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold text-foreground">
          {wallet.name}
        </span>
        <span className="block truncate text-xs text-muted">
          {missing ? "Not installed" : kind}
        </span>
      </span>
    </>
  );

  if (missing) {
    return (
      <li>
        <a
          href={wallet.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2"
        >
          {body}
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent">
            Install
            <ArrowUpRight className="size-3.5" />
          </span>
        </a>
      </li>
    );
  }

  return (
    <li>
      <button
        ref={ref}
        onClick={onChoose}
        disabled={disabled}
        className="flex w-full items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
      >
        {body}
        {pending && <Loader2 className="size-4 shrink-0 animate-spin text-accent" />}
      </button>
    </li>
  );
}
