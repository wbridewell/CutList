import { afterEach, describe, expect, it, vi } from "vitest";
import { getJsonFromGemini } from "@/lib/ai/providers/geminiClient";

describe("Gemini client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("requires a Gemini API key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    await expect(getJsonFromGemini("test")).rejects.toThrow("GEMINI_API_KEY is not configured.");
  });

  it("requests JSON output from the configured Gemini model", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash-lite");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ text: "{\"ok\":true}" }]
        }
      }]
    }), { status: 200 }));

    const result = await getJsonFromGemini("make json");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "test-key"
        })
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.contents[0].parts[0].text).toContain("Return strict JSON only.");
    expect(body.contents[0].parts[0].text).toContain("make json");
  });

  it("surfaces Gemini API errors without exposing the API key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: { message: "quota exceeded" }
    }), { status: 429, statusText: "Too Many Requests" }));

    await expect(getJsonFromGemini("test")).rejects.toThrow("Gemini request failed: quota exceeded");
  });
});
