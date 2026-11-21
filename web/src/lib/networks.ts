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
 */
const MAINNET_RPC_URL = process.env.NEXT_PUBLIC_MAINNET_RPC_URL ?? "";

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
  // Deliberately null. Filled in when the contracts are deployed and the
  // generated bindings carry a `mainnet` entry, the same way testnet's are read
  // out of the bindings above rather than typed here.
  contracts: null,
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

export const EXPLORER_TX = (n: Network, hash: string) =>
  `https://stellar.expert/explorer/${n.explorerSegment}/tx/${hash}`;
export const EXPLORER_ACCOUNT = (n: Network, id: string) =>
  `https://stellar.expert/explorer/${n.explorerSegment}/account/${id}`;
export const EXPLORER_CONTRACT = (n: Network, id: string) =>
  `https://stellar.expert/explorer/${n.explorerSegment}/contract/${id}`;
