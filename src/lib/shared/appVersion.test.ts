import { describe, expect, it } from "vitest";
import { appVersion, metadataUserAgent } from "@/lib/shared/appVersion";

describe("appVersion", () => {
  it("uses the version the desktop shell injects", () => {
    expect(appVersion({ CUTLIST_APP_VERSION: "0.2.0" })).toBe("0.2.0");
  });

  it("falls back to dev outside the desktop shell", () => {
    expect(appVersion({})).toBe("dev");
    expect(appVersion({ CUTLIST_APP_VERSION: "   " })).toBe("dev");
  });

  it("builds a MusicBrainz-compliant user agent with app, version, and contact", () => {
    expect(metadataUserAgent({ CUTLIST_APP_VERSION: "0.1.6" })).toBe("CutList/0.1.6 (https://github.com/wbridewell/CutList)");
  });
});
