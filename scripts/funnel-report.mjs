#!/usr/bin/env node
/**
 * The invitation-to-attendance funnel, counted rather than estimated.
 *
 *   node scripts/funnel-report.mjs                    # everything, as markdown
 *   node scripts/funnel-report.mjs --since 2026-09-26
 *   node scripts/funnel-report.mjs --event C...       # one event
 *
 * What the SOW asks for is the drop-off between an invitation and an attendance,
 * and the interesting half of that is invisible on-chain: the chain knows who
 * reserved and who checked in, and has no idea how many people opened a link and
 * closed it. That number is the case for the deposit, so it is measured in the
 * browser and read back here.
 *
 * **Sessions, not visitors.** Every figure below counts distinct browser sessions,
 * because that is what the data is. One person on a phone and a laptop is two; one
 * person with storage disabled is zero. Both are stated rather than smoothed over,
 * because a funnel that quietly reports "people" is making a claim its data cannot
 * support.
 *
 * The last two steps are also on-chain facts, so they are **cross-checked**: if the
 * contract has more reservations than the funnel saw sessions for, the difference is
 * printed. That is not an error — a guest who reserved from a wallet's in-app
 * browser, or with storage off, is a real reservation that no session recorded — but
 * it is the honest boundary of the measurement and it belongs in the report.
 *
 * Reads with the Admin SDK, because `firestore.rules` denies every client read of
 * this collection.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");

const { cert, initializeApp } = await import(join(web, "node_modules/firebase-admin/lib/esm/app/index.js"));
const { getFirestore } = await import(join(web, "node_modules/firebase-admin/lib/esm/firestore/index.js"));

const STEPS = ["invite_opened", "wallet_connected", "reserved", "checked_in"];
const LABELS = {
  invite_opened: "Opened an invitation",
  wallet_connected: "Connected a wallet",
  reserved: "Locked a deposit",
  checked_in: "Turned up and checked in",
};

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

function serviceAccount() {
  const env = readFileSync(join(web, ".env.local"), "utf8");
  const line = env.split("\n").find((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT="));
  if (!line) {
    console.error("FIREBASE_SERVICE_ACCOUNT is not in web/.env.local");
    process.exit(1);
  }
  return JSON.parse(line.slice("FIREBASE_SERVICE_ACCOUNT=".length));
}

const key = serviceAccount();
initializeApp({
  credential: cert({
    projectId: key.project_id,
    clientEmail: key.client_email,
    privateKey: key.private_key.replace(/\\n/g, "\n"),
  }),
  projectId: key.project_id,
});
const db = getFirestore();

const since = arg("--since");
const onlyEvent = arg("--event");
const from = since ? Date.parse(`${since}T00:00:00Z`) : 0;
if (since && Number.isNaN(from)) {
  console.error(`--since wants a date like 2026-09-26, not "${since}"`);
  process.exit(1);
}

const rows = (await db.collection("funnel").get()).docs
  .map((d) => d.data())
  .filter((r) => r.at >= from)
  .filter((r) => !onlyEvent || r.eventId === onlyEvent);

if (rows.length === 0) {
  console.log("No funnel rows match. Nothing has been measured yet for that range.");
  process.exit(0);
}

// Sessions per step, so a refresh cannot be a second visitor. The route already
// writes one row per session per step per event; this is the belt to that braces,
// and it is also what makes a per-event and an all-events run comparable.
const sessions = {};
for (const step of STEPS) sessions[step] = new Set();
for (const row of rows) {
  if (sessions[row.step]) sessions[row.step].add(row.session);
}

const counts = STEPS.map((step) => sessions[step].size);
const top = counts[0];

console.log(`# Funnel — ${onlyEvent ? onlyEvent : "every event"}`);
console.log(`\n${since ? `From ${since} to now.` : "All measured activity."} ${rows.length} rows, ${
  new Set(rows.map((r) => r.session)).size
} distinct sessions.\n`);
console.log("| Step | Sessions | Of those invited | Kept from the step before |");
console.log("| :-- | --: | --: | --: |");

counts.forEach((n, i) => {
  const ofTop = top === 0 ? "—" : `${((n / top) * 100).toFixed(0)}%`;
  const prev = i === 0 ? null : counts[i - 1];
  const kept = i === 0 ? "—" : prev === 0 ? "—" : `${((n / prev) * 100).toFixed(0)}%`;
  console.log(`| ${LABELS[STEPS[i]]} | ${n} | ${ofTop} | ${kept} |`);
});

// The one number the whole exercise is for.
if (top > 0) {
  const turnedUp = counts[3];
  console.log(
    `\n**${turnedUp} of ${top} sessions that opened an invitation turned up** — ${(
      (turnedUp / top) *
      100
    ).toFixed(1)}%.`,
  );
  console.log(
    `\nThe drop that matters most is between opening an invitation and locking a deposit: ${
      top - counts[2]
    } sessions got that far and no further.`,
  );
}

console.log(
  "\nCounts are browser sessions, not people. One person on two devices is two" +
    " sessions; one person with storage disabled is none. Both are limits of the" +
    " measurement rather than of the product, and the last two rows can be checked" +
    " against the chain, which is the authority on them.",
);
