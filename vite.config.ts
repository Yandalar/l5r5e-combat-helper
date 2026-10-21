import { defineConfig } from "vite";

// `vite build --mode release` (npm run build:release): no source map in the
// published ZIP. Dev builds keep it for debugging in the browser.
export default defineConfig(({ mode }) => ({
  build: {
    lib: {
      entry: "src/main.ts",
      name: "l5r5e-combat-helper",
      fileName: () => "bundle.js",
      formats: ["es"],
    },
    outDir: "dist",
    sourcemap: mode !== "release",
    minify: false,
  },
}));
