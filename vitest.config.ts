import { defineConfig } from "vitest/config";

/**
 * Test configuration, kept separate from vite.config.ts on purpose.
 *
 * The build config is lib-mode only, with no aliases and no plugins, so there
 * is nothing for the test config to inherit and nothing that can drift between
 * the two. Keeping them apart also means `vite build` never has to resolve
 * `vitest/config`.
 */
export default defineConfig({
  test: {
    // Explicit imports from "vitest" instead of globals, so the restrictive
    // `types` allowlist in tsconfig.json can stay untouched.
    globals: false,
    environment: "node",
    setupFiles: ["./tests/helpers/setup.ts"],
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // main.ts runs Hooks registrations at import time; the config UI is a
      // FormApplication subclass. Neither is meaningfully unit-testable.
      exclude: ["src/main.ts", "src/ui/custom-critical-config.ts"],
      reporter: ["text", "html"],
    },
  },
});
