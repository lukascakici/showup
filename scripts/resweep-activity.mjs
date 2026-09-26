#!/usr/bin/env node
/**
 * Make the next sync re-read an event's whole history instead of resuming.
 *
 *   node scripts/resweep-activity.mjs <event id>
 *   node scripts/resweep-activity.mjs --all
 *
 * The archive sweep is incremental: it stores `activitySweptTo` and starts from
 * there next time, which is what keeps a page view cheap. The cost is that **a
 * row kind the bundle did not know about when the sweep passed it is missed
 * permanently.** The chain still has it; the copy does not, and no amount of
 * re-syncing gets it, because the sweep never looks that far back again.
 *
 * That is not hypothetical. `vouched` was added to the decoder after the first
 * vouch had already been swept past, and the event's history was one row short
 * with nothing in the logs to say so. Every future row kind has the same
 * exposure.
 *
 * So this clears the cursor. Nothing is deleted: rows are written under
 * `activityId`, so a re-sweep rewrites what is already there and adds whatever
 * this bundle now understands. Running it on an event that needs nothing costs a
 * sweep and changes no data.
 *
 * It does **not** sync anything itself — that is the route's job, and it needs
 * RPC access and a running server. Clear the cursor here, then hit the page (or
 * `POST /api/events/sync` with the id) and the sweep starts from the bottom.
 *
 * Deliberately not a flag on the sync endpoint: that endpoint is unauthenticated
 * because it accepts no data, and a "sweep everything again" parameter would give
 * an anonymous caller a way to multiply our RPC bill. This needs the service
 * account, which is the right bar for it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");

const { cert, initializeApp } = await import(join(web, "node_modules/firebase-admin/lib/esm/app/index.js"));
const { getFirestore } = await import(join(web, "node_modules/firebase-admin/lib/esm/firestore/index.js"));

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

const [target] = process.argv.slice(2);
if (!target) {
  console.error("usage: node scripts/resweep-activity.mjs <event id> | --all");
  process.exit(1);
}
if (target !== "--all" && !/^C[A-Z2-7]{55}$/.test(target)) {
  console.error("that is not a contract address");
  process.exit(1);
}

const docs =
  target === "--all"
    ? (await db.collection("events").get()).docs
    : [await db.collection("events").doc(target).get()];

const known = docs.filter((d) => d.exists);
if (known.length === 0) {
  console.error("the index has never seen that event, so there is no cursor to clear");
  console.error("open the home page once, then try again");
  process.exit(1);
}

for (const doc of known) {
  // `activityComplete: false` is what actually forces the reach for the bottom
  // of the RPC's range; `activitySweptTo: 0` is belt and braces, since the route
  // requires both before it will resume from a cursor.
  await doc.ref.set({ activityComplete: false, activitySweptTo: 0 }, { merge: true });
  console.log(`cleared  ${doc.id}  ${doc.get("title") || "(untitled)"}`);
}

console.log(
  `\n${known.length} event(s) will re-read their whole history on the next sync.\n` +
    "Open each event's page, or POST /api/events/sync with its id.",
);
