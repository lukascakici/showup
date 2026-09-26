import "server-only";

import { adminFirestore } from "./firebase-admin";
import { EMPTY_RECORD } from "./record";
import { RECORDS_COLLECTION, type IndexedRecord } from "./record-index";

/**
 * The same read as `readIndexedRecord`, through the Admin SDK.
 *
 * It exists because **the client Firestore SDK does not work in this server
 * runtime.** `firebase/firestore` talks gRPC, and from a Next server component it
 * fails with "Could not reach Cloud Firestore backend" and then operates in
 * offline mode — which returns *no document* rather than an error, so a server
 * component reading through it saw every mirrored record as absent and fell
 * straight back to an RPC read. Silent, and exactly the cost the mirror exists to
 * remove.
 *
 * So the rule is: **client components read through `record-index.ts`, server
 * components read through this.** Both hit the same collection and return the same
 * shape; only the transport differs.
 *
 * `server-only` makes a stray client import a build error rather than a leaked
 * service-account key.
 */
export async function readIndexedRecordAdmin(address: string): Promise<IndexedRecord | null> {
  const db = adminFirestore();
  if (!db) return null;

  const snapshot = await db.collection(RECORDS_COLLECTION).doc(address).get();
  if (!snapshot.exists) return null;
  // Spread over the defaults for the same reason as the client reader: a document
  // written before a counter existed is still a good snapshot of the ones that
  // did, and `undefined` would render as NaN.
  return { ...EMPTY_RECORD, ...(snapshot.data() as IndexedRecord) };
}
