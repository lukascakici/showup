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
  standing: null as string | null,
  applicants: null as string[] | null,
  vouches: null as number | null,
  record: null as unknown,
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
  useStanding: () => ({ data: state.standing, refresh: vi.fn() }),
  useApplicants: () => ({ data: state.applicants, refresh: vi.fn() }),
  // `null` is "the count hasn't arrived", never zero — see the tests below.
  useVouches: () => ({ data: state.vouches, refresh: vi.fn() }),
  useRecord: () => ({ data: state.record, refresh: vi.fn() }),
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
    hosts: [ORGANIZER],
    admission: { tag: "Open", values: undefined },
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
  state.standing = null;
  state.applicants = null;
  state.vouches = null;
  state.record = null;
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
    expect(screen.getByRole("button", { name: /lock deposit and reserve/i })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: /lock deposit and reserve/i })).toBeDisabled();
  });

  it("lets a funded account through without a word", () => {
    state.address = GUEST;
    state.balance = funded("10000");
    state.event = anEvent();
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.queryByText(/not enough test XLM/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lock deposit and reserve/i })).toBeEnabled();
  });

  // Horizon being down is not evidence that someone is broke.
  it("never blocks on a balance it hasn't read", () => {
    state.address = GUEST;
    state.balance = null;
    state.event = anEvent();
    render(<EventDetail id={ID} linkSecret={null} />);
    expect(screen.getByRole("button", { name: /lock deposit and reserve/i })).toBeEnabled();
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

/**
 * The approval gate, from the guest's side.
 *
 * What these protect is the mode's whole promise: **nothing is taken until the
 * organizer says yes.** That promise is enforced by the contract, which is the
 * part that matters — but a screen that shows somebody a deposit amount and a
 * "not enough XLM" warning while they are only asking has broken the promise
 * where it is actually read, which is here.
 */
describe("an event that admits people one at a time", () => {
  const approvalEvent = () =>
    anEvent({ admission: { tag: "Approval", values: undefined } });

  beforeEach(() => {
    state.standing = null;
    state.address = GUEST;
  });

  it("offers to ask, and shows no payment while asking", async () => {
    state.event = approvalEvent();
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByRole("button", { name: /ask to come/i })).toBeInTheDocument();
    // The reserve button belongs to a spot that has not been given yet.
    expect(screen.queryByRole("button", { name: /reserve/i })).toBeNull();
    // And no funding warning: there is nothing to fund.
    expect(screen.queryByText(/not enough xlm/i)).toBeNull();
  });

  it("says the wait is a wait, and that it costs nothing", async () => {
    state.event = approvalEvent();
    state.standing = "Applied";
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByText(/you've asked to come/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ask to come|reserve/i })).toBeNull();
  });

  it("turns a decline into an ending rather than a retry", async () => {
    state.event = approvalEvent();
    state.standing = "Declined";
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByText(/not this one/i)).toBeInTheDocument();
    // A decline is terminal on-chain. A button here would be a promise the
    // contract refuses with `AlreadyApplied`, after a wallet prompt.
    expect(screen.queryByRole("button", { name: /ask to come/i })).toBeNull();
  });

  it("only shows the deposit once a spot has actually been given", async () => {
    state.event = approvalEvent();
    state.standing = "Approved";
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByText(/approved you/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reserve/i })).toBeInTheDocument();
  });

  it("leaves an open event exactly as it was", async () => {
    // Every event on the factory before today is `Open`, and this mode must not
    // have put a step in front of any of them.
    state.event = anEvent();
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByRole("button", { name: /reserve/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ask to come/i })).toBeNull();
  });
});

/**
 * The host's side of the same gate.
 *
 * The queue is assembled from an event history that is allowed to be
 * incomplete, so what these guard is that the page never offers an answer the
 * contract will refuse — and never implies a decision can be walked back, when
 * on-chain neither one can.
 */
describe("the host's queue of people asking to come", () => {
  const approvalEvent = (over: Partial<EventState> = {}) =>
    anEvent({ admission: { tag: "Approval", values: undefined }, ...over });

  beforeEach(() => {
    state.standing = null;
    state.applicants = [];
    state.address = ORGANIZER;
  });

  it("shows nothing to answer as nothing to answer", async () => {
    state.event = approvalEvent();
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByText(/nobody is waiting/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  });

  it("offers both answers per applicant, and says they are final", async () => {
    state.event = approvalEvent();
    state.applicants = [GUEST];
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument();
    // A host reading "Decline" as "not yet" is reading it as something the
    // contract will not let them take back.
    expect(screen.getByText(/final on-chain/i)).toBeInTheDocument();
  });

  it("warns before an approval that has no spot behind it", async () => {
    state.event = approvalEvent({ reserved: Array.from({ length: 10 }, (_, i) => `G${i}`) });
    state.applicants = [GUEST];
    render(<EventDetail id={ID} linkSecret={null} />);

    // Matched on the host-specific half of the sentence: a host who has not
    // reserved also sees the guest panel, which says its own version of "full".
    expect(await screen.findByText(/reserve one that does not exist/i)).toBeInTheDocument();
  });

  it("is absent on an open event, where nobody can ask", async () => {
    state.event = anEvent();
    state.applicants = [GUEST];
    render(<EventDetail id={ID} linkSecret={null} />);

    await screen.findByRole("button", { name: /start check-in/i });
    expect(screen.queryByText(/people asking to come/i)).toBeNull();
  });

  it("is absent for somebody who is not a host", async () => {
    state.event = approvalEvent();
    state.applicants = [GUEST];
    state.address = GUEST;
    render(<EventDetail id={ID} linkSecret={null} />);

    await screen.findByRole("button", { name: /ask to come/i });
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  });
});

/**
 * The vouch-gated door.
 *
 * Its whole point is admitting somebody the ledger has no record of, so the
 * states worth pinning are the ones where the page could accidentally tell a
 * newcomer they are shut out when they are not.
 */
describe("EventDetail — a vouch-gated event", () => {
  const vouchEvent = (needed = 1, over: Partial<EventState> = {}): EventState =>
    anEvent({
      admission: { tag: "Vouch", values: [needed] } as EventState["admission"],
      ...over,
    });

  it("never shows a newcomer a zero it has not been told", async () => {
    // `null` is "the count hasn't arrived". Rendering it as 0/1 would tell a
    // guest who has already been vouched for that nobody has vouched for them,
    // and they would go and ask again.
    state.event = vouchEvent();
    state.address = GUEST;
    state.balance = funded("100");
    state.vouches = null;
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByText(/checking/i)).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("shows the count against the threshold once it knows", async () => {
    state.event = vouchEvent(2);
    state.address = GUEST;
    state.balance = funded("100");
    state.vouches = 1;
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByText(/2 members to vouch for you/i)).toBeInTheDocument();
    expect(screen.getByText(/\/ 2/)).toBeInTheDocument();
    // One short is a refusal, not a rounding — the same boundary the contract
    // uses — so there must be nothing here to reserve with.
    expect(screen.queryByRole("button", { name: /reserve/i })).toBeNull();
  });

  it("hands a vouched-in guest the ordinary reservation panel", async () => {
    state.event = vouchEvent();
    state.address = GUEST;
    state.balance = funded("100");
    state.vouches = 1;
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByText(/a member has vouched for you/i)).toBeInTheDocument();
    // And from here it is an ordinary deposit, described by the panel that
    // already knows how to talk about somebody's money.
    expect(screen.getByRole("button", { name: /reserve/i })).toBeInTheDocument();
  });

  it("offers the vouch form to any member, not only hosts", async () => {
    state.event = vouchEvent();
    state.address = GUEST;
    state.balance = funded("100");
    state.vouches = 0;
    render(<EventDetail id={ID} linkSecret={null} />);

    // The contract owns the "may this wallet vouch" rule. Hiding the form from
    // people who turn out to qualify would be us guessing at it.
    expect(await screen.findByText(/vouch for somebody/i)).toBeInTheDocument();
  });

  it("refuses to submit a vouch for yourself before asking the chain", async () => {
    state.event = vouchEvent();
    state.address = GUEST;
    state.balance = funded("100");
    state.vouches = 0;
    render(<EventDetail id={ID} linkSecret={null} />);

    const field = await screen.findByLabelText(/their wallet address/i);
    await userEvent.type(field, GUEST);

    expect(screen.getByText(/refuses a vouch for yourself/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /put my record behind them/i })).toBeDisabled();
  });

  it("will not submit something that is not an address", async () => {
    state.event = vouchEvent();
    state.address = ORGANIZER;
    state.balance = funded("100");
    state.vouches = 0;
    render(<EventDetail id={ID} linkSecret={null} />);

    const field = await screen.findByLabelText(/their wallet address/i);
    await userEvent.type(field, "GBEDUGG");

    // Cheap to check here and it saves a wallet prompt. Every other refusal is
    // the contract's to make.
    expect(screen.getByRole("button", { name: /put my record behind them/i })).toBeDisabled();
  });

  it("is absent once check-in has opened, like vouching itself", async () => {
    state.event = vouchEvent(1, { phase: "CheckingIn" });
    state.address = GUEST;
    state.balance = funded("100");
    state.vouches = 0;
    render(<EventDetail id={ID} linkSecret={null} />);

    await screen.findByText(/no new spots can be taken/i);
    // The contract closes vouching with reservations, so a form that was still
    // here would be one the chain refuses with `ReservationsClosed`.
    expect(screen.queryByText(/vouch for somebody/i)).toBeNull();
  });
});

/**
 * The score-gated door.
 *
 * This mode was enforced on-chain and unexplained in the interface for a while,
 * so a guest below the threshold met it as a wallet prompt followed by a refusal.
 * These pin the numbers being in front of the button instead.
 */
describe("EventDetail — a score-gated event", () => {
  const scoreEvent = (needed = 1, over: Partial<EventState> = {}): EventState =>
    anEvent({
      admission: { tag: "Score", values: [needed] } as EventState["admission"],
      ...over,
    });

  const aRecord = (shows: number) => ({
    shows,
    noShows: 0,
    vouchesGiven: 0,
    vouchesBroken: 0,
    eventsOrganised: 0,
  });

  it("shows the threshold and the guest's own count before any button", async () => {
    state.event = scoreEvent(3);
    state.address = GUEST;
    state.balance = funded("100");
    state.record = aRecord(1);
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByText(/asks for 3 check-ins/i)).toBeInTheDocument();
    expect(screen.getByText(/\/ 3/)).toBeInTheDocument();
    // The whole point: no signature is offered to somebody the contract will
    // refuse. `ScoreTooLow` after a wallet prompt is what this replaces.
    expect(screen.queryByRole("button", { name: /reserve/i })).toBeNull();
  });

  it("says a refusal costs nothing, because that is the question being asked", async () => {
    state.event = scoreEvent(2);
    state.address = GUEST;
    state.balance = funded("100");
    state.record = aRecord(0);
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByText(/refused rather than taken and forfeited/i)).toBeInTheDocument();
  });

  it("never shows a record of nothing it has not been told", async () => {
    // `null` is "the read is still out". Rendering it as 0 check-ins would tell a
    // regular they fail a gate they pass.
    state.event = scoreEvent(1);
    state.address = GUEST;
    state.balance = funded("100");
    state.record = null;
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByText(/checking/i)).toBeInTheDocument();
    expect(screen.queryByText(/\/ 1/)).toBeNull();
  });

  it("hands a qualifying guest the ordinary reservation panel", async () => {
    state.event = scoreEvent(2);
    state.address = GUEST;
    state.balance = funded("100");
    state.record = aRecord(2);
    render(<EventDetail id={ID} linkSecret={null} />);

    // Exactly at the threshold is admitted — the contract's boundary is `<`.
    expect(await screen.findByText(/this event will admit you/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reserve/i })).toBeInTheDocument();
  });

  it("points a newcomer at the one door that has no gate", async () => {
    state.event = scoreEvent(1);
    state.address = GUEST;
    state.balance = funded("100");
    state.record = aRecord(0);
    render(<EventDetail id={ID} linkSecret={null} />);

    expect(await screen.findByRole("link", { name: /find an open event/i })).toBeInTheDocument();
  });
});

/**
 * Co-host management.
 *
 * The contract has had `add_host` and `remove_host` since co-hosting shipped and
 * nothing called either — a capability stranded on-chain while the README said it
 * was there. What needs pinning is the two rules that are the contract's, because
 * a button that fails only when pressed is worse than no button.
 */
describe("EventDetail — who can run the event", () => {
  const CO_HOST = "GCOHOST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFG";

  it("offers no way to remove the creator, who is permanent", async () => {
    state.event = anEvent({ organizer: ORGANIZER, hosts: [ORGANIZER, CO_HOST] });
    state.address = ORGANIZER;
    state.balance = funded("100");
    render(<EventDetail id={ID} linkSecret={null} />);

    await screen.findByText(/who can run this event/i);
    // One Remove, for the co-host. `remove_host` aimed at the creator is refused
    // on-chain, so a second button here would be one the contract rejects.
    expect(screen.getAllByRole("button", { name: /^remove$/i })).toHaveLength(1);
    expect(screen.getByText(/creator cannot be removed/i)).toBeInTheDocument();
  });

  it("says a co-host cannot move the money, because that is what makes it safe", async () => {
    state.event = anEvent({ organizer: ORGANIZER, hosts: [ORGANIZER] });
    state.address = ORGANIZER;
    state.balance = funded("100");
    render(<EventDetail id={ID} linkSecret={null} />);

    // Every payout in `finalize` goes to `config.organizer`, never to whichever
    // host called it. Adding one is a decision about labour, not about funds.
    expect(await screen.findByText(/they cannot move its money/i)).toBeInTheDocument();
  });

  it("will not submit a wallet that is already a host, or a non-address", async () => {
    state.event = anEvent({ organizer: ORGANIZER, hosts: [ORGANIZER, CO_HOST] });
    state.address = ORGANIZER;
    state.balance = funded("100");
    render(<EventDetail id={ID} linkSecret={null} />);

    const field = await screen.findByLabelText(/add a co-host/i);
    await userEvent.type(field, CO_HOST);
    expect(screen.getByText(/already a host/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add co-host/i })).toBeDisabled();

    await userEvent.clear(field);
    await userEvent.type(field, "GCOHOST");
    expect(screen.getByRole("button", { name: /add co-host/i })).toBeDisabled();
  });

  it("is hidden from a guest, and from everyone once the event has settled", async () => {
    state.event = anEvent({ organizer: ORGANIZER, hosts: [ORGANIZER] });
    state.address = GUEST;
    state.balance = funded("100");
    const guestView = render(<EventDetail id={ID} linkSecret={null} />);
    await screen.findByRole("button", { name: /reserve/i });
    expect(screen.queryByText(/who can run this event/i)).toBeNull();
    guestView.unmount();

    // A settled event's host list is history. Changing it would write to a
    // contract whose phase machine is terminal.
    state.event = anEvent({ organizer: ORGANIZER, hosts: [ORGANIZER], phase: "Finalized" });
    state.address = ORGANIZER;
    render(<EventDetail id={ID} linkSecret={null} />);
    await screen.findByText(/this event is finalized/i);
    expect(screen.queryByText(/who can run this event/i)).toBeNull();
  });
});
