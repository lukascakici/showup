import {
  Account,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@/test/render";
import { WalletProvider, useWallet } from "./wallet";
import { loadLocalWallet } from "./local-wallet";
import { network } from "./networks";

/**
 * The provider, which is where the two kinds of signer are reconciled.
 *
 * Worth testing here rather than only through a screen: which signer is in use
 * is *derived* — there is no stored "active wallet" flag — and the thing that
 * must never happen is reporting an address that belongs to one signer while
 * `sign` uses the other. That invariant only exists at this level.
 */

const kit = vi.hoisted(() => ({
  address: null as string | null,
  signTransaction: vi.fn(),
  disconnect: vi.fn(),
  fetchAddress: vi.fn(),
  listeners: {} as Record<string, (e: unknown) => void>,
}));

vi.mock("./kit", () => ({
  getKit: async () => ({
    kit: {
      // The real kit answers synchronously from inside `on`, as a signals
      // effect, and the provider depends on that to resolve `restoring` without
      // a flash. Replicated rather than deferred, so the test exercises the same
      // ordering the browser does.
      on: (event: string, handler: (e: unknown) => void) => {
        kit.listeners[event] = handler;
        if (event === "STATE_UPDATED") {
          handler({ payload: { address: kit.address } });
        }
        return () => {};
      },
      disconnect: kit.disconnect,
      fetchAddress: kit.fetchAddress,
      signTransaction: kit.signTransaction,
      selectedModule: { productName: "Freighter" },
      refreshSupportedWallets: async () => [],
      getNetwork: async () => {
        throw new Error("not supported");
      },
    },
    events: { STATE_UPDATED: "STATE_UPDATED", DISCONNECT: "DISCONNECT" },
  }),
  kitReady: () => true,
}));

// Nothing here should reach Horizon, and a balance fetch that 404s would make
// every test wait on a network timeout.
vi.mock("./stellar", async (original) => ({
  ...(await original<typeof import("./stellar")>()),
  fetchAccountState: vi.fn().mockResolvedValue({ funded: true, xlm: "100.0" }),
}));

const track = vi.hoisted(() => vi.fn());
vi.mock("./funnel", () => ({ track }));

/** A real unsigned transaction, because the local signer parses what it is given. */
const UNSIGNED = new TransactionBuilder(new Account(Keypair.random().publicKey(), "1"), {
  fee: "100",
  networkPassphrase: network("testnet").passphrase,
})
  .addOperation(Operation.bumpSequence({ bumpTo: "2" }))
  .setTimeout(30)
  .build()
  .toXDR();

/**
 * Every status this provider has reported, in order.
 *
 * Recorded because one of the claims below is about a state that must never be
 * *passed through*, not merely about where things settle — and a `waitFor` on
 * the final value cannot tell the difference.
 */
let seen: string[] = [];

/** Renders the context as text, so assertions read off what a screen would. */
function Probe() {
  const { address, status, walletName, isLocal, localAllowed, createLocal, forgetLocal, sign } =
    useWallet();
  if (seen[seen.length - 1] !== status) seen.push(status);
  return (
    <div>
      <p data-testid="address">{address ?? "none"}</p>
      <p data-testid="status">{status}</p>
      <p data-testid="name">{walletName ?? "none"}</p>
      <p data-testid="isLocal">{String(isLocal)}</p>
      <p data-testid="allowed">{String(localAllowed)}</p>
      <button onClick={() => createLocal()}>create</button>
      <button onClick={() => forgetLocal()}>forget</button>
      <button
        onClick={async () => {
          const result = await sign(UNSIGNED).catch((e: Error) => ({
            signedTxXdr: `threw: ${e.message}`,
          }));
          document.title = result.signedTxXdr;
        }}
      >
        sign
      </button>
    </div>
  );
}

const show = (id: string) => screen.getByTestId(id).textContent;

function mount(on: "testnet" | "mainnet" = "testnet") {
  return render(
    <WalletProvider>
      <Probe />
    </WalletProvider>,
    { network: on },
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.title = "";
  kit.address = null;
  kit.listeners = {};
  kit.signTransaction = vi.fn().mockResolvedValue({ signedTxXdr: "signed-by-kit" });
  kit.disconnect = vi.fn().mockResolvedValue(undefined);
  kit.fetchAddress = vi.fn().mockResolvedValue({ address: null });
  track.mockClear();
  seen = [];
});

describe("creating an in-app wallet", () => {
  it("connects with it, and says what it is", async () => {
    mount();
    await waitFor(() => expect(show("status")).toBe("idle"));

    await userEvent.click(screen.getByRole("button", { name: "create" }));

    expect(show("status")).toBe("connected");
    expect(show("isLocal")).toBe("true");
    expect(show("address")).toMatch(/^G[A-Z2-7]{55}$/);
    // Never nameless. The top bar and the reserve card both render this.
    expect(show("name")).toBe("In-app wallet");

    // With no key stored, `idle` is correct and is reported — which is also what
    // makes the "no flash of idle" assertion in the next test mean something.
    expect(seen).toEqual(["restoring", "idle", "connected"]);
  });

  it("is restored on the next page load without a flash of disconnected", async () => {
    mount();
    await waitFor(() => expect(show("status")).toBe("idle"));
    await userEvent.click(screen.getByRole("button", { name: "create" }));
    const made = show("address");

    // A genuinely fresh mount, which is what a reload is: the provider reads
    // `localStorage` from scratch and the kit reports nobody connected.
    cleanup();
    seen = [];
    const second = mount();
    await waitFor(() => expect(second.getByTestId("address").textContent).toBe(made));
    expect(second.getByTestId("status").textContent).toBe("connected");

    // The point of the whole `restoring` state: `idle` is what renders "connect
    // a wallet" over a wallet that already exists, so on this path it must never
    // be reported at all — not even for one frame between the kit answering and
    // the local key being read.
    expect(seen).toEqual(["restoring", "connected"]);
  });

  it("counts as the same funnel step a real wallet does", async () => {
    mount();
    await waitFor(() => expect(show("status")).toBe("idle"));
    await userEvent.click(screen.getByRole("button", { name: "create" }));
    expect(track).toHaveBeenCalledWith("wallet_connected", { address: show("address") });
  });
});

describe("on Mainnet", () => {
  it("does not offer one", async () => {
    mount("mainnet");
    await waitFor(() => expect(show("status")).toBe("idle"));
    expect(show("allowed")).toBe("false");
  });

  /**
   * The guard that matters, exercised through the provider rather than the
   * library: a button wired up by mistake, or a screen that forgot to check
   * `localAllowed`, must not be able to produce a real-money key.
   */
  it("refuses to create one even when asked directly", async () => {
    mount("mainnet");
    await waitFor(() => expect(show("status")).toBe("idle"));

    await userEvent.click(screen.getByRole("button", { name: "create" }));

    expect(show("isLocal")).toBe("false");
    expect(show("address")).toBe("none");
    expect(show("status")).toBe("idle");
    expect(window.localStorage.length).toBe(0);
    expect(track).not.toHaveBeenCalled();
  });

  it("ignores a key that somehow got into storage for it", async () => {
    window.localStorage.setItem(
      "showup.local-wallet.mainnet",
      JSON.stringify(Keypair.random().secret()),
    );
    mount("mainnet");
    await waitFor(() => expect(show("status")).toBe("idle"));
    expect(show("isLocal")).toBe("false");
    expect(show("address")).toBe("none");
  });
});

describe("which signer signs", () => {
  it("uses the local key when it is the one connected", async () => {
    mount();
    await waitFor(() => expect(show("status")).toBe("idle"));
    await userEvent.click(screen.getByRole("button", { name: "create" }));
    const address = show("address")!;

    await userEvent.click(screen.getByRole("button", { name: "sign" }));

    await waitFor(() => expect(document.title).not.toBe(""));
    expect(kit.signTransaction).not.toHaveBeenCalled();
    // A real signature by the address the provider is reporting — which is the
    // invariant: the reported address and the signing key are the same key.
    const signed = new Transaction(document.title, network("testnet").passphrase);
    expect(
      Keypair.fromPublicKey(address).verify(signed.hash(), signed.signatures[0].signature),
    ).toBe(true);
  });

  /**
   * A real wallet takes precedence immediately. Picking one is an explicit act,
   * and a local key sitting in storage must not shadow it — otherwise somebody
   * who connected Freighter would be signing with a browser key.
   */
  it("hands over to a real wallet as soon as one connects", async () => {
    const theirs = Keypair.random().publicKey();
    kit.fetchAddress = vi.fn().mockResolvedValue({ address: theirs });

    mount();
    await waitFor(() => expect(show("status")).toBe("idle"));
    await userEvent.click(screen.getByRole("button", { name: "create" }));
    expect(show("isLocal")).toBe("true");

    // The kit reporting an address is what `select` ultimately produces.
    kit.listeners.STATE_UPDATED?.({ payload: { address: theirs } });

    await waitFor(() => expect(show("address")).toBe(theirs));
    expect(show("isLocal")).toBe("false");
    expect(show("name")).toBe("Freighter");

    await userEvent.click(screen.getByRole("button", { name: "sign" }));
    await waitFor(() => expect(document.title).toBe("signed-by-kit"));
  });
});

describe("the two ways to stop using a wallet", () => {
  /**
   * `disconnect` and `forgetLocal` are deliberately different actions.
   * Disconnecting a wallet app is reversible; deleting a local key destroys the
   * only copy of it and whatever the account holds. A test for this is a test
   * that nobody later collapses them into one button.
   */
  it("forgetting a local wallet really deletes the key", async () => {
    mount();
    await waitFor(() => expect(show("status")).toBe("idle"));
    await userEvent.click(screen.getByRole("button", { name: "create" }));

    await userEvent.click(screen.getByRole("button", { name: "forget" }));

    expect(show("isLocal")).toBe("false");
    expect(show("address")).toBe("none");
    expect(show("status")).toBe("idle");
    expect(loadLocalWallet(network("testnet"))).toBeNull();
  });

  it("disconnecting a real wallet leaves a local key untouched", async () => {
    const theirs = Keypair.random().publicKey();
    kit.address = theirs;

    mount();
    await waitFor(() => expect(show("address")).toBe(theirs));
    // A local key made earlier, still in storage behind the connected wallet.
    await userEvent.click(screen.getByRole("button", { name: "create" }));
    expect(show("isLocal")).toBe("false");
    const stored = loadLocalWallet(network("testnet"));
    expect(stored).not.toBeNull();

    // What the kit's DISCONNECT event does to the provider.
    kit.listeners.DISCONNECT?.({});

    await waitFor(() => expect(show("isLocal")).toBe("true"));
    // The key survived, and is now the signer rather than nothing at all.
    expect(loadLocalWallet(network("testnet"))).toEqual(stored);
    expect(show("address")).toBe(stored!.publicKey);
  });
});
