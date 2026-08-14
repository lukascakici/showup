"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Loader2, RotateCw, X } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { Button } from "./ui";
import {
  DETECTS_INSTALL,
  WALLET_DISPLAY,
  insideFreighterMobile,
  walletConnectConfigured,
  type ISupportedWallet,
} from "@/lib/kit";

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
  const { closePicker, wallets, walletsLoading, refreshWallets, select, error } = useWallet();
  const [pending, setPending] = useState<string | null>(null);
  const [inFreighterApp, setInFreighterApp] = useState(false);
  const [touch, setTouch] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // `window.stellar` is injected by the host app, so it can only be read after
    // mount — reading it during render would disagree with the prerender.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInFreighterApp(insideFreighterMobile());
    // Which advice is true depends on whether browser extensions exist here at
    // all, and on a phone they don't. Same reason as above: this can only be
    // read after mount, and the disable on the first call covers the effect.
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

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
    // Released either way, so a rejected request leaves the rows clickable again —
    // `select` reports failure through the context rather than by throwing.
    void select(wallet.id).finally(() => setPending(null));
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-picker-title"
    >
      {/* The panel used to be as tall as its contents while the body behind it
          was scroll-locked, so in landscape — or on a short phone with six
          wallets listed — the last rows and the Testnet note were simply below
          the fold and unreachable. It caps itself and scrolls its own list now;
          `100dvh` rather than `100vh` because iOS Safari's `vh` counts the URL
          bar's space whether or not the bar is there. */}
      <div
        ref={panel}
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/60"
      >
        <svg
          className="runner runner-loop pointer-events-none absolute inset-0 size-full"
          aria-hidden="true"
        >
          <rect pathLength={100} />
          <rect pathLength={100} />
        </svg>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border py-2 pl-5 pr-2">
          <h2 id="wallet-picker-title" className="text-base font-bold tracking-tight">
            Connect a wallet
          </h2>
          {/* 24px before this — the dismiss control on a modal that covers the
              whole screen, and the only way out of it on a phone besides
              tapping the scrim. */}
          <button
            onClick={closePicker}
            aria-label="Close"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* The list is the only part that scrolls. The title, the error and the
            Testnet note stay put, because they are the three things you need to
            still be able to read while hunting for your wallet. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Inside Freighter's own browser the kit reports Freighter unavailable,
              so without this the row below reads "Not installed" to someone who is,
              at that moment, inside the app it is talking about. The row that does
              work is called WalletConnect, which nobody would guess. */}
          {inFreighterApp && (
            <div className="border-b border-border bg-surface-2 px-5 py-4">
              <p className="text-sm font-semibold text-foreground">
                You&apos;re in Freighter&apos;s in-app browser
              </p>
              <p className="mt-1.5 text-sm text-muted">
                {walletConnectConfigured
                  ? "Freighter signs over WalletConnect here — pick that row below and approve it in the app."
                  : "Freighter only signs over WalletConnect here, which this deploy isn't set up for. Open showup.click in Safari or Chrome instead — xBull and Albedo work there with nothing to install."}
              </p>
            </div>
          )}

          {walletsLoading && wallets.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              Checking which wallets you have…
            </p>
          ) : wallets.length === 0 ? (
            // Was "No Stellar wallet found. Install one to continue." and then
            // nothing — a full stop in the one place where somebody with no
            // wallet was always going to end up. The way out is below it now.
            <p className="px-5 pb-2 pt-8 text-center text-sm text-muted">
              Couldn&apos;t list any wallets just now.
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
                  // Offering to install Freighter from inside Freighter is a loop,
                  // and the reason it's unreachable isn't that it's missing.
                  installable={!(inFreighterApp && wallet.id === "freighter")}
                  onChoose={() => choose(wallet)}
                />
              ))}
            </ul>
          )}

          <NoWalletHelp touch={touch} onRecheck={refreshWallets} busy={walletsLoading} />
        </div>

        {error && (
          <p className="shrink-0 border-t border-border px-5 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <p className="shrink-0 border-t border-border px-5 py-3 text-xs text-muted-2">
          Showup runs on Stellar Testnet. Your wallet must be on Testnet too.
        </p>
      </div>
    </div>
  );
}

/**
 * The way out for someone who has never held a Stellar wallet.
 *
 * Every row above assumes you already know which of these names means anything.
 * Ten people next week won't, and the fastest true answer — a wallet that needs
 * nothing installed — is invisible because it is spelled "Albedo" and sits in a
 * list next to four things that are not it.
 *
 * The advice splits on whether browser extensions exist here at all, because on
 * a phone "install Freighter" means an app plus WalletConnect, and on a desktop
 * it means an extension plus a re-check. Getting that backwards sends somebody
 * to an extension store on iOS, which is a dead end with a link on it.
 */
function NoWalletHelp({
  touch,
  onRecheck,
  busy,
}: {
  touch: boolean;
  onRecheck: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="border-t border-border px-5 py-4">
      <h3 className="text-sm font-semibold text-foreground">Don&apos;t have any of these?</h3>
      <p className="mt-1.5 text-sm text-muted">
        <strong className="font-semibold text-foreground">Albedo</strong> needs nothing
        installed — pick it above and approve in the {touch ? "tab" : "window"} it opens.
        It takes about a minute, and it works on Testnet out of the box.
      </p>
      <p className="mt-2 text-sm text-muted">
        {touch ? (
          <>
            If you&apos;d rather use an app, install Freighter from your app store
            {walletConnectConfigured
              ? ", then come back and pick WalletConnect — that is the row Freighter answers on a phone."
              : ". This deploy can't reach it on a phone, so Albedo is the way here."}
          </>
        ) : (
          <>
            Freighter and Hana are browser extensions — install one from its row above,
            then use Check again.
          </>
        )}
      </p>
      <Button
        variant="secondary"
        className="mt-3"
        fullWidth
        onClick={() => void onRecheck()}
        loading={busy}
      >
        <RotateCw className="size-4" />
        Check again
      </Button>
    </div>
  );
}

function WalletRow({
  ref,
  wallet,
  pending,
  disabled,
  installable = true,
  onChoose,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  wallet: ISupportedWallet;
  pending: boolean;
  disabled: boolean;
  /** False when the wallet is unreachable for a reason installing won't fix. */
  installable?: boolean;
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
          {missing ? (installable ? "Not installed" : "Not available in this browser") : kind}
        </span>
      </span>
    </>
  );

  if (missing && !installable) {
    return (
      <li>
        <div className="flex items-center gap-3 px-5 py-3.5 opacity-40">{body}</div>
      </li>
    );
  }

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
