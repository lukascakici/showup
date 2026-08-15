import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  },
}));

vi.mock("@/lib/wallet", () => ({ useWallet: () => wallet.value }));

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
