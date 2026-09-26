#!/usr/bin/env node
/**
 * The three mobile failures that are visible in the source, checked on every run.
 *
 *   node scripts/mobile-audit.mjs
 *
 * **This is not a substitute for looking at it on a phone.** It cannot see
 * overlapping text, a heading that wraps badly at 280px, or a sheet that opens off
 * the bottom of the screen. What it can do is catch the three that have actually
 * bitten this project, every time, instead of the once somebody remembers to check:
 *
 * 1. **An input under 16px.** iOS Safari zooms the page in when a focused input's
 *    font-size is below 16px and does not zoom back out, leaving the visitor on a
 *    page wider than their screen, panning sideways to find the button they were
 *    about to press. The alternative fix is `maximum-scale=1`, which solves it by
 *    taking pinch-zoom away from everybody.
 *
 * 2. **A tap target under 44px.** Found by hand once already: the copy button on
 *    the organizer's check-in link was a bare 16px icon, a third of what a thumb
 *    needs, on the control that answers "did my refund arrive".
 *
 * 3. **A fixed width wide enough to leave the viewport.** The wallet menu was a
 *    hard `w-80` — 320px — and hung off the left edge of anything narrower than
 *    about 352px with no scrollbar to bring it back. The balance and the faucet
 *    were simply not there.
 *
 * Each rule is deliberately narrow. A checker that reports things which are fine
 * gets ignored, and an ignored checker is worse than none.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "web", "src");

/** 44px is 2.75rem, which is Tailwind's `11`. */
const MIN_TAP = 11;

/** 18rem = 288px, the point at which a fixed width starts risking a 320px screen. */
const WIDE = 72;

/**
 * Blank out every comment, keeping the line count.
 *
 * The first version of this reported `w-80` in WalletMenu — from the comment
 * *explaining* that `w-80` was the bug and had been fixed. A checker that reports
 * prose is a checker people learn to ignore.
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (line) => line.replace(/./g, " "));
}

/**
 * The attribute run of one opening tag, and nothing inside the element.
 *
 * The first version read a fixed twelve lines forward, which meant a `<button>`
 * containing a 16px spinner icon was reported as a 16px button — twice, including
 * on the shared `Button` whose real sizing lives in `classesFor`. Scanning to the
 * tag's own `>` is the difference between measuring the control and measuring its
 * contents.
 */
function openingTag(source, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return source.slice(from, i);
  }
  return source.slice(from);
}

function files(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

const findings = [];

function report(file, line, rule, detail) {
  findings.push({ file: relative(join(here, ".."), file), line, rule, detail });
}

for (const file of files(root)) {
  const source = withoutComments(readFileSync(file, "utf8"));
  const lines = source.split("\n");

  lines.forEach((line, i) => {
    const at = i + 1;

    // 1. Inputs that iOS will zoom into.
    //
    // Matched on the element rather than on every `text-sm` in the file, because
    // small type is correct nearly everywhere and wrong only in a focusable field.
    if (/<(input|textarea)\b/.test(line)) {
      const small = line.match(/\btext-(xs|sm)\b|\btext-\[1[0-5](\.\d+)?px\]/);
      if (small) report(file, at, "ios-zoom", `${small[0]} on a focusable field`);
    }

    // 2. Tap targets a thumb cannot hit.
    //
    // Raw `<button>` only. The shared `Button` sizes itself and is covered by its
    // own definition; re-deriving that here would mean guessing at a variant.
    const button = line.indexOf("<button");
    if (button !== -1) {
      const offset = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0) + button;
      const tag = openingTag(source, offset);
      const sized = [...tag.matchAll(/\b(?:size|h|min-h)-(\d+(?:\.\d+)?)\b/g)].map((m) =>
        Number(m[1]),
      );
      // `py-*` sizes a button just as well as `h-*`; a tag with neither is sized by
      // its content and is not something this can measure.
      const padded = /\bpy-(\d+(?:\.\d+)?)\b/.test(tag);
      if (sized.length > 0 && !padded && Math.max(...sized) < MIN_TAP) {
        report(file, at, "small-tap", `largest height class is ${Math.max(...sized)}, under ${MIN_TAP}`);
      }
    }

    // 3. A fixed width that can exceed a narrow screen with no escape.
    const wide = [...line.matchAll(/\bw-(\d+)\b/g)].map((m) => Number(m[1])).filter((n) => n >= WIDE);
    if (wide.length > 0 && !/max-w-\[calc\(100vw|max-w-full|max-w-\[100/.test(line)) {
      report(file, at, "fixed-width", `w-${Math.max(...wide)} with no viewport cap`);
    }
  });
}

const RULES = {
  "ios-zoom": "An input under 16px — iOS Safari will zoom in and not zoom back out",
  "small-tap": `A tap target under 44px (Tailwind ${MIN_TAP})`,
  "fixed-width": `A fixed width of ${WIDE} (${WIDE / 4}rem) or more with no viewport cap`,
};

console.log(`Checked ${files(root).length} components for three measurable mobile faults.\n`);

if (findings.length === 0) {
  console.log("ok     none of the three found");
} else {
  for (const rule of Object.keys(RULES)) {
    const hits = findings.filter((f) => f.rule === rule);
    if (hits.length === 0) continue;
    console.log(`${rule} — ${RULES[rule]}`);
    for (const hit of hits) console.log(`   ${hit.file}:${hit.line}  ${hit.detail}`);
    console.log();
  }
}

console.log(
  "This sees three faults and no others. Overlapping text, a heading that wraps\n" +
    "badly at 280px and a sheet that opens off-screen are still things somebody has\n" +
    "to look at on a real phone.",
);

process.exit(findings.length === 0 ? 0 : 1);
