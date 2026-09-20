/**
 * Who is allowed to start a scheduled sweep.
 *
 * Split out of the route because the interesting case is the one that is easy
 * to get backwards, and a route handler is awkward to call from a test.
 */

export type CronVerdict = "ok" | "not-configured" | "not-authorized";

/**
 * Refuse when there is no secret, rather than letting everybody in.
 *
 * This read `if (secret && header !== ...)`, which is the shape that looks like
 * a guard and is the opposite of one: with `CRON_SECRET` unset the condition is
 * false, the check is skipped, and the sweep is open to anyone who knows the
 * path. It walks the whole factory, reads every event off Soroban RPC and
 * writes the archive, so an open door there is somebody else spending our RPC
 * quota and our Firestore writes, on a loop, for free.
 *
 * Unset is therefore its own answer rather than a missing one. It fails loudly
 * on the first scheduled run instead of sitting there looking configured, which
 * is the only way a missing environment variable ever gets noticed.
 */
export function cronVerdict(
  secret: string | undefined,
  authorization: string | null,
): CronVerdict {
  if (!secret) return "not-configured";
  return authorization === `Bearer ${secret}` ? "ok" : "not-authorized";
}
