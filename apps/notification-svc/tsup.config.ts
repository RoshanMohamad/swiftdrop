import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/index.ts"],
  format: ["esm"],
  target: "es2023",
  outDir: "dist",
  sourcemap: true,
  dts: true,
  clean: true,
  noExternal: ["@swiftdrop/contracts", "@swiftdrop/db"],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
