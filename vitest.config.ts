import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx"],
    environmentMatchGlobs: [["packages/app/test/**", "jsdom"]],
    // Explicitly wires up @testing-library/react's cleanup between tests —
    // see packages/app/test/setup.ts. Listed here (root is the only place
    // Vitest reads setupFiles from) but self-scoped to the app package: it
    // no-ops everywhere `document` doesn't exist, i.e. pf2data and schema.
    setupFiles: ["packages/app/test/setup.ts"],
  },
});
