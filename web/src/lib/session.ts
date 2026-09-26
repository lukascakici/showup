import type { SignFn } from "./stellar";

/**
 * The browser's side of a wallet session.
 *
 * One signature buys a few hours of being recognised, so this is the thing that
 * stops a conversation being a wallet prompt per message. Kept in
 * `sessionStorage`, not `localStorage`: closing the tab should end it, which is
 * what somebody on a borrowed laptop would expect and is the cheapest form of
 * revocation a stateless token can have.
 *
 * Keyed by address, because one browser can hold several wallets and a token minted
 * for one of them says nothing about another.
 */
const key = (address: string) => `showup.session.${address}`;

/**
 * A real subscription, so a component can *watch* the session rather than sample it.
 *
 * The first version of this read storage once through `useSyncExternalStore` with a
 * no-op subscribe, and kept a second piece of state for a token minted during the
 * same render. That meant an expiry could clear storage and leave the component
 * holding the dead token anyway — the panel would sit there retrying a request that
 * could never succeed. Watching it instead removes the second copy and the bug with
 * it.
 */
const watchers = new Set<() => void>();

export function watchSession(onChange: () => void): () => void {
  watchers.add(onChange);
  return () => {
    watchers.delete(onChange);
  };
}

function changed() {
  for (const watcher of watchers) watcher();
}

export function storedSession(address: string): string | null {
  try {
    return sessionStorage.getItem(key(address));
  } catch {
    // `sessionStorage` throws when storage is disabled rather than returning null.
    // The visitor simply signs again; nothing else about the app depends on this.
    return null;
  }
}

function remember(address: string, token: string) {
  try {
    sessionStorage.setItem(key(address), token);
  } catch {
    // Nothing to do. The cost is another prompt.
  }
  changed();
}

export function forgetSession(address: string) {
  try {
    sessionStorage.removeItem(key(address));
  } catch {
    // Nothing to do.
  }
  changed();
}

/**
 * Prove this wallet and get a token, or reuse the one already held.
 *
 * The wallet prompt is real and unexpected, so every caller has to have explained
 * it first: it is a transaction built only to be signed, never submitted, costing
 * no fee. See `lib/wallet-proof.ts` for why a signed message could not be used.
 */
export async function openSession(
  address: string,
  sign: SignFn,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<string> {
  if (!fresh) {
    const existing = storedSession(address);
    if (existing) return existing;
  }

  const issued = await fetch(`/api/session?address=${encodeURIComponent(address)}`);
  if (!issued.ok) throw new Error(await message(issued, "Couldn't start a session."));
  const { nonce, xdr } = (await issued.json()) as { nonce: string; xdr: string };

  const { signedTxXdr } = await sign(xdr, { address });

  const minted = await fetch("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, nonce, signedXdr: signedTxXdr }),
  });
  if (!minted.ok) throw new Error(await message(minted, "Couldn't verify that signature."));

  const { token } = (await minted.json()) as { token: string };
  remember(address, token);
  return token;
}

async function message(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}
