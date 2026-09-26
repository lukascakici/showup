#!/usr/bin/env node
/**
 * Drive the whole flow in a browser you can see, and stop at every signature.
 *
 *   node scripts/guided-run.mjs --shots docs/screenshots/sow2
 *   node scripts/guided-run.mjs --video private/video
 *
 * **Why a person is in the loop at all.** Every screen worth capturing from here
 * needs a wallet: a balance, the faucet, a gate telling you whether *you* qualify,
 * an organizer's own panel, and every transaction. A headless browser has no
 * wallet, and the two ways of giving it one are both wrong:
 *
 * - **Faking one** produces real Testnet transactions but no wallet prompt, so a
 *   video shot that way shows a signature that never happened. The demo's whole
 *   claim is that the contract decides and the person approves.
 * - **Using your own Chrome profile** would hand this script your actual signing
 *   keys. Not on Testnet, not ever — it is your wallet, and a script should not be
 *   able to spend from it.
 *
 * So: this opens a visible browser, walks every step, and **waits** whenever your
 * wallet asks for something. You press Approve. Everything else — navigation,
 * timing, framing, filenames — is scripted, so the run is repeatable and the
 * screenshots line up with the ones taken without a wallet.
 *
 * Before you start: have Freighter (or any supported wallet) unlocked, on
 * **Testnet**, holding a funded account. The faucet in the app tops it up.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}

const BASE = (arg("--base", "https://showup.click") ?? "").replace(/\/$/, "");
const SHOTS = join(here, "..", arg("--shots", "docs/screenshots/sow2"));
const VIDEO = arg("--video", null);

/** The event the walkthrough happens on. Vouch-gated, because that is the story. */
const EVENT = arg("--event", "CBANCBQPJX5MGCB5PIDF35OYIU5AKSPOG3OD2RIG6ENDZFRLQZZ3BBCH");

mkdirSync(SHOTS, { recursive: true });
if (VIDEO) mkdirSync(join(here, "..", VIDEO), { recursive: true });

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => rl.question(`\n  ${q}\n  → press Enter when done: `);

/**
 * Headed, and deliberately not maximised: a 1280x900 window matches the widths
 * `capture-screens.mjs` uses, so the pair of sets is one product photographed the
 * same way rather than two.
 */
const browser = await chromium.launch({ channel: "chrome", headless: false });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
  ...(VIDEO ? { recordVideo: { dir: join(here, "..", VIDEO), size: { width: 1280, height: 900 } } } : {}),
});
const page = await context.newPage();

async function shot(id) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, `${id}-desktop.png`), fullPage: true });
  console.log(`  captured ${id}`);
}

console.log(`\nShowup — guided run against ${BASE}`);
console.log("Your wallet will ask for approval a few times. Nothing here signs for you.\n");

// 1. Connect.
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
const gotIt = page.getByRole("button", { name: /^got it$/i });
if (await gotIt.isVisible({ timeout: 4000 }).catch(() => false)) await gotIt.click();
await page.getByRole("button", { name: /^connect( wallet)?$/i }).first().click();
await ask("Pick your wallet in the dialog and approve the connection.");
await shot("connected-home");

// 2. The wallet menu: balance, faucet, the link to your own record.
await page.getByRole("button", { name: /wallet/i }).first().click();
await shot("wallet-menu");
await page.keyboard.press("Escape");

// 3. Your own record.
await page.getByRole("link", { name: /show-up record/i }).click().catch(() => {});
await page.waitForTimeout(2500);
await shot("record-mine");

// 4. The gate, seen by somebody it applies to.
await page.goto(`${BASE}/e/${EVENT}`, { waitUntil: "domcontentloaded" });
if (await gotIt.isVisible({ timeout: 4000 }).catch(() => false)) await gotIt.click();
await page.waitForTimeout(3000);
await shot("event-gate-connected");

await ask("If this wallet needs a vouch, get one now (another member can vouch from this page).");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await shot("event-admitted");

// 5. Reserve — the first signature that moves money.
await page.getByRole("button", { name: /reserve/i }).first().click().catch(() => {});
await ask("Approve the reservation in your wallet.");
await page.waitForTimeout(6000);
await shot("reserved");

// 6. Check in.
await ask("As the organizer, open check-in on this event (a second browser, or the organizer panel).");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await shot("checkin-open");

await ask("Enter the check-in code and approve it in your wallet.");
await page.waitForTimeout(6000);
await shot("checked-in");

console.log("\nDone. Screenshots in", SHOTS);
if (VIDEO) console.log("Video will be written when the browser closes.");

await rl.close();
await context.close();
await browser.close();
