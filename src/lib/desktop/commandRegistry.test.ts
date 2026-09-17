import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { desktopCommandNames } from "@/lib/desktop/contracts";

// A desktop command is declared in three places that nothing type-checks together: the
// TypeScript contract, the Rust handler list, and the Node dispatcher's handler map. A
// missed entry used to surface only as a runtime "unknown command" error. This test reads
// the other two as text and fails the moment the three lists disagree.
const root = fileURLToPath(new URL("../../../", import.meta.url));
// The Rust shell is split across modules; read every source file so a command declared in
// src-tauri/src/commands/*.rs or backend.rs is seen alongside main.rs's handler list.
function rustSources(directory: string): string {
  return readdirSync(directory)
    .map((entry) => join(directory, entry))
    .flatMap((path) => (statSync(path).isDirectory() ? [rustSources(path)] : path.endsWith(".rs") ? [readFileSync(path, "utf8")] : []))
    .join("\n");
}
const rustMain = rustSources(join(root, "src-tauri/src"));
const nodeDispatcher = readFileSync(new URL("desktop/command.ts", `file://${root}`), "utf8");

function rustGeneratedHandlers(): string[] {
  const block = rustMain.match(/generate_handler!\[([\s\S]*?)\]/);
  if (!block?.[1]) {
    throw new Error("generate_handler! block not found under src-tauri/src");
  }
  // Entries may be module paths such as commands::export::desktop_export_playlist.
  return block[1].split(",").map((name) => name.trim().split("::").pop()!).filter(Boolean);
}

// Commands are declared either as an explicit #[tauri::command] fn or through the
// desktop_value_command! macro, whose first argument is the generated function name.
function rustCommandFunctions(): string[] {
  const explicit = [...rustMain.matchAll(/#\[tauri::command\]\s*(?:pub(?:\(crate\))?\s+)?(?:async\s+)?fn\s+(desktop_[a-z_]+)/g)].map((match) => match[1]!);
  const viaMacro = [...rustMain.matchAll(/desktop_value_command!\(\s*(desktop_[a-z_]+)\s*,/g)].map((match) => match[1]!);
  return [...new Set([...explicit, ...viaMacro])];
}

// Commands the Rust shell forwards to the Node backend, keyed by the envelope command name.
function rustForwardedCommands(): string[] {
  const viaMacro = [...rustMain.matchAll(/desktop_value_command!\(\s*desktop_[a-z_]+\s*,\s*"([a-zA-Z]+)"\s*\)/g)].map((match) => match[1]!);
  const explicit = [...rustMain.matchAll(/command:\s*"([a-zA-Z]+)"\.to_string\(\)/g)].map((match) => match[1]!);
  return [...new Set([...viaMacro, ...explicit])].sort();
}

function nodeHandlerKeys(): string[] {
  const block = nodeDispatcher.match(/const handlers: BackendHandlers = \{([\s\S]*?)\n\};/);
  if (!block?.[1]) {
    throw new Error("handlers map not found in desktop/command.ts");
  }
  return [...block[1].matchAll(/^  ([a-zA-Z]+):/gm)].map((match) => match[1]!).sort();
}

describe("desktop command registry", () => {
  const contractNames = Object.values(desktopCommandNames).sort();

  it("registers every contract command name in the Rust generate_handler! list", () => {
    expect(rustGeneratedHandlers().sort()).toEqual(contractNames);
  });

  it("declares a #[tauri::command] function for every registered name", () => {
    expect(rustCommandFunctions().sort()).toEqual(contractNames);
  });

  it("has a Node handler for every command Rust forwards to the backend, and nothing else", () => {
    expect(nodeHandlerKeys()).toEqual(rustForwardedCommands());
  });

  it("keys Node handlers by the camelCase form of their contract name", () => {
    const camelFromContract = new Set(
      contractNames.map((name) => name.replace(/^desktop_/, "").replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()))
    );
    for (const key of nodeHandlerKeys()) {
      expect(camelFromContract.has(key), `${key} has no matching desktop_* contract name`).toBe(true);
    }
  });
});
