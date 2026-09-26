import { describe, expect, it } from "vitest";
import { MESSAGE_MAX_LENGTH, messageProblem } from "./messages";

/**
 * The conversation is the only place on Showup where one person writes text that
 * others read, so the limits are about text that renders as something other than
 * what it is — not about tone.
 */

describe("what a message may be", () => {
  it("accepts what people actually write, including lists", () => {
    // Newlines are deliberately allowed: the first real use of this will be
    // somebody listing what to bring.
    for (const body of ["I'll bring the ball", "bring:\n- water\n- a bib", "🙂 ok", "Geliyorum"]) {
      expect(messageProblem(body), body).toBeNull();
    }
  });

  it("refuses nothing, including whitespace that looks like something", () => {
    expect(messageProblem("")).toBe("empty");
    expect(messageProblem("   \n  ")).toBe("empty");
  });

  it("refuses invisible characters that disguise text", () => {
    // U+202E reverses everything after it, which is how one string is made to
    // render as another.
    expect(messageProblem("see you at 7‮rebmun ym llac")).toBe("control-characters");
    expect(messageProblem("hi​there")).toBe("control-characters");
  });

  it("measures the trimmed length, so padding cannot smuggle a long message", () => {
    expect(messageProblem(`  ${"a".repeat(MESSAGE_MAX_LENGTH)}  `)).toBeNull();
    expect(messageProblem("a".repeat(MESSAGE_MAX_LENGTH + 1))).toBe("too-long");
  });
});
