#!/usr/bin/env node
/**
 * Fail if a server-only secret reached the client bundle.
 *
 *   node scripts/check-bundle-secrets.mjs        # after `npm run build` in web/
 *
 * Next.js exposes an environment variable to the browser if, and only if, it is
 * named `NEXT_PUBLIC_*`. That prefix is the entire boundary — nothing else
 * enforces it, no type says which side of it a value is on, and renaming a
 * variable moves a credential into every visitor's cache with no error anywhere.
 *
 * This matters here because of one value. Mainnet has no free, keyless Soroban
 * RPC the way Testnet does, so ours authenticates with an **API key inside the
 * URL**. If that URL is ever read through a `NEXT_PUBLIC_` name, it is published:
 * not in principle, but in a `.js` file anybody can download, cached by people we
 * will never be able to reach. `app/api/rpc/mainnet` exists so the browser never
 * needs it; this exists so that stays true after somebody "simplifies" it.
 *
 * ## Canaries, not the real values
 *
 * The build under test is given **distinctive fake values** for every server-only
 * variable, and this looks for those. That is deliberate:
 *
 * - It works in CI, which has no production secrets and should never have them.
 * - It tests the *mechanism* rather than today's configuration. A real-value grep
 *   passes on any machine where the variable happens to be unset — which is the
 *   one place the check would have been free, and the one place it proves nothing.
 *
 * A canary in the output means a real secret would have been there too.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolved from this file rather than from the working directory.
 *
 * CI runs the web job with `working-directory: web`, so a repo-relative path
 * pointed at `web/web/.next` and the check reported "run the build first" on a
 * run that had just built. A guard that is easy to misread as "not applicable"
 * is a guard that gets deleted.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every server-only variable the app reads, and the canary each is built with.
 *
 * Kept in step with `web/.env.example` by hand. A variable missing from this list
 * is simply unchecked, so adding a server-only one means adding it here — which
 * is the kind of thing a comment cannot enforce, and is why the canary values are
 * built from the variable's own name rather than invented separately.
 */
const SERVER_ONLY = [
  "MAINNET_RPC_URL",
  "SESSION_SECRET",
  "CRON_SECRET",
  "FIREBASE_SERVICE_ACCOUNT",
  "STELLAR_ADMIN_SECRET",
];

const canary = (name) => `canary-${name}-must-never-reach-the-browser`;

/** What `npm run build` writes, and what a browser is served from. */
const BUNDLE = join(ROOT, "web/.next/static");

/** Repo-relative, for messages — an absolute CI path is noise in a log. */
const shown = (path) => relative(ROOT, path);

if (process.argv.includes("--print-env")) {
  // Consumed by CI as the build step's environment. Printed rather than
  // duplicated in the workflow so the list above stays the only copy.
  for (const name of SERVER_ONLY) console.log(`${name}=${canary(name)}`);
  process.exit(0);
}

function files(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    console.error(
      `\n${shown(BUNDLE)} isn't there. Run \`npm run build\` in web/ first — this checks\n` +
        `the built client bundle, not the source.\n`,
    );
    process.exit(1);
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...files(path));
    // Source maps are shipped too, and a value stripped from the minified file
    // can still sit in the map beside it.
    else if (/\.(js|mjs|json|map|css|txt)$/.test(entry)) out.push(path);
  }
  return out;
}

const found = [];
const bundle = files(BUNDLE);

for (const path of bundle) {
  const source = readFileSync(path, "utf8");
  for (const name of SERVER_ONLY) {
    if (source.includes(canary(name))) found.push({ name, path });
  }
}

if (found.length > 0) {
  console.error(
    `\nA server-only value reached the client bundle.\n\n` +
      found.map((f) => `  ${f.name}  →  ${shown(f.path)}`).join("\n") +
      `\n\nAnything in ${shown(BUNDLE)} is downloadable by anybody who opens the site.\n` +
      `Next.js only exposes a variable to the browser when it is named\n` +
      `NEXT_PUBLIC_*, so one of these is now being read through such a name, or\n` +
      `is being inlined into a client component.\n\n` +
      `If the browser genuinely needs what this value gives access to, put a\n` +
      `route in front of it the way app/api/rpc/mainnet does, and give the client\n` +
      `the path — never the credential.\n`,
  );
  process.exit(1);
}

console.log(
  `ok     no server-only value in ${bundle.length} client files  (${SERVER_ONLY.length} checked)`,
);
