#!/usr/bin/env node
/**
 * Fail if a README-published event wasm hash isn't the one that network's
 * deployed factory actually uses.
 *
 * The factory deploys events by wasm hash, so that hash is the join between this
 * repo and the contracts running on a network. The README publishes it as
 * Deliverable 1 and 2 evidence — a claim a reviewer is expected to check — and
 * nothing was checking it. It sat at v1's `96cd1eb6…` through two contract
 * revisions and a redeploy before the week 2 audit caught it by hand.
 *
 * **This asks the chain, not the compiler.** The first version of this script
 * compared the README against `sha256(target/wasm32v1-none/release/event.wasm)`,
 * on the assumption that the build is reproducible. It isn't: the same source,
 * the same pinned rustc 1.96.0, the same locked soroban-sdk 27.0.0 and the same
 * stellar CLI 27.0.0 produce one hash on macOS/arm64 and a different one on
 * Linux/x64. The wasm's own metadata sections carry only those version strings,
 * so the difference is codegen across host platforms. CI went red on its first
 * run and was right to — the check was wrong, not the repo.
 *
 * Reading the chain also happens to be the stronger check. A local build tells
 * you what this machine compiles; the factory's `EventWasmHash` tells you what
 * a guest's deposit is actually going to be governed by.
 *
 * Every value it compares comes out of README.md — each network's factory
 * address and hash — so the deployed-contracts tables verify themselves.
 *
 * ## Two networks
 *
 * Showup serves Mainnet and Testnet from one build, so the README will publish
 * two tables and **both** have to be true. Each network is found by its own
 * heading and checked independently: a mismatch on either fails the build, and
 * a network the README has no table for is simply not checked — which is how
 * this stays quiet until the Mainnet contracts exist, and starts checking them
 * the moment the table is written rather than when somebody remembers to come
 * back here.
 *
 * Read-only: `stellar contract read` needs no source account, no key and no
 * XLM. It does need the network, so an unreachable RPC is reported and skipped
 * rather than failed. A mismatch is always a hard failure; only "couldn't ask"
 * is soft. Losing the check on a bad network day is better than a red build
 * nobody trusts, and it runs again on the next push.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const README = "README.md";

/**
 * Which section each network's table lives under.
 *
 * Matched on the heading rather than on the whole file, because two tables of
 * identical shape otherwise collapse into whichever appears first — and the
 * failure mode of that is the worst one available here: Testnet's hash
 * silently standing in for Mainnet's, reporting `ok` for a network nobody
 * checked.
 */
const NETWORKS = [
  { id: "testnet", heading: /^###\s+Deployed contracts \(Testnet\)\s*$/m },
  { id: "mainnet", heading: /^###\s+Deployed contracts \(Mainnet\)\s*$/m },
];

// Rows of a deployed-contracts table, e.g.
// | **Event factory** | [`CD5A…`](https://stellar.expert/…) |
// | **Event wasm hash** | `8fe992b8…` |
const FACTORY_ROW = /\|\s*\*\*Event factory\*\*\s*\|[^|]*?`(C[A-Z2-7]{55})`/;
const HASH_ROW = /\|\s*\*\*Event wasm hash\*\*\s*\|\s*`([0-9a-f]{64})`\s*\|/;

const failures = [];
const skipped = [];
const checked = [];

function fail(message) {
  failures.push(message);
}

const readme = readFileSync(README, "utf8");

/**
 * The slice of the README from one heading to the next heading of any level.
 *
 * `null` when the heading isn't there at all, which is a network this repo has
 * not deployed to yet rather than an error.
 */
function sectionFor(heading) {
  const start = readme.match(heading);
  if (!start) return null;
  const from = start.index + start[0].length;
  const rest = readme.slice(from);
  const next = rest.match(/^#{1,6}\s/m);
  return next ? rest.slice(0, next.index) : rest;
}

function row(section, network, pattern, what, shape) {
  const match = section.match(pattern);
  if (!match) {
    fail(
      `Couldn't find the "${what}" row under the ${network} deployed-contracts heading.\n` +
        `It must stay a table row of the shape:\n\n  ${shape}\n\n` +
        `If the table was restructured, update the pattern in this script — don't\n` +
        `drop the row, it is Deliverable 1 and 2 evidence.`,
    );
    return null;
  }
  return match[1];
}

/**
 * The factory keeps `EventWasmHash` in *instance* storage, which `--key` can't
 * address (it only reaches persistent entries), so this reads the whole
 * instance and picks the entry out. Output is CSV whose second field is a JSON
 * blob with its quotes doubled.
 *
 * Returns `null` on a soft outcome — unreachable network, or a failure already
 * recorded — so the caller stops without taking the whole run down with it.
 */
function readInstanceStorage(contractId, network) {
  let raw;
  try {
    raw = execFileSync(
      "stellar",
      [
        "contract",
        "read",
        "--id",
        contractId,
        "--network",
        network,
        "--durability",
        "persistent",
        "--output",
        "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 },
    );
  } catch (err) {
    const detail = String(err.stderr || err.message || "").trim();
    // "Nothing is deployed there" is a false claim in the README, not a bad
    // network day, so it must not take the soft path out.
    if (/no matching contract data entries|contract .*not found/i.test(detail)) {
      fail(
        `${README} names ${contractId} as the ${network} event factory, but ${network}\n` +
          `has nothing deployed at that address.\n\n${detail}`,
      );
      return null;
    }
    skipped.push(
      `couldn't reach ${network} to read ${contractId}: ${detail}\n` +
        `       ${network}'s published hash was NOT verified this run.`,
    );
    return null;
  }

  // Field 2 of `<key>,<json>,<ledger>,<liveUntilLedger>`. Parsed properly rather
  // than sliced to the end: the two trailing ledger numbers sit outside the
  // quotes, so "take everything after the comma" swallows them and the JSON
  // never parses.
  const separator = raw.indexOf('","');
  if (separator === -1) {
    fail(`Unexpected output from \`stellar contract read\` on ${network}:\n\n${raw}`);
    return null;
  }

  let json = "";
  let i = separator + 3; // past `","`, now inside the quoted field
  for (; i < raw.length; i++) {
    if (raw[i] !== '"') {
      json += raw[i];
      continue;
    }
    if (raw[i + 1] === '"') {
      json += '"'; // a doubled quote is one literal quote
      i++;
      continue;
    }
    break; // a lone quote closes the field
  }
  if (i >= raw.length) {
    fail(`Unterminated field in \`stellar contract read\` output on ${network}:\n\n${raw}`);
    return null;
  }

  try {
    return JSON.parse(json).contract_instance.storage;
  } catch {
    fail(`Couldn't parse the contract instance out of:\n\n${raw}`);
    return null;
  }
}

function check({ id: network, heading }) {
  const section = sectionFor(heading);
  if (!section) return; // not deployed there yet — nothing to be wrong about

  const factory = row(section, network, FACTORY_ROW, "Event factory", "| **Event factory** | [`C…`](…) |");
  const published = row(section, network, HASH_ROW, "Event wasm hash", "| **Event wasm hash** | `<64 hex>` |");
  if (!factory || !published) return;

  const storage = readInstanceStorage(factory, network);
  if (!storage) return;

  const entry = storage.find((e) => e.key?.vec?.[0]?.symbol === "EventWasmHash");
  if (!entry) {
    fail(
      `${factory} has no EventWasmHash in its instance storage on ${network}.\n` +
        `Either the README names something that isn't the factory, or the factory\n` +
        `was never initialized.`,
    );
    return;
  }

  const deployed = entry.val?.bytes;
  if (deployed !== published) {
    fail(
      `${README} publishes a ${network} event wasm hash the factory isn't using.\n\n` +
        `  README claims:  ${published}\n` +
        `  factory uses:   ${deployed}\n\n` +
        `Events are deployed from the factory's hash, so the README is describing a\n` +
        `contract nobody is running. Either correct the table, or — if the intent\n` +
        `was to ship a new event contract — upload it and point the factory at it:\n\n` +
        `  stellar contract upload --wasm target/wasm32v1-none/release/event.wasm \\\n` +
        `    --source <key> --network ${network}\n` +
        `  stellar contract invoke --id ${factory} --source <key> --network ${network} -- \\\n` +
        `    set_event_wasm_hash --event_wasm_hash <the hash upload printed>\n\n` +
        `Note the hash comes from the upload, not from a local build: the wasm is\n` +
        `not byte-reproducible across host platforms. Record it in ${README} and in\n` +
        `docs/deployments.md. Events already deployed keep the wasm they were born\n` +
        `with; only events created afterwards get the new one.`,
    );
    return;
  }

  checked.push(
    `ok     ${network}: ${README}'s event wasm hash is what ${factory.slice(0, 8)}… deploys  (${deployed.slice(0, 8)}…)`,
  );
}

// Every network is checked before anything is reported, so one bad table does
// not hide the state of the other. Two networks failing is two things to fix,
// and finding that out one push at a time is how a two-network deployment
// stays broken for two pushes.
for (const network of NETWORKS) check(network);

for (const line of checked) console.log(line);
for (const line of skipped) console.warn(`\nskip   ${line}\n`);

if (failures.length > 0) {
  for (const message of failures) console.error(`\n${message}\n`);
  process.exit(1);
}

// Every network the README has a table for was unreachable. Not a failure —
// nothing was contradicted — but it must not read as a pass either.
if (checked.length === 0 && skipped.length > 0) {
  console.warn("No published wasm hash was verified this run.");
}

// Neither table exists. That is a README that has stopped publishing the thing
// this script guards, which is exactly the drift it was written to catch.
if (checked.length === 0 && skipped.length === 0) {
  console.error(
    `\n${README} has no deployed-contracts table for any network.\n` +
      `The event wasm hash is Deliverable 1 and 2 evidence and a reviewer is\n` +
      `expected to check it. Restore the table, or update NETWORKS in this script\n` +
      `if the headings were renamed.\n`,
  );
  process.exit(1);
}
