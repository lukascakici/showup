#!/usr/bin/env node
/**
 * Snapshot every published wallet's reputation score straight off the ledger,
 * and compare two snapshots.
 *
 * The reputation contract holds the first engagement's results, and the README
 * publishes them as Deliverable 2 evidence: *these wallets showed up, this many
 * times, and the chain says so.* The contract is upgradeable in place, which is
 * the whole point of it keeping one address forever — but it means every upgrade
 * is a moment where that published claim could quietly stop being true.
 *
 * So: take a snapshot before the upgrade, take another after, and diff them.
 *
 *   node scripts/reputation-snapshot.mjs --out private/before.json
 *   # ...upgrade...
 *   node scripts/reputation-snapshot.mjs --against private/before.json
 *
 * A difference is a hard failure. Nothing else about an upgrade matters if a
 * score moved, because a score that moves on its own is not a record.
 *
 * **Keyless, like `check-wasm-hash.mjs`.** `stellar contract read` needs no
 * source account, no signature and no XLM, so a reviewer can run this against
 * the addresses in the README and get the same numbers we publish. That is the
 * point: evidence anyone can re-derive is worth more than a screenshot of ours.
 *
 * It reads *storage* rather than calling `get_score`, for the same reason. An
 * invoke — even a read-only one — needs a funded source account to simulate
 * against; storage does not. The stored entry is also the more primitive fact:
 * it is what the contract would have to be lying about.
 *
 * Addresses come from `docs/deployments.md`, every `G…` in it, because that file
 * is the record of who took part. Nothing is hardcoded here, so an event run
 * next month is covered by writing it up, which we do anyway.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const README = "README.md";
const DEPLOYMENTS = "docs/deployments.md";
const NETWORK = "testnet";

// | **Reputation ledger** | [`CDFG…`](https://stellar.expert/…) |
const LEDGER_ROW = /\|\s*\*\*Reputation ledger\*\*\s*\|[^|]*?`(C[A-Z2-7]{55})`/;
const ACCOUNT = /\bG[A-Z2-7]{55}\b/g;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1] ?? fail(`${flag} needs a file path.`);
}

const out = arg("--out");
const against = arg("--against");

const readme = readFileSync(README, "utf8");
const match = readme.match(LEDGER_ROW);
if (!match) {
  fail(
    `Couldn't find the "Reputation ledger" row in ${README}.\n` +
      "It must stay a table row of the shape:\n\n" +
      "  | **Reputation ledger** | [`C…`](…) |\n\n" +
      "If the table was restructured, update the pattern here — don't drop the\n" +
      "row, it is Deliverable 2 evidence.",
  );
}
const ledger = match[1];

// Deduped, and left in the order the record introduces them, which is the order
// a reader of docs/deployments.md meets them.
const members = [...new Set(readFileSync(DEPLOYMENTS, "utf8").match(ACCOUNT) ?? [])];
if (members.length === 0) {
  fail(`No wallet addresses found in ${DEPLOYMENTS}. Nothing to snapshot.`);
}

/**
 * One member's stored `Score`, or `null` where the ledger has never seen them.
 *
 * "Never seen" is a real answer, not an error: an organizer who has only ever
 * run events has no attendance, and a snapshot that omitted them would be one
 * that couldn't notice a score appearing out of nowhere.
 */
function score(member) {
  const key = JSON.stringify({ vec: [{ symbol: "Score" }, { address: member }] });
  let raw;
  try {
    raw = execFileSync(
      "stellar",
      [
        "contract",
        "read",
        "--id",
        ledger,
        "--network",
        NETWORK,
        "--durability",
        "persistent",
        "--key",
        key,
        "--output",
        "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 },
    );
  } catch (err) {
    const detail = String(err.stderr || err.message || "").trim();
    if (/no matching contract data entries/i.test(detail)) return null;
    // Anything else — an unreachable RPC, a wrong address — fails the run. A
    // snapshot with holes in it is worse than no snapshot, because the holes
    // read as "no record" the next time it's compared against.
    fail(`Couldn't read ${member}'s score from ${ledger}:\n\n${detail}`);
  }

  // `<key json>,<val json>,<ledger>,<liveUntilLedger>` as CSV, with the JSON's
  // own quotes doubled. Take the value field the same careful way
  // check-wasm-hash.mjs does.
  const separator = raw.indexOf('","');
  if (separator === -1) fail(`Unexpected output from \`stellar contract read\`:\n\n${raw}`);

  let json = "";
  let i = separator + 3;
  for (; i < raw.length; i++) {
    if (raw[i] !== '"') {
      json += raw[i];
      continue;
    }
    if (raw[i + 1] === '"') {
      json += '"';
      i++;
      continue;
    }
    break;
  }
  if (i >= raw.length) fail(`Unterminated field in \`stellar contract read\` output:\n\n${raw}`);

  let entries;
  try {
    entries = JSON.parse(json).map;
  } catch {
    fail(`Couldn't parse ${member}'s score out of:\n\n${raw}`);
  }
  if (!Array.isArray(entries)) fail(`${member}'s stored score is not a struct:\n\n${json}`);

  // A `#[contracttype]` struct is a map keyed by field name, and the keys sort
  // on the wire — so read them by name rather than by position. `{no_shows,
  // shows}` and `{shows, no_shows}` are the same entry.
  const field = (name) => entries.find((e) => e.key?.symbol === name)?.val?.u32;
  const shows = field("shows");
  const no_shows = field("no_shows");
  if (shows === undefined || no_shows === undefined) {
    fail(
      `${member}'s stored score is missing a field the contract promises:\n\n${json}\n\n` +
        "If `Score` grew a field, that is the frozen-struct rule broken — every\n" +
        "entry written by the old wasm is now undecodable. See the doc comment on\n" +
        "`Score` in contracts/reputation/src/lib.rs.",
    );
  }
  return { shows, no_shows };
}

const snapshot = {};
for (const member of members) {
  snapshot[member] = score(member);
}

const held = members.filter((m) => snapshot[m] !== null);
for (const member of held) {
  const { shows, no_shows } = snapshot[member];
  console.log(`${member}  shows ${shows}  no-shows ${no_shows}`);
}
console.log(
  `\n${held.length} of ${members.length} wallets in ${DEPLOYMENTS} have a record at ${ledger.slice(0, 8)}…`,
);

if (out) {
  writeFileSync(out, `${JSON.stringify({ ledger, network: NETWORK, scores: snapshot }, null, 2)}\n`);
  console.log(`\nwrote  ${out}`);
}

if (against) {
  const before = JSON.parse(readFileSync(against, "utf8"));
  if (before.ledger !== ledger) {
    fail(
      `${against} was taken against ${before.ledger}, not ${ledger}.\n` +
        "Comparing two different contracts would say nothing about either.",
    );
  }

  const show = (s) => (s === null ? "no record" : `shows ${s.shows}, no-shows ${s.no_shows}`);
  const moved = [];
  for (const member of new Set([...Object.keys(before.scores), ...members])) {
    const then = before.scores[member] ?? null;
    const now = member in snapshot ? snapshot[member] : null;
    if (JSON.stringify(then) !== JSON.stringify(now)) {
      moved.push(`  ${member}\n    was  ${show(then)}\n    now  ${show(now)}`);
    }
  }

  if (moved.length > 0) {
    fail(
      `${moved.length} record(s) changed since ${against}:\n\n${moved.join("\n\n")}\n\n` +
        "If nothing was supposed to have happened between the two snapshots, this\n" +
        "is an upgrade that ate published evidence. Do not carry on: the first\n" +
        "engagement's results are a claim in the README, and they just stopped\n" +
        "being true.",
    );
  }
  console.log(`\nok     every record is exactly as ${against} left it`);
}
