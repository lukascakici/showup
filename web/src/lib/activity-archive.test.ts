import { describe, expect, it } from "vitest";
import type { Activity } from "./chain";
import { fromArchived, mergeActivity, reachesCreation, toArchived } from "./activity-archive";

/**
 * The archive exists because Soroban RPC forgets. These are the ways a copy of
 * a payout history can be wrong while looking fine — a rounded amount, a
 * duplicated row, a stale row winning over a live one — and none of them show
 * up by looking at the page.
 */

const HASH = "a".repeat(64);
const GUEST = "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJK";
const ORGANIZER = "GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW";

const checkedIn = (over: Partial<Activity> = {}): Activity =>
  ({
    kind: "checked_in",
    guest: GUEST,
    refunded: 51_000_000n,
    ledger: 100,
    txHash: HASH,
    at: 1_700_000_000_000,
    ...over,
  }) as Activity;

describe("archiving a row", () => {
  it("keeps a stroop amount exact through Firestore, which has no bigint", () => {
    // 51000000 stroops is 5.1 XLM. A float round-trip is where a refund quietly
    // becomes almost-but-not-quite what the contract actually paid.
    const stored = toArchived(checkedIn({ refunded: 12_345_678_901_234_567n } as Partial<Activity>));
    expect(stored.refunded).toBe("12345678901234567");

    const back = fromArchived(stored);
    expect(back).toMatchObject({ kind: "checked_in", refunded: 12_345_678_901_234_567n });
  });

  it("writes no undefined fields, which Firestore rejects outright", () => {
    for (const row of [
      checkedIn(),
      { kind: "created", organizer: ORGANIZER, title: "coffee time", ledger: 1, txHash: HASH, at: 1 },
      { kind: "phase_changed", phase: "CheckingIn", ledger: 2, txHash: HASH, at: 2 },
      { kind: "reserved", guest: GUEST, spotsLeft: 8, ledger: 3, txHash: HASH, at: 3 },
      { kind: "finalized", showed: 11, noShows: 1, forfeited: 50_000_000n, ledger: 4, txHash: HASH, at: 4 },
    ] as Activity[]) {
      const stored = toArchived(row) as Record<string, unknown>;
      expect(Object.values(stored).every((v) => v !== undefined)).toBe(true);
    }
  });

  it("survives a round trip for every kind", () => {
    const rows: Activity[] = [
      { kind: "created", organizer: ORGANIZER, title: "coffee time", ledger: 1, txHash: HASH, at: 1 },
      { kind: "phase_changed", phase: "CheckingIn", ledger: 2, txHash: HASH, at: 2 },
      { kind: "reserved", guest: GUEST, spotsLeft: 8, ledger: 3, txHash: HASH, at: 3 },
      checkedIn(),
      { kind: "finalized", showed: 11, noShows: 1, forfeited: 50_000_000n, ledger: 4, txHash: HASH, at: 4 },
    ];
    for (const row of rows) expect(fromArchived(toArchived(row))).toEqual(row);
  });

  it("skips a row written by a newer deploy rather than guessing at it", () => {
    expect(fromArchived({ kind: "refunded", ledger: 1, txHash: HASH, at: 1 } as never)).toBeNull();
  });
});

describe("merging the live feed with the archive", () => {
  it("shows a row once when both sources have it", () => {
    const row = checkedIn();
    expect(mergeActivity([row], [row])).toHaveLength(1);
  });

  it("lets the live row win, because the archive is a copy of a past moment", () => {
    const stale = checkedIn({ refunded: 1n } as Partial<Activity>);
    const live = checkedIn({ refunded: 51_000_000n } as Partial<Activity>);
    expect(mergeActivity([live], [stale])).toEqual([live]);
  });

  it("treats two kinds from one transaction as two rows", () => {
    const finalized = {
      kind: "finalized",
      showed: 1,
      noShows: 1,
      forfeited: 50_000_000n,
      ledger: 9,
      txHash: HASH,
      at: 9,
    } as Activity;
    const phase = { kind: "phase_changed", phase: "Finalized", ledger: 9, txHash: HASH, at: 9 } as Activity;
    expect(mergeActivity([finalized, phase], [])).toHaveLength(2);
  });

  it("puts the newest first and keeps a transaction's own rows in order", () => {
    const old = { kind: "reserved", guest: GUEST, spotsLeft: 8, ledger: 1, txHash: "b".repeat(64), at: 1 } as Activity;
    const finalized = { kind: "finalized", showed: 1, noShows: 0, forfeited: 0n, ledger: 9, txHash: HASH, at: 9 } as Activity;
    const phase = { kind: "phase_changed", phase: "Finalized", ledger: 9, txHash: HASH, at: 9 } as Activity;

    // The archive holds the old row; the live feed holds the pair from ledger 9.
    const merged = mergeActivity([finalized, phase], [old]);
    expect(merged.map((a) => a.kind)).toEqual(["finalized", "phase_changed", "reserved"]);
  });

  it("shows the archive alone when the chain read returned nothing", () => {
    // The Deliverable 3 case: the ledgers holding this history are long gone.
    const archived = [checkedIn(), { kind: "created", organizer: ORGANIZER, title: "x", ledger: 1, txHash: "c".repeat(64), at: 1 } as Activity];
    expect(mergeActivity([], archived)).toHaveLength(2);
  });
});

describe("knowing whether the feed is complete", () => {
  it("is complete once it reaches the event's creation", () => {
    expect(
      reachesCreation([
        checkedIn(),
        { kind: "created", organizer: ORGANIZER, title: "x", ledger: 1, txHash: "c".repeat(64), at: 1 } as Activity,
      ]),
    ).toBe(true);
  });

  it("makes no such claim about a feed that only reaches back a day", () => {
    expect(reachesCreation([checkedIn()])).toBe(false);
  });
});
