import { describe, expect, it } from "vitest";
import { mintSession, readSession, sessionSecret } from "./session-token";

/**
 * The session token is the credential that decides who may write in an event's
 * conversation, so everything here is a way one could be accepted when it should
 * not be.
 */

const ADDRESS = "GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW";
const OTHER = "GA5TJJJCL2VXRFJPEQW42Q5GC7NOXWIXZRGOI77TEOW42OTW6KEVNGEO";
const SECRET = "a".repeat(48);
const NOW = 1_800_000_000_000;

describe("a wallet session token", () => {
  it("reads back the address it was minted for", () => {
    const token = mintSession(ADDRESS, SECRET, NOW);
    expect(readSession(token, SECRET, NOW + 1000)).toBe(ADDRESS);
  });

  it("is refused once it expires", () => {
    const token = mintSession(ADDRESS, SECRET, NOW);
    // Twelve hours plus a second. An expiry that is not enforced is not an expiry,
    // and it is the only revocation a stateless token has.
    expect(readSession(token, SECRET, NOW + 12 * 3600_000 + 1000)).toBeNull();
  });

  it("is refused under a different secret", () => {
    expect(readSession(mintSession(ADDRESS, SECRET, NOW), "b".repeat(48), NOW)).toBeNull();
  });

  it("cannot have its address swapped", () => {
    // The obvious forgery: take a valid token and change whose it is. The MAC
    // covers the address, so this has to fail.
    const token = mintSession(ADDRESS, SECRET, NOW);
    const [, expires, mac] = token.split(".");
    expect(readSession(`${OTHER}.${expires}.${mac}`, SECRET, NOW)).toBeNull();
  });

  it("cannot have its expiry extended", () => {
    const token = mintSession(ADDRESS, SECRET, NOW);
    const [address, , mac] = token.split(".");
    const forever = String(NOW + 365 * 24 * 3600_000);
    expect(readSession(`${address}.${forever}.${mac}`, SECRET, NOW)).toBeNull();
  });

  it("refuses anything that is not three parts", () => {
    for (const bad of ["", ADDRESS, `${ADDRESS}.1`, `${ADDRESS}.1.a.b`, "..."]) {
      expect(readSession(bad, SECRET, NOW), bad).toBeNull();
    }
  });

  it("refuses a token whose address is not an address", () => {
    // Otherwise the address half is free-form text that later code trusts as a
    // wallet — including as the `from` on a message.
    const token = mintSession(ADDRESS, SECRET, NOW);
    const [, expires] = token.split(".");
    expect(readSession(`not-a-wallet.${expires}.anything`, SECRET, NOW)).toBeNull();
  });

  it("refuses an unparseable expiry rather than treating it as now", () => {
    const token = mintSession(ADDRESS, SECRET, NOW);
    const [address, , mac] = token.split(".");
    expect(readSession(`${address}.later.${mac}`, SECRET, NOW)).toBeNull();
  });
});

describe("the secret the whole thing rests on", () => {
  it("treats a missing or short secret as the feature being off", () => {
    // Not "insecure by default": an app that fell back to unsigned tokens would
    // make forging a session the norm in any environment somebody forgot to
    // configure, which is exactly the shape of the CRON_SECRET bug this project
    // already had once.
    const original = process.env.SESSION_SECRET;
    try {
      delete process.env.SESSION_SECRET;
      expect(sessionSecret()).toBeNull();
      process.env.SESSION_SECRET = "too-short";
      expect(sessionSecret()).toBeNull();
      process.env.SESSION_SECRET = SECRET;
      expect(sessionSecret()).toBe(SECRET);
    } finally {
      if (original === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = original;
    }
  });
});
