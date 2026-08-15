import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventCreated } from "./EventCreated";
import { SITE_URL } from "@/lib/links";

/**
 * The one screen whose job is to hand over something unrecoverable.
 *
 * The chain only ever stored sha256 of the check-in code, so nobody — us
 * included — can get it back. This screen exists because the old behaviour
 * generated it and navigated away in the same instant.
 */
const ID = "CCWYYTY5XCJY7KFPUWKMP4MELJG3G3FIYW2O3WJSMEIZTDKOMST6FL7C";
const SECRET = "0123456789abcdef0123456789abcdef";

const renderIt = () =>
  render(<EventCreated id={ID} title="Perşembe halı saha" secret={SECRET} />);

describe("EventCreated", () => {
  it("shows the invite link, which carries no secret", () => {
    renderIt();
    expect(screen.getByText(`${SITE_URL}/e/${ID}`)).toBeInTheDocument();
  });

  it("shows the check-in link, which does", () => {
    renderIt();
    expect(screen.getByText(`${SITE_URL}/e/${ID}?c=${SECRET}`)).toBeInTheDocument();
  });

  // The two differ by one query parameter, and mixing them up is the only way
  // to break the deposit mechanic: post the check-in link early and anyone can
  // mark themselves present without turning up.
  it("names them for when they are used, not for what they are", () => {
    renderIt();
    expect(screen.getByRole("button", { name: /copy the invite link/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy the check-in link/i })).toBeInTheDocument();
  });

  it("says plainly that this browser holds the only copy", () => {
    renderIt();
    expect(screen.getByText(/nobody — including us — can recover it/i)).toBeInTheDocument();
    expect(screen.getByText(/the only copy lives in this browser/i)).toBeInTheDocument();
  });

  it("warns against sharing the check-in link early", () => {
    renderIt();
    expect(screen.getByText(/whether they showed up or not/i)).toBeInTheDocument();
  });

  // Built on a fixed host rather than `window.location.origin`, so the link an
  // organizer copies off a preview deploy still works for everyone else.
  it("builds both links on the site's own domain", () => {
    renderIt();
    for (const link of screen.getAllByRole("link")) {
      const href = link.getAttribute("href") ?? "";
      if (href.startsWith("http")) expect(href).toContain(SITE_URL);
    }
  });
});
