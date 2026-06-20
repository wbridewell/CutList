#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const appPath = join(root, "src-tauri", "target", "release", "bundle", "macos", "The CutList.app");
const dmgDir = join(root, "src-tauri", "target", "release", "bundle", "dmg");
const dmgPath = join(dmgDir, "The-CutList-Alpha.dmg");
const stageDir = join(dmgDir, ".cutlist-dmg-stage");

function run(command, args) {
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      CUTLIST_RELEASE_PACKAGING: "1"
    }
  });
}

run("npx", ["tauri", "build", "--bundles", "app", "--config", "src-tauri/tauri.release.conf.json"]);

if (process.platform !== "darwin") {
  process.stdout.write("Built macOS app bundle only. DMG creation runs on macOS.\n");
  process.exit(0);
}

if (!existsSync(appPath)) {
  throw new Error(`Expected app bundle at ${appPath}`);
}

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
cpSync(appPath, join(stageDir, "The CutList.app"), { recursive: true, dereference: true });
symlinkSync("/Applications", join(stageDir, "Applications"));
mkdirSync(dmgDir, { recursive: true });
rmSync(dmgPath, { force: true });

try {
  run("xattr", ["-cr", stageDir]);
} catch {
  // ponytail: metadata cleanup is best-effort for unsigned alpha builds.
}

try {
  run("hdiutil", [
    "create",
    "-volname", "The CutList",
    "-fs", "HFS+",
    "-srcfolder", stageDir,
    "-ov",
    "-format", "UDZO",
    dmgPath
  ]);
} catch (error) {
  throw new Error(
    `Built app bundle at ${appPath}, but DMG creation failed. Try the same command from a normal logged-in macOS session with Disk Utility access.`
  );
}

process.stdout.write(`Built DMG at ${dmgPath}\n`);
