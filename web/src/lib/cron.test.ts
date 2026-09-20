import { describe, expect, it } from "vitest";
import { cronVerdict } from "./cron";

describe("who may start a sweep", () => {
  it("lets the scheduler in with the right bearer token", () => {
    expect(cronVerdict("s3cret", "Bearer s3cret")).toBe("ok");
  });

  it("turns away a wrong, absent or nearly-right token", () => {
    expect(cronVerdict("s3cret", "Bearer nope")).toBe("not-authorized");
    expect(cronVerdict("s3cret", null)).toBe("not-authorized");
    // No scheme, and the scheme is part of what is checked.
    expect(cronVerdict("s3cret", "s3cret")).toBe("not-authorized");
    // A prefix of the secret must not pass for it.
    expect(cronVerdict("s3cret", "Bearer s3cre")).toBe("not-authorized");
  });

  it("refuses when there is no secret at all", () => {
    // The bug this replaces: an unset secret skipped the check entirely, so the
    // deploy with no configuration was the one with no door on it.
    expect(cronVerdict(undefined, "Bearer anything")).toBe("not-configured");
    expect(cronVerdict(undefined, null)).toBe("not-configured");
    // An empty string is a variable somebody set and left blank. It is not a
    // secret, and treating it as one would let `Bearer ` through.
    expect(cronVerdict("", "Bearer ")).toBe("not-configured");
  });
});
