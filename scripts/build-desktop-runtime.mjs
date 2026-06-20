import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const runtimeDir = join(root, ".desktop-runtime");
const compiledRoot = join(runtimeDir, "app");
const nodeModulesDir = join(runtimeDir, "node_modules");
const entryFile = join(root, "desktop", "command.ts");
const runtimeNodePath = join(runtimeDir, "node", process.platform === "win32" ? "node.exe" : "node");
const sourceExtensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"];

const compiledFiles = new Set();
const copiedPackages = new Set();
const runtimePackages = new Set();
const nonPortableMacOSPrefixes = [
  "/opt/homebrew/",
  "/usr/local/Cellar/",
  "/opt/local/",
  "/sw/",
  "/nix/",
  "/run/current-system/",
  "/home/linuxbrew/.linuxbrew/"
];

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

function outputPathForSource(filePath) {
  const relativePath = relative(root, filePath);
  const extension = extname(relativePath);
  const outputExtension = extension === ".json" ? ".json" : ".js";
  return join(compiledRoot, relativePath.slice(0, relativePath.length - extension.length) + outputExtension);
}

function resolveSourceModule(specifier, importerPath) {
  let candidate;
  if (specifier.startsWith("@/")) {
    candidate = join(root, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    candidate = resolve(dirname(importerPath), specifier);
  } else {
    return null;
  }

  for (const extension of sourceExtensions) {
    const resolvedPath = `${candidate}${extension}`;
    if (existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  for (const extension of sourceExtensions) {
    const resolvedPath = join(candidate, `index${extension}`);
    if (existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  return null;
}

function barePackageName(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0];
}

function collectModuleSpecifiers(source, filePath) {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const replacements = [];
  const packages = new Set();

  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      replacements.push({
        start: node.moduleSpecifier.getStart(sourceFile) + 1,
        end: node.moduleSpecifier.getEnd() - 1,
        specifier: node.moduleSpecifier.text
      });
    } else if (
      ts.isCallExpression(node)
      && node.arguments.length > 0
      && ts.isStringLiteral(node.arguments[0])
      && (
        node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require")
      )
    ) {
      replacements.push({
        start: node.arguments[0].getStart(sourceFile) + 1,
        end: node.arguments[0].getEnd() - 1,
        specifier: node.arguments[0].text
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  for (const { specifier } of replacements) {
    if (specifier.startsWith("node:")) {
      continue;
    }
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
      packages.add(barePackageName(specifier));
    }
  }

  return { replacements, packages };
}

function rewriteSource(source, filePath) {
  const withoutServerOnly = source.replace(/^\s*import\s+["']server-only["'];?\s*$/gm, "");
  const { replacements, packages } = collectModuleSpecifiers(withoutServerOnly, filePath);
  let rewritten = withoutServerOnly;

  for (const pkg of packages) {
    if (pkg !== "server-only") {
      runtimePackages.add(pkg);
    }
  }

  const normalizedReplacements = replacements
    .map((replacement) => {
      const resolved = resolveSourceModule(replacement.specifier, filePath);
      if (!resolved) {
        return null;
      }
      const fromPath = outputPathForSource(filePath);
      const toPath = outputPathForSource(resolved);
      let nextSpecifier = normalizePath(relative(dirname(fromPath), toPath));
      if (!nextSpecifier.startsWith(".")) {
        nextSpecifier = `./${nextSpecifier}`;
      }
      return { ...replacement, nextSpecifier };
    })
    .filter(Boolean)
    .sort((left, right) => right.start - left.start);

  for (const replacement of normalizedReplacements) {
    rewritten = `${rewritten.slice(0, replacement.start)}${replacement.nextSpecifier}${rewritten.slice(replacement.end)}`;
  }

  return rewritten;
}

function findImportedSourceFiles(source, filePath) {
  const preprocessed = ts.preProcessFile(source, true, true);
  return preprocessed.importedFiles
    .map((file) => resolveSourceModule(file.fileName, filePath))
    .filter(Boolean);
}

function compileSourceFile(filePath) {
  if (compiledFiles.has(filePath)) {
    return;
  }
  compiledFiles.add(filePath);

  const source = readFileSync(filePath, "utf8");
  for (const importedFile of findImportedSourceFiles(source, filePath)) {
    compileSourceFile(importedFile);
  }

  const outputPath = outputPathForSource(filePath);
  mkdirSync(dirname(outputPath), { recursive: true });

  if (extname(filePath) === ".json") {
    copyFileSync(filePath, outputPath);
    return;
  }

  const rewrittenSource = rewriteSource(source, filePath);
  const transpiled = ts.transpileModule(rewrittenSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      resolveJsonModule: true
    },
    fileName: filePath
  });
  writeFileSync(outputPath, transpiled.outputText, "utf8");
}

function copyRuntimePackage(packageName) {
  if (copiedPackages.has(packageName) || packageName === "server-only") {
    return;
  }

  let packageEntryPath;
  try {
    packageEntryPath = require.resolve(packageName, { paths: [root] });
  } catch {
    return;
  }
  let packageDir = dirname(packageEntryPath);
  while (basename(packageDir) !== packageName.split("/").at(-1) || !existsSync(join(packageDir, "package.json"))) {
    const parent = dirname(packageDir);
    if (parent === packageDir) {
      throw new Error(`Could not find package root for ${packageName}.`);
    }
    packageDir = parent;
  }
  const packageJsonPath = join(packageDir, "package.json");
  const destinationDir = join(nodeModulesDir, ...packageName.split("/"));
  mkdirSync(dirname(destinationDir), { recursive: true });
  cpSync(packageDir, destinationDir, { recursive: true, dereference: true });
  copiedPackages.add(packageName);

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const dependencies = Object.keys({
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.optionalDependencies ?? {})
  });

  for (const dependency of dependencies) {
    copyRuntimePackage(dependency);
  }
}

function pruneRuntimeTree(rootDir) {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "src" || entry.name === "test" || entry.name === "tests" || entry.name === "__tests__") {
        rmSync(fullPath, { recursive: true, force: true });
        continue;
      }
      pruneRuntimeTree(fullPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const lowerName = entry.name.toLowerCase();
    if (
      lowerName.endsWith(".ts")
      || lowerName.endsWith(".mts")
      || lowerName.endsWith(".cts")
      || lowerName.endsWith(".map")
      || lowerName.endsWith(".md")
      || lowerName === "license"
      || lowerName.startsWith("license.")
      || lowerName.startsWith("readme")
      || lowerName.startsWith("changelog")
    ) {
      rmSync(fullPath, { force: true });
    }
  }
}

export function isReleasePackaging(env = process.env) {
  return env.CUTLIST_RELEASE_PACKAGING === "1";
}

export function resolveRuntimeNodeSourcePath(env = process.env, execPath = process.execPath) {
  const explicitPath = env.CUTLIST_NODE_RUNTIME_PATH?.trim();
  if (explicitPath) {
    return resolve(explicitPath);
  }

  if (isReleasePackaging(env)) {
    throw new Error(
      "Release desktop packaging requires CUTLIST_NODE_RUNTIME_PATH. Point it at a standalone macOS Node binary before running the build."
    );
  }

  return execPath;
}

export function parsePortableMacOSNodeReport(otoolOutput) {
  const linkedLibraries = otoolOutput
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" ")[0])
    .filter(Boolean);
  const nonPortableLibraries = linkedLibraries.filter((path) => {
    if (path.startsWith("/System/") || path.startsWith("/usr/lib/")) {
      return false;
    }
    return nonPortableMacOSPrefixes.some((prefix) => path.startsWith(prefix));
  });
  return {
    linkedLibraries,
    nonPortableLibraries,
    portable: nonPortableLibraries.length === 0
  };
}

export function validatePortableMacOSNode(nodePath) {
  if (process.platform !== "darwin") {
    return;
  }

  const report = parsePortableMacOSNodeReport(execFileSync("otool", ["-L", nodePath], { encoding: "utf8" }));

  if (!report.portable) {
    process.stderr.write(
      `Portable Node check failed for ${nodePath}: found package-manager-linked libraries: ${report.nonPortableLibraries.join(", ")}\n`
    );
    throw new Error(
      `CUTLIST_NODE_RUNTIME_PATH must point to a portable macOS Node binary. Unsupported linked libraries: ${report.nonPortableLibraries.join(", ")}`
    );
  }

  process.stdout.write(`Portable Node check passed for ${nodePath}: only system libraries were detected.\n`);
}

function stageNodeRuntime() {
  const nodeSourcePath = resolveRuntimeNodeSourcePath();
  validatePortableMacOSNode(nodeSourcePath);
  mkdirSync(dirname(runtimeNodePath), { recursive: true });
  copyFileSync(nodeSourcePath, runtimeNodePath);
  if (process.platform !== "win32") {
    chmodSync(runtimeNodePath, 0o755);
  }
}

function writeRuntimeMetadata() {
  writeFileSync(
    join(runtimeDir, "manifest.json"),
    `${JSON.stringify({
      entry: "app/desktop/command.js",
      node: normalizePath(relative(runtimeDir, runtimeNodePath)),
      packages: Array.from(runtimePackages).sort()
    }, null, 2)}\n`,
    "utf8"
  );
}

export function stageDesktopRuntime() {
  rmSync(runtimeDir, { recursive: true, force: true });
  mkdirSync(runtimeDir, { recursive: true });

  compileSourceFile(entryFile);
  stageNodeRuntime();

  for (const packageName of runtimePackages) {
    copyRuntimePackage(packageName);
  }

  pruneRuntimeTree(nodeModulesDir);
  writeRuntimeMetadata();

  if (process.platform === "darwin") {
    try {
      execFileSync("xattr", ["-cr", runtimeDir]);
    } catch {
      // ponytail: provenance metadata is best-effort cleanup for macOS builds.
    }
  }

  process.stdout.write(`Staged desktop runtime at ${relative(root, runtimeDir) || ".desktop-runtime"}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  stageDesktopRuntime();
}
