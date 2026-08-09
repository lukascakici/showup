#!/usr/bin/env node
/**
 * Fail if the README's published event wasm hash isn't what this repo builds.
 *
 * The factory deploys events by wasm hash, so that hash is the join between the
 * source in this repo and the contract running on Testnet. The README publishes
 * it as evidence, which means it is a claim about the chain that a reviewer is
 * expected to check — and a claim nothing was verifying. It sat at v1's
 * `96cd1eb6…` through two contract revisions and a redeploy before the week 2
 * audit caught it by hand.
 *
 * The check is hermetic: it compares the README against the local build and
 * never touches the network, so CI stays offline and deterministic. That does
 * mean it proves the README matches the *source*, not that either matches the
 * deployed factory. Closing that last gap is one command, kept in
 * docs/deployments.md, and is deliberately a human step because it costs XLM:
 *
 *     stellar contract invoke --id <factory> --network testnet -- get_event_wasm_hash
 *
 * So: change the event contract and this goes red. That is the point. Either
 * upload the new wasm and point the factory at it, or don't claim the old hash.
 *
 * Run after `stellar contract build`, which is what produces the wasm this reads.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const WASM = "target/wasm32v1-none/release/event.wasm";
const README = "README.md";
// The row in the deployed-contracts table, e.g.
// | **Event wasm hash** | `8fe992b8…` |
const ROW = /\|\s*\*\*Event wasm hash\*\*\s*\|\s*`([0-9a-f]{64})`\s*\|/;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

let wasm;
try {
  wasm = readFileSync(WASM);
} catch {
  fail(
    `Can't read ${WASM}.\n` +
      `Run \`stellar contract build\` first — this check reads the built artifact.`,
  );
}

const built = createHash("sha256").update(wasm).digest("hex");

const readme = readFileSync(README, "utf8");
const match = readme.match(ROW);
if (!match) {
  fail(
    `Couldn't find the "Event wasm hash" row in ${README}.\n` +
      `It must stay a table row of the exact shape:\n\n` +
      "  | **Event wasm hash** | `<64 hex characters>` |\n\n" +
      `If the table was restructured, update the ROW pattern in this script —\n` +
      `don't drop the row, it is Deliverable 1 and 2 evidence.`,
  );
}

const published = match[1];
if (published !== built) {
  fail(
    `The event wasm hash in ${README} is not what this repo builds.\n\n` +
      `  README claims:    ${published}\n` +
      `  source builds to: ${built}\n\n` +
      `The event contract changed. Two things have to happen together, or the\n` +
      `published evidence describes a contract nobody is running:\n\n` +
      `  1. stellar contract upload --wasm ${WASM} --source <key> --network testnet\n` +
      `  2. stellar contract invoke --id <factory> --source <key> --network testnet -- \\\n` +
      `       set_event_wasm_hash --event_wasm_hash ${built}\n\n` +
      `Then put ${built} in the ${README} table and in docs/deployments.md.\n` +
      `Events already deployed keep running the wasm they were born with; only\n` +
      `events created after step 2 get the new one.`,
  );
}

console.log(`ok     event wasm hash matches ${README}  (${built.slice(0, 8)}…)`);
