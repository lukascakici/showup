import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateEvent } from "./CreateEvent";

/**
 * The form sits behind a wallet gate, so a headless browser cannot reach it —
 * which is why every claim day 6 made about it was reasoned rather than
 * measured. This is where that gets closed.
 *
 * Only two things are mocked: the wallet's public key, and the factory call
 * itself. Everything the tests actually assert on — byte counting, when errors
 * appear, the stepper, the two-step wait — is the real component.
 */
const ORGANIZER = "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJK";
const EVENT_ID = "CCWYYTY5XCJY7KFPUWKMP4MELJG3G3FIYW2O3WJSMEIZTDKOMST6FL7C";

const chain = vi.hoisted(() => ({
  createEvent: vi.fn(),
  signAndSend: vi.fn(),
}));

vi.mock("@/lib/signer", () => ({
  useSigner: () => ({ publicKey: ORGANIZER, signTransaction: vi.fn() }),
}));

vi.mock("@/lib/contracts", async (importOriginal) => ({
  // `toStroops`, `fromStroops` and the byte limit stay real — they are half of
  // what is being tested.
  ...(await importOriginal<typeof import("@/lib/contracts")>()),
  factory: () => ({ create_event: chain.createEvent }),
}));

/** Resolves the whole call, as one uninterrupted round trip. */
function chainSucceeds() {
  chain.signAndSend.mockResolvedValue({ result: { unwrap: () => EVENT_ID } });
  chain.createEvent.mockResolvedValue({ signAndSend: chain.signAndSend });
}

/** Stops at the wallet prompt and stays there, so the wait can be inspected. */
function chainHangsAtTheWallet() {
  chain.signAndSend.mockImplementation(() => new Promise(() => {}));
  chain.createEvent.mockResolvedValue({ signAndSend: chain.signAndSend });
}

const fill = async (label: RegExp, value: string) => {
  const field = screen.getByLabelText(label);
  await userEvent.clear(field);
  await userEvent.type(field, value);
  return field;
};

beforeEach(() => {
  chain.createEvent.mockReset();
  chain.signAndSend.mockReset();
  localStorage.clear();
});

describe("CreateEvent — when it corrects you", () => {
  // "Perşembe halı saha, Kadıköy" is 27 characters and 31 bytes, and the
  // contract counts bytes. Counting characters here would let a Turkish title
  // past the form and into an InvalidTitle after the wallet prompt.
  it("counts the title in bytes, not characters", async () => {
    render(<CreateEvent />);
    const title = await fill(/event name/i, "ş".repeat(51)); // 102 bytes, 51 chars
    await userEvent.tab();
    expect(await screen.findByText(/that's 2 too long/i)).toBeInTheDocument();
    expect(title).toHaveValue("ş".repeat(51));
  });

  // It used to validate on every keystroke, so a title that was going to be
  // fine got told off four characters in.
  it("stays quiet while you are still typing", async () => {
    render(<CreateEvent />);
    await fill(/event name/i, "ş".repeat(51));
    expect(screen.queryByText(/too long/i)).not.toBeInTheDocument();
  });

  it("speaks up once you leave the field", async () => {
    render(<CreateEvent />);
    await fill(/deposit per person/i, "10.12345678");
    expect(screen.queryByText(/at most 7 decimals/i)).not.toBeInTheDocument();
    await userEvent.tab();
    expect(await screen.findByText(/at most 7 decimals/i)).toBeInTheDocument();
  });

  it("shows every error at once on a submit attempt, without touching the chain", async () => {
    render(<CreateEvent />);
    await fill(/deposit per person/i, "abc");
    await userEvent.click(screen.getByRole("button", { name: /create event/i }));
    expect(await screen.findByText(/at most 7 decimals/i)).toBeInTheDocument();
    expect(chain.createEvent).not.toHaveBeenCalled();
  });

  it("only shows the byte counter as the limit gets close", async () => {
    render(<CreateEvent />);
    expect(screen.queryByText(/\/ 100/)).not.toBeInTheDocument();
    await fill(/event name/i, "x".repeat(85));
    expect(screen.getByText("85 / 100")).toBeInTheDocument();
  });
});

describe("CreateEvent — the controls that replace typing", () => {
  it("fills the deposit from a preset", async () => {
    render(<CreateEvent />);
    await userEvent.click(screen.getByRole("button", { name: "25" }));
    expect(screen.getByLabelText(/deposit per person/i)).toHaveValue("25");
    expect(screen.getByRole("button", { name: "25" })).toHaveAttribute("aria-pressed", "true");
  });

  it("steps the spot count up and down", async () => {
    render(<CreateEvent />);
    const spots = screen.getByRole("textbox", { name: /maximum people/i });
    await userEvent.click(screen.getByRole("button", { name: /one more spot/i }));
    expect(spots).toHaveValue("11");
    await userEvent.click(screen.getByRole("button", { name: /one fewer spot/i }));
    expect(spots).toHaveValue("10");
  });

  it("won't step below one spot", async () => {
    render(<CreateEvent />);
    const spots = screen.getByRole("textbox", { name: /maximum people/i });
    await userEvent.clear(spots);
    await userEvent.type(spots, "1");
    expect(screen.getByRole("button", { name: /one fewer spot/i })).toBeDisabled();
  });

  // The organizer funds the fee pool up front, so the number has to follow the
  // stepper rather than only the keyboard.
  it("keeps the funding notice in step with the spot count", async () => {
    render(<CreateEvent />);
    expect(screen.getByText("1 XLM")).toBeInTheDocument(); // 10 spots x 0.1
    await userEvent.click(screen.getByRole("button", { name: /one more spot/i }));
    expect(screen.getByText("1.1 XLM")).toBeInTheDocument();
  });
});

describe("CreateEvent — the wait", () => {
  it("names both steps, and locks the form during them", async () => {
    chainHangsAtTheWallet();
    render(<CreateEvent />);
    await fill(/event name/i, "Perşembe halı saha");
    await userEvent.click(screen.getByRole("button", { name: /create event/i }));

    // Fields stayed editable through a 30-second wait, so anything typed into
    // them was silently not what was being created.
    await waitFor(() => expect(screen.getByLabelText(/event name/i)).toBeDisabled());
    expect(
      await screen.findByText(/approve it in your wallet/i),
    ).toBeInTheDocument();
  });

  it("hands over the links instead of navigating away", async () => {
    chainSucceeds();
    render(<CreateEvent />);
    await fill(/event name/i, "Perşembe halı saha");
    await userEvent.click(screen.getByRole("button", { name: /create event/i }));

    expect(await screen.findByText(/your event is live/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open event page/i })).toHaveAttribute(
      "href",
      `/e/${EVENT_ID}`,
    );
  });

  // The chain only ever stores sha256(secret); this is the only copy.
  it("writes the check-in secret down before showing anything", async () => {
    chainSucceeds();
    render(<CreateEvent />);
    await fill(/event name/i, "Perşembe halı saha");
    await userEvent.click(screen.getByRole("button", { name: /create event/i }));

    await screen.findByText(/your event is live/i);
    const stored = JSON.stringify(localStorage);
    expect(stored).toContain(EVENT_ID);
  });

  it("sends the title trimmed and the start time as a number of seconds", async () => {
    chainSucceeds();
    render(<CreateEvent />);
    await fill(/event name/i, "  Perşembe halı saha  ");
    await userEvent.click(screen.getByRole("button", { name: /create event/i }));

    await screen.findByText(/your event is live/i);
    const args = chain.createEvent.mock.calls[0][0];
    expect(args.title).toBe("Perşembe halı saha");
    expect(args.organizer).toBe(ORGANIZER);
    expect(typeof args.starts_at).toBe("bigint");
    expect(args.starts_at).toBeGreaterThan(0n);
  });

  it("reports a failure in words and leaves the form usable", async () => {
    chain.createEvent.mockRejectedValue(new Error("Error(Contract, #3)"));
    render(<CreateEvent />);
    await fill(/event name/i, "Perşembe halı saha");
    await userEvent.click(screen.getByRole("button", { name: /create event/i }));

    expect(await screen.findByText(/deposit amount is invalid/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/event name/i)).toBeEnabled();
  });
});
