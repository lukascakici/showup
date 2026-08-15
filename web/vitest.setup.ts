import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { installMatchMedia, resetMediaMatches } from "./src/test/media";

installMatchMedia();

// Vitest doesn't run Testing Library's auto-cleanup (that hooks into globals
// this project doesn't enable), and without it every render stays in the
// document — so a `getByText` in the third test can match markup the first one
// left behind, and the suite passes for the wrong reason.
afterEach(() => {
  cleanup();
  resetMediaMatches();
});
