import { describe, expect, it } from "vitest";
import { CHECK_IN_PARAM, SITE_URL, checkInUrl, inviteUrl } from "./links";

const ORIGIN = "https://showup.click";
// A real Testnet event contract, so the shape of what gets embedded is honest.
const EVENT = "CCBELUML3QPYDXC7RSQUD3GPDCZ6P3DZYORTY6MCBRMIHFKLCDYA4G6X";
// 16 random bytes as hex, which is what generateSecret() produces.
const SECRET = "0123456789abcdef0123456789abcdef";

describe("SITE_URL", () => {
  // The reason these links are built on a fixed host instead of
  // window.location.origin: an invite created on localhost, or on a preview
  // deployment, is one nobody else can open. Sharing is the entire job.
  it("is an absolute https origin with no trailing slash", () => {
    expect(SITE_URL).toMatch(/^https:\/\/[^/]+$/);
  });
});

describe("inviteUrl", () => {
  it("points at the event and carries nothing else", () => {
    expect(inviteUrl(EVENT, ORIGIN)).toBe(`${ORIGIN}/e/${EVENT}`);
  });

  it("uses the canonical host, not whatever browser built it", () => {
    expect(inviteUrl(EVENT)).toBe(`${SITE_URL}/e/${EVENT}`);
    expect(inviteUrl(EVENT)).not.toContain("localhost");
  });


  // The invite link is the one an organizer posts in a group chat. If it ever
  // gained a query string it would be worth re-reading this test's name: the
  // whole reason it is safe to share is that it grants nothing.
  it("has no query string at all", () => {
    expect(inviteUrl(EVENT, ORIGIN)).not.toContain("?");
  });
});

describe("checkInUrl", () => {
  it("is the invite link plus the secret", () => {
    expect(checkInUrl(EVENT, SECRET, ORIGIN)).toBe(
      `${inviteUrl(EVENT, ORIGIN)}?${CHECK_IN_PARAM}=${SECRET}`,
    );
  });

  it("starts with the invite link, because it is the same page", () => {
    expect(checkInUrl(EVENT, SECRET, ORIGIN).startsWith(inviteUrl(EVENT, ORIGIN))).toBe(true);
  });

  // The secret is hex today, so nothing needs escaping — which is exactly why
  // this is worth pinning. A future secret format containing `&` or `#` would
  // otherwise truncate the parameter and produce a link that looks right and
  // checks nobody in.
  it("encodes a secret that isn't URL-safe", () => {
    const url = checkInUrl(EVENT, "a&b#c d", ORIGIN);
    expect(url).toContain("a%26b%23c%20d");
    expect(new URL(url).searchParams.get(CHECK_IN_PARAM)).toBe("a&b#c d");
  });

  it("round-trips through the parser the event page uses", () => {
    const parsed = new URL(checkInUrl(EVENT, SECRET, ORIGIN));
    expect(parsed.pathname).toBe(`/e/${EVENT}`);
    expect(parsed.searchParams.get(CHECK_IN_PARAM)).toBe(SECRET);
  });
});
