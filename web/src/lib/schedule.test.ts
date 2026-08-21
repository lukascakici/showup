import { describe, expect, it } from "vitest";
import { dayLabel, groupByDay } from "./schedule";
import type { ListedEvent } from "./events";

/** Local wall-clock seconds, because that is what the grouping works in. */
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  Math.floor(new Date(y, m - 1, d, h, min, 0, 0).getTime() / 1000);

const NOW = new Date(2026, 7, 20, 15, 0, 0, 0).getTime(); // Thu 20 Aug 2026, 15:00

function ev(id: string, startsAt: number): ListedEvent {
  return { id, startsAt, source: "chain" } as unknown as ListedEvent;
}

const ids = (events: ListedEvent[]) => events.map((e) => e.id);

describe("groupByDay", () => {
  it("puts the soonest day first and sorts within a day by time", () => {
    const groups = groupByDay(
      [
        ev("sat", at(2026, 8, 22)),
        ev("fri-late", at(2026, 8, 21, 21)),
        ev("fri-early", at(2026, 8, 21, 9)),
      ],
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual(["2026-08-21", "2026-08-22"]);
    expect(ids(groups[0].events)).toEqual(["fri-early", "fri-late"]);
  });

  // The reason this isn't a timestamp comparison: people at an event that
  // started two hours ago should still find it under Today.
  it("keeps an event that already started today under Today", () => {
    const groups = groupByDay([ev("this-morning", at(2026, 8, 20, 9))], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Today");
  });

  it("files yesterday under Earlier, most recent first", () => {
    const groups = groupByDay(
      [ev("last-week", at(2026, 8, 13)), ev("yesterday", at(2026, 8, 19))],
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual(["earlier"]);
    expect(ids(groups[0].events)).toEqual(["yesterday", "last-week"]);
  });

  it("orders the buckets: upcoming, then earlier", () => {
    const groups = groupByDay(
      [ev("old", at(2026, 8, 1)), ev("soon", at(2026, 8, 21))],
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual(["2026-08-21", "earlier"]);
  });

  // Events from before start times existed on-chain store 0. That is "no date",
  // not 1 January 1970 — filing them under Earlier would date them to 1970 and
  // bury them forever. They are left off the list instead.
  it("leaves an undated event off the list entirely", () => {
    expect(groupByDay([ev("legacy", 0)], NOW)).toEqual([]);
  });

  // The one that matters: an undated event must not take a dated one down with
  // it, since dropping the list's only real row would read as an outage.
  it("drops only the undated event, never its neighbours", () => {
    const groups = groupByDay([ev("legacy", 0), ev("real", at(2026, 8, 21))], NOW);
    expect(groups.flatMap((g) => ids(g.events))).toEqual(["real"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });

  it("never drops or duplicates a dated event", () => {
    const all = [
      ev("a", at(2026, 8, 21)),
      ev("b", at(2026, 8, 21, 8)),
      ev("c", at(2026, 8, 25)),
      ev("d", at(2026, 8, 2)),
      ev("f", at(2026, 8, 20, 23)),
    ];
    const seen = groupByDay(all, NOW).flatMap((g) => g.events);
    expect(ids(seen).sort()).toEqual(["a", "b", "c", "d", "f"]);
  });
});

describe("dayLabel", () => {
  it("names today and tomorrow rather than dating them", () => {
    expect(dayLabel("2026-08-20", NOW)).toBe("Today");
    expect(dayLabel("2026-08-21", NOW)).toBe("Tomorrow");
  });

  // Adding 24h to a local midnight lands on the wrong day across a DST switch;
  // stepping the date field does not. Europe/Istanbul has no DST, so this is
  // pinned with an explicit date rather than a clock offset.
  it("dates anything further out", () => {
    expect(dayLabel("2026-08-22", NOW)).not.toBe("Tomorrow");
    expect(dayLabel("2026-08-22", NOW)).toMatch(/22/);
  });

  it("rolls tomorrow over a month boundary", () => {
    const lastOfMonth = new Date(2026, 7, 31, 22, 0, 0, 0).getTime();
    expect(dayLabel("2026-09-01", lastOfMonth)).toBe("Tomorrow");
  });
});
