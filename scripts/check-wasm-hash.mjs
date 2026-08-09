#!/usr/bin/env node
/**
 * Fail if the README's published event wasm hash isn't the one the deployed
 * factory actually uses.
 *
 * The factory deploys events by wasm hash, so that hash is the join between this
 * repo and the contracts running on Testnet. The README publishes it as
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
 * Both values it compares come out of README.md — the factory address and the
 * hash — so the deployed-contracts table is verifying itself.
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
const NETWORK = "testnet";

// Rows of the deployed-contracts table, e.g.
// | **Event factory** | [`CD5A…`](https://stellar.expert/…) |
// | **Event wasm hash** | `8fe992b8…` |
const FACTORY_ROW = /\|\s*\*\*Event factory\*\*\s*\|[^|]*?`(C[A-Z2-7]{55})`/;
const HASH_ROW = /\|\s*\*\*Event wasm hash\*\*\s*\|\s*`([0-9a-f]{64})`\s*\|/;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function skip(message) {
  console.warn(`\nskip   ${message}\n`);
  process.exit(0);
}

const readme = readFileSync(README, "utf8");

function row(pattern, what, shape) {
  const match = readme.match(pattern);
  if (!match) {
    fail(
      `Couldn't find the "${what}" row in ${README}.\n` +
        `It must stay a table row of the shape:\n\n  ${shape}\n\n` +
        `If the table was restructured, update the pattern in this script — don't\n` +
        `drop the row, it is Deliverable 1 and 2 evidence.`,
    );
  }
  return match[1];
}

const factory = row(FACTORY_ROW, "Event factory", "| **Event factory** | [`C…`](…) |");
const published = row(HASH_ROW, "Event wasm hash", "| **Event wasm hash** | `<64 hex>` |");

/**
 * The factory keeps `EventWasmHash` in *instance* storage, which `--key` can't
 * address (it only reaches persistent entries), so this reads the whole
 * instance and picks the entry out. Output is CSV whose second field is a JSON
 * blob with its quotes doubled.
 */
function readInstanceStorage(contractId) {
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
        NETWORK,
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
        `${README} names ${contractId} as the event factory, but ${NETWORK} has\n` +
          `nothing deployed at that address.\n\n${detail}`,
      );
    }
    skip(
      `couldn't reach ${NETWORK} to read ${contractId}: ${detail}\n` +
        `       The published hash was NOT verified this run.`,
    );
  }

  // Field 2 of `<key>,<json>,<ledger>,<liveUntilLedger>`. Parsed properly rather
  // than sliced to the end: the two trailing ledger numbers sit outside the
  // quotes, so "take everything after the comma" swallows them and the JSON
  // never parses.
  const separator = raw.indexOf('","');
  if (separator === -1) fail(`Unexpected output from \`stellar contract read\`:\n\n${raw}`);

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
  if (i >= raw.length) fail(`Unterminated field in \`stellar contract read\` output:\n\n${raw}`);

  try {
    return JSON.parse(json).contract_instance.storage;
  } catch {
    fail(`Couldn't parse the contract instance out of:\n\n${raw}`);
  }
}

const storage = readInstanceStorage(factory);
const entry = storage.find((e) => e.key?.vec?.[0]?.symbol === "EventWasmHash");
if (!entry) {
  fail(
    `${factory} has no EventWasmHash in its instance storage.\n` +
      `Either the README names something that isn't the factory, or the factory\n` +
      `was never initialized.`,
  );
}

const deployed = entry.val?.bytes;
if (deployed !== published) {
  fail(
    `${README} publishes an event wasm hash the factory isn't using.\n\n` +
      `  README claims:  ${published}\n` +
      `  factory uses:   ${deployed}\n\n` +
      `Events are deployed from the factory's hash, so the README is describing a\n` +
      `contract nobody is running. Either correct the table, or — if the intent\n` +
      `was to ship a new event contract — upload it and point the factory at it:\n\n` +
      `  stellar contract upload --wasm target/wasm32v1-none/release/event.wasm \\\n` +
      `    --source <key> --network ${NETWORK}\n` +
      `  stellar contract invoke --id ${factory} --source <key> --network ${NETWORK} -- \\\n` +
      `    set_event_wasm_hash --event_wasm_hash <the hash upload printed>\n\n` +
      `Note the hash comes from the upload, not from a local build: the wasm is\n` +
      `not byte-reproducible across host platforms. Record it in ${README} and in\n` +
      `docs/deployments.md. Events already deployed keep the wasm they were born\n` +
      `with; only events created afterwards get the new one.`,
  );
}

console.log(`ok     ${README}'s event wasm hash is what ${factory.slice(0, 8)}… deploys  (${deployed.slice(0, 8)}…)`);
