import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { WalletPicker } from "./WalletPicker";
import { setMediaMatches } from "@/test/media";
import type { ISupportedWallet } from "@/lib/kit";

/**
 * The screen a stranger with no wallet lands on.
 *
 * Its advice splits on `(pointer: coarse)`, and getting that backwards sends
 * someone on iOS to a Chrome extension store — a dead end with a link on it.
 * Both halves get asserted here; a browser can only ever show one of them per
 * run, and Chrome's touch emulation is sticky within a session besides.
 */
const COARSE = "(pointer: coarse)";

const wallet = vi.hoisted(() => ({
  value: {
    pickerOpen: true,
    closePicker: vi.fn(),
    wallets: [] as ISupportedWallet[],
    walletsLoading: false,
    refreshWallets: vi.fn(),
    select: vi.fn(),
    error: null as string | null,
    address: null as string | null,
    refreshBalance: vi.fn(),
    localAllowed: true,
    createLocal: vi.fn(),
  },
}));

vi.mock("@/lib/wallet", () => ({ useWallet: () => wallet.value }));

// The created screen offers the key, which the real component reads out of
// storage rather than off the context. Stubbed so this file tests the picker's
// flow; `local-wallet.test.ts` tests what it reads.
vi.mock("@/lib/local-wallet", () => ({
  loadLocalWallet: () => ({ publicKey: MADE, secret: "S".repeat(56) }),
  secretFileName: () => "showup-testnet-key-GAAAAAAA.txt",
  secretFileBody: () => "body",
}));

const MADE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const aWallet = (id: string, name: string, isAvailable: boolean): ISupportedWallet =>
  ({ id, name, isAvailable, url: `https://example.com/${id}` }) as ISupportedWallet;

beforeEach(() => {
  wallet.value = {
    pickerOpen: true,
    closePicker: vi.fn(),
    wallets: [
      aWallet("freighter", "Freighter", false),
      aWallet("albedo", "Albedo", true),
    ],
    walletsLoading: false,
    refreshWallets: vi.fn(),
    // Resolved, not bare: the context types this as a Promise and the component
    // chains `.finally` onto it to release the pending row. A `vi.fn()` that
    // returns undefined tests a contract the app doesn't have.
    select: vi.fn().mockResolvedValue(undefined),
    error: null,
    address: MADE,
    refreshBalance: vi.fn().mockResolvedValue(undefined),
    localAllowed: true,
    createLocal: vi.fn().mockReturnValue({ publicKey: MADE, secret: "S".repeat(56) }),
  };
});

describe("WalletPicker — the way out for someone with no wallet", () => {
  it("points a desktop at the extension rows", () => {
    render(<WalletPicker />);
    expect(screen.getByText(/browser extensions/i)).toBeInTheDocument();
    expect(screen.queryByText(/app store/i)).not.toBeInTheDocument();
  });

  it("points a phone at the app store instead of an extension store", () => {
    setMediaMatches(COARSE);
    render(<WalletPicker />);
    expect(screen.getByText(/app store/i)).toBeInTheDocument();
    expect(screen.queryByText(/browser extensions/i)).not.toBeInTheDocument();
  });

  // The fastest true answer on any device, and it was invisible because it is
  // spelled "Albedo" and sits in a list next to four things that are not it.
  it("names the wallet that needs nothing installed, on both", () => {
    render(<WalletPicker />);
    expect(screen.getByText(/needs nothing\s+installed/i)).toBeInTheDocument();
  });

  // Installing an extension doesn't notify the page, and nothing on screen used
  // to say that a reload was needed.
  it("can be asked to look again", async () => {
    render(<WalletPicker />);
    await userEvent.click(screen.getByRole("button", { name: /check again/i }));
    expect(wallet.value.refreshWallets).toHaveBeenCalledOnce();
  });

  // It used to say "No Stellar wallet found. Install one to continue." and then
  // stop, in the one place someone with no wallet was always going to end up.
  it("is not a dead end when the list comes back empty", () => {
    wallet.value.wallets = [];
    render(<WalletPicker />);
    expect(screen.getByRole("button", { name: /check again/i })).toBeInTheDocument();
    expect(screen.getByText(/needs nothing\s+installed/i)).toBeInTheDocument();
  });
});

describe("WalletPicker — the rows", () => {
  it("offers an install link for a wallet that really is missing", () => {
    render(<WalletPicker />);
    const install = screen.getByRole("link", { name: /freighter.*install/is });
    expect(install).toHaveAttribute("href", "https://example.com/freighter");
  });

  it("connects on click", async () => {
    render(<WalletPicker />);
    await userEvent.click(screen.getByRole("button", { name: /albedo/i }));
    expect(wallet.value.select).toHaveBeenCalledWith("albedo");
  });

  it("renders nothing at all while closed", () => {
    wallet.value.pickerOpen = false;
    const { container } = render(<WalletPicker />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says which network this is, wherever the list ends up scrolled", () => {
    render(<WalletPicker />);
    expect(screen.getByText(/must be on testnet/i)).toBeInTheDocument();
  });
});

/**
 * The footer line, which is advice rather than description.
 *
 * It read "Showup runs on Stellar Testnet. Your wallet must be on Testnet too"
 * on both hostnames, so on Mainnet it told people to move their wallet to the
 * network their money is not on — breaking the exact thing it exists to help
 * with. A string that gives instructions has to come from the network being
 * served, and the only way to know it does is to render it on both.
 */
/**
 * The in-app wallet, which is the only option on this panel that asks nothing of
 * the person beyond tapping it.
 *
 * D3 turns on strangers finishing a reservation unattended on their own phone,
 * and every other row here assumes they have already chosen and installed a
 * Stellar wallet. These assert the path exists, and — the half that matters more
 * — that it does not exist where real money is.
 */
describe("creating a wallet in the browser", () => {
  it("is offered, as the first answer for someone with nothing", async () => {
    render(<WalletPicker />);
    const create = screen.getByRole("button", { name: /create a wallet here/i });
    expect(create).toBeInTheDocument();
    await userEvent.click(create);
    expect(wallet.value.createLocal).toHaveBeenCalledOnce();
  });

  it("says who holds the key before it is made, not after", () => {
    render(<WalletPicker />);
    expect(screen.getByText(/you keep the key/i)).toBeInTheDocument();
  });

  it("shows the key and the faucet the moment it is created", async () => {
    render(<WalletPicker />);
    await userEvent.click(screen.getByRole("button", { name: /create a wallet here/i }));

    expect(screen.getByText(/your wallet is ready/i)).toBeInTheDocument();
    // The one screen where the key can be offered to somebody who is paying
    // attention, so it must be here and not two taps into a menu.
    expect(screen.getByRole("button", { name: /show recovery key/i })).toBeInTheDocument();
    // A brand-new account holds nothing, and the next thing they will try needs
    // a deposit.
    expect(screen.getByRole("button", { name: /add test xlm/i })).toBeInTheDocument();
    expect(screen.getByText(/never had a copy/i)).toBeInTheDocument();
  });

  it("stops offering wallet rows once one has been made", async () => {
    render(<WalletPicker />);
    await userEvent.click(screen.getByRole("button", { name: /create a wallet here/i }));
    expect(screen.queryByRole("button", { name: /albedo/i })).toBeNull();
  });

  /**
   * "Done" sits outside the scrolling list, with the header and the network
   * note. Measured in a real 375×667 viewport: this screen was 71px taller than
   * its share of the panel, so inside the list the button fell below the fold —
   * and revealing the recovery key pushed it a further 160px down. jsdom cannot
   * measure that, but it can hold the structure that fixes it.
   */
  it("keeps the way out of the panel off the scrolling list", async () => {
    render(<WalletPicker />);
    await userEvent.click(screen.getByRole("button", { name: /create a wallet here/i }));

    const done = screen.getByRole("button", { name: /^done$/i });
    const scroller = document.querySelector(".overflow-y-auto");
    expect(scroller).not.toBeNull();
    expect(scroller!.contains(done)).toBe(false);
  });

  it("leaves closing the panel to the person, not to the creation", async () => {
    render(<WalletPicker />);
    await userEvent.click(screen.getByRole("button", { name: /create a wallet here/i }));
    // Closing on create would have unmounted the key screen before it rendered.
    expect(wallet.value.closePicker).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /^done$/i }));
    expect(wallet.value.closePicker).toHaveBeenCalledOnce();
  });

  /**
   * The half that matters most. A key in `localStorage` is readable by anything
   * that gets onto the page — an acceptable trade for money that is free and
   * worth nothing, and not for money that is not. An in-app key holding real
   * funds is custody, which is a different product.
   */
  it("is not offered at all where the money is real", () => {
    wallet.value.localAllowed = false;
    render(<WalletPicker />, { network: "mainnet" });
    expect(screen.queryByRole("button", { name: /create a wallet here/i })).toBeNull();
    expect(screen.queryByText(/you keep the key/i)).toBeNull();
    // And the person with no wallet still has a way through.
    expect(screen.getByText(/needs nothing\s+installed/i)).toBeInTheDocument();
  });
});

describe("the network the picker tells you to be on", () => {
  it("names Testnet on Testnet", () => {
    render(<WalletPicker />);
    expect(screen.getByText(/runs on Stellar Testnet/i)).toBeInTheDocument();
    expect(screen.getByText(/wallet must be on Testnet/i)).toBeInTheDocument();
  });

  it("names Mainnet on Mainnet, and never mentions the other one", () => {
    // Set together with the network, because the provider derives one from the
    // other — `localAllowed` is true on Mainnet in no real configuration, and a
    // fixture that says otherwise is testing a screen that cannot exist.
    wallet.value.localAllowed = false;
    render(<WalletPicker />, { network: "mainnet" });
    expect(screen.getByText(/runs on Stellar Mainnet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Testnet/i)).toBeNull();
  });
});
