import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // jsdom rather than node: some of what we test reads localStorage, and the
    // component tests need a DOM anyway.
    environment: "jsdom",
    // `.tsx` as well as `.ts` — the component tests are the ones that render.
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
