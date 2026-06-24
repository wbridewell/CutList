#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const MAX_BUFFER = 64 * 1024 * 1024;

function parseArgs(argv) {
  const options = {
    branch: "main",
    dryRun: false,
    publicRepo: resolve(root, "..", "CutList-public"),
    pushOrigin: false,
    sourceRef: "HEAD"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--push-origin") {
      options.pushOrigin = true;
      continue;
    }
    if (argument === "--help") {
      printHelp();
      process.exit(0);
    }
    if (argument.startsWith("--source-ref=")) {
      options.sourceRef = argument.slice("--source-ref=".length);
      continue;
    }
    if (argument === "--source-ref") {
      options.sourceRef = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith("--public-repo=")) {
      options.publicRepo = resolve(root, argument.slice("--public-repo=".length));
      continue;
    }
    if (argument === "--public-repo") {
      options.publicRepo = resolve(root, argv[index + 1]);
      index += 1;
      continue;
    }
    if (argument.startsWith("--branch=")) {
      options.branch = argument.slice("--branch=".length);
      continue;
    }
    if (argument === "--branch") {
      options.branch = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/sync-public.mjs [options]

Options:
  --dry-run              Check whether the public repo is behind without changing it
  --push-origin          Push the public repo branch to its origin after committing
  --source-ref <ref>     Source ref in this repo to publish (default: HEAD)
  --public-repo <path>   Path to the public repo (default: ../CutList-public)
  --branch <name>        Public branch to update (default: main)
`);
}

function run(command, args, options = {}) {
  execFileSync(command, args, { maxBuffer: MAX_BUFFER, stdio: "inherit", ...options });
}

function capture(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  }).trim();
}

function captureNullSeparated(command, args, options = {}) {
  const output = execFileSync(command, args, {
    encoding: "buffer",
    maxBuffer: MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  });
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function git(repo, args) {
  return capture("git", args, { cwd: repo });
}

function gitNullSeparated(repo, args) {
  return captureNullSeparated("git", args, { cwd: repo });
}

function removeEmptyDirectories(directory) {
  let isEmpty = true;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git") {
      isEmpty = false;
      continue;
    }
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (removeEmptyDirectories(entryPath)) {
        rmSync(entryPath, { recursive: true, force: true });
      } else {
        isEmpty = false;
      }
      continue;
    }
    isEmpty = false;
  }
  return isEmpty;
}

function ensureCleanPublicRepo(publicRepo) {
  const status = git(publicRepo, ["status", "--porcelain"]);
  if (status !== "") {
    throw new Error(`Public repo has uncommitted changes at ${publicRepo}. Commit or stash them first.`);
  }
}

function exportSourceTree(sourceRef, destination) {
  const archive = execFileSync("git", ["archive", "--format=tar", sourceRef], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"]
  });
  execFileSync("tar", ["-xf", "-", "-C", destination], {
    input: archive,
    maxBuffer: MAX_BUFFER,
    stdio: ["pipe", "inherit", "inherit"]
  });

  if (readdirSync(destination).length === 0) {
    throw new Error(`Exported ${sourceRef} into an empty snapshot. Aborting public sync.`);
  }
}

function syncTrackedFiles(publicRepo, tempDir) {
  for (const path of gitNullSeparated(publicRepo, ["ls-files", "-z"])) {
    rmSync(join(publicRepo, path), { recursive: true, force: true });
  }
  removeEmptyDirectories(publicRepo);
  run("rsync", ["-a", "--exclude", ".git/", `${tempDir}/`, `${publicRepo}/`]);
}

const options = parseArgs(process.argv.slice(2));
const publicRepo = resolve(options.publicRepo);
const sourceRef = options.sourceRef;

try {
  const sourceTree = git(root, ["rev-parse", `${sourceRef}^{tree}`]);
  const sourceCommit = git(root, ["rev-parse", "--short=12", sourceRef]);
  const sourceSubject = git(root, ["log", "-1", "--format=%s", sourceRef]);

  git(publicRepo, ["rev-parse", "--show-toplevel"]);
  const currentBranch = git(publicRepo, ["branch", "--show-current"]);
  ensureCleanPublicRepo(publicRepo);
  if (currentBranch !== options.branch) {
    run("git", ["switch", options.branch], { cwd: publicRepo });
  }
  ensureCleanPublicRepo(publicRepo);

  const publicTree = git(publicRepo, ["rev-parse", `HEAD^{tree}`]);
  if (publicTree === sourceTree) {
    process.stdout.write(`Public repo already matches ${sourceRef} (${sourceCommit}).\n`);
    process.exit(0);
  }

  if (options.dryRun) {
    process.stdout.write(
      `Public repo is behind ${sourceRef} (${sourceCommit}) at ${relative(root, publicRepo) || publicRepo}.\n`
    );
    process.exit(0);
  }

  const tempDir = mkdtempSync(join(tmpdir(), "cutlist-public-"));

  try {
    exportSourceTree(sourceRef, tempDir);
    syncTrackedFiles(publicRepo, tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  run("git", ["add", "-A"], { cwd: publicRepo });

  const stagedStatus = git(publicRepo, ["status", "--porcelain"]);
  if (stagedStatus === "") {
    process.stdout.write("Public repo content is unchanged after sync.\n");
    process.exit(0);
  }

  run("git", ["commit", "-m", `Sync from private ${sourceCommit}: ${sourceSubject}`], { cwd: publicRepo });

  if (options.pushOrigin) {
    run("git", ["push", "origin", options.branch], { cwd: publicRepo });
  }

  process.stdout.write(`Synced ${sourceRef} into ${relative(root, publicRepo) || publicRepo}.\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
