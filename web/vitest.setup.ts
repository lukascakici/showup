import { afterEach } from "vitest";

/**
 * Most of the suite runs in jsdom, but a file can opt into the `node`
 * environment with `// @vitest-environment node` — server-side crypto has to
 * stay in one JS realm, because a Node-realm `Uint8Array` fails
 * stellar-sdk v17's `instanceof` checks when jsdom supplies a second realm.
 *
 * So nothing DOM-shaped is set up unconditionally: this setup file is shared by
 * both environments, and in `node` there is no `window` to install onto.
 */
if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  const { installMatchMedia, resetMediaMatches } = await import("./src/test/media");

  installMatchMedia();

  // Vitest doesn't run Testing Library's auto-cleanup (that hooks into globals
  // this project doesn't enable), and without it every render stays in the
  // document — so a `getByText` in the third test can match markup the first one
  // left behind, and the suite passes for the wrong reason.
  afterEach(() => {
    cleanup();
    resetMediaMatches();
  });
}
