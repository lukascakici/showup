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
 * ## Connected screens, on Testnet
 *
 * This file used to say a headless browser has no wallet, so the connected states
 * — a balance, the faucet, an organizer's own form — could not be captured here
 * and were taken by hand with a real wallet in the loop.
 *
 * That stopped being true when the in-app wallet shipped: on Testnet the app can
 * generate a keypair in the page and fund it from Friendbot, with nothing
 * installed and nothing to approve. `connect()` below does exactly what a visitor
 * does, so these are photographs of the real flow rather than a mock of it.
 *
 * A shot marked `wallet: true` therefore **only works against a Testnet host**.
 * On Mainnet the app refuses to make an in-app wallet — deliberately, see
 * `local-wallet.ts` — so those shots are skipped rather than silently captured
 * disconnected and filed as if they showed a connected screen.
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
  open: "CA7225ACDQPVKQ4IT2A6GI3PEQ7BBVV7HLJP4HH6KVKA4WTNYIXIK4W4",
  score: "CADTPJYUB4QYY5THYKOJAPGSWUJXTMNRJABQGYIQ5PCDH7XL4SZX6XLM",
  approval: "CCCHVUMR5XOUUQF6BTJ5ONA7MNNPBPPM3N3GA4LHWFD33PDS5CDSYYBS",
  vouch: "CCQVQ4OJF4XGT2JJXOR7A4DAQTLBKTA2PQ2QWHCLQWPBORE27RRZNZTV",
};

const WITH_RECORD = "GB7TWPUDTFK7TZCX2JEJW675KE4B2T5UPOLKNJGRDGRY5H7MYXLVNKCL";
const WITHOUT_RECORD = "GBYT3TBN4FFMNP7RSG7KRTRK4HDHHKCXEVTLVLHMIC7DBQ3BN7WOV52K";

/**
 * Make a wallet the way a visitor with nothing installed makes one.
 *
 * Open the picker, generate a key in the page, take Friendbot's 10,000 test XLM,
 * dismiss. No extension, no popup, no approval — which is the entire point of
 * the feature, and the reason these screens can be photographed at all.
 *
 * Each shot runs in its own browser context, so each one mints its own throwaway
 * key. That is wasteful of nothing: the account is free and the XLM is worth
 * nothing anywhere.
 */
async function connect(page, { fund = true } = {}) {
  await page.getByRole("button", { name: /^connect( wallet)?$/i }).first().click();
  await page.getByRole("dialog").waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: /create a wallet here/i }).click();
  await page.getByText(/your wallet is ready/i).waitFor({ timeout: 15_000 });
  if (fund) {
    await page.getByRole("button", { name: /add test xlm/i }).click();
    // Friendbot has to create the account and a ledger has to close.
    await page.getByText(/funded/i).waitFor({ timeout: 45_000 });
  }
  await page.getByRole("button", { name: /^done$/i }).click();
  await page.waitForTimeout(1500);
}

/**
 * `expect` is text the page must actually show before the shutter opens. It is
 * what stops a screenshot of a skeleton being filed as a screenshot of a screen.
 *
 * `wallet: true` runs `connect()` first and marks the shot Testnet-only.
 */
const SHOTS = [
  { id: "home", path: "/", expect: /put a price on/i, full: true },
  // The one that leads the README. Deliberately **not** `full`: the whole page is
  // nearly 4000px tall, and a lead image that tall is a scroll rather than a look.
  // One screen, which is what somebody arriving actually sees.
  { id: "lead", path: "/", expect: /put a price on/i },
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
  { id: "event-open", path: `/e/${EVENTS.open}`, expect: /soroban çalışma/i, full: true },
  { id: "event-score", path: `/e/${EVENTS.score}`, expect: /kasım demo gecesi/i, full: true },
  { id: "event-approval", path: `/e/${EVENTS.approval}`, expect: /kapalı oturum/i, full: true },
  { id: "event-vouch", path: `/e/${EVENTS.vouch}`, expect: /hafta sonu kahvesi/i, full: true },
  // Disconnected, /create is a connect prompt rather than the form — the wallet is
  // the event's organizer, so there is nothing to fill in until there is one. That
  // prompt is a real screen and worth having; the form itself needs a wallet and is
  // captured with one.
  { id: "create-connect", path: "/create", expect: /connect first/i, full: true },
  { id: "trust", path: "/trust", expect: /what we can and cannot do/i, full: true },
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

  /* ---- Testnet only: the screens the in-app wallet makes photographable ---- */

  // The way in for somebody who has never held a Stellar wallet, which is the
  // option the picker now leads with. Captured disconnected, so it is the panel
  // as a first-time visitor meets it.
  {
    id: "wallet-create-offer",
    path: "/",
    expect: /put a price on/i,
    wallet: "testnet-only",
    act: async (page) => {
      await page.getByRole("button", { name: /^connect( wallet)?$/i }).first().click();
      await page.getByRole("dialog").waitFor({ timeout: 15_000 });
      await page.getByRole("button", { name: /create a wallet here/i }).waitFor();
      await page.waitForTimeout(800);
    },
  },
  // The moment the key exists, with the warning and the export on screen. This is
  // the screen the README's claim about custody is actually about.
  {
    id: "wallet-created",
    path: "/",
    expect: /put a price on/i,
    wallet: "testnet-only",
    // Not `connect()`, which finishes by dismissing the panel — this shot is the
    // panel. Funded first, so the faucet shows its confirmation rather than an
    // untouched button: the screen somebody actually leaves this step on.
    act: async (page) => {
      await page.getByRole("button", { name: /^connect( wallet)?$/i }).first().click();
      await page.getByRole("dialog").waitFor({ timeout: 15_000 });
      await page.getByRole("button", { name: /create a wallet here/i }).click();
      await page.getByText(/your wallet is ready/i).waitFor({ timeout: 15_000 });
      await page.getByRole("button", { name: /add test xlm/i }).click();
      await page.getByText(/funded/i).waitFor({ timeout: 45_000 });
      await page.waitForTimeout(800);
    },
  },
  // The wallet menu as an in-app wallet sees it: the balance Friendbot just sent,
  // the recovery key, and the two separate ways to stop using it.
  {
    id: "wallet-menu",
    path: "/",
    expect: /put a price on/i,
    wallet: "testnet-only",
    act: async (page) => {
      await connect(page);
      await page.getByRole("button", { name: /^wallet$/i }).click();
      await page.getByText(/in-app wallet/i).first().waitFor({ timeout: 10_000 });
      await page.waitForTimeout(800);
    },
  },
  // The organizer's form, which until now could not be photographed at all —
  // disconnected, `/create` is only a prompt to connect.
  {
    id: "create-form",
    path: "/create",
    expect: /connect first/i,
    wallet: "testnet-only",
    full: true,
    act: async (page) => {
      await connect(page);
      await page.getByLabel(/event name/i).waitFor({ timeout: 15_000 });
      await page.waitForTimeout(800);
    },
  },
  // The deposit panel with a funded wallet behind it: the amount, what comes back,
  // and the button that actually moves money.
  {
    id: "event-reserve",
    path: `/e/${EVENTS.open}`,
    expect: /soroban çalışma/i,
    wallet: "testnet-only",
    full: true,
    act: async (page) => {
      await connect(page);
      await page.waitForTimeout(2500);
    },
  },
];

mkdirSync(OUT, { recursive: true });

/**
 * Chrome if the machine has it, Playwright's own Chromium if not.
 *
 * It said `channel: "chrome"` outright until 25.11.2026, which assumed a browser
 * this project never installs — and the machine taking these very screenshots did
 * not have it, so the whole set failed before the first navigation. The fallback is
 * `npx playwright install chromium` once; both are the same engine, and a set
 * nobody can reproduce is not evidence.
 */
const browser = await chromium
  .launch({ channel: "chrome", headless: true })
  .catch(async (e) => {
    console.log(`no installed Chrome (${String(e.message).split("\n")[0]}) — using Playwright's Chromium`);
    return chromium.launch({ headless: true });
  });
let taken = 0;
const failed = [];
const skipped = [];

/**
 * Whether this run is pointed at a Testnet host.
 *
 * Decided from the base URL rather than by asking the page, because the question
 * is "may this run make an in-app wallet", and the answer has to be no by
 * default. An unrecognised host is treated as real money.
 */
const isTestnetHost = /(^|\/\/)(testnet\.|localhost|127\.0\.0\.1)/.test(BASE);

for (const shot of SHOTS) {
  if (ONLY && !ONLY.includes(shot.id)) continue;

  // Skipped out loud. A connected screen captured disconnected would still be a
  // PNG of a real page, and would be filed next to the others as though it
  // showed what its name says it shows.
  if (shot.wallet === "testnet-only" && !isTestnetHost) {
    skipped.push(shot.id);
    continue;
  }

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
if (skipped.length) {
  console.log(
    `${skipped.length} skipped (need an in-app wallet, which only exists on Testnet): ${skipped.join(", ")}`,
  );
}
if (failed.length) {
  console.log(`${failed.length} failed: ${failed.join(", ")}`);
  process.exit(1);
}
