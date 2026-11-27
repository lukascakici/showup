import "server-only";

import { adminFirestore } from "./firebase-admin";
import { NAMES_COLLECTION, type Name } from "./names";
import { isAccountAddress } from "./record";

/**
 * One wallet's profile document, through the Admin SDK.
 *
 * Admin rather than the client Firestore SDK for the same reason
 * `record-index.server.ts` is: the client SDK talks gRPC and fails from a Next
 * server component with "Could not reach Cloud Firestore backend", then quietly
 * behaves as though the document were missing — which here would render a wallet
 * that has set links as one that has not, and silently drop them out of the
 * editor the next time its owner opened it.
 */
export async function readProfileAdmin(address: string): Promise<Name | null> {
  const db = adminFirestore();
  if (!db || !isAccountAddress(address)) return null;

  const snapshot = await db.collection(NAMES_COLLECTION).doc(address).get();
  return snapshot.exists ? (snapshot.data() as Name) : null;
}
