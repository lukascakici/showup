import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { adminFirestore } from "./firebase-admin";
import {
  DESCRIPTIONS_COLLECTION,
  descriptionDocId,
  normalizeBody,
  type EventDescription,
} from "./event-description";

/**
 * Reading and writing an event's description, through the Admin SDK.
 *
 * Admin rather than the client Firestore SDK for the same reason
 * `record-index.server.ts` is: the client SDK talks gRPC and fails from a Next
 * server component with "Could not reach Cloud Firestore backend", then quietly
 * behaves as though the document were missing — which here would render an
 * event as having no description rather than as having one we could not read.
 *
 * There is no public GET route for this. The page that shows a description is
 * server-rendered, so it reads here directly and hands the text down; adding an
 * endpoint nothing calls would be one more surface to get wrong.
 */

/** How many previous versions to keep. */
const MAX_HISTORY = 20;

export async function readDescription(
  factoryId: string,
  eventId: string,
): Promise<EventDescription | null> {
  const db = adminFirestore();
  if (!db) return null;

  const snapshot = await db
    .collection(DESCRIPTIONS_COLLECTION)
    .doc(descriptionDocId(factoryId, eventId))
    .get();
  return snapshot.exists ? (snapshot.data() as EventDescription) : null;
}

/**
 * Write a description, keeping whatever was there before.
 *
 * A transaction, not a `set`: two hosts saving at the same moment would
 * otherwise each read the same history, append their own line to it, and the
 * second write would drop the first one's revision. Rare, and silent, and about
 * the one record here that cannot be rebuilt from the chain.
 */
export async function writeDescription(
  db: Firestore,
  {
    factoryId,
    eventId,
    body,
    authoredBy,
    now = Date.now(),
  }: {
    factoryId: string;
    eventId: string;
    body: string;
    authoredBy: string;
    now?: number;
  },
): Promise<EventDescription> {
  const ref = db.collection(DESCRIPTIONS_COLLECTION).doc(descriptionDocId(factoryId, eventId));
  const text = normalizeBody(body);

  return db.runTransaction(async (tx) => {
    const prior = await tx.get(ref);
    const existing = prior.exists ? (prior.data() as EventDescription) : null;

    // An edit that changes nothing does not become a revision. Otherwise opening
    // the editor and pressing save would fill the history with identical rows and
    // make the one question it exists to answer — "did this change after I
    // reserved?" — harder to read rather than easier.
    if (existing && existing.body === text) return existing;

    const history = [...(existing?.history ?? [])];
    if (existing) {
      history.push({ body: existing.body, authoredBy: existing.authoredBy, at: existing.updatedAt });
    }

    const next: EventDescription = {
      eventId,
      factory: factoryId,
      body: text,
      authoredBy,
      updatedAt: now,
      // Oldest dropped first. A bound is needed because a document has a size
      // limit and this one grows every time somebody edits; twenty revisions is
      // far more than any real event will see, and the alternative is a write
      // that starts failing after enough edits.
      ...(history.length > 0 ? { history: history.slice(-MAX_HISTORY) } : {}),
    };

    tx.set(ref, next);
    return next;
  });
}

/**
 * Remove a description entirely.
 *
 * Deliberately a delete rather than an empty body: "the organizer cleared this"
 * and "nobody ever wrote one" are the same state as far as the page is
 * concerned, and keeping an empty document around would mean two ways to spell
 * the same thing. The history goes with it, which is the honest consequence of
 * being asked to remove it.
 */
export async function deleteDescription(
  db: Firestore,
  factoryId: string,
  eventId: string,
): Promise<void> {
  await db
    .collection(DESCRIPTIONS_COLLECTION)
    .doc(descriptionDocId(factoryId, eventId))
    .delete();
}
