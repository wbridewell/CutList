import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Repo invariant: every environment variable the TypeScript code reads is listed in
// .env.example, so there is one place to find them all. A variable may be commented out
// there; it only has to be named.
const root = fileURLToPath(new URL("../", import.meta.url));

function walk(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

// Provided by the platform or the build, not by this app's configuration.
const platformVariables = new Set(["NODE_ENV", "HOME"]);

describe("environment variables", () => {
  it("are all documented in .env.example", () => {
    const documented = new Set(
      [...readFileSync(join(root, ".env.example"), "utf8").matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]!)
    );
    const undocumented = new Set<string>();
    for (const file of [...walk(join(root, "src")), join(root, "desktop/command.ts")]) {
      for (const match of readFileSync(file, "utf8").matchAll(/\benv\.([A-Z][A-Z0-9_]+)\b/g)) {
        const name = match[1]!;
        if (!documented.has(name) && !platformVariables.has(name)) {
          undocumented.add(`${name} (${file.replace(root, "")})`);
        }
      }
    }
    expect([...undocumented].sort(), "add the variable to .env.example, commented out if it is debug-only").toEqual([]);
  });
});
