import { rpc, scValToNative } from "@stellar/stellar-sdk";
import {
  factory,
  event as eventClient,
  SOROBAN_RPC_URL,
  type Admission,
  type ForfeitPolicy,
} from "./contracts";
import type { Phase } from "event-client";

/**
 * Reading the chain — no React, no `"use client"`.
 *
 * Split out of `events.ts` because a route handler could not call any of it:
 * a module marked `"use client"` exports *client* functions, and Next answers a
 * server-side call to one with "it's not possible to invoke a client function
 * from the server". The hooks in `events.ts` need the directive; these reads
 * must not have it, because `/api/events/sync` runs them on the server.
 *
 * Everything here is isomorphic on purpose: the same function backs the
 * browser's polling and the server's indexing, so the two can never drift into
 * disagreeing about what an event is.
 */

export type { Phase };

export type EventState = {
  id: string;
  /** What the event is called. On-chain, so it is as trustworthy as the deposit. */
  title: string;
  /** Unix seconds, UTC. Informational — the phase machine decides what is allowed. */
  startsAt: number;
  organizer: string;
  /** Everyone who may run the event. Always contains `organizer`. */
  hosts: string[];
  /**
   * Who may reserve. Fixed at creation and enforced inside `rsvp`.
   *
   * `Open` for every event deployed before `get_terms` existed, which is what
   * they were created as — not a guess, and not a default standing in for an
   * answer nobody has.
   */
  admission: Admission;
  deposit: bigint;
  feeAllowance: bigint;
  capacity: number;
  policy: ForfeitPolicy;
  reserved: string[];
  checkedIn: string[];
  phase: Phase["tag"];
};

export const server = new rpc.Server(SOROBAN_RPC_URL);

export async function listEventIds(): Promise<string[]> {
  const tx = await factory().list_events();
  return tx.result;
}

/**
 * Does the factory know this address?
 *
 * Asked only when `loadEvent` has already failed, to tell two very different
 * failures apart. `loadEvent` fans four RPC calls out with `Promise.all`, so a
 * single dropped read rejects the lot — indistinguishable, from the outside,
 * from an address where no event was ever deployed. Telling someone with a real
 * deposit locked in a real contract that their event does not exist is the worse
 * of the two mistakes by a distance, so nothing claims it without asking here
 * first.
 */
export async function isKnownEvent(id: string): Promise<boolean> {
  return (await listEventIds()).includes(id);
}

/**
 * The admission mode and host list, or `null` for an event too old to have them.
 *
 * `get_terms` does not exist on the revision every event on the live factory was
 * deployed from, so this failing is an ordinary answer rather than an error: it
 * means an open event with a single host, and the caller fills that in. The one
 * thing it must not do is take the whole page down with it, which is why it is
 * caught here instead of riding in the `Promise.all` below.
 */
async function loadTerms(client: ReturnType<typeof eventClient>) {
  try {
    return (await client.get_terms()).result.unwrap();
  } catch {
    return null;
  }
}

export async function loadEvent(id: string): Promise<EventState> {
  const client = eventClient(id);
  const [config, reserved, checkedIn, phase, terms] = await Promise.all([
    client.get_config(),
    client.get_reserved(),
    client.get_checked_in(),
    client.get_phase(),
    loadTerms(client),
  ]);
  const c = config.result.unwrap();
  return {
    id,
    // Events created before the title revision have no `title` or `starts_at`
    // in their Config at all — the fields are simply absent, so the generated
    // binding's non-optional types are a lie for them. They are still perfectly
    // valid events with real deposits in them, so they get an honest blank
    // rather than being dropped or given an invented name.
    title: c.title ?? "",
    // Checked for finiteness rather than for undefined: an absent field decodes
    // to something `Number()` turns into NaN, and NaN reaches Firestore as a
    // stored value that every later comparison silently gets wrong.
    startsAt: Number.isFinite(Number(c.starts_at)) ? Number(c.starts_at) : 0,
    organizer: c.organizer,
    // Not a guess: an event created before co-hosting existed has exactly one
    // host, and it is whoever created it.
    hosts: terms?.hosts ?? [c.organizer],
    admission: terms?.admission ?? ({ tag: "Open", values: undefined } as Admission),
    deposit: c.deposit,
    feeAllowance: c.fee_allowance,
    capacity: c.capacity,
    policy: c.policy,
    reserved: reserved.result,
    checkedIn: checkedIn.result,
    phase: phase.result.tag,
  };
}

/**
 * Where one wallet stands with one event, straight from the contract.
 *
 * `reserved` and `checkedIn` are already on `EventState`, so this is only ever
 * needed for the three states that are *not* lists: `Applied`, `Approved` and
 * `Declined` exist under `Admission::Approval` and nothing enumerates them. A
 * host cannot list their own applicants either — the contract publishes an
 * event when somebody applies and stores the answer per address, and that is
 * the whole surface.
 *
 * `null` means no record, which is what never having asked looks like.
 */
export async function loadStanding(id: string, guest: string): Promise<string | null> {
  const tx = await eventClient(id).get_attendance({ guest });
  return tx.result?.tag ?? null;
}

/**
 * Which of these addresses are still waiting on an answer.
 *
 * The contract has no `get_applicants`: it publishes an event when somebody
 * applies and stores the answer per address, so a host's queue has to be
 * assembled from the history and then checked. Both halves are needed.
 *
 * The history alone is not enough because it is not guaranteed complete —
 * Soroban RPC keeps about a week and the archive only reaches as far back as it
 * has been swept, so a feed that has lost an `answered` row would show a host an
 * applicant they have already turned down, with a button to turn them down
 * again. The contract alone is not enough either, because nothing on it can
 * enumerate who ever asked.
 *
 * So: candidates from the feed, truth from the contract. Only `Applied`
 * survives, which is also exactly the set `approve` and `decline` will accept.
 */
export async function loadApplicants(id: string, candidates: string[]): Promise<string[]> {
  const settled = await Promise.all(
    candidates.map(async (guest) => {
      try {
        return (await loadStanding(id, guest)) === "Applied" ? guest : null;
      } catch {
        // One unreadable address must not empty a queue. Dropping it shows the
        // host a shorter list; failing the lot shows them none at all.
        return null;
      }
    }),
  );
  return settled.filter((a): a is string => a !== null);
}

/**
 * How many members have put their record behind `guest` at this event.
 *
 * Per event, not per person: a vouch is a decision about one door, and somebody
 * vouched into a coffee morning has not been vouched into anything else. The
 * count is the contract's own, so it is the number `rsvp` will compare against
 * the threshold rather than the number a feed happens to have seen.
 */
export async function loadVouches(id: string, guest: string): Promise<number> {
  const tx = await eventClient(id).get_vouches({ guest });
  return Number(tx.result);
}

export function spotsLeft(e: EventState): number {
  return e.capacity - e.reserved.length;
}

export function attendanceOf(
  e: EventState,
  address: string | null,
): "none" | "reserved" | "checked-in" {
  if (!address) return "none";
  if (e.checkedIn.includes(address)) return "checked-in";
  if (e.reserved.includes(address)) return "reserved";
  return "none";
}

/**
 * A guest's stake is only settled once they check in, so a reserved-but-absent
 * guest is exactly what the forfeit pool is made of.
 */
export function forfeitPool(e: EventState): bigint {
  const noShows = BigInt(e.reserved.length - e.checkedIn.length);
  return e.deposit * noShows;
}

/**
 * Where and when something happened, carried by every row in the feed.
 *
 * `at` is the ledger's close time rather than anything this process observed.
 * The feed used to be read seconds after the fact, so "now" was close enough to
 * the truth to leave out; an archived feed is read months later, and a history
 * that cannot say when is not a history.
 */
type Occurred = {
  ledger: number;
  txHash: string;
  /** ms since epoch, from the ledger's close time. */
  at: number;
};

export type Activity = Occurred &
  (
    | { kind: "created"; organizer: string; title: string }
    | { kind: "phase_changed"; phase: Phase["tag"] }
    | { kind: "reserved"; guest: string; spotsLeft: number }
    | { kind: "checked_in"; guest: string; refunded: bigint }
    | { kind: "finalized"; showed: number; noShows: number; forfeited: bigint }
    // Admission and co-hosting. Everything above is about money moving; these
    // are about who was let near it, which is the other half of what an
    // organizer is accountable for and was invisible until now.
    | { kind: "applied"; applicant: string }
    | { kind: "answered"; applicant: string; approved: boolean }
    | { kind: "host_added"; host: string }
    | { kind: "host_removed"; host: string }
    // A vouch is the one row here that commits somebody other than the person
    // acting, so leaving it out of the history would hide the only thing on this
    // feed that a third party is on the hook for.
    | { kind: "vouched"; voucher: string; guest: string; vouches: number }
  );

/**
 * Identity of a row, stable across every source it can arrive from.
 *
 * One transaction publishes at most one event of a given kind — `finalize`
 * emits `finalized` and `phase_changed` together, and they are two rows — so
 * the pair is unique. It is the React key, the Firestore document id and the
 * dedupe key when the live feed and the archive overlap, deliberately: three
 * places that must agree on when two rows are the same row.
 */
export function activityId(a: Pick<Activity, "kind" | "txHash">): string {
  return `${a.txHash}-${a.kind}`;
}

/** A getEvents cursor is "<toid>-<index>"; the ledger is the toid's high bits. */
function cursorLedger(cursor: string): number {
  const [toid] = cursor.split("-");
  try {
    return Number(BigInt(toid) >> 32n);
  } catch {
    return 0;
  }
}

/**
 * Activity, plus whether this is all of it.
 *
 * `truncated` is the honest half. Paging stops early on a failed request or on
 * hitting `maxPages`, and a shortened feed looks exactly like a quiet event —
 * so the caller is told, rather than left to present a partial history as a
 * complete one.
 */
export type ActivityFeedResult = { activity: Activity[]; truncated: boolean };

/**
 * Page `getEvents` forward from a ledger until the scan catches the head.
 *
 * getEvents scans a bounded slice of ledgers per call — roughly 10k, regardless
 * of `limit` — and hands back a cursor to continue from. A single call starting
 * a day back therefore returns *zero* events and no error, because the slice it
 * scanned ends long before anything happened. An empty page is not the end of
 * the results; only a cursor that has caught up with the head is.
 */
async function sweep(
  contractIds: string[],
  startLedger: number,
  maxPages: number,
  deadline = Infinity,
): Promise<{ raw: rpc.Api.EventResponse[]; truncated: boolean; sweptTo: number }> {
  const filters = [{ type: "contract" as const, contractIds }];
  const latest = await server.getLatestLedger();

  const raw: rpc.Api.EventResponse[] = [];
  let cursor: string | undefined;
  let truncated = false;
  let sweptTo = startLedger;

  for (let page = 0; page < maxPages; page++) {
    let res: rpc.Api.GetEventsResponse;
    try {
      res = await server.getEvents(
        cursor ? { cursor, filters, limit: 200 } : { startLedger, filters, limit: 200 },
      );
    } catch {
      // Keep whatever we already have rather than losing the feed — but say so,
      // because a feed that stops early is otherwise a feed that looks finished.
      truncated = true;
      break;
    }
    raw.push(...res.events);
    if (!res.cursor) {
      sweptTo = latest.sequence;
      break;
    }
    cursor = res.cursor;
    sweptTo = cursorLedger(res.cursor);
    if (sweptTo >= latest.sequence) break;
    // Ran out of pages, or out of time, before reaching the present: there is
    // more up there. `sweptTo` says exactly where to resume.
    if (page === maxPages - 1 || Date.now() > deadline) {
      truncated = true;
      break;
    }
  }

  return { raw, truncated, sweptTo };
}

/**
 * Turn raw contract events into feed rows, newest last.
 *
 * `eventId` is what makes the factory's `event_created` belong here: the sweep
 * that wants it has to ask the factory, which answers for every event it has
 * ever deployed, so the one row about *this* event is picked out by hand.
 */
function decodeActivity(raw: rpc.Api.EventResponse[], eventId: string): Activity[] {
  const out: Activity[] = [];

  for (const e of raw) {
    const topic = e.topic.map((t) => scValToNative(t));
    const name = String(topic[0] ?? "");
    const data = scValToNative(e.value) as Record<string, unknown>;
    const where = { ledger: e.ledger, txHash: e.txHash, at: Date.parse(e.ledgerClosedAt) || 0 };

    if (name === "event_created") {
      if (String(data.event) !== eventId) continue;
      out.push({
        kind: "created",
        organizer: String(data.organizer),
        title: String(data.title ?? ""),
        ...where,
      });
    } else if (name === "phase_changed") {
      // A unit enum variant comes back as a single-element array, e.g.
      // { phase: ["CheckingIn"] } — not a bare string and not { tag }.
      const raw = data.phase;
      const tag = Array.isArray(raw) ? String(raw[0]) : String(raw);
      out.push({ kind: "phase_changed", phase: tag as Phase["tag"], ...where });
    } else if (name === "reserved") {
      out.push({
        kind: "reserved",
        guest: String(data.guest),
        spotsLeft: Number(data.spots_left ?? 0),
        ...where,
      });
    } else if (name === "checked_in") {
      out.push({
        kind: "checked_in",
        guest: String(data.guest),
        refunded: BigInt(String(data.refunded ?? 0)),
        ...where,
      });
    } else if (name === "application_received") {
      out.push({ kind: "applied", applicant: String(data.applicant), ...where });
    } else if (name === "application_answered") {
      out.push({
        kind: "answered",
        applicant: String(data.applicant),
        // One event carries both answers, so this flag is the whole difference
        // between a guest list and a rubber stamp. Defaulting it to `true`
        // would turn every decline in the archive into an approval.
        approved: data.approved === true,
        ...where,
      });
    } else if (name === "vouched") {
      // Topic name and field names taken from a real `vouch` on Testnet, not
      // from the Rust struct's spelling — the two have diverged before.
      out.push({
        kind: "vouched",
        voucher: String(data.voucher),
        guest: String(data.guest),
        vouches: Number(data.vouches ?? 0),
        ...where,
      });
    } else if (name === "host_added") {
      out.push({ kind: "host_added", host: String(data.host), ...where });
    } else if (name === "host_removed") {
      out.push({ kind: "host_removed", host: String(data.host), ...where });
    } else if (name === "finalized") {
      out.push({
        kind: "finalized",
        showed: Number(data.showed ?? 0),
        noShows: Number(data.no_shows ?? 0),
        forfeited: BigInt(String(data.forfeited ?? 0)),
        ...where,
      });
    }
  }

  return out;
}

/**
 * The live feed: what this contract has done lately.
 *
 * Bounded on purpose, twice over. Soroban RPC only retains recent history (see
 * getHealth's oldestLedger), and this only looks a day into it, because it runs
 * on a five-second poll in a browser. Everything older comes out of the archive
 * (`activity-archive.ts`), which is written from the sweep below.
 */
export async function fetchActivity(
  contractId: string,
  lookback = 17_280, // ~24h at ~5s/ledger
  maxPages = 6,
): Promise<ActivityFeedResult> {
  const [latest, health] = await Promise.all([server.getLatestLedger(), server.getHealth()]);
  const startLedger = Math.max(health.oldestLedger, latest.sequence - lookback, 1);

  const { raw, truncated } = await sweep([contractId], startLedger, maxPages);
  return { activity: decodeActivity(raw, contractId).reverse(), truncated };
}

/**
 * Everything the RPC still holds about one event, for archiving.
 *
 * The counterpart to `fetchActivity`, and the reason the archive can be written
 * at all: it reaches back to the oldest ledger the node has rather than a day,
 * and it asks the factory as well as the event, so a first sweep picks up the
 * `event_created` that proves the archive starts at the beginning.
 *
 * Deliberately not called from the browser. It is minutes of RPC paging in the
 * worst case, which is fine on a server once and unacceptable on a poll.
 */
export async function sweepEventActivity(
  eventId: string,
  factoryId: string,
  {
    from,
    maxPages = 24,
    deadline = Infinity,
  }: { from?: number; maxPages?: number; deadline?: number } = {},
): Promise<{ activity: Activity[]; truncated: boolean; sweptFrom: number; sweptTo: number }> {
  const health = await server.getHealth();
  // The retained range moves while it is being read, so the floor comes from the
  // server rather than from arithmetic on the head.
  const sweptFrom = Math.max(health.oldestLedger, from ?? 0, 1);

  const { raw, truncated, sweptTo } = await sweep(
    [eventId, factoryId],
    sweptFrom,
    maxPages,
    deadline,
  );
  return { activity: decodeActivity(raw, eventId), truncated, sweptFrom, sweptTo };
}
