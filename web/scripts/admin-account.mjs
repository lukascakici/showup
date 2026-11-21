/**
 * Turn the admin into an account no single signature can move, and read back
 * what any account's signing rules actually are.
 *
 *   node scripts/admin-account.mjs show  <account>
 *   node scripts/admin-account.mjs setup <identity> <signer> <signer>
 *
 * `setup` installs 2-of-3: the account's own key plus the two addresses given,
 * each at weight 1, with the low, medium **and** high thresholds at 2. High
 * matters as much as medium — leaving it at 1 would mean one key could still
 * rewrite the signer list and hand itself everything, which is the same key
 * holding the whole account by a slower route.
 *
 * Ordering inside the transaction is deliberate and not cosmetic: the signers go
 * on first and the thresholds last. Raising the thresholds first would make the
 * very next operation in the same transaction unauthorised, and the transaction
 * would fail having already been signed for.
 *
 * The transaction that installs the rules is signed by the account's own key
 * alone, which is enough because the thresholds it installs do not apply to it.
 * That is the single moment this account is a one-key account — afterwards it
 * never is again, and `show` is how you confirm it.
 *
 * Read `show` before trusting anything: these thresholds are public ledger
 * state, which is exactly why they are better evidence than a claim about where
 * a key is kept.
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

async function setup([identity, ...signers]) {
  if (!identity || signers.length !== 2) {
    die("Usage: admin-account.mjs setup <identity> <signer-G…> <signer-G…>");
  }
  for (const s of signers) {
    if (!ADDRESS.test(s)) die(`\`${s}\` is not a Stellar address (G…, 56 characters).`);
  }

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
  const master = Keypair.fromSecret(secret);

  if (signers.includes(master.publicKey())) {
    die(
      `${master.publicKey()} is the account itself — it is already a signer.\n\n` +
        `Pass the two *other* holders' addresses. Listing the same key twice\n` +
        `would build an account that looks like 2-of-3 and behaves like 1-of-2.`,
    );
  }

  const loaded = await horizon.loadAccount(master.publicKey());
  if (Number(loaded.thresholds.med_threshold) > 1) {
    die(
      `${master.publicKey()} already requires more than one signature.\n\n` +
        `Run \`show\` on it and change it deliberately rather than through this,\n` +
        `which assumes it is signing for itself.`,
    );
  }

  const tx = new TransactionBuilder(loaded, {
    fee: String(Number(BASE_FEE) * 10),
    networkPassphrase: NETWORK,
  })
    .addOperation(Operation.setOptions({ signer: { ed25519PublicKey: signers[0], weight: 1 } }))
    .addOperation(Operation.setOptions({ signer: { ed25519PublicKey: signers[1], weight: 1 } }))
    .addOperation(
      Operation.setOptions({
        masterWeight: 1,
        lowThreshold: 2,
        medThreshold: 2,
        highThreshold: 2,
      }),
    )
    .setTimeout(180)
    .build();

  tx.sign(master);
  const sent = await horizon.submitTransaction(tx).catch((err) => {
    die(
      `The network refused it: ${JSON.stringify(err?.response?.data?.extras?.result_codes ?? err?.message)}`,
    );
  });

  console.log(`${EXPLORER}/tx/${sent.hash}\n`);
  await show([master.publicKey()]);
}

const [command, ...rest] = process.argv.slice(2);
const commands = { show, setup };
if (!commands[command]) {
  die(
    "Usage:\n" +
      "  node scripts/admin-account.mjs show  <account>\n" +
      "  node scripts/admin-account.mjs setup <identity> <signer> <signer>",
  );
}
await commands[command](rest);
