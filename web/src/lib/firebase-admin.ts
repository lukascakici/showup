import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * The write side, server only.
 *
 * The Admin SDK bypasses `firestore.rules` entirely, which is exactly why the
 * service-account key must never reach the browser. `server-only` above turns a
 * stray client import into a build error rather than a leak discovered later.
 *
 * The key is one env var holding the whole JSON Google hands out, rather than
 * three fields picked out of it: fewer ways to paste half of it, and rotating
 * it is a single replace.
 */
function credentials(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  let parsed: { project_id?: string; client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A malformed key is a deployment mistake, not a user's problem — the
    // caller degrades to "index unavailable" and the app still reads the chain.
    console.error("FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON");
    return null;
  }

  const { project_id: projectId, client_email: clientEmail } = parsed;
  // Vercel's env editor stores newlines as the two characters \ and n, so a key
  // pasted through the dashboard needs them turned back into real newlines
  // before OpenSSL will look at it.
  const privateKey = parsed.private_key?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.error("FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email or private_key");
    return null;
  }
  return { projectId, clientEmail, privateKey };
}

let cached: Firestore | null = null;

/** `null` when the server has no key, which callers must treat as "no index". */
export function adminFirestore(): Firestore | null {
  if (cached) return cached;

  const creds = credentials();
  if (!creds) return null;

  const app: App = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert(creds), projectId: creds.projectId });

  cached = getFirestore(app);
  return cached;
}
