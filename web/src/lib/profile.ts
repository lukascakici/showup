/**
 * The two links a wallet can put beside its name.
 *
 * An X handle and an EVM address, stored on the same document as the name
 * because they are the same kind of thing — the only fields in this product that
 * a person *authors* rather than the chain producing — and because one edit
 * should cost one wallet prompt, not three.
 *
 * ## Claimed, never verified, and the UI must say so
 *
 * A Stellar wallet signature proves one thing: that the person editing holds
 * **that Stellar wallet**. It proves nothing whatsoever about an X account or an
 * Ethereum address, and anybody can type `@jack`.
 *
 * So nothing here is a verification badge, and the display is deliberately plain:
 * these render as *"this wallet says"*, next to a name that is also only ever a
 * claim. Verifying the EVM side would mean a signature from that key too — a
 * second wallet, a second prompt, and a different feature. Verifying the X side
 * means their API. Neither is in scope, and implying otherwise in the interface
 * would be the actual harm: a reader trusting a handle because it sat inside our
 * chrome.
 *
 * The validation below is therefore about **shape and safety**, not identity.
 */

/** X's own limit, and its own alphabet. */
export const X_MAX_LENGTH = 15;

export type ProfileProblem =
  | "x-too-long"
  | "x-bad-characters"
  | "evm-not-an-address";

/**
 * A handle, with or without the leading `@`, which people type both ways.
 *
 * Stored without it: one wallet writing `@ada` and another writing `ada` must not
 * read as two different people, and the display adds the `@` back.
 */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "");
}

export function xProblem(raw: string): ProfileProblem | null {
  const handle = normalizeHandle(raw);
  if (handle.length === 0) return null; // clearing
  if (handle.length > X_MAX_LENGTH) return "x-too-long";
  // X allows letters, digits and underscore, and nothing else. Narrow on
  // purpose: this string becomes an href, and the characters that make a handle
  // render as a different handle — bidi overrides, lookalikes — are all outside
  // this set.
  if (!/^[A-Za-z0-9_]+$/.test(handle)) return "x-bad-characters";
  return null;
}

/**
 * `0x` and forty hex digits.
 *
 * Case is kept exactly as typed rather than lowercased, because mixed case in an
 * Ethereum address is EIP-55 checksum information. Rewriting it would throw away
 * the one piece of self-checking the string carries — and this field is typed by
 * hand, which is precisely when a checksum earns its place.
 */
export function evmProblem(raw: string): ProfileProblem | null {
  const value = raw.trim();
  if (value.length === 0) return null; // clearing
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return "evm-not-an-address";
  return null;
}

export const PROFILE_PROBLEMS: Record<ProfileProblem, string> = {
  "x-too-long": `${X_MAX_LENGTH} characters at most — that is X's own limit.`,
  "x-bad-characters": "Letters, numbers and underscores only.",
  "evm-not-an-address": "An Ethereum address is 0x followed by 40 hex characters.",
};

/** `0x1234…abcd`, for a field that is 42 characters of noise at full length. */
export function shortEvm(address: string): string {
  return address.length <= 13 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export const xUrl = (handle: string) => `https://x.com/${normalizeHandle(handle)}`;

/**
 * Etherscan, and only as a convenience.
 *
 * An EVM address is chain-agnostic — the same address exists on every EVM chain —
 * so linking it anywhere is already a guess. Mainnet Ethereum is the least
 * surprising one, and the address is shown in full on hover either way.
 */
export const evmUrl = (address: string) => `https://etherscan.io/address/${address.trim()}`;
