import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventDetail } from "./EventDetail";
import type { EventState } from "@/lib/events";
import type { AccountState } from "@/lib/stellar";

/**
 * The two hardest states in the app to reach by hand.
 *
 * "This event does not exist" and "we couldn't ask" look identical from the
 * outside — `loadEvent` fans four RPC reads out at once, and a single dropped
 * one is indistinguishable from an address that was never deployed to. Telling
 * a guest their organizer's link is dead when the truth is a flaky read is the
 * worst thing this page can do, and reproducing it means breaking the network
 * on cue. So it gets tested here instead.
 *
 * Also here: the cold-start explainer's gating, and the funding pre-flight,
 * both of which are day-5 work that a headless browser could only see half of.
 */
const ID = "CCWYYTY5XCJY7KFPUWKMP4MELJG3G3FIYW2O3WJSMEIZTDKOMST6FL7C";
const ORGANIZER = "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJK";
const GUEST = "GXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJK";

const XLM = 10_000_000n;

const state = vi.hoisted(() => ({
  event: null as unknown,
  error: null as string | null,
  loading: false,
  known: null as boolean | null,
  address: null as string | null,
  balance: null as unknown,
  status: "idle" as string,
  openPicker: vi.fn(),
}));

vi.mock("@/lib/events", async (importOriginal) => ({
  // `attendanceOf`, `spotsLeft` and `forfeitPool` stay real — they are the
  // logic deciding which card renders.
  ...(await importOriginal<typeof import("@/lib/events")>()),
  useEvent: () => ({
    data: state.event,
    error: state.error,
    loading: state.loading,
    refreshing: false,
    refresh: vi.fn(),
  }),
  useActivity: () => ({
    data: { activity: [], truncated: false },
    error: null,
    loading: false,
    refreshing: false,
    refresh: vi.fn(),
  }),
  // `null` is "we couldn't ask the factory either" — a rejection, not a no.
  // Collapsing it to `false` here is exactly the bug the component guards
  // against, so the mock must not do it.
  isKnownEvent: () =>
    state.known === null
      ? Promise.reject(new Error("factory unreachable"))
      : Promise.resolve(state.known),
}));

vi.mock("@/lib/wallet", () => ({
  useWallet: () => ({
    address: state.address,
    status: state.status,
    balance: state.balance,
    openPicker: state.openPicker,
    refreshBalance: vi.fn(),
    walletName: "Freighter",
  }),
}));

vi.mock("@/lib/signer", () => ({ useSigner: () => ({ publicKey: state.address }) }));

function anEvent(over: Partial<EventState> = {}): EventState {
  return {
    id: ID,
    title: "Perşembe halı saha",
    startsAt: 1_787_000_000,
    organizer: ORGANIZER,
    deposit: 10n * XLM,
    feeAllowance: XLM / 10n,
    capacity: 10,
    policy: { tag: "SplitAmongAttendees", values: undefined } as EventState["policy"],
    reserved: [],
    checkedIn: [],
    phase: "Reserving",
    ...over,
  };
}

const funded = (xlm: string): AccountState => ({ funded: true, xlm });

beforeEach(() => {
  state.event = null;
  state.error = null;
  state.loading = false;
  state.known = null;
  state.address = null;
  state.balance = null;
  state.status = "idle";
  state.openPicker = vi.fn();
  localStorage.clear();
});

describe("EventDetail — not found versus couldn't ask", () => {
  it("only says the event doesn't exist when the factory said so", async () => {
    state.error = "read failed";
    state.known = false;
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(await screen.findByText(/no event here/i)).toBeInTheDocument();
  });

  it("treats an unanswerable question as a failed read, not a missing event", async () => {
    state.error = "read failed";
    state.known = null; // the factory couldn't be reached either
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(await screen.findByText(/couldn't load this event/i)).toBeInTheDocument();
    expect(screen.queryByText(/no event here/i)).not.toBeInTheDocument();
  });

  // The single most important sentence on that screen: a failed read has not
  // touched anybody's deposit, and someone whose money is locked in a contract
  // needs to be told that before anything else.
  it("says nothing has happened to the deposits", async () => {
    state.error = "read failed";
    state.known = null;
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(
      await screen.findByText(/nothing has happened to the event or to any deposit/i),
    ).toBeInTheDocument();
  });

  it("shows a skeleton rather than an error before the first read lands", () => {
    state.loading = true;
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.getByRole("status", { name: /loading event/i })).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
  });
});

describe("EventDetail — the stranger's first screen", () => {
  it("explains the mechanic with this event's own numbers", () => {
    state.event = anEvent();
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.getByText(/how this works/i)).toBeInTheDocument();
    expect(screen.getByText(/10 XLM leaves your wallet/i)).toBeInTheDocument();
    expect(screen.getByText(/you get 10.1 XLM back/i)).toBeInTheDocument();
  });

  it("says the money isn't real, which is the reassuring part", () => {
    state.event = anEvent();
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.getByText(/test money/i)).toBeInTheDocument();
  });

  // The explainer promises "reserve" first. On an event nobody can join that
  // is three confident steps of fiction.
  it("does not promise a reservation on a finalized event", () => {
    state.event = anEvent({ phase: "Finalized" });
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.queryByText(/how this works/i)).not.toBeInTheDocument();
  });

  it("gives a full event the reason to connect that is true there", () => {
    state.event = anEvent({ capacity: 1, reserved: [GUEST] });
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.queryByText(/how this works/i)).not.toBeInTheDocument();
    expect(screen.getByText(/this event is full/i)).toBeInTheDocument();
  });

  it("tells someone arriving during check-in what connecting is for", () => {
    state.event = anEvent({ phase: "CheckingIn" });
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.getByText(/connect the wallet you reserved with/i)).toBeInTheDocument();
  });

  it("carries its own connect button rather than pointing at the top bar", async () => {
    state.event = anEvent();
    render(<EventDetail id={ID} linkSecret={null} />);
    await userEvent.click(screen.getByRole("button", { name: /connect a wallet/i }));
    expect(state.openPicker).toHaveBeenCalledOnce();
  });
});

describe("EventDetail — the funding pre-flight", () => {
  it("stops an account that doesn't exist yet, and offers the faucet", () => {
    state.address = GUEST;
    state.balance = { funded: false, xlm: "0" };
    state.event = anEvent();
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.getByText(/isn't on testnet yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reserve for 10 XLM/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /request test XLM/i })).toBeInTheDocument();
  });

  // The case a naive `balance >= deposit` gets wrong every time: 1 XLM of that
  // balance is the base reserve and can never be spent.
  it("stops a balance that only just covers the deposit", () => {
    state.address = GUEST;
    state.balance = funded("10");
    state.event = anEvent();
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.getByText(/not enough test XLM/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reserve for 10 XLM/i })).toBeDisabled();
  });

  it("lets a funded account through without a word", () => {
    state.address = GUEST;
    state.balance = funded("10000");
    state.event = anEvent();
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.queryByText(/not enough test XLM/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reserve for 10 XLM/i })).toBeEnabled();
  });

  // Horizon being down is not evidence that someone is broke.
  it("never blocks on a balance it hasn't read", () => {
    state.address = GUEST;
    state.balance = null;
    state.event = anEvent();
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.getByRole("button", { name: /reserve for 10 XLM/i })).toBeEnabled();
  });
});

describe("EventDetail — the organizer's links", () => {
  it("shows the invite link on any device, since it needs no secret", () => {
    state.address = ORGANIZER;
    state.balance = funded("10000");
    state.event = anEvent();
    render(<EventDetail id={ID} linkSecret={null} />);
    const invite = screen.getByRole("button", { name: /copy the invite link/i });
    expect(invite).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`/e/${ID}$`))).toBeInTheDocument();
  });

  // The check-in secret lives in one browser and nowhere else. Saying so is the
  // whole point; pretending the link exists would be worse than useless.
  it("admits when the check-in code isn't in this browser", () => {
    state.address = ORGANIZER;
    state.balance = funded("10000");
    state.event = anEvent();
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.getByText(/isn't in this browser/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /copy the check-in link/i }),
    ).not.toBeInTheDocument();
  });

  it("offers the check-in link while reservations are still open", () => {
    localStorage.setItem("showup:secrets", JSON.stringify({ [ID]: "abcdef" }));
    state.address = ORGANIZER;
    state.balance = funded("10000");
    state.event = anEvent();
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.getByRole("button", { name: /copy the check-in link/i })).toBeInTheDocument();
  });
});
