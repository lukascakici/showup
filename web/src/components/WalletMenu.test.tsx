import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test/render";
import { WalletMenu } from "./WalletMenu";

/**
 * The menu, and the one destructive control in the app.
 *
 * Deleting an in-app wallet destroys the only copy of its key and everything the
 * account holds. Disconnecting a wallet app does not — reconnect and the account
 * is still there. These are tests that nobody later collapses the two into one
 * button labelled "Disconnect", which is the mistake that would make an
 * irreversible action look routine.
 */

// Declared inside `vi.hoisted` because the mock factories are lifted above every
// `const` in this file, so a top-level one is not initialised yet when they run.
const { ADDRESS } = vi.hoisted(() => ({
  ADDRESS: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
}));

const wallet = vi.hoisted(() => ({
  value: {
    address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as string | null,
    balance: { funded: true, xlm: "42.5000000" } as
      | { funded: boolean; xlm: string }
      | null,
    balanceLoading: false,
    balanceError: null as string | null,
    refreshBalance: vi.fn(),
    disconnect: vi.fn(),
    isLocal: false,
    forgetLocal: vi.fn(),
    openPicker: vi.fn(),
  },
}));

vi.mock("@/lib/wallet", () => ({ useWallet: () => wallet.value }));

vi.mock("@/lib/local-wallet", () => ({
  loadLocalWallet: () => ({ publicKey: ADDRESS, secret: "S".repeat(56) }),
  secretFileName: () => "showup-testnet-key-GAAAAAAA.txt",
  secretFileBody: () => "body",
}));

beforeEach(() => {
  wallet.value = {
    address: ADDRESS,
    balance: { funded: true, xlm: "42.5000000" },
    balanceLoading: false,
    balanceError: null,
    refreshBalance: vi.fn(),
    disconnect: vi.fn(),
    isLocal: false,
    forgetLocal: vi.fn(),
    openPicker: vi.fn(),
  };
});

const open = async () => {
  render(<WalletMenu />);
  await userEvent.click(screen.getByRole("button", { name: /wallet/i }));
};

describe("a wallet app", () => {
  it("offers Disconnect and nothing destructive", async () => {
    await open();
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete this wallet/i })).toBeNull();
    // The recovery-key panel belongs to a key we hold. There isn't one here.
    expect(screen.queryByRole("button", { name: /show recovery key/i })).toBeNull();
  });

  it("disconnects on click", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    expect(wallet.value.disconnect).toHaveBeenCalledOnce();
  });
});

describe("an in-app wallet", () => {
  beforeEach(() => {
    wallet.value.isLocal = true;
  });

  it("says it holds its own key, where somebody would go looking", async () => {
    await open();
    expect(screen.getByText(/generated in this browser/i)).toBeInTheDocument();
    expect(screen.getByText(/no copy and cannot restore it/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show recovery key/i })).toBeInTheDocument();
  });

  it("keeps the key hidden until it is asked for", async () => {
    await open();
    expect(screen.queryByText("S".repeat(56))).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /show recovery key/i }));
    expect(screen.getByText("S".repeat(56))).toBeInTheDocument();
  });

  /** Switching wallets is not the same as deleting one, and must not delete one. */
  it("offers a different wallet without touching this one", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: /use a different wallet/i }));
    expect(wallet.value.openPicker).toHaveBeenCalledOnce();
    expect(wallet.value.forgetLocal).not.toHaveBeenCalled();
    expect(wallet.value.disconnect).not.toHaveBeenCalled();
  });

  it("never shows Disconnect, which would not do anything here", async () => {
    await open();
    expect(screen.queryByRole("button", { name: /^disconnect$/i })).toBeNull();
  });
});

/**
 * A structural guard for something jsdom cannot measure.
 *
 * The header is `sticky`, so a dropdown taller than the viewport is not merely
 * below the fold — scrolling the page moves the header and the menu with it, and
 * the overflowing part can never be reached. Measured in a real 375×667
 * viewport once the in-app wallet section was added: 696px of menu in 667px of
 * screen, with "Delete this wallet" in the 95px nothing could scroll to.
 *
 * jsdom has no layout, so the height cannot be asserted here. The class that
 * fixes it can be, which is enough to stop it being deleted by someone tidying
 * up — and the comment above says what to re-measure if it is.
 */
describe("the menu on a small screen", () => {
  it("caps its own height and scrolls inside itself", async () => {
    await open();
    const panel = screen.getByText("BALANCE").closest("div.absolute");
    expect(panel).not.toBeNull();
    expect(panel!.className).toMatch(/overflow-y-auto/);
    expect(panel!.className).toMatch(/max-h-\[calc\(100dvh/);
  });
});

describe("deleting an in-app wallet", () => {
  beforeEach(() => {
    wallet.value.isLocal = true;
  });

  it("does not delete on the first press", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: /delete this wallet/i }));
    expect(wallet.value.forgetLocal).not.toHaveBeenCalled();
  });

  /**
   * The confirmation names the balance, because "this cannot be undone" is
   * abstract and "the 42.50 XLM it holds" is the thing somebody would stop for.
   */
  it("says what will be lost, in figures", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: /delete this wallet/i }));
    // Matched on the paragraph's whole text: the figure is interpolated, so it
    // is its own text node and `getByText` would not see it beside the words.
    expect(
      screen.getByText((_, el) => el?.textContent?.includes("42.5 XLM") ?? false, {
        selector: "p",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it("can be backed out of", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: /delete this wallet/i }));
    await userEvent.click(screen.getByRole("button", { name: /keep it/i }));
    expect(wallet.value.forgetLocal).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /delete this wallet/i })).toBeInTheDocument();
  });

  it("deletes once, on a second deliberate press", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: /delete this wallet/i }));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(wallet.value.forgetLocal).toHaveBeenCalledOnce();
  });

  /** Reopening the menu must not land on an already-armed delete button. */
  it("is disarmed when the menu is reopened", async () => {
    render(<WalletMenu />);
    const toggle = screen.getByRole("button", { name: /wallet/i });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: /delete this wallet/i }));
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();

    await userEvent.click(toggle); // closed
    await userEvent.click(toggle); // reopened

    expect(screen.queryByRole("button", { name: /^delete$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /delete this wallet/i })).toBeInTheDocument();
  });

  it("still warns when the balance has not loaded", async () => {
    wallet.value.balance = null;
    await open();
    await userEvent.click(screen.getByRole("button", { name: /delete this wallet/i }));
    // No figure to name, so it names the thing itself rather than printing "0".
    expect(screen.getByText(/the balance it holds/i)).toBeInTheDocument();
  });
});
