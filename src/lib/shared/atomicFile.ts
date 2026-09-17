import "server-only";

import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// renameSync replacing an existing file is atomic on POSIX (macOS, Linux) but
// throws on Windows. This app is macOS-only today; add an unlink-then-rename
// fallback here before adding a Windows target.
export function writeFileAtomicSync(path: string, contents: string, mode = 0o600): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const temporaryPath = join(directory, `.${basename(path)}.${process.pid}.tmp`);
  const handle = openSync(temporaryPath, "w", mode);
  try {
    writeSync(handle, contents, null, "utf8");
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  try {
    renameSync(temporaryPath, path);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}
