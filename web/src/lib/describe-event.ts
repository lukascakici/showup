import { serverMessage } from "./api";
import type { EventDescription } from "./event-description";
import type { SignFn } from "./stellar";

/**
 * Write or clear an event's description, as one of its hosts.
 *
 * The same three steps as `claimName`, and the same wallet prompt in the middle
 * that the person did not ask for — so the component calling this has to have
 * explained it first: **nothing is submitted and no fee is paid.** See
 * `wallet-proof.ts` for why a transaction rather than `signMessage()`.
 *
 * One difference worth knowing while reading the component: the server checks
 * the event's host list *before* it spends the proof. So a transient RPC failure
 * leaves the signature unused and the same one cannot be retried — a fresh
 * challenge is issued on the next attempt — but a 503 here means "try again",
 * not "sign again and try again".
 *
 * Throws the server's own message, because every refusal is something the person
 * can act on: too long, invisible characters, not a host, the proof expired
 * while the wallet was open.
 */
export async function describeEvent(
  eventId: string,
  address: string,
  body: string,
  sign: SignFn,
): Promise<EventDescription | null> {
  const issued = await fetch(
    `/api/events/${eventId}/description/challenge?address=${encodeURIComponent(address)}`,
  );
  if (!issued.ok) throw new Error(await serverMessage(issued, "Couldn't start the save."));
  const { nonce, xdr } = (await issued.json()) as { nonce: string; xdr: string };

  const { signedTxXdr } = await sign(xdr, { address });

  const saved = await fetch(`/api/events/${eventId}/description`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, body, nonce, signedXdr: signedTxXdr }),
  });
  if (!saved.ok) throw new Error(await serverMessage(saved, "Couldn't save that."));

  return ((await saved.json()) as { description: EventDescription | null }).description;
}
