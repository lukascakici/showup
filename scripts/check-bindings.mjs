#!/usr/bin/env node
/**
 * Fail if the committed TypeScript bindings no longer match the contract source.
 *
 * The bindings in web/packages/ are generated artifacts that happen to be
 * committed (Vercel needs them at install time). That makes them capable of
 * drifting: change a contract signature, forget to regenerate, and the web build
 * keeps compiling against a spec the chain no longer has. That exact drift went
 * unnoticed here for twelve days and produced two unrelated-looking failures.
 *
 * Run after `stellar contract build`, which is what produces the wasm this reads.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PACKAGES = [
  {
    wasm: "target/wasm32v1-none/release/event.wasm",
    committed: "web/packages/event-client/src/index.ts",
  },
  {
    wasm: "target/wasm32v1-none/release/factory.wasm",
    committed: "web/packages/factory-client/src/index.ts",
  },
];

/**
 * Drop the `networks` block before comparing.
 *
 * Generating from `--wasm` is hermetic but can't know a deployed address, so the
 * factory binding carries a hand-kept `networks` export. We're checking the
 * contract spec here, not the deployment — `stellar contract bindings typescript
 * --contract-id <factory> --network testnet` reproduces that block byte for byte
 * if you ever want to verify it against the live contract instead.
 */
function normalize(source) {
  return source
    .replace(/export const networks = \{[\s\S]*?\} as const\n?/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const scratch = mkdtempSync(join(tmpdir(), "showup-bindings-"));
let drifted = false;

try {
  for (const { wasm, committed } of PACKAGES) {
    const outputDir = join(scratch, committed.replace(/\W+/g, "_"));
    execFileSync(
      "stellar",
      ["contract", "bindings", "typescript", "--wasm", wasm, "--output-dir", outputDir],
      { stdio: "pipe" },
    );

    const fresh = normalize(readFileSync(join(outputDir, "src/index.ts"), "utf8"));
    const onDisk = normalize(readFileSync(committed, "utf8"));

    if (fresh === onDisk) {
      console.log(`ok     ${committed}`);
      continue;
    }

    drifted = true;
    console.error(`DRIFT  ${committed}`);
    const a = join(scratch, "committed.ts");
    const b = join(scratch, "generated.ts");
    writeFileSync(a, `${onDisk}\n`);
    writeFileSync(b, `${fresh}\n`);
    try {
      execFileSync("diff", ["-u", "--label", `${committed} (committed)`, "--label", `${committed} (regenerated)`, a, b], {
        stdio: "inherit",
      });
    } catch {
      // diff exits non-zero when files differ, which is the whole point.
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (drifted) {
  console.error(
    "\nThe contract source and the committed bindings disagree. Regenerate them:\n" +
      "  stellar contract build\n" +
      "  stellar contract bindings typescript --wasm target/wasm32v1-none/release/event.wasm \\\n" +
      "    --output-dir web/packages/event-client --overwrite\n" +
      "  stellar contract bindings typescript --contract-id <factory> --network testnet \\\n" +
      "    --output-dir web/packages/factory-client --overwrite\n" +
      "\n" +
      "Then check `git diff web/packages` before committing. `--overwrite` rewrites the\n" +
      "whole package, not just src/index.ts, and it will happily undo three things that\n" +
      "are maintained by hand:\n" +
      "  * package.json      loses `prepare: tsc` (Vercel builds the package at install\n" +
      "                      time and has nothing to import without it), downgrades\n" +
      "                      @stellar/stellar-sdk, and drops `private: true`\n" +
      "  * src/index.ts      loses the `networks` export when generated from --wasm,\n" +
      "                      because a wasm file cannot know a deployed address\n" +
      "  * README.md         reverts to INSERT_CONTRACT_ID_HERE placeholders\n" +
      "`git checkout -- web/packages/<pkg>/package.json web/packages/<pkg>/README.md` is\n" +
      "usually the whole fix.\n",
  );
  process.exit(1);
}
