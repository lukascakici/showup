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
  readIndexedEvents: vi.fn(),
  toEventState: (doc: IndexedEvent) => ({ id: doc.id, organizer: "G_FROM_INDEX" }),
}));

import { listEventIds, loadEvent } from "./chain";
import { readIndexedEvents } from "./event-index";
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
  vi.mocked(readIndexedEvents).mockReset();
});

describe("loadEventList", () => {
  it("reads every event from the chain when the chain is healthy", async () => {
    vi.mocked(listEventIds).mockResolvedValue(["A", "B"]);
    vi.mocked(loadEvent).mockImplementation(async (id: string) => chainEvent(id));

    const list = await loadEventList();

    expect(list.events.map((e) => e.id)).toEqual(["A", "B"]);
    expect(list.events.every((e) => e.source === "chain")).toBe(true);
    expect(list.unreadable).toEqual([]);
    // The index is not even consulted when nothing needs it.
    expect(readIndexedEvents).not.toHaveBeenCalled();
  });

  it("keeps the other events when one of them cannot be read", async () => {
    // This is the regression. It used to be Promise.all, so a single rejection
    // emptied the entire list and looked exactly like the events being deleted.
    vi.mocked(listEventIds).mockResolvedValue(["A", "B", "C"]);
    vi.mocked(loadEvent).mockImplementation(async (id: string) => {
      if (id === "B") throw new Error("archived");
      return chainEvent(id);
    });
    vi.mocked(readIndexedEvents).mockResolvedValue([indexDoc("B")]);

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
    vi.mocked(readIndexedEvents).mockResolvedValue([]);

    const list = await loadEventList();

    expect(list.events.map((e) => e.id)).toEqual(["A"]);
    expect(list.unreadable).toEqual(["B"]);
  });

  it("falls back to the index entirely when the factory itself is unreadable", async () => {
    vi.mocked(listEventIds).mockRejectedValue(new Error("rpc down"));
    vi.mocked(readIndexedEvents).mockResolvedValue([indexDoc("A"), indexDoc("B")]);

    const list = await loadEventList();

    expect(list.events.map((e) => e.id)).toEqual(["A", "B"]);
    expect(list.events.every((e) => e.source === "index")).toBe(true);
  });

  it("fails loudly when the chain is down and there is nothing cached", async () => {
    vi.mocked(listEventIds).mockRejectedValue(new Error("rpc down"));
    vi.mocked(readIndexedEvents).mockResolvedValue([]);

    // An empty list here would be a lie — it would say "no events exist" when
    // the truth is "we couldn't ask". The caller shows an error instead.
    await expect(loadEventList()).rejects.toThrow(/nothing cached/i);
  });
});
