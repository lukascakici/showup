import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * The read side of the off-chain index.
 *
 * Every value here is public by design — a Firebase web config ships inside the
 * client bundle and cannot be a secret. Nothing about it grants write access:
 * `firestore.rules` denies client writes outright, and the only thing that
 * writes to this database is `/api/events/sync`, which re-derives every field
 * from the chain. See that route for why that removes the need to prove who is
 * calling.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Whether the index is available at all.
 *
 * Deliberately a runtime check rather than a build-time requirement. The index
 * is an accelerator, not a dependency: with the env vars absent the app reads
 * everything from the chain exactly as it did before Firestore existed. A
 * missing key must never be the difference between a working app and a blank
 * page — that is the failure mode this whole file is shaped to avoid.
 */
export const firebaseEnabled = Object.values(config).every(
  (v) => typeof v === "string" && v.length > 0,
);

let cached: Firestore | null = null;

/** `null` when the index isn't configured. Callers must handle that. */
export function firestore(): Firestore | null {
  if (!firebaseEnabled) return null;
  if (!cached) {
    const app = getApps().length ? getApp() : initializeApp(config as Record<string, string>);
    cached = getFirestore(app);
  }
  return cached;
}
