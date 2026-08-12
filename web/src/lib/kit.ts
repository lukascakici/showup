"use client";

import type { ISupportedWallet } from "@creit.tech/stellar-wallets-kit/types";
import { NETWORK_PASSPHRASE } from "./stellar";

export type { ISupportedWallet };

/**
 * The wallets Showup offers. Verified against each module's source:
 * Freighter and Hana genuinely detect whether they're installed, while xBull and
 * Albedo always report themselves available because they're popup/web based and
 * need nothing installed.
 */
export const WALLET_IDS = ["freighter", "xbull", "albedo", "hana", "wallet_connect"] as const;

/**
 * WalletConnect's project id, from https://cloud.reown.com.
 *
 * Public by design — it identifies the app to the relay and ships in the client
 * bundle, which is why it carries the `NEXT_PUBLIC_` prefix rather than being
 * kept secret. When it is absent the module is simply not registered: building
 * it calls `SignClient.init()` and `createAppKit()` in its constructor, so an
 * unconfigured deploy would pay for a relay connection it can never use.
 */
const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export const walletConnectConfigured = WALLETCONNECT_PROJECT_ID.length > 0;

/**
 * How each wallet is reached, and a monogram to stand in for its logo.
 *
 * The kit types all four as `HOT_WALLET`, so it can't tell a browser extension
 * from a web wallet — that distinction is ours. The logos it points at are remote
 * PNGs on a third-party host, in each wallet's own brand colours; a flat monogram
 * keeps the picker on our palette and the page free of outside requests.
 */
export const WALLET_DISPLAY: Record<string, { kind: string; monogram: string }> = {
  freighter: { kind: "Browser extension", monogram: "F" },
  xbull: { kind: "Web or extension", monogram: "x" },
  albedo: { kind: "Web", monogram: "A" },
  hana: { kind: "Browser extension", monogram: "H" },
  wallet_connect: { kind: "Mobile wallet", monogram: "W" },
};

/**
 * The wallets whose "available" answer means "installed".
 *
 * xBull and Albedo return available unconditionally because they need nothing
 * installed, so offering to install them would be nonsense.
 */
export const DETECTS_INSTALL: ReadonlySet<string> = new Set(["freighter", "hana"]);

/** What Freighter's mobile app puts on `window` inside its own browser. */
declare global {
  interface Window {
    stellar?: { provider?: string; platform?: string };
  }
}

/**
 * True when the page is running inside the Freighter mobile app's own browser.
 *
 * Freighter reports itself there, and the kit's `FreighterModule.isAvailable()`
 * answers **false** on purpose when it sees this — its own comment says to use
 * WalletConnect instead, and `WalletConnectModule.isPlatformWrapper()` runs this
 * exact check to claim the case. Reported from a phone on 12.08.2026: the picker
 * told someone standing inside Freighter that Freighter was not installed, and
 * offered them a link to install it.
 *
 * WalletConnect is registered now, so the case has an answer. This stays because
 * the answer still needs explaining: the row a person is looking for says
 * "Freighter" and the one that works says "WalletConnect", and nothing on screen
 * would otherwise connect the two.
 */
export function insideFreighterMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.stellar?.provider === "freighter" && window.stellar?.platform === "mobile";
}

type Kit = typeof import("@creit.tech/stellar-wallets-kit/sdk")["StellarWalletsKit"];
type KitEvents = typeof import("@creit.tech/stellar-wallets-kit/types")["KitEventType"];

let pending: Promise<{ kit: Kit; events: KitEvents }> | null = null;

/**
 * Load and initialise the wallet kit — lazily, and never during server render.
 *
 * The kit runs an effect at import time that writes seventeen inline CSS custom
 * properties onto <html>. Importing it from a module the server also renders
 * would therefore change the DOM before React hydrates and produce a hydration
 * mismatch (Creit-Tech/Stellar-Wallets-Kit#79). Keeping every import inside this
 * function means it only ever runs after hydration, from an effect or a click.
 *
 * The kit is a global singleton with static methods, so this resolves once and
 * every later caller gets the same initialised instance.
 */
export function getKit() {
  pending ??= load();
  return pending;
}

/** True once the kit is loaded, so a click handler can avoid awaiting it. */
export function kitReady(): boolean {
  return pending !== null;
}

async function load() {
  const [sdk, types, freighter, xbull, albedo, hana] = await Promise.all([
    import("@creit.tech/stellar-wallets-kit/sdk"),
    import("@creit.tech/stellar-wallets-kit/types"),
    import("@creit.tech/stellar-wallets-kit/modules/freighter"),
    import("@creit.tech/stellar-wallets-kit/modules/xbull"),
    import("@creit.tech/stellar-wallets-kit/modules/albedo"),
    import("@creit.tech/stellar-wallets-kit/modules/hana"),
  ]);

  if (types.Networks.TESTNET !== NETWORK_PASSPHRASE) {
    throw new Error("The wallet kit and the app disagree about which network this is.");
  }

  // Listed explicitly rather than via defaultModules(), which instantiates
  // twelve modules and drags Coinbase and the rest in with them.
  const modules = [
    new freighter.FreighterModule(),
    new xbull.xBullModule(),
    new albedo.AlbedoModule(),
    new hana.HanaModule(),
  ];

  if (walletConnectConfigured) {
    modules.push(await walletConnectModule());
  }

  sdk.StellarWalletsKit.init({ modules, network: types.Networks.TESTNET });

  return { kit: sdk.StellarWalletsKit, events: types.KitEventType };
}

/**
 * WalletConnect, imported separately so its weight only lands when it is
 * configured — `@walletconnect/sign-client` and `@reown/appkit` together are
 * larger than everything else in this file combined.
 *
 * This is the route into the Freighter mobile app, whose in-app browser is the
 * one place `FreighterModule` deliberately reports itself unavailable. It also
 * reaches Lobstr and any other WalletConnect-speaking Stellar wallet, which is
 * why the row is labelled for what it is rather than for Freighter.
 */
async function walletConnectModule() {
  const wc = await import("@creit.tech/stellar-wallets-kit/modules/wallet-connect");

  return new wc.WalletConnectModule({
    projectId: WALLETCONNECT_PROJECT_ID,
    // Not decoration: this is what a phone shows in the approval sheet, and an
    // unnamed request is one people decline.
    metadata: {
      name: "Showup",
      description: "Put a refundable deposit on showing up.",
      url: typeof window === "undefined" ? "https://showup.click" : window.location.origin,
      icons: ["https://showup.click/icon.svg"],
    },
    // The module defaults this to `stellar:pubnet`. Left alone, every session
    // would be negotiated for mainnet while the rest of the app is on Testnet,
    // and the mismatch would only surface at signing time.
    allowedChains: [wc.WalletConnectTargetChain.TESTNET],
  });
}
