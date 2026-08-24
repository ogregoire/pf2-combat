import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx"],
    environmentMatchGlobs: [["packages/app/test/**", "jsdom"]],
    // Exposes `afterEach` as a global so @testing-library/react's built-in
    // auto-cleanup (index.js: `if (typeof afterEach === 'function')`) fires
    // between tests — needed once a test file calls render() more than once.
    globals: true,
  },
});
