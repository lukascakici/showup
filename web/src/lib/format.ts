/** Shorten a Stellar address: GABC…WXYZ */
export function shortAddr(addr: string, head = 4, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Shorten a 64-hex-character transaction hash: 4b8c1e0a…9f2d7c31 */
export function shortHash(hash: string): string {
  return shortAddr(hash, 8, 8);
}

/**
 * An event's start time in the reader's own timezone.
 *
 * The contract stores UTC seconds; a person thinks in their own clock, and an
 * event they are travelling to is the last place to make them do the arithmetic.
 * Events created before start times existed store 0 — they have no date to show,
 * rather than a date at the epoch.
 */
export function formatWhen(startsAt: number): string {
  if (!startsAt) return "No date";
  return new Date(startsAt * 1000).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Just the clock time, for a row that already sits under a day heading.
 *
 * "Thu, Aug 20, 10:00 PM" under a heading that says "Thursday, 20 August" is
 * the same fact printed twice.
 */
export function formatTime(startsAt: number): string {
  if (!startsAt) return "";
  return new Date(startsAt * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format an XLM balance string to a readable amount. */
export function formatXlm(raw: string, decimals = 4): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/** Basic Stellar public key validation (G… ed25519, 56 chars). */
export function isValidAddress(addr: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(addr.trim());
}

/** Validate a positive decimal amount with up to 7 dp (Stellar precision). */
export function isValidAmount(amount: string): boolean {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(trimmed)) return false;
  return Number(trimmed) > 0;
}
