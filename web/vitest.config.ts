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
    // component tests coming later need a DOM anyway.
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
