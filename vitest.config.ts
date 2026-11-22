import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.integration.test.ts", "src/**/*.stress.test.ts", "test/**/*.test.ts"],
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Match vite.config.ts — citation-js package exports use short paths that resolve via aliases.
      "citation-js/plugin-bibtex": path.resolve(
        __dirname,
        "node_modules/@citation-js/plugin-bibtex/lib/index.js"
      ),
      "citation-js/plugin-csl": path.resolve(
        __dirname,
        "node_modules/@citation-js/plugin-csl/lib/index.js"
      ),
    },
  },
});
