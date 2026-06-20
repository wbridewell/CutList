#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:os";

const isReturnLaunch = process.argv.includes("--start-alpha");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: platform() === "win32", ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function commandExists(command) {
  const check = platform() === "win32" ? "where" : "command";
  const args = platform() === "win32" ? [command] : ["-v", command];
  return spawnSync(check, args, { stdio: "ignore", shell: platform() !== "win32" }).status === 0;
}

if (!commandExists("node")) {
  console.error("Node.js is required. Install it from https://nodejs.org/ and run this command again.");
  process.exit(1);
}

if (!commandExists("npm")) {
  console.error("npm is required. Install Node.js from https://nodejs.org/ and run this command again.");
  process.exit(1);
}

if (!existsSync("node_modules") && isReturnLaunch) {
  console.error("App dependencies are not installed yet.");
  console.error("Run `npm run first-run` once, then use `npm run start-alpha` for later launches.");
  process.exit(1);
}

if (!existsSync("node_modules")) {
  console.log("Installing app dependencies. This can take a few minutes the first time...");
  run("npm", ["install"]);
}

console.log("");
console.log(isReturnLaunch ? "Starting The CutList local alpha..." : "Starting The CutList local alpha after first-run setup...");
if (!isReturnLaunch) {
  console.log("Use the LLM setup button in the top-right to paste a Gemini API key.");
}
console.log("Keep this Terminal window open while the app is running. Closing it will quit the app.");
console.log("");

const dev = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: platform() === "win32"
});

dev.on("exit", (code) => {
  process.exit(code ?? 0);
});
