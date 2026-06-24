import { describe, expect, it } from "vitest";

// @ts-ignore ponytail: test imports the packaging script directly.
import { parsePortableMacOSNodeReport, resolveRuntimeNodeSourcePath } from "../../../scripts/build-desktop-runtime.mjs";

describe("build-desktop-runtime", () => {
  it("prefers an explicit runtime path during release packaging", () => {
    expect(resolveRuntimeNodeSourcePath({
      CUTLIST_RELEASE_PACKAGING: "1",
      CUTLIST_NODE_RUNTIME_PATH: "/tmp/portable-node"
    }, "/tmp/node")).toBe("/tmp/portable-node");
  });

  it("falls back to either the bundled portable node or execPath for non-release staging", () => {
    const resolved = resolveRuntimeNodeSourcePath({}, "/tmp/dev-node");

    expect(
      resolved === "/tmp/dev-node" || resolved.includes("codex-primary-runtime")
    ).toBe(true);
  });

  it("rejects obvious Homebrew-linked libraries", () => {
    const report = parsePortableMacOSNodeReport(`
/tmp/node:
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 0.0.0)
\t/opt/homebrew/opt/icu4c/lib/libicui18n.76.dylib (compatibility version 76.0.0, current version 76.1.0)
`);

    expect(report.portable).toBe(false);
    expect(report.nonPortableLibraries).toEqual([
      "/opt/homebrew/opt/icu4c/lib/libicui18n.76.dylib"
    ]);
  });

  it("accepts system-linked libraries", () => {
    const report = parsePortableMacOSNodeReport(`
/tmp/node:
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 0.0.0)
\t/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation (compatibility version 150.0.0, current version 3500.0.0)
`);

    expect(report.portable).toBe(true);
    expect(report.nonPortableLibraries).toEqual([]);
  });
});
