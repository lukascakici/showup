import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FirstRun } from "./FirstRun";

/**
 * The screen that has to answer "do I get my money back" before anybody signs for
 * a deposit. Two ways it could fail: not appearing when it should, and appearing
 * when somebody has already read it.
 */

const XLM = 10_000_000n;

beforeEach(() => {
  localStorage.clear();
});

describe("explaining the deposit before asking for it", () => {
  it("answers the only question anybody has, with this event's own numbers", () => {
    render(<FirstRun deposit={10n * XLM} refund={101n * XLM / 10n} />);

    // "A deposit is refunded when you attend" is a sentence about software.
    // "Your 10 XLM comes back" is a sentence about their money.
    expect(screen.getByText(/you get it back/i)).toBeInTheDocument();
    expect(screen.getByText(/10 XLM in the event/i)).toBeInTheDocument();
    expect(screen.getByText(/10\.1 XLM comes straight back/i)).toBeInTheDocument();
  });

  it("says plainly that the money is not real", () => {
    // Somebody believing they are risking savings is the failure. So is somebody
    // believing the opposite of a real deposit later.
    render(<FirstRun deposit={10n * XLM} refund={10n * XLM} />);
    expect(screen.getByText(/isn't real money/i)).toBeInTheDocument();
    expect(screen.getByText(/worth nothing anywhere/i)).toBeInTheDocument();
  });

  it("shows once per browser and not again", async () => {
    const first = render(<FirstRun deposit={10n * XLM} refund={10n * XLM} />);
    await userEvent.click(screen.getByRole("button", { name: /got it/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    first.unmount();

    // Somebody who has read it and comes back to a second event is not a
    // first-time visitor, and being explained to again says the app didn't notice.
    render(<FirstRun deposit={5n * XLM} refund={5n * XLM} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("can be dismissed with Escape as well as the button", async () => {
    render(<FirstRun deposit={10n * XLM} refund={10n * XLM} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("still appears for a browser that refuses storage, rather than crashing", () => {
    // `localStorage` throws when it is disabled. Explaining the deposit twice is
    // the correct way for that to fail; taking the event page down is not.
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("denied");
    };
    try {
      expect(() =>
        render(<FirstRun deposit={10n * XLM} refund={10n * XLM} />),
      ).not.toThrow();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
