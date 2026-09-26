import { beforeEach, describe, expect, it, vi } from "vitest";
import { FUNNEL_STEPS, isFunnelStep, track } from "./funnel";

/**
 * Measurement sits on the paths that matter — opening an invite, connecting a
 * wallet, signing for a deposit — so the risks here are not about accuracy. They
 * are about a measurement being able to break a reservation, or to travel further
 * than it was meant to.
 */

const EVENT = "CCWYYTY5XCJY7KFPUWKMP4MELJG3G3FIYW2O3WJSMEIZTDKOMST6FL7C";
const ADDRESS = "GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // The storage-disabled test below spies on `Storage.prototype`, and a spy that
  // throws would leak into whatever runs next and make it pass for the wrong
  // reason. Caught by exactly that happening.
  vi.restoreAllMocks();
  localStorage.clear();
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
});

describe("what counts as a step", () => {
  it("accepts the four and nothing else", () => {
    for (const step of FUNNEL_STEPS) expect(isFunnelStep(step)).toBe(true);
    // The route validates with this. A fifth step arriving from a browser would
    // otherwise become a collection nobody planned and a row no report reads.
    expect(isFunnelStep("reserved_maybe")).toBe(false);
    expect(isFunnelStep("")).toBe(false);
    expect(isFunnelStep(undefined)).toBe(false);
    expect(isFunnelStep({ step: "reserved" })).toBe(false);
  });
});

describe("recording a step", () => {
  it("sends the step, a session and nothing the caller didn't give it", () => {
    track("reserved", { eventId: EVENT, address: ADDRESS });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.step).toBe("reserved");
    expect(body.eventId).toBe(EVENT);
    expect(body.address).toBe(ADDRESS);
    expect(typeof body.session).toBe("string");
    // No timestamp: the server's clock is the only one that can't be used to
    // rewrite the order of the steps, and the order is the measurement.
    expect(body.at).toBeUndefined();
    expect(Object.keys(body).sort()).toEqual(["address", "eventId", "session", "step"]);
  });

  it("reuses one session across every step, or a path cannot be followed", () => {
    track("invite_opened", { eventId: EVENT });
    track("wallet_connected", { address: ADDRESS });
    track("checked_in", { eventId: EVENT, address: ADDRESS });

    const sessions = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).session);
    expect(new Set(sessions).size).toBe(1);
  });

  it("survives a browser that has no storage, by going unmeasured", () => {
    // `localStorage` *throws* when it is disabled rather than returning null, and
    // an exception here would land inside `rsvp` and fail a reservation over a
    // measurement. Going uncounted is the correct trade; taking the page down is
    // not.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(() => track("invite_opened", { eventId: EVENT })).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows a failed request rather than surfacing it", () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(() => track("reserved", { eventId: EVENT })).not.toThrow();
  });

  it("keeps the request alive across a navigation", () => {
    // `checked_in` fires as the page is about to change under it, and a plain
    // fetch is cancelled when that happens — losing the one step that means
    // somebody physically turned up.
    track("checked_in", { eventId: EVENT });
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });
});
