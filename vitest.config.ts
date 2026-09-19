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
    },
  },
});