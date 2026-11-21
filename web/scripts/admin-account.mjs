/**
 * Turn the admin into an account no single signature can move, and read back
 * what any account's signing rules actually are.
 *
 *   node scripts/admin-account.mjs show        <account>
 *   node scripts/admin-account.mjs add-signers <identity> <signer> [signer ...]
 *   node scripts/admin-account.mjs require     <identity> <n>
 *
 * **Adding signers and requiring them are deliberately two commands**, and the
 * order between them is the whole safety story. An account whose threshold is
 * raised to 2 can only ever act again if two of its keys really can sign — and
 * "the holder says they have it" is not that. If one of them turns out to be
 * lost, mistyped or never saved, the account is not inconvenienced, it is
 * finished: no `upgrade`, no `set_event_wasm_hash`, no way to lower the
 * threshold again, because lowering it needs the threshold.
 *
 * So the sequence is: add the signers, have **each new holder actually sign
 * something** while one signature is still enough, and only then `require` two.
 * A single command doing both would make the dangerous order the easy one.
 *
 * `require 2` sets the low, medium *and* high thresholds. High matters as much
 * as medium — leaving it lower would mean one key could still rewrite the signer
 * list and hand itself everything, which is the same key holding the whole
 * account by a slower route.
 *
 * Both commands are signed by the account's own key alone, which is enough
 * while the thresholds are still low. After `require 2` that stops being true,
 * which is the point.
 *
 * Read `show` before trusting anything: signers and thresholds are ordinary
 * public ledger state, which is exactly why they are better evidence than a
 * claim about where a key is kept.
 */

import { execFileSync } from "node:child_process";
import {
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const NETWORK = Networks.TESTNET;
const EXPLORER = "https://stellar.expert/explorer/testnet";

const horizon = new Horizon.Server(HORIZON_URL);

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const ADDRESS = /^G[A-Z2-7]{55}$/;

async function show([account]) {
  if (!ADDRESS.test(account ?? "")) die("Usage: admin-account.mjs show <G…>");
  const loaded = await horizon.loadAccount(account).catch((err) => {
    die(`Couldn't load ${account}: ${err?.message ?? err}`);
  });

  const { low_threshold: low, med_threshold: med, high_threshold: high } = loaded.thresholds;
  console.log(`account    : ${account}`);
  console.log(`thresholds : low ${low}  medium ${med}  high ${high}`);
  console.log(`signers    :`);
  let total = 0;
  for (const s of loaded.signers) {
    total += s.weight;
    console.log(`             ${s.key}  weight ${s.weight}`);
  }
  console.log(`total weight: ${total}`);

  // The medium threshold is the one that governs a contract call, so it is the
  // one worth stating in words.
  if (med <= 1) {
    console.log(
      `\nAny single signature can act for this account. That is a one-key account,\n` +
        `whatever the signer list looks like.`,
    );
  } else {
    console.log(
      `\nA contract call needs ${med} of these signatures. No single key can act,\n` +
        `and with high at ${high} no single key can change that either.`,
    );
  }
}

/** The account's own key, which signs while the thresholds are still low. */
function masterOf(identity) {
  let secret;
  try {
    secret = execFileSync("stellar", ["keys", "secret", identity], {
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
    }).trim();
  } catch {
    die(
      `Couldn't read the key for identity \`${identity}\`.\n\n` +
        `It has to be an ordinary identity: a \`--secure-store\` key cannot be\n` +
        `used here, because the CLI will not reveal it and this transaction has\n` +
        `to be built and signed in one place.`,
    );
  }
  return Keypair.fromSecret(secret);
}

async function submit(tx, master) {
  tx.sign(master);
  const sent = await horizon.submitTransaction(tx).catch((err) => {
    const codes = err?.response?.data?.extras?.result_codes;
    die(
      `The network refused it: ${JSON.stringify(codes ?? err?.message)}` +
        (codes?.transaction === "tx_bad_auth"
          ? `\n\nThe account already needs more signatures than this command can\n` +
            `provide. Gather them with \`admin-tx.mjs\` instead.`
          : ""),
    );
  });
  console.log(`${EXPLORER}/tx/${sent.hash}\n`);
  await show([master.publicKey()]);
}

async function addSigners([identity, ...signers]) {
  if (!identity || signers.length === 0) {
    die("Usage: admin-account.mjs add-signers <identity> <signer-G…> [signer-G…]");
  }
  for (const s of signers) {
    if (!ADDRESS.test(s)) die(`\`${s}\` is not a Stellar address (G…, 56 characters).`);
  }
  if (new Set(signers).size !== signers.length) {
    die(
      "The same address is listed twice.\n\n" +
        "Adding a key twice does not add weight twice — it would build an account\n" +
        "that reads as 2-of-3 and behaves as 1-of-2.",
    );
  }

  const master = masterOf(identity);
  if (signers.includes(master.publicKey())) {
    die(
      `${master.publicKey()} is the account itself, and already a signer at weight 1.\n\n` +
        `Pass only the *other* holders' addresses.`,
    );
  }

  const loaded = await horizon.loadAccount(master.publicKey());
  const existing = new Set(loaded.signers.map((s) => s.key));
  const already = signers.filter((s) => existing.has(s));
  if (already.length) die(`Already a signer on this account: ${already.join(", ")}`);

  const tx = new TransactionBuilder(loaded, {
    fee: String(Number(BASE_FEE) * 10),
    networkPassphrase: NETWORK,
  });
  for (const key of signers) {
    tx.addOperation(Operation.setOptions({ signer: { ed25519PublicKey: key, weight: 1 } }));
  }
  // Thresholds are deliberately untouched. Each key added here has to prove it
  // can sign before any of them is depended on — see the note at the top.
  await submit(tx.setTimeout(180).build(), master);

  console.log(
    `\nEvery new signer can now act alone, because the threshold is still 1.\n` +
      `Have each holder sign one real call before running \`require\` — that is\n` +
      `the only thing that distinguishes a key they have from a key they think\n` +
      `they have.`,
  );
}

async function require_([identity, n]) {
  const needed = Number(n);
  if (!identity || !Number.isInteger(needed) || needed < 1) {
    die("Usage: admin-account.mjs require <identity> <n>");
  }

  const master = masterOf(identity);
  const loaded = await horizon.loadAccount(master.publicKey());
  const total = loaded.signers.reduce((sum, s) => sum + s.weight, 0);

  if (needed > total) {
    die(
      `This account's signers add up to weight ${total}, so requiring ${needed} would\n` +
        `leave it unable to ever act again — including unable to lower the\n` +
        `requirement, because lowering it needs the requirement met.\n\n` +
        `Add signers first.`,
    );
  }
  if (needed === total) {
    console.log(
      `Warning: ${needed} of a total weight of ${total} means losing any one key ends\n` +
        `this account's ability to act. 2 of 3 survives one loss; ${needed} of ${total} does not.\n`,
    );
  }

  const tx = new TransactionBuilder(loaded, {
    fee: String(Number(BASE_FEE) * 10),
    networkPassphrase: NETWORK,
  })
    .addOperation(
      Operation.setOptions({
        lowThreshold: needed,
        medThreshold: needed,
        highThreshold: needed,
      }),
    )
    .setTimeout(180)
    .build();

  await submit(tx, master);
}

const [command, ...rest] = process.argv.slice(2);
const commands = { show, "add-signers": addSigners, require: require_ };
if (!commands[command]) {
  die(
    "Usage:\n" +
      "  node scripts/admin-account.mjs show        <account>\n" +
      "  node scripts/admin-account.mjs add-signers <identity> <signer> [signer ...]\n" +
      "  node scripts/admin-account.mjs require     <identity> <n>\n\n" +
      "In that order, and with each new signer having signed something real in\n" +
      "between. See the note at the top of this file for why.",
  );
}
await commands[command](rest);
