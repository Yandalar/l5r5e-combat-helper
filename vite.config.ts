import { defineConfig } from "vite";

// `vite build --mode release` (npm run build:release): minified, no source map
// in the published ZIP. Dev builds keep both readable code and the map for
// debugging in the browser.
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
    minify: mode === "release" ? "esbuild" : false,
  },
}));
