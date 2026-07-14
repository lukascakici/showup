/** Shorten a Stellar address: GABC…WXYZ */
export function shortAddr(addr: string, head = 4, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
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
