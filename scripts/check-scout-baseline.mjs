#!/usr/bin/env node
/**
 * Fail if Scout found something the published security report has no decision for.
 *
 * `docs/SOW3/security.md` claims that **every** finding either was fixed or has a
 * written reason for being left alone. That claim is true the day it is written
 * and decays silently afterwards: a new `unsafe` subtraction, a new unbounded
 * `Vec`, a new admin setter — each would be a finding nobody ever read, in a
 * report that says there are none of those.
 *
 * So the gate is not "zero findings", which would be a lie this codebase cannot
 * tell, but **"exactly the findings that have been triaged"**:
 *
 *   1. Any CRITICAL finding fails, always and without a baseline to appeal to.
 *      Every critical finding so far has been unbounded arithmetic on somebody's
 *      deposit, and none of them is ever acceptable.
 *   2. Any detector whose count rises above its baseline fails. Adding a finding
 *      therefore costs a deliberate edit here *and* a decision written into the
 *      report — which is exactly the discipline the report describes.
 *
 * A count that *drops* is fine and says so. Baselines are not auto-lowered:
 * tightening them is a separate, deliberate commit, so a fix and a regression
 * can never cancel out in the same push.
 *
 * Input is `cargo scout-audit --output-format raw-json`, which despite the name
 * is JSONL — one cargo compiler-message object per line, with the severity
 * carried as a `[CRITICAL]`-style prefix on the human message. Lines that are
 * not diagnostics (build progress, artifact notifications) are ignored.
 */
import { readFileSync } from "node:fs";

/**
 * The triaged baseline — the state of `docs/SOW3/security.md`, and the reason
 * each of these is not zero is written there. Keep the two in step: a number
 * changed here without a decision added there defeats the point of the gate.
 *
 * As published 21.11.2026: 61 findings, 0 critical.
 */
const BASELINE = {
  dynamic_storage: 11,
  contract_import_dependency: 6,
  init_instead_of_constructor: 3,
  missing_new_admin_auth: 2,
  dos_unexpected_revert_with_storage: 1,
  storage_change_events: 30,
  soroban_version: 4,
  assert_violation: 4,
};

const SEVERITIES = ["CRITICAL", "MEDIUM", "MINOR", "ENHANCEMENT"];
const report = process.argv[2] ?? "scout-report.json";

let raw;
try {
  raw = readFileSync(report, "utf8");
} catch (err) {
  console.error(
    `\nCouldn't read ${report}: ${err.message}\n\n` +
      `This script runs on the output of:\n` +
      `  cargo scout-audit --output-format raw-json --output-path ${report}\n`,
  );
  process.exit(1);
}

const findings = [];
for (const line of raw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) continue;
  let entry;
  try {
    entry = JSON.parse(trimmed);
  } catch {
    continue; // not a diagnostic line
  }
  const message = entry.message?.message;
  const match = /^\[(CRITICAL|MEDIUM|MINOR|ENHANCEMENT)\]/.exec(message ?? "");
  if (!match) continue;

  const span = entry.message?.spans?.find((s) => s.is_primary) ?? entry.message?.spans?.[0];
  findings.push({
    severity: match[1],
    detector: entry.message?.code?.code ?? "unknown",
    where: span ? `${span.file_name}:${span.line_start}` : "?",
  });
}

if (findings.length === 0) {
  // Zero is not a pass. Scout has silently produced nothing before — a detector
  // build that fails leaves an empty file behind — and an empty report looks
  // identical to a clean one.
  console.error(
    `\n${report} contains no findings at all.\n\n` +
      `That is not a clean run: this workspace has a published baseline of\n` +
      `${Object.values(BASELINE).reduce((a, b) => a + b, 0)} findings. An empty report means Scout did not actually\n` +
      `analyse anything.\n\n` +
      `Read the Scout step's own summary table first. "Compilation errors"\n` +
      `against every crate, on contracts that build fine in the Contracts job\n` +
      `and analyse fine on a laptop, has meant one thing twice: a **restored\n` +
      `dylint driver**. The pattern was cold run passes, next warm run fails.\n` +
      `~/.dylint_drivers is no longer cached for that reason — if this is\n` +
      `happening again, check whether something put it back.\n\n` +
      `If instead the table says "Analyzed" and the count is genuinely zero,\n` +
      `that is a real change and this baseline is what needs updating.\n`,
  );
  process.exit(1);
}

const bySeverity = {};
for (const s of SEVERITIES) bySeverity[s] = findings.filter((f) => f.severity === s).length;

const byDetector = {};
for (const f of findings) byDetector[f.detector] = (byDetector[f.detector] ?? 0) + 1;

const summary = SEVERITIES.filter((s) => bySeverity[s] > 0)
  .map((s) => `${bySeverity[s]} ${s.toLowerCase()}`)
  .join(", ");
console.log(`Scout: ${findings.length} findings — ${summary}`);

const failures = [];

const critical = findings.filter((f) => f.severity === "CRITICAL");
if (critical.length > 0) {
  failures.push(
    `${critical.length} CRITICAL finding${critical.length === 1 ? "" : "s"}, which never has a baseline:\n` +
      critical.map((f) => `    ${f.detector}  ${f.where}`).join("\n"),
  );
}

for (const [detector, count] of Object.entries(byDetector)) {
  const allowed = BASELINE[detector] ?? 0;
  if (count <= allowed) continue;
  if (detector === "unknown") continue; // already reported by severity above
  const fresh = findings.filter((f) => f.detector === detector);
  failures.push(
    `${detector}: ${count} findings, baseline ${allowed}\n` +
      fresh.map((f) => `    ${f.severity}  ${f.where}`).join("\n"),
  );
}

for (const [detector, allowed] of Object.entries(BASELINE)) {
  const count = byDetector[detector] ?? 0;
  if (count < allowed) {
    console.log(
      `       ${detector} is down to ${count} from ${allowed} — lower the baseline in this script when that is deliberate.`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    `\nScout found something docs/SOW3/security.md has no decision for.\n\n` +
      failures.map((f) => `  ${f}`).join("\n\n") +
      `\n\nFix it, or — if it is a finding this project accepts — write the reason\n` +
      `into docs/SOW3/security.md and raise the baseline in scripts/check-scout-baseline.mjs.\n` +
      `A finding with no decision attached is the one thing that report promises\n` +
      `does not exist.\n`,
  );
  process.exit(1);
}

console.log(`ok     every finding is one docs/SOW3/security.md already decides on`);
