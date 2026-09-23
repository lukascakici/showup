import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventState } from "./chain";
import type { IndexedEvent } from "./event-index";

vi.mock("./chain", () => ({
  listEventIds: vi.fn(),
  loadEvent: vi.fn(),
  fetchActivity: vi.fn(),
  server: {},
  spotsLeft: vi.fn(),
  attendanceOf: vi.fn(),
  forfeitPool: vi.fn(),
}));
vi.mock("./event-index", () => ({
  readIndexedEventsCached: vi.fn(),
  // The list asks the server to write down what it just read. Stubbed to a
  // resolved promise so the fire-and-forget call cannot reject into a test.
  requestSync: vi.fn(() => Promise.resolve()),
  forgetIndexCache: vi.fn(),
  toEventState: (doc: IndexedEvent) => ({ id: doc.id, organizer: "G_FROM_INDEX" }),
}));

import { listEventIds, loadEvent } from "./chain";
import { readIndexedEventsCached, requestSync } from "./event-index";
import { loadEventList } from "./events";

/**
 * Only the fields these tests assert on. The list logic routes whole events
 * around; it never inspects a deposit, so filling one in would be decoration
 * that later has to be maintained.
 */
const chainEvent = (id: string) => ({ id, organizer: "G_FROM_CHAIN" }) as unknown as EventState;
const indexDoc = (id: string, syncedAt = 1_700_000_000_000) =>
  ({ id, syncedAt }) as unknown as IndexedEvent;

beforeEach(() => {
  vi.mocked(listEventIds).mockReset();
  vi.mocked(loadEvent).mockReset();
  vi.mocked(readIndexedEventsCached).mockReset();
  vi.mocked(readIndexedEventsCached).mockResolvedValue([]);
  vi.mocked(requestSync).mockClear();
});

describe("loadEventList", () => {
  it("reads every event from the chain when the chain is healthy", async () => {
    vi.mocked(listEventIds).mockResolvedValue(["A", "B"]);
    vi.mocked(loadEvent).mockImplementation(async (id: string) => chainEvent(id));

    const list = await loadEventList();

    expect(list.events.map((e) => e.id)).toEqual(["A", "B"]);
    expect(list.events.every((e) => e.source === "chain")).toBe(true);
    expect(list.unreadable).toEqual([]);
    // The index is read on the happy path now, once, because the `hidden` flags
    // live on those documents. It used to be touched only when a chain read
    // failed — and twice when one did.
    expect(readIndexedEventsCached).toHaveBeenCalledTimes(1);
  });

  it("keeps the other events when one of them cannot be read", async () => {
    // This is the regression. It used to be Promise.all, so a single rejection
    // emptied the entire list and looked exactly like the events being deleted.
    vi.mocked(listEventIds).mockResolvedValue(["A", "B", "C"]);
    vi.mocked(loadEvent).mockImplementation(async (id: string) => {
      if (id === "B") throw new Error("archived");
      return chainEvent(id);
    });
    vi.mocked(readIndexedEventsCached).mockResolvedValue([indexDoc("B")]);

    const list = await loadEventList();

    // All three still present, and B kept its place rather than being appended.
    expect(list.events.map((e) => e.id)).toEqual(["A", "B", "C"]);
    expect(list.events.map((e) => e.source)).toEqual(["chain", "index", "chain"]);
    expect(list.events[1].syncedAt).toBe(1_700_000_000_000);
    expect(list.unreadable).toEqual([]);
  });

  it("reports an event the index has never seen instead of inventing one", async () => {
    vi.mocked(listEventIds).mockResolvedValue(["A", "B"]);
    vi.mocked(loadEvent).mockImplementation(async (id: string) => {
      if (id === "B") throw new Error("archived");
      return chainEvent(id);
    });
    vi.mocked(readIndexedEventsCached).mockResolvedValue([]);

    const list = await loadEventList();

    expect(list.events.map((e) => e.id)).toEqual(["A"]);
    expect(list.unreadable).toEqual(["B"]);
  });

  it("falls back to the index entirely when the factory itself is unreadable", async () => {
    vi.mocked(listEventIds).mockRejectedValue(new Error("rpc down"));
    vi.mocked(readIndexedEventsCached).mockResolvedValue([indexDoc("A"), indexDoc("B")]);

    const list = await loadEventList();

    expect(list.events.map((e) => e.id)).toEqual(["A", "B"]);
    expect(list.events.every((e) => e.source === "index")).toBe(true);
  });

  it("fails loudly when the chain is down and there is nothing cached", async () => {
    vi.mocked(listEventIds).mockRejectedValue(new Error("rpc down"));
    vi.mocked(readIndexedEventsCached).mockResolvedValue([]);

    // An empty list here would be a lie — it would say "no events exist" when
    // the truth is "we couldn't ask". The caller shows an error instead.
    await expect(loadEventList()).rejects.toThrow(/nothing cached/i);
  });
});

describe("hiding an event from the list", () => {
  it("leaves it out, and never asks the chain for it", async () => {
    vi.mocked(listEventIds).mockResolvedValue(["A", "B"]);
    vi.mocked(readIndexedEventsCached).mockResolvedValue([
      { id: "B", hidden: true } as unknown as IndexedEvent,
    ]);
    vi.mocked(loadEvent).mockImplementation(async (id: string) => chainEvent(id));

    const list = await loadEventList();

    expect(list.events.map((e) => e.id)).toEqual(["A"]);
    // Filtered before the fetch, not after it: a hidden event costs no RPC call.
    expect(loadEvent).toHaveBeenCalledTimes(1);
    expect(loadEvent).toHaveBeenCalledWith("A");
  });

  it("does not report a hidden event as one that failed to load", async () => {
    vi.mocked(listEventIds).mockResolvedValue(["A", "B"]);
    vi.mocked(readIndexedEventsCached).mockResolvedValue([
      { id: "B", hidden: true } as unknown as IndexedEvent,
    ]);
    vi.mocked(loadEvent).mockRejectedValue(new Error("rpc down"));

    const list = await loadEventList();

    // "1 event couldn't be read right now" is a message about the network. A
    // hidden event appearing in that count would be the page apologising for
    // something we did on purpose.
    expect(list.unreadable).toEqual(["A"]);
  });

  it("stays hidden when the chain is unreachable and the index is all there is", async () => {
    vi.mocked(listEventIds).mockRejectedValue(new Error("rpc down"));
    vi.mocked(readIndexedEventsCached).mockResolvedValue([
      indexDoc("A"),
      { id: "B", hidden: true, syncedAt: 1 } as unknown as IndexedEvent,
    ]);

    const list = await loadEventList();

    expect(list.events.map((e) => e.id)).toEqual(["A"]);
  });

  it("shows everything when the index is empty or off", async () => {
    // The failure mode that matters: Firestore unreachable must not blank the
    // page. Nothing hidden is the safe answer, and it is the default one.
    vi.mocked(listEventIds).mockResolvedValue(["A", "B"]);
    vi.mocked(readIndexedEventsCached).mockResolvedValue([]);
    vi.mocked(loadEvent).mockImplementation(async (id: string) => chainEvent(id));

    const list = await loadEventList();

    expect(list.events.map((e) => e.id)).toEqual(["A", "B"]);
  });
});
