import type { IndexedEvent } from "./event-index";

/**
 * Which events the list leaves out, and why that is allowed to live off-chain.
 *
 * The chain decides what an event *is*: who is in it, whose money is locked,
 * what phase it is in, who may run it. This decides only whether it appears in
 * a list — the one thing about an event that is ours to say rather than the
 * contract's. A factory anyone can call accumulates bring-up events, probes and
 * junk, and none of that can be deleted from a chain.
 *
 * So it is **a filter over a list, and nothing else**:
 *
 * - `/e/<id>` ignores it completely. Every link ever published keeps working,
 *   including the ones in the README that are graded evidence. Hiding an event
 *   from a page is not hiding it from anybody, and building it so that it looked
 *   like it was would be the kind of claim this project exists not to make.
 * - It is applied in the browser, so it is cosmetic by construction: anyone can
 *   read the factory directly and see all of them. That is the right amount of
 *   power for a curation layer.
 * - It cannot take money, refuse a reservation, or move a score.
 *
 * **Where the flag lives.** On the event's own document in `events/{id}`, which
 * is otherwise a purely derived mirror of the chain. That is a deliberate
 * exception and it is safe for one specific reason: the sync route writes with
 * `{ merge: true }` and names every field it sets, so a hand-set `hidden`
 * survives every re-sync. It does *not* survive deleting the document and
 * re-syncing from scratch, which is the documented way to rebuild the index —
 * so that is now a thing that forgets curation, and it is written down here
 * rather than discovered later when the junk comes back.
 *
 * The alternative was a separate document holding an array of contract ids.
 * Cheaper to read and purer, and rejected: hiding an event would mean pasting a
 * 56-character address into a JSON array with nothing on screen to say which
 * event it was. The control surface is a person in the Firebase console, and
 * `hidden: true` next to a title is the version of this they can use without
 * making a mistake that takes an hour to find.
 */

/** Set `hidden: true` on `events/{id}` to take an event out of the list. */
export function isHidden(doc: Pick<IndexedEvent, "hidden">): boolean {
  // Strictly `true`, so a stray `"false"`, `0` or `null` typed into the console
  // reads as visible. The failure this avoids is an event silently vanishing
  // because somebody set a string where a boolean was expected.
  return doc.hidden === true;
}

/** Every id currently marked hidden, out of whatever the index knows about. */
export function hiddenIds(docs: Pick<IndexedEvent, "id" | "hidden">[]): Set<string> {
  return new Set(docs.filter(isHidden).map((d) => d.id));
}
