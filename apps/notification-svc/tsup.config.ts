import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "es2023",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  noExternal: ["@swiftdrop/contracts", "@swiftdrop/db"],
});
