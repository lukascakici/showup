/**
 * Collect Deliverable 3's evidence off the chain, as markdown.
 *
 *   node scripts/collect-evidence.mjs <EVENT_ID>
 *
 * SOW §6.1 asks for 10+ attendee wallet addresses, each with its `rsvp` and
 * `check_in` transaction hashes, plus the finalised event's address. This prints
 * exactly that, in the shape the run sheet's tables want, ready to paste into
 * the README.
 *
 * Everything comes from contract events, and nothing from a contract read. That
 * is the point: a row assembled from `get_reserved` would list a guest with no
 * transaction behind them, and a hash is the only part a reviewer can check. If
 * it isn't in an event, it doesn't go in the table.
 *
 * Run it the night of the event, right after finalize — see the retention
 * warning below.
 */

import { rpc, scValToNative } from "@stellar/stellar-sdk";

const RPC_URL = "https://soroban-testnet.stellar.org";
const FACTORY_ID = "CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE";
const EXPLORER = "https://stellar.expert/explorer/testnet";

const server = new rpc.Server(RPC_URL);

const short = (s, head = 8, tail = 6) =>
  s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;

// Full values, not abbreviated ones. These tables are the evidence a reviewer
// checks, and an elided hash cannot be copied, pasted or compared — only clicked,
// which assumes the link goes where the text claims. The tables come out wide;
// GitHub scrolls them, and being able to verify beats being able to skim.
const txLink = (hash) => (hash ? `[\`${hash}\`](${EXPLORER}/tx/${hash})` : "—");
const accountLink = (address) => `[\`${address}\`](${EXPLORER}/account/${address})`;

const xlm = (stroops) => (Number(stroops) / 1e7).toFixed(2);

/**
 * Every event either contract published, oldest first.
 *
 * Paginated to exhaustion rather than to a lookback window. The app's feed
 * deliberately stops at ~24h because it is a feed; this is a record, so it takes
 * everything the RPC still holds.
 */
async function fetchEvents(contractIds) {
  const [latest, health] = await Promise.all([server.getLatestLedger(), server.getHealth()]);
  // The RPC's retained range moves while you read it, so the floor comes from
  // the server rather than from arithmetic on the latest sequence.
  const startLedger = health.oldestLedger;
  const filters = [{ type: "contract", contractIds }];

  const out = [];
  let cursor;
  let pages = 0;
  // Each call scans a bounded window of about ten thousand ledgers and returns
  // *whatever matched inside it* — which is usually nothing, since a single
  // event contract is silent for days at a time. So an empty page is not the
  // end of the results; only a cursor that has caught up with the head is.
  // Stopping on `events.length === 0` reported this event as having no
  // reservations while six were plainly on chain.
  const cap = Math.ceil((latest.sequence - startLedger) / 5_000) + 10;
  for (;;) {
    const res = await server.getEvents(
      cursor ? { cursor, filters, limit: 200 } : { startLedger, filters, limit: 200 },
    );
    out.push(...res.events);
    pages += 1;
    if (!res.cursor) break;
    cursor = res.cursor;
    if (cursorLedger(res.cursor) >= latest.sequence) break;
    if (pages >= cap) {
      console.error(
        `\nWARNING: stopped after ${pages} pages at ledger ${cursorLedger(cursor)}, short of ` +
          `${latest.sequence}. The table below is incomplete — re-run it.`,
      );
      break;
    }
  }
  return { events: out, oldestLedger: startLedger, latestLedger: latest.sequence, pages };
}

/** A getEvents cursor is "<toid>-<index>"; the ledger is the toid's high bits. */
function cursorLedger(cursor) {
  const [toid] = cursor.split("-");
  try {
    return Number(BigInt(toid) >> 32n);
  } catch {
    return 0;
  }
}

function decode(e) {
  const topic = e.topic.map((t) => scValToNative(t));
  return {
    name: String(topic[0] ?? ""),
    data: scValToNative(e.value),
    ledger: e.ledger,
    at: e.ledgerClosedAt,
    txHash: e.txHash,
    contractId: e.contractId?.toString?.() ?? String(e.contractId ?? ""),
  };
}

function report(eventId, decoded) {
  const mine = decoded.filter((d) => d.contractId === eventId);

  const created = decoded.find((d) => d.name === "event_created" && d.data?.event === eventId);
  const phases = mine.filter((d) => d.name === "phase_changed");
  const finalized = mine.find((d) => d.name === "finalized");

  // Insertion order is chain order, so the table comes out in the order people
  // actually reserved — which is also the order they will recognise.
  const guests = new Map();
  for (const d of mine) {
    if (d.name === "reserved") {
      const g = String(d.data.guest);
      if (!guests.has(g)) guests.set(g, { rsvp: d.txHash, checkIn: null, refunded: 0n });
    } else if (d.name === "checked_in") {
      const g = String(d.data.guest);
      const row = guests.get(g) ?? { rsvp: null, checkIn: null, refunded: 0n };
      row.checkIn = d.txHash;
      row.refunded = BigInt(String(d.data.refunded ?? 0));
      guests.set(g, row);
    }
  }

  const showed = [...guests.values()].filter((g) => g.checkIn).length;

  const lines = [];
  lines.push("**Event**", "", "| | |", "| --- | --- |");
  lines.push(`| Event contract | [\`${eventId}\`](${EXPLORER}/contract/${eventId}) |`);
  if (created) {
    lines.push(`| Title | ${created.data.title} |`);
    lines.push(`| Organizer | ${accountLink(String(created.data.organizer))} |`);
  }
  lines.push(`| \`create_event\` tx | ${txLink(created?.txHash)} |`);
  // Listed rather than singular: `reopen_rsvp` means check-in can legitimately
  // be opened more than once, and hiding the second one would misdescribe the night.
  for (const p of phases) {
    const to = Array.isArray(p.data.phase) ? p.data.phase[0] : p.data.phase;
    lines.push(`| → \`${to}\` tx | ${txLink(p.txHash)} |`);
  }
  lines.push(`| \`finalize\` tx | ${txLink(finalized?.txHash)} |`);
  lines.push(`| Reserved / showed | ${guests.size} / ${showed} |`);
  if (finalized) {
    lines.push(`| Forfeited and split | ${xlm(finalized.data.forfeited ?? 0)} XLM |`);
  }

  lines.push("", "**Attendees**", "");
  lines.push("| # | Wallet address | `rsvp` tx | `check_in` tx | Showed |");
  lines.push("| --- | --- | --- | --- | --- |");
  let i = 0;
  for (const [address, row] of guests) {
    i += 1;
    lines.push(
      `| ${i} | ${accountLink(address)} | ${txLink(row.rsvp)} | ${txLink(row.checkIn)} | ${row.checkIn ? "yes" : "no"} |`,
    );
  }

  return { markdown: lines.join("\n"), guests: guests.size, showed, finalized: Boolean(finalized) };
}

const eventId = process.argv[2];
if (!eventId || !/^C[A-Z2-7]{55}$/.test(eventId)) {
  console.error("usage: node scripts/collect-evidence.mjs <EVENT_ID>");
  process.exit(2);
}

const { events, oldestLedger, latestLedger, pages } = await fetchEvents([eventId, FACTORY_ID]);
const decoded = events.map(decode);
const result = report(eventId, decoded);

console.log(result.markdown);
console.log("");
console.log(`<!-- ${result.guests} reserved, ${result.showed} checked in`);
console.log(
  `     read from ledgers ${oldestLedger}–${latestLedger} in ${pages} pages at ${new Date().toISOString()} -->`,
);

// The failure this script exists to prevent. The RPC keeps roughly a week of
// ledgers and then drops them; once an `rsvp` falls off the back, its hash is
// unrecoverable from here and the row can never be filled in. A missing
// `create_event` is the tell that the window has already started eating the
// evidence.
if (!decoded.some((d) => d.name === "event_created" && d.data?.event === eventId)) {
  console.error(
    "\nWARNING: no event_created found for this event. Either it was not created by " +
      `factory ${short(FACTORY_ID)}, or the RPC has already dropped the ledger it was ` +
      "created in — in which case earlier rsvp hashes may be gone too. Check the table above " +
      "against the reserved count from get_reserved before publishing it.",
  );
}
if (!result.finalized) {
  console.error("\nNote: no finalized event yet, so this is a mid-run snapshot.");
}
