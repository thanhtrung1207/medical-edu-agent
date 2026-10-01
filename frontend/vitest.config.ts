import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": resolve(rootDir, "./src") } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // Needed so @testing-library/react's auto-cleanup (which checks for a
    // global `afterEach`) runs between tests. Several test files already
    // call `afterEach(cleanup)` manually; that remains harmless/idempotent
    // alongside this global auto-cleanup.
    globals: true,
  },
});
