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
export const WALLET_IDS = ["freighter", "xbull", "albedo", "hana"] as const;

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
};

/**
 * The wallets whose "available" answer means "installed".
 *
 * xBull and Albedo return available unconditionally because they need nothing
 * installed, so offering to install them would be nonsense.
 */
export const DETECTS_INSTALL: ReadonlySet<string> = new Set(["freighter", "hana"]);

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
  // twelve modules and drags WalletConnect, Reown and Coinbase in with them.
  sdk.StellarWalletsKit.init({
    modules: [
      new freighter.FreighterModule(),
      new xbull.xBullModule(),
      new albedo.AlbedoModule(),
      new hana.HanaModule(),
    ],
    network: types.Networks.TESTNET,
  });

  return { kit: sdk.StellarWalletsKit, events: types.KitEventType };
}
