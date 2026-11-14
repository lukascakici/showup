import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside a Server Component, and the test
      // environment is jsdom, so every module that guards itself with it was
      // untestable — including the wallet signature check. Aliasing it to an
      // empty module is the standard escape hatch: it removes the guard for the
      // test run only, and Next still enforces it at build time.
      "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)),
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
