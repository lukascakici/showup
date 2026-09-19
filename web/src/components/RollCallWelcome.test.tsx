import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RollCall } from "@/lib/roll-call";
import { RollCallWelcome } from "./RollCallWelcome";

/**
 * The greeting is the first thing anyone sees at this meetup, and the server
 * renders it as nothing on purpose, so nothing about it can be checked by
 * loading the page. It is also the one screen standing between a visitor and
 * the button they came to press, which makes "can it be closed" the question
 * that matters most.
 */
const call: RollCall = {
  slug: "test-call",
  title: "Test Meetup",
  greeting: { title: "Welcome to Istanbul!", line: "Connect a wallet and tap Join." },
  opensAt: 1_000,
  closesAt: 2_000,
};

beforeEach(() => localStorage.clear());

describe("the welcome", () => {
  it("greets a first visit", () => {
    render(<RollCallWelcome call={call} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("Welcome to Istanbul!");
    // The roll call's own name, so somebody who scanned the wrong wall knows.
    expect(screen.getByRole("dialog")).toHaveTextContent(call.title);
  });

  it("closes on the button, and stays closed next time", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<RollCallWelcome call={call} />);
    await user.click(screen.getByRole("button", { name: /let's go/i }));
    expect(screen.queryByRole("dialog")).toBeNull();

    unmount();
    render(<RollCallWelcome call={call} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on a tap outside the panel", async () => {
    const user = userEvent.setup();
    render(<RollCallWelcome call={call} />);
    // The panel is the dialog's only child, so the dialog element itself is the
    // scrim. Tapping it is somebody dismissing this with their thumb where it
    // already is, rather than reaching for one word in the middle of the screen.
    await user.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not close when the panel itself is tapped", async () => {
    const user = userEvent.setup();
    render(<RollCallWelcome call={call} />);
    await user.click(screen.getByText("Welcome to Istanbul!"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<RollCallWelcome call={call} />);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is absent entirely for a roll call with nothing to say", () => {
    render(<RollCallWelcome call={{ ...call, greeting: undefined }} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("gives the page back its scroll on the way out", async () => {
    const user = userEvent.setup();
    render(<RollCallWelcome call={call} />);
    expect(document.body.style.overflow).toBe("hidden");
    await user.click(screen.getByRole("button", { name: /let's go/i }));
    // A modal that locks the body and forgets to unlock it leaves a page that
    // looks fine and cannot be scrolled, which reads as the site being broken.
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
