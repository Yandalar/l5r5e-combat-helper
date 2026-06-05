import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/main.ts",
      name: "l5r5e-combat-helper",
      fileName: () => "bundle.js",
      formats: ["es"],
    },
    outDir: "dist",
    sourcemap: true,
    minify: false,
  },
});
