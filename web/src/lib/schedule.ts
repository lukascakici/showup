import type { ListedEvent } from "./events";

/**
 * The list, in the order a person actually wants it.
 *
 * It used to be `events.slice().reverse()` — the factory's creation order,
 * backwards. So an event happening tonight sat below one from last month purely
 * because it was registered first, and the only thing the ordering encoded was
 * an implementation detail of the factory's index.
 *
 * `starts_at` has been on-chain since week 2 day 5.5 and nothing read it. Now:
 * soonest first among what hasn't happened, then everything that has, most
 * recent first.
 */
export type EventGroup = {
  /** Stable across renders: a date key, or one of the two fixed buckets. */
  key: string;
  label: string;
  events: ListedEvent[];
};

/**
 * A local calendar day as `YYYY-MM-DD`.
 *
 * Local, not UTC: "today" is the reader's today. And a string rather than a
 * timestamp because adding 86,400,000ms to a local midnight lands on 23:00 or
 * 01:00 twice a year, which is exactly the kind of bug that only appears for a
 * weekend and only for some of the people looking.
 */
function dayKey(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function dayLabel(key: string, now: number): string {
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(addDays(now, 1))) return "Tomorrow";
  // `${key}T00:00:00` with no zone is parsed as local time, which is the zone
  // the key was built in.
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function groupByDay(events: ListedEvent[], now: number = Date.now()): EventGroup[] {
  const today = dayKey(now);
  const byDay = new Map<string, ListedEvent[]>();
  const past: ListedEvent[] = [];
  const undated: ListedEvent[] = [];

  for (const event of events) {
    // 0 means the event predates start times existing on-chain. It has no date
    // to show, which is not the same as a date at the epoch.
    if (!event.startsAt) {
      undated.push(event);
      continue;
    }
    const key = dayKey(event.startsAt * 1000);
    // Compared by calendar day, so an event that started two hours ago is still
    // under "Today" rather than filed away as history while people are at it.
    if (key < today) {
      past.push(event);
      continue;
    }
    const list = byDay.get(key);
    if (list) list.push(event);
    else byDay.set(key, [event]);
  }

  const groups: EventGroup[] = [...byDay.entries()]
    // `YYYY-MM-DD` sorts lexicographically exactly as it sorts chronologically.
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, list]) => ({
      key,
      label: dayLabel(key, now),
      events: [...list].sort((a, b) => a.startsAt - b.startsAt),
    }));

  if (past.length > 0) {
    groups.push({
      key: "earlier",
      label: "Earlier",
      events: [...past].sort((a, b) => b.startsAt - a.startsAt),
    });
  }
  if (undated.length > 0) {
    groups.push({ key: "undated", label: "No date", events: undated });
  }
  return groups;
}
