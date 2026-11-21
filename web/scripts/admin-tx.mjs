/**
 * Run an admin call against the factory or the reputation ledger, with as many
 * signatures as the admin account requires.
 *
 *   node scripts/admin-tx.mjs build <contract> <fn> [value ...]
 *   node scripts/admin-tx.mjs sign  <xdr|@file> [--alias <identity>]
 *   node scripts/admin-tx.mjs send  <xdr|@file>
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

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

/**
 * Hidden prompt, so a secret never lands in the shell history or a file.
 *
 * The prompt is written to **stderr**, never stdout. stdout is this tool's data
 * channel — the signed envelope goes there, and the whole flow is built on
 * redirecting it to a file. An earlier version prompted on stdout and the
 * prompt string, ANSI escapes and all, was written into the envelope file,
 * which then failed to parse as base64 on the next step. The echo suppression
 * held and no key was written, but the lesson is the general one: anything
 * meant for a human goes to stderr.
 */
function askSecret(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    // Everything after the prompt is echoed as nothing at all. Not even
    // asterisks: a length is information about a secret.
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

/**
 * An envelope, given either literally or as `@path`.
 *
 * A signed Soroban envelope runs to a couple of kilobytes of base64, which is
 * past what is comfortable to paste and past what some shells will accept as one
 * argument. `@path` keeps the multi-step flow usable: each step writes a file,
 * the next step reads it.
 */
function envelopeFrom(value) {
  if (!value.startsWith("@")) return value;
  const path = value.slice(1);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    die(`Couldn't read the envelope from ${path}: ${err.message}`);
  }

  // Take the base64 and say so if anything else was in there. An envelope file
  // can pick up noise — a prompt, a shell banner, a stray copy-paste — and
  // "Invalid character" from deep inside a base64 decoder is a miserable way to
  // find that out. Base64 is self-delimiting enough to pull out safely, and
  // reporting what was discarded keeps this from hiding a real mix-up.
  const lines = raw.split("\n").map((l) => l.trim());
  const envelope = lines.filter((l) => l.length > 0 && /^[A-Za-z0-9+/=]+$/.test(l));
  const noise = lines.filter((l) => l.length > 0 && !/^[A-Za-z0-9+/=]+$/.test(l));

  if (envelope.length === 0) die(`${path} contains no base64 envelope.`);
  if (envelope.length > 1) {
    die(
      `${path} contains ${envelope.length} separate envelopes.\n\n` +
        `Each step writes one. Two in a file means an output was appended to\n` +
        `rather than replaced, and signing the wrong one is silent.`,
    );
  }
  if (noise.length > 0) {
    console.error(`note           : ignored ${noise.length} non-envelope line(s) in ${path}`);
  }
  return envelope[0];
}

function keypairFrom(secret) {
  if (/^S[A-Z2-7]{55}$/.test(secret)) return Keypair.fromSecret(secret);
  die(
    "That isn't a secret key (S…, 56 characters).\n\n" +
      "A signer's stored value should be the S-form — what `stellar keys secret`\n" +
      "prints. A 24-word seed phrase is not accepted here directly: deriving a key\n" +
      "from a phrase is a different operation, and silently guessing which\n" +
      "derivation path was meant is how a signature ends up coming from an address\n" +
      "nobody listed.",
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

  // Read the authoriser off the contract rather than being told it. The source
  // account has to be the address the contract will demand, and asking the
  // chain removes the one way to get that wrong.
  //
  // `accept_admin` is the exception that makes this worth doing properly: the
  // address that has to sign it is the *pending* admin, not the current one.
  // Building it against `get_admin` would produce a transaction signed by the
  // outgoing key — which is the one key the contract refuses for this call.
  const authoriser =
    fn === "accept_admin"
      ? await readPendingAdmin(contractId)
      : await readAdmin(contractId);
  console.error(
    fn === "accept_admin"
      ? `pending admin  : ${authoriser}  (the address that must sign)`
      : `admin on chain : ${authoriser}`,
  );

  const account = await server.getAccount(authoriser);
  const prepared = await server.prepareTransaction(
    new TransactionBuilder(account, {
      fee: String(Number(BASE_FEE) * 100),
      networkPassphrase: NETWORK,
    })
      .addOperation(new Contract(contractId).call(fn, ...values.map(toScVal)))
      // An hour. The limit here is a human one: the envelope has to reach other
      // holders, be looked at, and be signed — and if it expires in the middle
      // of that, the whole round starts again. Shorter is not safer, because
      // what the timebound protects against is a *stale* transaction being
      // replayed later, and an hour is nowhere near long enough to matter for
      // a call whose effect is checked on the chain immediately afterwards.
      .setTimeout(3600)
      .build(),
  );

  console.error(`call           : ${fn}(${values.join(", ")})`);
  console.error(`signatures     : 0 so far — sign this, then send it\n`);
  console.log(prepared.toXDR());
}

/**
 * Simulate a read-only getter and return what it answered.
 *
 * Simulation never consults the source account for a read, hence the all-zero
 * address below — it exists only to hold a sequence number.
 */
async function read(contractId, fn) {
  const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK,
  })
    .addOperation(new Contract(contractId).call(fn))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    die(`Couldn't call \`${fn}\` on ${contractId}:\n\n${sim.error}`);
  }
  return scValToNative(sim.result.retval);
}

const readAdmin = (contractId) => read(contractId, "get_admin");

async function readPendingAdmin(contractId) {
  const pending = await read(contractId, "get_pending_admin");
  if (!pending) {
    die(
      `${contractId} has nobody proposed as admin, so there is nothing to accept.\n\n` +
        `The handover is two transactions: the current admin calls\n` +
        `\`propose_admin <address>\` first, and only the proposed address can\n` +
        `then call \`accept_admin\`. \`get_pending_admin\` is how you check\n` +
        `which address that is before signing anything.`,
    );
  }
  return pending;
}

/**
 * Pull a secret out of a `stellar` CLI identity without it passing through a
 * terminal or a shell variable. The value goes CLI -> this process -> signature
 * and is never printed; printing a key to look at it is how keys stop being
 * secret.
 *
 * **Not available for `--secure-store` identities.** The CLI refuses outright —
 * "Secure Store does not reveal secret key" — which is the keychain doing its
 * job and also what rules it out as a signer here: a key the CLI will only use
 * itself can only ever contribute one signature per transaction, via
 * `stellar contract invoke`, and one signature is the thing a 2-of-3 account
 * exists to refuse. The signer that lives on this machine is therefore an
 * ordinary identity, and that is sound rather than a compromise: it holds one
 * of three weights, so reading this laptop gets an attacker a signature that
 * cannot do anything on its own. Neutralising that key is the whole point of
 * the threshold.
 */
function secretFromAlias(alias) {
  try {
    return execFileSync("stellar", ["keys", "secret", alias], {
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"], // stdin inherited: the keychain may prompt
    }).trim();
  } catch {
    die(
      `Couldn't read the key for identity \`${alias}\`.\n\n` +
        `\`stellar keys ls\` lists what exists. If the identity is in the OS\n` +
        `keychain, the prompt it raises has to be answered in this terminal.`,
    );
  }
}

async function sign([envelope, ...flags]) {
  if (!envelope) die("Usage: admin-tx.mjs sign <xdr|@file> [--alias <identity>]");
  const tx = new Transaction(envelopeFrom(envelope), NETWORK);
  const before = tx.signatures.length;

  const aliasAt = flags.indexOf("--alias");
  const alias = aliasAt === -1 ? null : flags[aliasAt + 1];
  if (aliasAt !== -1 && !alias) die("`--alias` needs an identity name.");

  const secret = alias
    ? secretFromAlias(alias)
    : (process.env.STELLAR_ADMIN_SECRET ?? (await askSecret("secret key (hidden): ")));
  if (!secret) die("Nothing entered.");
  const keypair = keypairFrom(secret);

  tx.sign(keypair);
  console.error(`signed by      : ${keypair.publicKey()}`);
  console.error(`signatures     : ${before} -> ${tx.signatures.length}\n`);
  console.log(tx.toXDR());
}

async function send([envelope]) {
  if (!envelope) die("Usage: admin-tx.mjs send <xdr|@file>");
  const tx = new Transaction(envelopeFrom(envelope), NETWORK);
  console.error(`signatures     : ${tx.signatures.length}`);

  const sent = await server.sendTransaction(tx);
  if (sent.status !== "PENDING") {
    const code = txCode(sent.errorResult);
    const explanations = {
      txBadAuth:
        "That is the threshold doing its job — the envelope does not carry enough\n" +
        "signatures for this account. Hand it to another holder and sign again.",
      // Stellar refuses signatures it did not need, so "more is safer" is wrong
      // here: an account at threshold 1 accepts exactly one signature, and a
      // second one fails the whole transaction.
      txBadAuthExtra:
        "Too many signatures, not too few. This account needs fewer than the\n" +
        "envelope carries, and Stellar rejects a transaction holding signatures\n" +
        "it had no use for. Rebuild and gather exactly as many as\n" +
        "`admin-account.mjs show` says the medium threshold is.",
      txTooLate:
        "The envelope's time window closed while it was being passed around.\n" +
        "Nothing was lost except the signatures on it — rebuild and sign again.",
    };
    die(
      `The network refused it: ${code ?? sent.status}\n\n` +
        (explanations[code] ?? "Nothing was submitted."),
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
      "  node scripts/admin-tx.mjs sign  <xdr|@file> [--alias <identity>]\n" +
      "  node scripts/admin-tx.mjs send  <xdr|@file>",
  );
}
await commands[command](rest);
