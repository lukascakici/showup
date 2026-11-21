/**
 * Run an admin call against the factory or the reputation ledger, with as many
 * signatures as the admin account requires.
 *
 *   node scripts/admin-tx.mjs build <contract> <fn> [value ...]
 *   node scripts/admin-tx.mjs sign  <xdr>
 *   node scripts/admin-tx.mjs send  <xdr>
 *
 * The `stellar` CLI signs with exactly one key, which is fine while the admin is
 * one keypair and impossible once it is a multisig account. This is the same
 * three steps a hardware or multi-party signer actually needs: one machine
 * prepares, each holder signs the thing it was handed, and whoever has the
 * complete envelope submits it. The transaction travels as base64 between them,
 * so no secret ever has to be in the same place as another secret.
 *
 * Authorisation rides on the transaction's own signature set. Every admin
 * function here calls `require_auth()` on the stored admin, and the admin is the
 * transaction's source account, so Stellar checks the signatures against that
 * account's **medium threshold** — the ordinary multisig rule, with nothing
 * Soroban-specific about it. Proven on Testnet before it was relied on: with a
 * 2-of-3 account, one signature is refused `txBadAuth` and two go through. See
 * docs/deployments.md.
 *
 * Argument types are inferred, because every admin call in this system takes one
 * of exactly two things:
 *   - 56 characters starting G or C -> an address
 *   - 64 hex characters            -> a 32-byte hash
 * Anything else is refused rather than guessed, since a mistyped admin argument
 * is the one class of mistake that is expensive here.
 */

import { createInterface } from "node:readline";
import {
  Account,
  Contract,
  Keypair,
  Networks,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
  BASE_FEE,
} from "@stellar/stellar-sdk";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK = Networks.TESTNET;
const EXPLORER = "https://stellar.expert/explorer/testnet";
/** Nobody's account. Only ever a sequence number for a read-only simulation. */
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const server = new rpc.Server(RPC_URL);

/** What the admin is ever asked to do, and nothing else. */
const ADMIN_FUNCTIONS = new Set([
  "propose_admin",
  "accept_admin",
  "set_event_wasm_hash",
  "set_reputation",
  "set_factory",
  "upgrade",
]);

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function toScVal(value) {
  if (/^[GC][A-Z2-7]{55}$/.test(value)) return nativeToScVal(value, { type: "address" });
  if (/^[0-9a-f]{64}$/.test(value)) return xdr.ScVal.scvBytes(Buffer.from(value, "hex"));
  die(
    `Can't tell what \`${value}\` is meant to be.\n\n` +
      `An admin argument is either an address (56 chars, G or C) or a 32-byte\n` +
      `hash (64 lowercase hex). Guessing is not worth the risk here.`,
  );
}

/** Hidden prompt, so a seed phrase never lands in the shell history or a file. */
function askSecret(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Everything after the prompt is echoed as nothing at all. Not even
    // asterisks: a length is information about a seed phrase.
    rl._writeToOutput = function (chunk) {
      if (chunk.includes(prompt)) rl.output.write(chunk);
    };
    rl.question(prompt, (answer) => {
      rl.output.write("\n");
      rl.close();
      resolve(answer.trim());
    });
  });
}

function keypairFrom(secret) {
  if (/^S[A-Z2-7]{55}$/.test(secret)) return Keypair.fromSecret(secret);
  die(
    "That isn't a secret key (S…, 56 characters).\n\n" +
      "If what you have is a 24-word seed phrase, turn it into a key first with\n" +
      "`stellar keys add <alias> --secure-store` and sign with that alias, so the\n" +
      "phrase goes into your OS keychain rather than through a terminal.",
  );
}

async function build([contractId, fn, ...values]) {
  if (!contractId || !fn) die("Usage: admin-tx.mjs build <contract> <fn> [value ...]");
  if (!ADMIN_FUNCTIONS.has(fn)) {
    die(
      `\`${fn}\` is not an admin function.\n\n` +
        `This tool exists for exactly these: ${[...ADMIN_FUNCTIONS].join(", ")}.\n` +
        `Everything else is an ordinary call and belongs in the \`stellar\` CLI.`,
    );
  }

  // Read the admin off the contract rather than being told it. The source
  // account has to be the admin for the signature check to mean anything, and
  // asking the chain removes the one way to get that wrong.
  const admin = await readAdmin(contractId);
  console.error(`admin on chain : ${admin}`);

  const account = await server.getAccount(admin);
  const prepared = await server.prepareTransaction(
    new TransactionBuilder(account, {
      fee: String(Number(BASE_FEE) * 100),
      networkPassphrase: NETWORK,
    })
      .addOperation(new Contract(contractId).call(fn, ...values.map(toScVal)))
      .setTimeout(600) // ten minutes: long enough to pass an envelope to a second holder
      .build(),
  );

  console.error(`call           : ${fn}(${values.join(", ")})`);
  console.error(`signatures     : 0 so far — sign this, then send it\n`);
  console.log(prepared.toXDR());
}

/**
 * Ask the contract who its admin is.
 *
 * `get_admin` is read-only, so simulation answers it and the source account is
 * never consulted — hence the all-zero address below, which exists only to hold
 * a sequence number. Reading this rather than accepting it as an argument is
 * deliberate: the source account has to *be* the admin for the signature check
 * to mean anything, and asking the chain removes the way to get that wrong.
 */
async function readAdmin(contractId) {
  const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK,
  })
    .addOperation(new Contract(contractId).call("get_admin"))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    die(`Couldn't read the admin of ${contractId}:\n\n${sim.error}`);
  }
  return scValToNative(sim.result.retval);
}

async function sign([envelope]) {
  if (!envelope) die("Usage: admin-tx.mjs sign <xdr>");
  const tx = new Transaction(envelope, NETWORK);
  const before = tx.signatures.length;

  const secret = process.env.STELLAR_ADMIN_SECRET ?? (await askSecret("secret key (hidden): "));
  if (!secret) die("Nothing entered.");
  const keypair = keypairFrom(secret);

  tx.sign(keypair);
  console.error(`signed by      : ${keypair.publicKey()}`);
  console.error(`signatures     : ${before} -> ${tx.signatures.length}\n`);
  console.log(tx.toXDR());
}

async function send([envelope]) {
  if (!envelope) die("Usage: admin-tx.mjs send <xdr>");
  const tx = new Transaction(envelope, NETWORK);
  console.error(`signatures     : ${tx.signatures.length}`);

  const sent = await server.sendTransaction(tx);
  if (sent.status !== "PENDING") {
    const code = txCode(sent.errorResult);
    die(
      `The network refused it: ${code ?? sent.status}\n\n` +
        (code === "txBadAuth"
          ? "That is the threshold doing its job — the envelope does not carry enough\n" +
            "signatures for this account. Hand it to another holder and sign again."
          : "Nothing was submitted."),
    );
  }

  let got = await server.getTransaction(sent.hash);
  while (got.status === "NOT_FOUND") {
    await new Promise((r) => setTimeout(r, 1500));
    got = await server.getTransaction(sent.hash);
  }

  console.error(`status         : ${got.status}`);
  console.error(`${EXPLORER}/tx/${sent.hash}`);
  if (got.status !== "SUCCESS") process.exit(1);
}

/** The tx-level result code, which is where a threshold failure shows up. */
function txCode(errorResult) {
  if (!errorResult) return null;
  try {
    const raw = Buffer.from(errorResult.toXDR("base64"), "base64");
    return xdr.TransactionResultCode.fromValue(raw.readInt32BE(8)).name;
  } catch {
    return null;
  }
}

const [command, ...rest] = process.argv.slice(2);
const commands = { build, sign, send };
if (!commands[command]) {
  die(
    "Usage:\n" +
      "  node scripts/admin-tx.mjs build <contract> <fn> [value ...]\n" +
      "  node scripts/admin-tx.mjs sign  <xdr>\n" +
      "  node scripts/admin-tx.mjs send  <xdr>",
  );
}
await commands[command](rest);
