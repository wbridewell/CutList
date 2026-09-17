import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next 15.x ships legacy-format configs; FlatCompat adapts them for ESLint 9.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

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
  }
];

export default config;
