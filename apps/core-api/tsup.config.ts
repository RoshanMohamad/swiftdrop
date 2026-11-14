import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/server.ts", "src/services-cli.ts"],
  format: ["esm"],
  outDir: "dist",
  sourcemap: true,
  clean: true,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  noExternal: ["@swiftdrop/db", "@swiftdrop/contracts", "@swiftdrop/messaging"],
});
