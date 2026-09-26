import type { SignFn } from "./stellar";

/**
 * Claim, change or clear a display name.
 *
 * Three steps, and the middle one is a wallet prompt the person did not ask for,
 * so the component calling this has to have explained it first: **nothing is
 * submitted and no fee is paid.** The transaction exists only to be signed, which
 * is the only proof of wallet control that works in all four of the wallets this
 * project supports — Albedo has `signMessage` stubbed out as SEP-0043
 * incompatible, so the obvious approach would have locked a quarter of users out
 * of having a name and they would have been the ones to find out.
 *
 * Throws with the server's own message, because every refusal here is something
 * the person can act on: the name is too long, it reads as an address, the proof
 * expired while they were looking at the wallet.
 */
export async function claimName(
  address: string,
  name: string,
  sign: SignFn,
): Promise<string | null> {
  const issued = await fetch(`/api/names?address=${encodeURIComponent(address)}`);
  if (!issued.ok) throw new Error(await message(issued, "Couldn't start the name claim."));
  const { nonce, xdr } = (await issued.json()) as { nonce: string; xdr: string };

  const { signedTxXdr } = await sign(xdr, { address });

  const claimed = await fetch("/api/names", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, name, nonce, signedXdr: signedTxXdr }),
  });
  if (!claimed.ok) throw new Error(await message(claimed, "Couldn't save that name."));

  return ((await claimed.json()) as { name: string | null }).name;
}

async function message(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}
