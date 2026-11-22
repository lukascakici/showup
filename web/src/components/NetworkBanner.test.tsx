import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { Networks } from "@stellar/stellar-sdk";
import { NetworkBanner } from "./NetworkBanner";

/**
 * The one component in the app that cannot be reached in a browser without a
 * wallet extension deliberately set to the wrong network — so this is the only
 * place it gets exercised at all.
 */
const wallet = vi.hoisted(() => ({
  value: {
    wrongNetwork: false,
    network: { passphrase: null as string | null, known: false },
    walletName: null as string | null,
    refreshNetwork: vi.fn(),
  },
}));

vi.mock("@/lib/wallet", () => ({ useWallet: () => wallet.value }));

/**
 * A wallet reporting `passphrase`, against an app serving `serving`.
 *
 * `serving` is a parameter rather than a constant because the mismatch this
 * banner exists for is now symmetric: a Mainnet wallet on the Testnet site, and
 * a Testnet wallet on the Mainnet one. The first version of this helper computed
 * `wrongNetwork` against `Networks.TESTNET`, which quietly made every test a
 * Testnet test and left the other direction unreachable.
 */
const connectedTo = (
  passphrase: string,
  { serving = Networks.TESTNET, walletName = "Freighter" } = {},
) => {
  wallet.value = {
    wrongNetwork: passphrase !== serving,
    network: { passphrase, known: true },
    walletName,
    refreshNetwork: vi.fn(),
  };
};

beforeEach(() => {
  wallet.value = {
    wrongNetwork: false,
    network: { passphrase: null, known: false },
    walletName: null,
    refreshNetwork: vi.fn(),
  };
});

describe("NetworkBanner", () => {
  it("stays out of the way when the network is right", () => {
    connectedTo(Networks.TESTNET);
    const { container } = render(<NetworkBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  // Three of the four wallets reject `getNetwork`, so "we couldn't ask" is a
  // real state and it must never be reported as "you're on the wrong one".
  it("stays quiet when the wallet won't say which network it is on", () => {
    const { container } = render(<NetworkBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the network, the wallet and the fix", () => {
    connectedTo(Networks.PUBLIC);
    render(<NetworkBanner />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Freighter is on Mainnet.");
    expect(alert).toHaveTextContent(/switch networks in Freighter/i);
    // Both halves, because naming only the wallet's network leaves the reader
    // to guess which one it should have been.
    expect(alert).toHaveTextContent("Showup on Stellar Testnet");
  });

  // The same mismatch the other way round, which is the case that exists only
  // once Mainnet is live: a wallet left on Testnet, on the real-money domain.
  it("names the served network rather than assuming Testnet", () => {
    connectedTo(Networks.TESTNET, { serving: Networks.PUBLIC });
    render(<NetworkBanner />, { network: "mainnet" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Freighter is on Testnet.");
    expect(alert).toHaveTextContent("Showup on Stellar Mainnet");
  });

  // The passphrase is a sentence — "Public Global Stellar Network ; September
  // 2015" — and showing it verbatim explains nothing about what to change.
  it("never shows the raw passphrase", () => {
    connectedTo(Networks.PUBLIC);
    render(<NetworkBanner />);
    expect(screen.getByRole("alert")).not.toHaveTextContent("September 2015");
  });

  it("names Futurenet too, rather than calling everything Mainnet", () => {
    connectedTo(Networks.FUTURENET);
    render(<NetworkBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("Futurenet");
  });

  it("falls back to 'your wallet' when the wallet has no name", () => {
    connectedTo(Networks.PUBLIC, { walletName: null as unknown as string });
    render(<NetworkBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("Your wallet is on Mainnet.");
  });

  // The network is read once, when the address arrives. Without this the banner
  // would still be there after someone did exactly what it asked.
  it("re-reads the network on request", async () => {
    connectedTo(Networks.PUBLIC);
    render(<NetworkBanner />);
    await userEvent.click(screen.getByRole("button", { name: /i switched/i }));
    expect(wallet.value.refreshNetwork).toHaveBeenCalledOnce();
  });
});
