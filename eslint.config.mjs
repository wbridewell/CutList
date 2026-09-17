import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next 15.x ships legacy-format configs; FlatCompat adapts them for ESLint 9.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

// Each layer is a regex over the import specifier. Regexes rather than gitignore groups
// because a group cannot re-include one file under an excluded directory, and two layers
// need exactly that kind of exception.
const layer = (path) => `^@/${path}(/|$)`;
const layerPatterns = {
  app: layer("app"),
  components: layer("components"),
  hooks: layer("hooks"),
  client: layer("lib/client"),
  desktop: layer("lib/desktop"),
  // The UI may read the command contracts (names and payload types) but nothing else in desktop.
  desktopInternals: "^@/lib/desktop(?!/contracts$)(/|$)",
  ai: layer("lib/ai"),
  // Verification may use the model client surface for match review, but not the curator.
  curatorInternals: "^@/lib/ai(?!/services/llmService$|/prompts(/|$)|/llmConfig$|/errors$)(/|$)",
  music: layer("lib/music"),
  playlist: layer("lib/playlist")
};

function boundary(files, forbiddenLayers) {
  const label = Array.isArray(files) ? files[0] : files;
  return [{
    files: Array.isArray(files) ? files : [files],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: forbiddenLayers.map((name) => ({
          regex: layerPatterns[name],
          message: `${label} must not import from the ${name.replace("Internals", "")} layer; see the import boundaries in AGENTS.md.`
        }))
      }]
    }
  }];
}

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      ".desktop-runtime/**",
      "src-tauri/**",
      "assets/**",
      "next-env.d.ts"
    ]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // The desktop UI is a static export with image optimization disabled, so next/image
      // has nothing to offer here and plain <img> is the intended element.
      "@next/next/no-img-element": "off",
      // An underscore prefix is the project's way of naming a binding that exists only to
      // be discarded, such as the updatedAt field stripped before a comparison.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ]
    }
  },

  // --- Import boundaries -------------------------------------------------------------
  // Direction of dependency, top to bottom: app -> components -> hooks -> client ->
  // desktop -> ai -> music -> playlist -> types, with shared and debug usable from
  // anywhere. Each block below forbids the layers a directory must not reach into.
  // Tests are exempt so they can mock across layers. Keep this in step with AGENTS.md.
  ...boundary("src/app/**", ["ai", "music", "desktopInternals"]),
  ...boundary("src/components/**", ["ai", "music", "desktopInternals", "app"]),
  ...boundary("src/hooks/**", ["ai", "music", "desktopInternals", "components", "app"]),
  ...boundary("src/lib/client/**", ["ai", "music", "desktopInternals", "components", "hooks", "app"]),
  ...boundary(["src/lib/desktop/**", "desktop/**"], ["client", "components", "hooks", "app"]),
  ...boundary("src/lib/ai/**", ["desktop", "client", "components", "hooks", "app"]),
  ...boundary("src/lib/music/**", ["curatorInternals", "desktop", "client", "components", "hooks", "app"]),
  ...boundary("src/lib/playlist/**", ["ai", "music", "desktop", "client", "components", "hooks", "app"]),
  ...boundary(["src/lib/shared/**", "src/lib/debug/**"], ["playlist", "ai", "music", "desktop", "client", "components", "hooks", "app"])
];

export default config;
