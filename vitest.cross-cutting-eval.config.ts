import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, root, ""));

  return {
    oxc: {
      jsx: {
        runtime: "automatic"
      }
    },
    test: {
      environment: "node",
      include: ["src/lib/ai/testing/crossCuttingEval.live.test.ts"],
      testTimeout: 1800000
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url))
      }
    },
    root
  };
});
