/**
 * An event in its organizer's own words.
 *
 * **The only thing in this app that nobody verified.** Every other field about
 * an event was read off a contract; this one was typed by a person. That is the
 * whole reason it lives in its own collection with its own rules rather than as
 * one more field on the index document.
 *
 * ## Why it is not part of the event index
 *
 * `event-index.ts` describes itself as "a derived record, never an authority" —
 * every field copied from the chain, and re-derivable by deleting the document
 * and syncing again. That property is what lets the index be written without
 * asking who is calling.
 *
 * A description is **authored**, so neither half holds: it cannot be re-derived
 * from anything, and the write has to prove who is asking. Put it on the index
 * document and `/api/events/sync` would overwrite it on the next sweep —
 * turning "delete and rebuild" from a safety property into a way to lose an
 * organizer's writing.
 *
 * ## Why the contract does not hold it
 *
 * Because the contracts are frozen, and a description is not worth reopening a
 * frozen commit for. The consequence is stated on the page rather than hidden:
 * the description is attributed, and it never shares a panel with the deposit,
 * the capacity or the forfeit policy. Those are chain facts and must not share
 * a border with prose.
 */

/** Plain text only. See `isBody`. */
export const MAX_DESCRIPTION_LENGTH = 2_000;

export const DESCRIPTIONS_COLLECTION = "eventDescriptions";

/** The purpose a wallet challenge must carry to write one of these. */
export const DESCRIPTION_PURPOSE = "event-description";

export type EventDescription = {
  /** The event contract this describes. */
  eventId: string;
  /** Which factory deployed it — and so, implicitly, which network. */
  factory: string;
  body: string;
  /** The host who wrote the current text. */
  authoredBy: string;
  updatedAt: number;
  /**
   * Every previous version, oldest first.
   *
   * Kept because a description shown to somebody who reserved, and rewritten
   * afterwards, is a changed offer against an unchanged contract. The contract
   * cannot be edited; this can, and "it said something else when I signed up"
   * has to be answerable. Only the current text is ever rendered.
   */
  history?: { body: string; authoredBy: string; at: number }[];
};

/**
 * Where one event's description lives.
 *
 * **The factory is in the key, not just in a field.** The same mistake was found
 * in the records index on 22.11: a document keyed by the contract alone collides
 * across networks, and whichever synced last wins. It is cheaper not to have
 * that bug twice than to fix it twice.
 */
export function descriptionDocId(factoryId: string, eventId: string): string {
  return `${factoryId}_${eventId}`;
}

/**
 * Is this text something we will store?
 *
 * Trimmed first, because trailing whitespace is not content and a body of
 * nothing but spaces is an empty description typed slowly. Empty is **not**
 * valid here — removing a description is deleting the document, which is a
 * different operation from writing an empty one, and conflating them would make
 * "cleared by the organizer" and "never written" indistinguishable.
 */
export function isBody(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_DESCRIPTION_LENGTH;
}

/**
 * The text as it will be stored.
 *
 * Trimmed at both ends, and line endings normalised so a description typed on
 * Windows and one typed on a Mac are the same string — otherwise an edit that
 * changed nothing but the newlines would look like a real revision in the
 * history above.
 *
 * Nothing else is touched. No HTML is stripped because none is ever rendered:
 * this is stored as text and displayed as text. Rendering markup from an
 * authenticated-but-arbitrary author would be an XSS surface, and a link in a
 * description is a phishing surface on a page where somebody is about to sign a
 * transaction.
 */
export function normalizeBody(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

/**
 * The first line or so, for a share card.
 *
 * Collapses the newlines a description is allowed to have, because Open Graph
 * descriptions are a single line and a raw "\n" renders as a space in some
 * clients and as nothing in others.
 */
export function toShareText(body: string, limit = 160): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  // Cut at a word boundary when there is one nearby, so the preview does not end
  // mid-word. 24 characters back is enough for any ordinary word.
  const cut = flat.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  const text = space > limit - 24 ? cut.slice(0, space) : cut;
  return `${text.trimEnd()}…`;
}
