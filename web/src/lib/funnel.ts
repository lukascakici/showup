/**
 * The four steps between being invited and turning up.
 *
 * The SOW asks for the drop-off between an invitation and an attendance, which
 * is not a number the chain can answer. The chain knows who reserved and who
 * checked in; it has no idea how many people opened a link and walked away, and
 * that gap is the entire thing worth measuring about a deposit.
 *
 * So two of these are only knowable in a browser and two are also on-chain facts.
 * All four are recorded anyway, because the *linkage* is the point: one visitor's
 * path through the four, rather than four unrelated totals. The report treats the
 * chain as the authority on the last two counts and says so when they disagree.
 */
export const FUNNEL_STEPS = [
  "invite_opened",
  "wallet_connected",
  "reserved",
  "checked_in",
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export function isFunnelStep(value: unknown): value is FunnelStep {
  return typeof value === "string" && (FUNNEL_STEPS as readonly string[]).includes(value);
}

const SESSION_KEY = "showup.funnel.session";

/**
 * A random per-browser id, so four rows can be read as one person's path.
 *
 * **Pseudonymous and deliberately thin.** It is a random string this browser
 * invented; it carries no wallet, no IP, no fingerprint, and nothing derived from
 * anything about the visitor. Its only job is to let `invite_opened` and
 * `reserved` be recognised as the same visit — without it the four steps are four
 * unrelated totals and a drop-off cannot be computed at all.
 *
 * `localStorage` rather than a cookie: it never travels with a request, so it
 * cannot be read by anything we did not deliberately send it to. Wrapped in
 * try/catch because `localStorage` *throws* in a locked-down browser rather than
 * returning null, and a visitor with storage disabled must still be able to
 * reserve a spot. They simply go unmeasured, which is the correct trade.
 */
function session(): string | null {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

/**
 * Record one step. Fire-and-forget, and never in the way of anything.
 *
 * Every call site is on a path that matters — opening an invite, connecting a
 * wallet, signing for a deposit — so this must not be awaited, must not throw and
 * must not be able to fail a reservation. A funnel with a hole in it is a
 * reporting problem; a reservation that failed because a measurement did is a
 * broken product.
 */
export function track(step: FunnelStep, of: { eventId?: string; address?: string } = {}): void {
  const id = session();
  if (!id) return;

  try {
    void fetch("/api/funnel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step, session: id, ...of }),
      // The tab may be navigating away — a plain fetch can be cancelled mid-flight
      // and `checked_in` is fired right before a page changes under it.
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Deliberately silent. See above.
  }
}
