import { Asset, Networks } from "@stellar/stellar-sdk";
import { networks as factoryNetworks } from "factory-client";
import { networks as reputationNetworks } from "reputation-client";

/**
 * Everything that differs between the two networks Showup serves, in one place.
 *
 * Until now the network was a constant — `stellar.ts` exported one passphrase,
 * one Horizon URL, one explorer prefix, and `contracts.ts` one RPC URL. That is
 * correct right up until both networks are live at once, which is what SOW 3
 * asks for: Mainnet because a deposit is only a deposit if losing it would
 * matter, and Testnet alongside it as the only free way to try this.
 *
 * Two rules shape this file:
 *
 * 1. **A network nobody has deployed to is not a network you can pick.**
 *    `contracts` is null until the addresses exist, and `liveNetworks()` filters
 *    on exactly that. So this can ship — and does — while Mainnet is still
 *    unfunded and undeployed: nothing user-visible changes, because there is
 *    only one live network to serve. Turning Mainnet on later is filling in two
 *    addresses, not a second refactor.
 *
 * 2. **Derive rather than transcribe.** The native XLM Stellar Asset Contract
 *    has a different address on each network — it is a hash of the asset and the
 *    network passphrase — and the Mainnet one is nowhere in this repository to
 *    copy. Writing either by hand is a silent way to point a deposit at the
 *    wrong contract, so both are computed from the passphrase.
 */

export type NetworkId = "testnet" | "mainnet";

export type NetworkContracts = {
  factoryId: string;
  reputationId: string;
};

export type Network = {
  id: NetworkId;
  /** What a person is told they are on. Never a passphrase — see `networkName`. */
  label: string;
  passphrase: string;
  sorobanRpcUrl: string;
  horizonUrl: string;
  /** stellar.expert's path segment. Mainnet's is "public", not "mainnet". */
  explorerSegment: string;
  /** Testnet only. Mainnet has no faucet and must never appear to have one. */
  friendbotUrl: string | null;
  /** The native XLM SAC, derived from the passphrase. */
  nativeSac: string;
  /**
   * Null until the contracts are deployed there. The app treats this as "this
   * network is not available", which is the honest reading.
   */
  contracts: NetworkContracts | null;
  /**
   * The account that governs both contracts on this network, for `/trust` to
   * point at. A different account on each, and neither is a key: both are
   * 2-of-3.
   *
   * Written down rather than read from the chain because `/trust` is a server
   * page and an RPC call per view would make the page fail when the network
   * does — on exactly the page somebody opens when they are already unsure.
   * The link goes to the chain, which is the authority: if this ever drifts,
   * the account it points at will visibly not be the one `get_admin` returns.
   */
  adminAccount: string | null;
  /**
   * Whether a mistake here costs somebody real money. Drives the confirmation
   * step, the labelling, and the refusal to put an app-generated wallet on it.
   */
  isRealMoney: boolean;
};

/**
 * Mainnet has no free public Soroban RPC the way Testnet does, so it comes from
 * the environment. Absent, Mainnet simply has no RPC and `liveNetworks()` leaves
 * it out — the same failure mode as not having deployed yet, and the same honest
 * result: it is not offered.
 *
 * **The server and the browser are given different URLs on purpose.** Every
 * Mainnet provider authenticates, and ours carries its API key inside the URL, so
 * that URL can never be a `NEXT_PUBLIC_` value — those are compiled into the
 * client bundle and served to anybody who asks. Server code therefore gets the
 * real upstream from a server-only secret, and the browser gets a path on our own
 * origin that `app/api/rpc/mainnet` forwards. See that route for what it refuses.
 *
 * `MAINNET_RPC_PATH` is public and carries nothing: it is a path, and its
 * presence is also how the browser learns that this deployment has a Mainnet RPC
 * at all. Set it only on a deployment where `MAINNET_RPC_URL` is set too —
 * otherwise the browser offers Mainnet and every read 503s at the proxy.
 */
const MAINNET_RPC_URL = (() => {
  if (typeof window === "undefined") return process.env.MAINNET_RPC_URL ?? "";
  const path = process.env.NEXT_PUBLIC_MAINNET_RPC_PATH ?? "";
  // Absolute, because `new rpc.Server(url)` runs `new URL(url)` and a bare path
  // throws. Built from the live origin rather than from a configured host so a
  // preview deployment proxies through itself.
  return path ? new URL(path, window.location.origin).toString() : "";
})();

const TESTNET: Network = {
  id: "testnet",
  label: "Testnet",
  passphrase: Networks.TESTNET,
  sorobanRpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  explorerSegment: "testnet",
  friendbotUrl: "https://friendbot.stellar.org",
  nativeSac: Asset.native().contractId(Networks.TESTNET),
  contracts: {
    factoryId: factoryNetworks.testnet.contractId,
    reputationId: reputationNetworks.testnet.contractId,
  },
  adminAccount: "GBWMYPV6274EVO3MVQMEQWGRSEFGE7ZSEJSNWYGMBV4WF7OQLEAF5QQF",
  isRealMoney: false,
};

const MAINNET: Network = {
  id: "mainnet",
  label: "Mainnet",
  passphrase: Networks.PUBLIC,
  sorobanRpcUrl: MAINNET_RPC_URL,
  horizonUrl: "https://horizon.stellar.org",
  explorerSegment: "public",
  friendbotUrl: null,
  nativeSac: Asset.native().contractId(Networks.PUBLIC),
  // Deployed 27.11.2026, and read out of the bindings rather than typed here —
  // the same rule testnet's addresses follow. Mainnet is still not *live* until
  // a deployment also has an RPC for it: see `liveNetworks()`, and the two
  // environment variables above.
  contracts: {
    factoryId: factoryNetworks.mainnet.contractId,
    reputationId: reputationNetworks.mainnet.contractId,
  },
  adminAccount: "GCHKQ5BIFT55QZMZFW5OMXN2MNWQP3GUFJWNHYV2PUEPOYI6RPYV2NOG",
  isRealMoney: true,
};

const NETWORKS: Record<NetworkId, Network> = {
  testnet: TESTNET,
  mainnet: MAINNET,
};

export function network(id: NetworkId): Network {
  return NETWORKS[id];
}

/**
 * The networks this deployment can actually serve, in the order to offer them.
 *
 * A network needs contracts *and* somewhere to ask about them. Mainnet without
 * an RPC URL is not a degraded Mainnet, it is an absent one, and offering it
 * would mean a reservation that fails after a wallet has already been asked to
 * sign.
 */
export function liveNetworks(): Network[] {
  return (["mainnet", "testnet"] as NetworkId[])
    .map((id) => NETWORKS[id])
    .filter((n) => n.contracts !== null && n.sorobanRpcUrl !== "");
}

export function isLive(id: NetworkId): boolean {
  return liveNetworks().some((n) => n.id === id);
}

/**
 * The one network to use when nothing says otherwise.
 *
 * Real money first, when it is available — this is a product for Mainnet with
 * Testnet kept alongside, not the reverse. Falls back to whatever is live so a
 * deployment with only Testnet configured still works unchanged, which is what
 * every environment is today.
 */
export function defaultNetwork(): Network {
  const live = liveNetworks();
  if (live.length === 0) {
    // Not reachable in any shipped configuration: Testnet's contracts come from
    // committed bindings and its RPC is a constant. Throwing beats returning a
    // network whose contract calls would all fail.
    throw new Error("No network is configured with both contracts and an RPC URL.");
  }
  return live[0];
}

/** Narrow an untrusted string — a URL segment, a stored preference — to a network. */
export function parseNetworkId(value: string | null | undefined): NetworkId | null {
  return value === "testnet" || value === "mainnet" ? value : null;
}

/**
 * The hostname that serves real money, and the only one.
 *
 * Mainnet is an **allowlist of one**. Everything else — the Testnet subdomain, a
 * Vercel preview, localhost, a hostname somebody typed wrong, a `Host` header
 * somebody made up — resolves to Testnet. The asymmetry is the whole design: the
 * worst outcome of a misconfiguration becomes "this shows Testnet when it should
 * have shown Mainnet", which is visible and harmless, instead of "this looked
 * like Testnet and moved real money", which is neither.
 */
const MAINNET_HOSTNAMES = new Set(["showup.click", "www.showup.click"]);

/** `showup.click` -> mainnet. Anything else at all -> testnet. */
export function networkIdFromHostname(hostname: string): NetworkId {
  // Lowercased and de-ported: a Host header arrives as the client wrote it,
  // and `Showup.Click:443` is the same host as `showup.click`.
  const host = hostname.trim().toLowerCase().split(":")[0];
  return MAINNET_HOSTNAMES.has(host) ? "mainnet" : "testnet";
}

/**
 * The network to serve on a given hostname.
 *
 * Falls back when the hostname's network is not live, which is what lets the
 * domain split ship before Mainnet exists: `showup.click` asks for Mainnet,
 * Mainnet has no contracts yet, and it serves Testnet — the same thing it serves
 * today — until the day the addresses are filled in.
 */
export function networkFromHostname(hostname: string): Network {
  const id = networkIdFromHostname(hostname);
  return isLive(id) ? network(id) : defaultNetwork();
}

/**
 * Where a link to this network should point.
 *
 * Invite links are built from a fixed canonical host rather than
 * `window.location.origin`, so that an event created on localhost or on a
 * preview deployment still produces a link somebody else can open — see
 * `links.ts`. Once there are two networks there have to be two canonical hosts,
 * because an invite that lands on the wrong one shows a stranger an event that
 * does not exist there.
 */
export function siteUrlFor(n: Network): string {
  const override = process.env.NEXT_PUBLIC_SITE_URL;
  if (override) {
    // A self-hoster gets one origin, and it serves whatever network they
    // configured. Appending a subdomain to somebody else's domain would be a
    // guess about DNS we have no business making.
    return override.replace(/\/+$/, "");
  }
  return n.id === "mainnet" ? "https://showup.click" : "https://testnet.showup.click";
}

export const EXPLORER_TX = (n: Network, hash: string) =>
  `https://stellar.expert/explorer/${n.explorerSegment}/tx/${hash}`;
export const EXPLORER_ACCOUNT = (n: Network, id: string) =>
  `https://stellar.expert/explorer/${n.explorerSegment}/account/${id}`;
export const EXPLORER_CONTRACT = (n: Network, id: string) =>
  `https://stellar.expert/explorer/${n.explorerSegment}/contract/${id}`;
