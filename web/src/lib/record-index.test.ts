import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECORD_TTL_MS,
  isStale,
  loadRecordForDisplay,
  requestRecordSync,
  toRecord,
  type IndexedRecord,
} from "./record-index";

/**
 * The mirror is a copy of a record the chain decided, and every risk here is the
 * same risk: the copy quietly making a claim the chain never made.
 *
 * "Nobody has synced this wallet" and "this wallet has no record" are the pair
 * that matters most. They are indistinguishable in Firestore and opposite in
 * meaning, and only the contract can tell them apart.
 */

const ADDRESS = "GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW";

const mocks = vi.hoisted(() => ({
  mirrored: null as unknown,
  chain: vi.fn(),
  fetch: vi.fn(),
}));

// The Firestore layer, not the module under test: `loadRecordForDisplay` calls
// `readIndexedRecord` inside its own module, so a partial mock of these exports
// would never be reached.
vi.mock("./firebase", () => ({ firestore: () => ({}) }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ collection, id }),
  getDoc: async () => ({
    exists: () => mocks.mirrored !== null,
    data: () => mocks.mirrored,
  }),
}));

vi.mock("./record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./record")>()),
  loadRecord: (address: string) => mocks.chain(address),
}));

const doc = (over: Partial<IndexedRecord> = {}): IndexedRecord => ({
  address: ADDRESS,
  shows: 3,
  noShows: 1,
  vouchesGiven: 0,
  vouchesBroken: 0,
  eventsOrganised: 0,
  syncedAt: Date.now(),
  syncedLedger: 4_878_000,
  ...over,
});

beforeEach(() => {
  mocks.mirrored = null;
  mocks.chain = vi.fn();
  mocks.fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("how old a mirrored record is allowed to be", () => {
  it("treats a missing document as stale, not as a fresh empty record", () => {
    // The bug this forbids: `null` read as "synced, and it says nothing".
    expect(isStale(null)).toBe(true);
  });

  it("serves a snapshot inside the window and refreshes one outside it", () => {
    const now = 1_700_000_000_000;
    expect(isStale(doc({ syncedAt: now - RECORD_TTL_MS + 1 }), now)).toBe(false);
    expect(isStale(doc({ syncedAt: now - RECORD_TTL_MS - 1 }), now)).toBe(true);
  });

  it("drops the bookkeeping when handing the counters on", () => {
    // `syncedAt` and `syncedLedger` are facts about the copy, not about the
    // person. Anything deciding whether somebody may vouch must not see them.
    expect(toRecord(doc())).toEqual({
      shows: 3,
      noShows: 1,
      vouchesGiven: 0,
      vouchesBroken: 0,
      eventsOrganised: 0,
    });
  });
});

describe("reading a record for display", () => {
  it("does not touch the chain when the mirror is current", async () => {
    mocks.mirrored = doc();
    const record = await loadRecordForDisplay(ADDRESS);

    expect(record.shows).toBe(3);
    // The whole point of the mirror: an open page costs a Firestore read, not an
    // RPC round trip every time it polls.
    expect(mocks.chain).not.toHaveBeenCalled();
  });

  it("serves a stale snapshot immediately and refreshes behind it", async () => {
    mocks.mirrored = doc({ shows: 2, syncedAt: Date.now() - 10 * RECORD_TTL_MS });
    const record = await loadRecordForDisplay(ADDRESS);

    // Answered from the copy rather than waiting on RPC — and the page that
    // renders this says how old it is.
    expect(record.shows).toBe(2);
    expect(mocks.chain).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledWith("/api/records/sync", expect.anything());
  });

  it("asks the chain when nothing has ever been mirrored", async () => {
    // This is the case that must never be answered from the mirror's silence: an
    // unsynced wallet and a wallet the ledger has never heard of look identical
    // in Firestore, and rendering one as the other would tell somebody with a
    // record that they have none.
    mocks.mirrored = null;
    mocks.chain.mockResolvedValue({
      shows: 7,
      noShows: 0,
      vouchesGiven: 1,
      vouchesBroken: 0,
      eventsOrganised: 2,
    });

    const record = await loadRecordForDisplay(ADDRESS);
    expect(record.shows).toBe(7);
    expect(mocks.chain).toHaveBeenCalledWith(ADDRESS);
  });

  it("lets a failed chain read throw rather than inventing an empty record", async () => {
    mocks.mirrored = null;
    mocks.chain.mockRejectedValue(new Error("rpc down"));

    // "We couldn't ask" must not become "this person has never shown up". The
    // caller renders a loading state for `null`, which is the honest answer.
    await expect(loadRecordForDisplay(ADDRESS)).rejects.toThrow(/rpc down/);
  });
});

describe("asking the server to refresh", () => {
  it("sends one address as `address` and many as `addresses`", async () => {
    await requestRecordSync(ADDRESS);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ address: ADDRESS });

    await requestRecordSync([ADDRESS, ADDRESS]);
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({
      addresses: [ADDRESS, ADDRESS],
    });
  });

  it("stays silent when the request fails", async () => {
    // A stale number with an accurate "as of" line is a good page. An error about
    // a refresh nobody asked for trains people to ignore warnings.
    mocks.fetch.mockRejectedValue(new Error("offline"));
    await expect(requestRecordSync(ADDRESS)).resolves.toBeUndefined();
  });
});
