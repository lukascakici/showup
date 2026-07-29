import { beforeEach, describe, expect, it } from "vitest";
import { recallSecret, rememberSecret } from "./secrets";

const KEY = "showup:secrets";

beforeEach(() => {
  window.localStorage.clear();
});

describe("check-in secrets", () => {
  it("recalls a secret the organizer stored", () => {
    rememberSecret("CEVENT1", "s3cr3t");
    expect(recallSecret("CEVENT1")).toBe("s3cr3t");
  });

  it("keeps one secret per event", () => {
    rememberSecret("CEVENT1", "first");
    rememberSecret("CEVENT2", "second");
    expect(recallSecret("CEVENT1")).toBe("first");
    expect(recallSecret("CEVENT2")).toBe("second");
  });

  it("overwrites when the same event is stored again", () => {
    rememberSecret("CEVENT1", "old");
    rememberSecret("CEVENT1", "new");
    expect(recallSecret("CEVENT1")).toBe("new");
  });

  it("returns null for an event it has never seen", () => {
    expect(recallSecret("CNOPE")).toBeNull();
  });

  it("survives a corrupted store instead of throwing", () => {
    // Losing the secret is recoverable — the check-in link carries a second copy.
    window.localStorage.setItem(KEY, "not json");
    expect(recallSecret("CEVENT1")).toBeNull();
    rememberSecret("CEVENT1", "recovered");
    expect(recallSecret("CEVENT1")).toBe("recovered");
  });
});
