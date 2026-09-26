import { createHmac, timingSafeEqual } from "node:crypto";
import { isAccountAddress } from "./record";

/**
 * The wallet session token: `<address>.<expiry>.<hmac>`.
 *
 * Stateless, so there is no session table to grow and nothing to clean up. It is
 * the credential that decides who may write in an event's conversation, which is
 * why it lives in its own file with no I/O in it — every function here is a pure
 * transformation of strings and therefore testable without a server.
 *
 * Server-side by construction rather than by a `server-only` marker: it imports
 * `node:crypto`, so a client bundle that reached for it would fail to build. The
 * marker is on `wallet-proof.ts`, which is where the parts that touch Firestore
 * live.
 */

/**
 * How long one wallet prompt is good for.
 *
 * Long enough that somebody is not re-signing between messages, short enough that
 * a token copied off a shared machine stops working the same day.
 */
const SESSION_TTL_MS = 12 * 60 * 60_000;

/**
 * Keyed on a server secret. **Without the secret the feature is off** rather than
 * insecure: an app that fell back to unsigned tokens would make forging a session
 * the default in any environment somebody forgot to configure, which is exactly the
 * shape of the `CRON_SECRET` bug this project already had once.
 */
export function sessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

export function mintSession(address: string, secret: string, now = Date.now()): string {
  const expires = now + SESSION_TTL_MS;
  const body = `${address}.${expires}`;
  return `${body}.${sign(body, secret)}`;
}

/** The address a token proves, or `null` for anything that is not exactly valid. */
export function readSession(token: string, secret: string, now = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [address, expires, mac] = parts;
  // Checked before anything downstream treats it as a wallet — including as the
  // `from` on a message somebody else reads.
  if (!isAccountAddress(address)) return null;

  const deadline = Number(expires);
  if (!Number.isFinite(deadline) || deadline < now) return null;

  // Compared in constant time. A leaky comparison here would let a signature be
  // guessed a byte at a time, which is the classic way this goes wrong.
  const expected = sign(`${address}.${expires}`, secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? address : null;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}
