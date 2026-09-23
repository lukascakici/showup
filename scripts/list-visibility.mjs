#!/usr/bin/env node
/**
 * Show or hide an event on the home page.
 *
 * The flag itself is one boolean on `events/{id}` in Firestore and can be
 * toggled by hand in the Firebase console. This exists because doing it by hand
 * means finding a 56-character contract address in a document list with no
 * titles on it, and the mistake that makes — hiding the wrong event — is silent.
 *
 *   node scripts/list-visibility.mjs                 # what is visible, what is not
 *   node scripts/list-visibility.mjs hide  <id>
 *   node scripts/list-visibility.mjs show  <id>
 *
 * Reads `web/.env.local` for the same service-account key the sync route uses.
 * Hiding changes nothing on-chain: the event still exists, its deposits are
 * untouched, and `/e/<id>` still opens. See `web/src/lib/listing.ts`.
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

const [action, id] = process.argv.slice(2);

if (!action) {
  const snapshot = await db.collection("events").get();
  const rows = snapshot.docs
    .map((d) => ({ id: d.id, title: d.get("title") || "(untitled)", hidden: d.get("hidden") === true }))
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || a.title.localeCompare(b.title));

  if (rows.length === 0) {
    console.log("The index has no events yet. Open the home page once: it asks the");
    console.log("server to write down what it read off the chain.");
    process.exit(0);
  }
  for (const row of rows) {
    console.log(`${row.hidden ? "hidden " : "shown  "} ${row.id}  ${row.title}`);
  }
  process.exit(0);
}

if (action !== "hide" && action !== "show") {
  console.error(`unknown action "${action}" — expected hide or show`);
  process.exit(1);
}
if (!/^C[A-Z2-7]{55}$/.test(id ?? "")) {
  console.error("that is not a contract address");
  process.exit(1);
}

const ref = db.collection("events").doc(id);
const before = await ref.get();
if (!before.exists) {
  // Writing the flag onto a document the sync route has never created would
  // leave a stub with nothing in it but `hidden`, which the list would then
  // treat as an event it knows about.
  console.error("the index has never seen that event, so there is nothing to hide yet");
  console.error("open the home page once, then try again");
  process.exit(1);
}

await ref.set({ hidden: action === "hide" }, { merge: true });
console.log(`${action === "hide" ? "hidden" : "shown"}: ${before.get("title") || id}`);
console.log("takes effect within a minute — the list caches the index for that long");
