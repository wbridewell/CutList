import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Repo invariant: every exported value is imported somewhere, or is exported for a test.
// Dead exports cost an agent twice, once to read and once to preserve, and hide whether a
// helper is safe to change. Exporting something only a test needs is fine; exporting
// something nothing needs is not. Types are not checked.
const root = fileURLToPath(new URL("../", import.meta.url));

function walk(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const files = [...walk(join(root, "src")), join(root, "desktop/command.ts")];
const source = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const frameworkEntry = (file: string) => /\/src\/app\/(?:.*\/)?(?:page(?:\.dev)?|layout)\.tsx$/.test(file);

function resolveSpecifier(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(root, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : null;
  if (!base) {
    return null;
  }
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (source.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

const imports = new Map<string, Set<string>>();
for (const file of files) {
  const targets = new Set<string>();
  // vi.mock("...") counts as an edge: a test that mocks a module references its exports.
  for (const match of source.get(file)!.matchAll(/from\s+"([^"]+)"|import\(\s*"([^"]+)"\s*\)|vi\.mock\(\s*"([^"]+)"/g)) {
    const target = resolveSpecifier(file, match[1] ?? match[2] ?? match[3]!);
    if (target && target !== file) {
      targets.add(target);
    }
  }
  imports.set(file, targets);
}

// A bare identifier reference: not part of a longer name, not a property access, but a
// spread argument (`...name`) counts.
const reference = (name: string) => new RegExp(`(?<![A-Za-z0-9_$])(?<!(?<!\\.)\\.)${name}(?![A-Za-z0-9_$])`);

function reExportedFromAnImportedBarrel(file: string, name: string): boolean {
  return files.some((barrel) => {
    if (barrel === file || isTest(barrel) || !imports.get(barrel)!.has(file)) {
      return false;
    }
    const forwards = new RegExp(`export\\s+(?:type\\s+)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s+from`).test(source.get(barrel)!);
    return forwards && files.some((consumer) => consumer !== barrel && imports.get(consumer)!.has(barrel) && reference(name).test(source.get(consumer)!));
  });
}

describe("exports", () => {
  it("are all imported by another module or by a test", () => {
    const dead: string[] = [];
    for (const file of files) {
      if (isTest(file) || frameworkEntry(file)) {
        continue;
      }
      for (const match of source.get(file)!.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/gm)) {
        const name = match[1]!;
        const test = reference(name);
        const used = files.some((other) => other !== file && imports.get(other)!.has(file) && test.test(source.get(other)!));
        if (used || reExportedFromAnImportedBarrel(file, name)) {
          continue;
        }
        dead.push(`${file.replace(root, "")}::${name}`);
      }
    }
    expect(dead, "remove the export, or the declaration, or reference it from a test").toEqual([]);
  });
});
