/**
 * The two links an organizer hands out, built in one place.
 *
 * They look almost identical and mean very different things, which is exactly
 * why they shouldn't be assembled by hand at each call site:
 *
 *   invite   /e/<id>            — safe to post anywhere; lets someone reserve
 *   check-in /e/<id>?c=<secret> — anyone holding it can check in
 *
 * The check-in link carries the secret whose sha256 is what the contract stores,
 * so it is the organizer's second copy of something otherwise held only in one
 * browser's localStorage (see lib/secrets.ts). That makes it simultaneously the
 * backup and the thing you must not paste into a group chat early.
 */

export const CHECK_IN_PARAM = "c";

/**
 * The origin every shared link is built on — deliberately not the one the page
 * happens to be served from.
 *
 * These links exist to be sent to other people. Built from
 * `window.location.origin`, an event created on `localhost:3000` produced an
 * invite nobody else could open, and a preview deployment produced one that
 * outlives the deployment. The address of an event is public information, so a
 * fixed canonical host costs nothing and removes a whole class of dead link.
 *
 * Overridable for anyone running this somewhere else.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://showup.click"
).replace(/\/+$/, "");

/**
 * Where the event lives.
 *
 * Carries no secret — it is the event's contract address and nothing else — so
 * it can be rebuilt from scratch on any device, by anyone, at any time. That is
 * why the organizer can be shown it from a browser that has never seen the
 * event before, which is not true of the check-in link below.
 */
export function inviteUrl(eventId: string, origin = SITE_URL): string {
  return `${origin}/e/${eventId}`;
}

/**
 * The same page with the check-in secret attached, so a guest arriving through
 * it doesn't have to type a code. Encoded because the secret is arbitrary text
 * as far as this function is concerned.
 */
export function checkInUrl(
  eventId: string,
  secret: string,
  origin = SITE_URL,
): string {
  return `${inviteUrl(eventId, origin)}?${CHECK_IN_PARAM}=${encodeURIComponent(secret)}`;
}
