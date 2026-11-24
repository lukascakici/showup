/**
 * The server's own words for why it refused.
 *
 * Every route in this app that can say no says why in an `error` field, and the
 * reasons are things a person can act on — the name is too long, the proof
 * expired while the wallet was open, only a host can do that. Replacing them
 * with a generic failure would throw away the only useful part of the response.
 *
 * The fallback is for the cases with no body to read: a gateway timeout, a
 * deploy mid-request, an origin that answered HTML.
 */
export async function serverMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}
