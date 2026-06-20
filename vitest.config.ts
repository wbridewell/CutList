import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic"
    }
  },
  test: {
    environment: "node",
    exclude: ["src/**/*.live.test.ts"],
    include: ["src/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url))
    }
  },
  root
});
