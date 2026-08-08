import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { factory, event as eventClient, SOROBAN_RPC_URL, type ForfeitPolicy } from "./contracts";
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

export async function loadEvent(id: string): Promise<EventState> {
  const client = eventClient(id);
  const [config, reserved, checkedIn, phase] = await Promise.all([
    client.get_config(),
    client.get_reserved(),
    client.get_checked_in(),
    client.get_phase(),
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
    deposit: c.deposit,
    feeAllowance: c.fee_allowance,
    capacity: c.capacity,
    policy: c.policy,
    reserved: reserved.result,
    checkedIn: checkedIn.result,
    phase: phase.result.tag,
  };
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

export type Activity =
  | { kind: "phase_changed"; phase: Phase["tag"]; ledger: number; txHash: string }
  | { kind: "reserved"; guest: string; spotsLeft: number; ledger: number; txHash: string }
  | { kind: "checked_in"; guest: string; refunded: bigint; ledger: number; txHash: string }
  | {
      kind: "finalized";
      showed: number;
      noShows: number;
      forfeited: bigint;
      ledger: number;
      txHash: string;
    };

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
 * Read the contract's own events off the ledger.
 *
 * getEvents scans a bounded slice of ledgers per call — roughly 10k, regardless
 * of `limit` — and hands back a cursor to continue from. A single call starting
 * a day back therefore returns *zero* events and no error, because the slice it
 * scanned ends long before anything happened. So page forward until the scan
 * reaches the present.
 *
 * The lookback is also bounded: Soroban RPC only retains recent history (see
 * getHealth's oldestLedger), so this feed is recent activity, not the whole
 * story. Contract state is what the UI trusts for who's reserved and who showed.
 */
export async function fetchActivity(
  contractId: string,
  lookback = 17_280, // ~24h at ~5s/ledger
  maxPages = 6,
): Promise<Activity[]> {
  const filters = [{ type: "contract" as const, contractIds: [contractId] }];
  const [latest, health] = await Promise.all([server.getLatestLedger(), server.getHealth()]);
  const startLedger = Math.max(health.oldestLedger, latest.sequence - lookback, 1);

  const raw: rpc.Api.EventResponse[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    let res: rpc.Api.GetEventsResponse;
    try {
      res = await server.getEvents(
        cursor ? { cursor, filters, limit: 200 } : { startLedger, filters, limit: 200 },
      );
    } catch {
      break; // Keep whatever we already have rather than losing the feed.
    }
    raw.push(...res.events);
    if (!res.cursor) break;
    cursor = res.cursor;
    if (cursorLedger(res.cursor) >= latest.sequence) break;
  }

  const out: Activity[] = [];
  for (const e of raw) {
    const topic = e.topic.map((t) => scValToNative(t));
    const name = String(topic[0] ?? "");
    const data = scValToNative(e.value) as Record<string, unknown>;
    const ledger = e.ledger;
    const txHash = e.txHash;

    if (name === "phase_changed") {
      // A unit enum variant comes back as a single-element array, e.g.
      // { phase: ["CheckingIn"] } — not a bare string and not { tag }.
      const raw = data.phase;
      const tag = Array.isArray(raw) ? String(raw[0]) : String(raw);
      out.push({ kind: "phase_changed", phase: tag as Phase["tag"], ledger, txHash });
    } else if (name === "reserved") {
      out.push({
        kind: "reserved",
        guest: String(data.guest),
        spotsLeft: Number(data.spots_left ?? 0),
        ledger,
        txHash,
      });
    } else if (name === "checked_in") {
      out.push({
        kind: "checked_in",
        guest: String(data.guest),
        refunded: BigInt(String(data.refunded ?? 0)),
        ledger,
        txHash,
      });
    } else if (name === "finalized") {
      out.push({
        kind: "finalized",
        showed: Number(data.showed ?? 0),
        noShows: Number(data.no_shows ?? 0),
        forfeited: BigInt(String(data.forfeited ?? 0)),
        ledger,
        txHash,
      });
    }
  }
  return out.reverse();
}
