import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomicSync } from "@/lib/shared/atomicFile";

let tempDir: string;

describe("writeFileAtomicSync", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cutlist-atomic-file-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates the target file with the requested contents", () => {
    const target = join(tempDir, "state.json");

    writeFileAtomicSync(target, "{\"a\":1}");

    expect(readFileSync(target, "utf8")).toBe("{\"a\":1}");
  });

  it("creates missing parent directories", () => {
    const target = join(tempDir, "nested", "deeper", "state.json");

    writeFileAtomicSync(target, "content");

    expect(readFileSync(target, "utf8")).toBe("content");
  });

  it("replaces existing file contents without leaving a temp file behind", () => {
    const target = join(tempDir, "state.json");
    writeFileSync(target, "old");

    writeFileAtomicSync(target, "new");

    expect(readFileSync(target, "utf8")).toBe("new");
    const leftoverTempFiles = readdirSync(tempDir).filter((name) => name.includes(".tmp"));
    expect(leftoverTempFiles).toEqual([]);
  });

  it("does not disturb the original file if a stale temp file already exists", () => {
    const target = join(tempDir, "state.json");
    writeFileSync(target, "original");
    const stalePath = join(tempDir, `.state.json.${process.pid}.tmp`);
    writeFileSync(stalePath, "stale leftover from a previous crashed write");

    writeFileAtomicSync(target, "updated");

    expect(readFileSync(target, "utf8")).toBe("updated");
  });

  it("writes with restrictive file mode by default", () => {
    const target = join(tempDir, "secret.json");

    writeFileAtomicSync(target, "{}");

    const mode = statSync(target).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
