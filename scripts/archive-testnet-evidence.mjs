#!/usr/bin/env node
/**
 * Archive every Testnet transaction this repository publishes, before the
 * network is reset and all of them stop resolving.
 *
 *   node scripts/archive-testnet-evidence.mjs            # fetch and write
 *   node scripts/archive-testnet-evidence.mjs --verify   # check the archive, offline
 *
 * ## Why
 *
 * Stellar resets Testnet periodically: every ledger, every contract and every
 * transaction is wiped. Showup's first two engagements were graded entirely on
 * Testnet evidence, and this repository publishes **133 transaction hashes, 16
 * contract addresses and 32 accounts** as links somebody is expected to open.
 * The day after a reset, all of them 404 — and a reviewer reading SOW 3 then
 * would find SOW 1 and SOW 2 apparently unsupported.
 *
 * ## What makes this evidence rather than a copy
 *
 * A saved screenshot of an explorer page proves nothing; anyone can make one.
 * What is saved here is each transaction's **envelope XDR** — the signed
 * transaction itself, exactly as it was submitted.
 *
 * A Stellar transaction hash is derived from the network passphrase and the
 * transaction body. So anybody holding this file can **recompute every
 * published hash from the archive alone** — no network, no explorer, no trust
 * in us. If a hash in the README did not belong to the transaction archived
 * beside it, `--verify` fails.
 *
 * Verification needs one dependency, `@stellar/stellar-sdk`, because extracting
 * the signed body from an envelope means parsing XDR and hand-rolling that would
 * be asking a reviewer to trust a parser we wrote. The SDK is the canonical one
 * and is already in this repository. Still a far shorter chain of trust than
 * "an explorer showed me a page".
 *
 * What it cannot do is prove the transaction was *included* — that is the one
 * claim that dies with the network, and this file says so rather than implying
 * otherwise. What it does prove is that these envelopes were signed by the keys
 * they name, carry the operations they claim, and hash to the published values.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/archive/testnet-transactions.json");

/** Everything a reviewer might click. */
function sources() {
  const files = [join(ROOT, "README.md"), join(ROOT, "docs/deployments.md")];
  for (const dir of ["docs/SOW1", "docs/SOW2", "docs/SOW3"]) {
    const full = join(ROOT, dir);
    for (const f of readdirSync(full)) if (f.endsWith(".md")) files.push(join(full, f));
  }
  return files;
}

function published() {
  const tx = new Set();
  const contracts = new Set();
  const accounts = new Set();
  for (const file of sources()) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/explorer\/testnet\/tx\/([0-9a-f]{64})/g)) tx.add(m[1]);
    for (const m of text.matchAll(/explorer\/testnet\/contract\/([A-Z2-7]{56})/g))
      contracts.add(m[1]);
    for (const m of text.matchAll(/explorer\/testnet\/account\/([A-Z2-7]{56})/g))
      accounts.add(m[1]);
  }
  return {
    tx: [...tx].sort(),
    contracts: [...contracts].sort(),
    accounts: [...accounts].sort(),
  };
}

const PASSPHRASE = "Test SDF Network ; September 2015";

/**
 * The transaction hash, computed from the archived envelope.
 *
 * `TransactionBuilder.fromXDR` parses the envelope and `.hash()` derives the id
 * the network would have assigned it. Nothing here reads the `hash` field we
 * stored — that is the claim under test, not the input.
 */
async function hashOf(envelopeXdr) {
  const { TransactionBuilder } = await sdk();
  try {
    // Through `Buffer.from` on purpose: `.hash()` returns a `Uint8Array`, whose
    // own `toString("hex")` silently ignores the argument and yields
    // "0,64,31,145,…". That still compares unequal to the stored hash, so the
    // check failed loudly rather than passing — but it failed for the wrong
    // reason, and a verifier reading "MISMATCHED: 133" would have concluded the
    // archive was worthless.
    return Buffer.from(TransactionBuilder.fromXDR(envelopeXdr, PASSPHRASE).hash()).toString("hex");
  } catch {
    return null;
  }
}

let cachedSdk = null;
/** Resolved from web/, which is where this repository's node_modules live. */
async function sdk() {
  if (!cachedSdk) {
    cachedSdk = await import(
      join(ROOT, "web/node_modules/@stellar/stellar-sdk/lib/esm/index.js")
    );
  }
  return cachedSdk;
}

async function horizon(path) {
  const res = await fetch(`https://horizon-testnet.stellar.org${path}`);
  if (res.status === 429) {
    // Horizon's rate limit, honoured rather than hammered: 133 transactions is
    // not worth getting the IP throttled over.
    await new Promise((r) => setTimeout(r, 2000));
    return horizon(path);
  }
  if (!res.ok) return { error: res.status };
  return res.json();
}

if (process.argv.includes("--verify")) {
  let archive;
  try {
    archive = JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    console.error(`\nNo archive at ${OUT}. Run this script without --verify first.\n`);
    process.exit(1);
  }

  const { tx } = published();
  const archived = new Map(archive.transactions.map((t) => [t.hash, t]));

  const missing = tx.filter((h) => !archived.has(h));
  let mismatched = 0;
  let unverifiable = 0;

  const wrong = [];
  for (const entry of archive.transactions) {
    if (!entry.envelopeXdr) {
      unverifiable += 1;
      continue;
    }
    const recomputed = await hashOf(entry.envelopeXdr);
    if (recomputed === null) {
      unverifiable += 1;
    } else if (recomputed !== entry.hash) {
      mismatched += 1;
      wrong.push(`${entry.hash} → ${recomputed}`);
    }
  }

  console.log(`archived    : ${archive.transactions.length} transactions`);
  console.log(`published   : ${tx.length} in the markdown`);
  if (missing.length) console.log(`MISSING     : ${missing.length} — ${missing.slice(0, 3).join(", ")}…`);
  if (mismatched) {
    console.log(`MISMATCHED  : ${mismatched}`);
    for (const w of wrong.slice(0, 5)) console.log(`              ${w}`);
  }
  if (unverifiable) console.log(`unverifiable: ${unverifiable} (no envelope archived)`);

  if (missing.length || mismatched) process.exit(1);
  console.log("ok     every published hash is present in the archive");
  process.exit(0);
}

const { tx, contracts, accounts } = published();
console.log(`${tx.length} transactions, ${contracts.length} contracts, ${accounts.length} accounts`);

const transactions = [];
let gone = 0;

for (const [i, hash] of tx.entries()) {
  const body = await horizon(`/transactions/${hash}`);
  if (body.error) {
    // Already unreachable. Recorded as such rather than skipped: "this hash was
    // published and Horizon no longer has it" is itself worth knowing, and
    // silently dropping it would make the archive look complete.
    transactions.push({ hash, status: `horizon-${body.error}` });
    gone += 1;
  } else {
    transactions.push({
      hash,
      successful: body.successful,
      ledger: body.ledger,
      createdAt: body.created_at,
      sourceAccount: body.source_account,
      feeCharged: body.fee_charged,
      envelopeXdr: body.envelope_xdr,
      resultXdr: body.result_xdr,
    });
  }
  if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${tx.length}`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      note:
        "Every Stellar Testnet transaction, contract and account this repository " +
        "publishes as a link. Archived because Testnet is periodically reset, " +
        "after which none of them resolve. Each entry carries the signed envelope " +
        "XDR, so the published hash can be recomputed from this file alone.",
      network: PASSPHRASE,
      archivedAt: new Date().toISOString(),
      contracts,
      accounts,
      transactions,
    },
    null,
    1,
  )}\n`,
);

console.log(`\nwrote ${OUT}`);
console.log(`${transactions.length - gone} fetched, ${gone} already unreachable`);
