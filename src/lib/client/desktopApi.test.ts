import { describe, expect, it } from "vitest";
import { DesktopCommandError, normalizeDesktopError } from "@/lib/client/desktopApi";

describe("normalizeDesktopError", () => {
  it("wraps a {code, message} rejection from a Tauri command into a DesktopCommandError", () => {
    const error = normalizeDesktopError({ code: "llm_timeout", message: "The model took too long to respond." });

    expect(error).toBeInstanceOf(DesktopCommandError);
    expect((error as DesktopCommandError).code).toBe("llm_timeout");
    expect(error.message).toBe("The model took too long to respond.");
  });

  it("passes an ordinary Error through unchanged", () => {
    const original = new Error("Desktop reveal path no longer exists.");

    expect(normalizeDesktopError(original)).toBe(original);
  });

  it("wraps a plain string rejection from a native-only command in an Error", () => {
    const error = normalizeDesktopError("Desktop reveal path no longer exists.");

    expect(error).not.toBeInstanceOf(DesktopCommandError);
    expect(error.message).toBe("Desktop reveal path no longer exists.");
  });

  it("falls back to a generic message for unrecognized rejection shapes", () => {
    expect(normalizeDesktopError(undefined).message).toBe("Desktop command failed.");
    expect(normalizeDesktopError({ unrelated: true }).message).toBe("Desktop command failed.");
  });
});
