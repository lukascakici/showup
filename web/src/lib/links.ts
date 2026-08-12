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
 * `window.location.origin` at runtime, and a harmless placeholder anywhere it
 * doesn't exist. Callers are all client components, but a module-level read
 * would still break the prerender, so the lookup happens per call.
 */
function currentOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/** Where the event lives. Share freely — reserving still costs a deposit. */
export function inviteUrl(eventId: string, origin = currentOrigin()): string {
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
  origin = currentOrigin(),
): string {
  return `${inviteUrl(eventId, origin)}?${CHECK_IN_PARAM}=${encodeURIComponent(secret)}`;
}
