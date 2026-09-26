#!/usr/bin/env node
/**
 * Capture every screen, at every width, the same way every time.
 *
 *   node scripts/capture-screens.mjs                      # live site, into docs/screenshots/sow2
 *   node scripts/capture-screens.mjs --base http://localhost:3000
 *   node scripts/capture-screens.mjs --out docs/screenshots/before
 *   node scripts/capture-screens.mjs --only home,record
 *
 * **Framed identically on purpose.** The SOW asks for before-and-after pairs, and a
 * pair only reads as a pair if nothing but the product changed between them — same
 * width, same scale, same waits. Capturing by hand guarantees the opposite.
 *
 * Drives the Chrome already installed rather than downloading a browser, so this
 * needs `npm i playwright-core` and nothing else.
 *
 * ## What it deliberately cannot do
 *
 * Every screen here renders **without a wallet**. The connected states — a balance,
 * the faucet, a gate telling you whether you qualify, an organizer's own panel —
 * need a wallet to sign, and a headless browser has none. Those are captured
 * separately with a real wallet in the loop. Nothing in this file pretends
 * otherwise: if a screen needs a wallet it is not in the list below.
 *
 * ## Waiting
 *
 * Never on `networkidle`. The app polls the chain every five to ten seconds, so the
 * network never goes idle and that wait times out every time. Each shot names a
 * thing it expects to see instead.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}

const BASE = (arg("--base", "https://showup.click") ?? "").replace(/\/$/, "");
const OUT = join(here, "..", arg("--out", "docs/screenshots/sow2"));
const ONLY = arg("--only", null)?.split(",").map((s) => s.trim());

/** Phone first, because that is how most invite links are opened. */
const WIDTHS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
];

/**
 * A live event per admission mode, so the gates are photographed against real
 * state rather than an empty shell. Passed in rather than discovered: which event
 * is the good example is a judgement, and it changes.
 */
const EVENTS = {
  open: "CCRN7I6ILH3CPTQTNWITGGXKYQ4MRHBIRJ7C4DARBWDCEIXBTBRIPCUP",
  score: "CANOMZA2OBJ5OAYGBZC3QMILYLN3PNU4QZZLRKLGNYVI3GZ3IIPV6MPJ",
  approval: "CCNOAF4MLQGHIIZYNW5VMJPT6LACR44CXEZO3CGS7L5IKRUHFBGXQKY3",
  vouch: "CBANCBQPJX5MGCB5PIDF35OYIU5AKSPOG3OD2RIG6ENDZFRLQZZ3BBCH",
};

const WITH_RECORD = "GB7TWPUDTFK7TZCX2JEJW675KE4B2T5UPOLKNJGRDGRY5H7MYXLVNKCL";
const WITHOUT_RECORD = "GBYT3TBN4FFMNP7RSG7KRTRK4HDHHKCXEVTLVLHMIC7DBQ3BN7WOV52K";

/**
 * `expect` is text the page must actually show before the shutter opens. It is
 * what stops a screenshot of a skeleton being filed as a screenshot of a screen.
 */
const SHOTS = [
  { id: "home", path: "/", expect: /put a price on/i, full: true },
  {
    id: "home-past",
    path: "/",
    expect: /put a price on/i,
    full: true,
    act: async (page) => {
      await page.getByRole("button", { name: /^past$/i }).click();
      await page.waitForTimeout(2000);
    },
  },
  { id: "event-open", path: `/e/${EVENTS.open}`, expect: /stellar night seoul/i, full: true },
  { id: "event-score", path: `/e/${EVENTS.score}`, expect: /madrid/i, full: true },
  { id: "event-approval", path: `/e/${EVENTS.approval}`, expect: /vip mixer/i, full: true },
  { id: "event-vouch", path: `/e/${EVENTS.vouch}`, expect: /riserva/i, full: true },
  // Disconnected, /create is a connect prompt rather than the form — the wallet is
  // the event's organizer, so there is nothing to fill in until there is one. That
  // prompt is a real screen and worth having; the form itself needs a wallet and is
  // captured with one.
  { id: "create-connect", path: "/create", expect: /connect first/i, full: true },
  { id: "record", path: `/u/${WITH_RECORD}`, expect: /show-up record/i, full: true },
  { id: "record-empty", path: `/u/${WITHOUT_RECORD}`, expect: /never seen this wallet/i, full: true },
  { id: "record-bad-address", path: "/u/GBEDUGG", expect: /not a wallet address/i },
  { id: "event-missing", path: `/e/${"C".repeat(56)}`, expect: /no event here|couldn't load/i },
  {
    id: "wallet-picker",
    path: "/",
    expect: /put a price on/i,
    act: async (page) => {
      // "Connect wallet" on desktop, "Connect" on a phone — the top bar drops the
      // second word to fit. Matching only the long form silently lost every phone
      // capture of this dialog.
      await page.getByRole("button", { name: /^connect( wallet)?$/i }).first().click();
      await page.getByRole("dialog").waitFor({ timeout: 15_000 });
      await page.waitForTimeout(1200);
    },
  },
  {
    id: "first-run",
    path: `/e/${EVENTS.open}`,
    expect: /before you reserve/i,
    // The onboarding panel shows once per browser, and every context here is fresh,
    // so it is on screen by default — it has to be dismissed for the other event
    // shots, which is why those run in their own contexts.
  },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
let taken = 0;
const failed = [];

for (const shot of SHOTS) {
  if (ONLY && !ONLY.includes(shot.id)) continue;

  for (const size of WIDTHS) {
    // A context per shot, so `localStorage` never carries a dismissed panel from
    // one screen into the next. The onboarding shot depends on this.
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const file = join(OUT, `${shot.id}-${size.name}.png`);

    try {
      await page.goto(BASE + shot.path, { waitUntil: "domcontentloaded", timeout: 60_000 });

      await page.getByText(shot.expect).first().waitFor({ timeout: 30_000 });

      // Dismissed *after* the page has content, not before. The first-run panel
      // renders inside the loaded-event branch, so on an event page it does not
      // exist yet when the navigation settles — dismissing early found nothing and
      // the panel then opened across the shot. Caught by looking at the output.
      if (shot.id !== "first-run") {
        const got = page.getByRole("button", { name: /^got it$/i });
        if (await got.isVisible({ timeout: 6000 }).catch(() => false)) {
          await got.click();
          await page.waitForTimeout(600);
        }
      }
      if (shot.act) await shot.act(page);
      // Let the first poll land, so nothing is caught mid-skeleton.
      await page.waitForTimeout(2500);

      await page.screenshot({ path: file, fullPage: !!shot.full });
      console.log(`ok     ${shot.id}-${size.name}`);
      taken += 1;
    } catch (e) {
      // Recorded rather than thrown: one screen that will not settle must not cost
      // the other twelve, and a silent gap in the set is worse than a loud one.
      console.error(`FAIL   ${shot.id}-${size.name}  ${String(e.message).split("\n")[0]}`);
      failed.push(`${shot.id}-${size.name}`);
    } finally {
      await context.close();
    }
  }
}

await browser.close();
console.log(`\n${taken} captured into ${OUT}`);
if (failed.length) {
  console.log(`${failed.length} failed: ${failed.join(", ")}`);
  process.exit(1);
}
