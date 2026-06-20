import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getJsonFromOllama,
  getOllamaModel,
  OllamaModelMissingError,
  OllamaUnavailableError
} from "@/lib/ai/providers/ollamaClient";

describe("Ollama client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses configured model name", () => {
    vi.stubEnv("OLLAMA_MODEL", "granite4.1:8b");

    expect(getOllamaModel()).toBe("granite4.1:8b");
  });

  it("parses JSON from Ollama chat responses", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    vi.stubEnv("OLLAMA_MODEL", "granite4.1:8b");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      message: {
        content: "{\"ok\":true}"
      }
    }), { status: 200 }));

    await expect(getJsonFromOllama("Return JSON.")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/chat", expect.objectContaining({
      method: "POST"
    }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("granite4.1:8b");
    expect(body.stream).toBe(false);
    expect(body.format).toBe("json");
    expect(body.options.temperature).toBe(0.1);
  });

  it("streams content with medium thinking and no JSON mode for gpt-oss models", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    vi.stubEnv("OLLAMA_MODEL", "gpt-oss:20b");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response([
      JSON.stringify({ message: { thinking: "Looking." }, done: false }),
      JSON.stringify({ message: { content: "{\"ok\"" }, done: false }),
      JSON.stringify({ message: { content: ":true}" }, done: true })
    ].join("\n"), { status: 200 }));

    await expect(getJsonFromOllama("Return JSON.")).resolves.toEqual({ ok: true });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("gpt-oss:20b");
    expect(body.stream).toBe(true);
    expect(body).not.toHaveProperty("format");
    expect(body).not.toHaveProperty("options");
    expect(body.think).toBe("medium");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toMatchObject({ role: "user" });
    expect(body.messages[0].content).toContain("Return strict JSON only.");
    expect(body.messages[0].content).toContain("Return JSON.");
  });

  it("allows the gpt-oss thinking level to be configured", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    vi.stubEnv("OLLAMA_MODEL", "gpt-oss:20b");
    vi.stubEnv("OLLAMA_GPT_OSS_THINK", "high");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      message: {
        content: "{\"ok\":true}"
      },
      done: true
    }), { status: 200 }));

    await expect(getJsonFromOllama("Return JSON.")).resolves.toEqual({ ok: true });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.think).toBe("high");
  });

  it("falls back to medium thinking for invalid gpt-oss thinking levels", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    vi.stubEnv("OLLAMA_MODEL", "gpt-oss:20b");
    vi.stubEnv("OLLAMA_GPT_OSS_THINK", "off");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      message: {
        content: "{\"ok\":true}"
      },
      done: true
    }), { status: 200 }));

    await expect(getJsonFromOllama("Return JSON.")).resolves.toEqual({ ok: true });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.think).toBe("medium");
  });

  it("reports thinking-only Ollama responses clearly", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    vi.stubEnv("OLLAMA_MODEL", "granite4.1:8b");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      message: {
        content: "",
        thinking: "Still thinking."
      }
    }), { status: 200 }));

    await expect(getJsonFromOllama("Return JSON.")).rejects.toThrow("thinking output without a JSON response");
  });

  it("reports unreachable Ollama server clearly", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("connect failed"));

    await expect(getJsonFromOllama("test")).rejects.toBeInstanceOf(OllamaUnavailableError);
  });

  it("reports missing Ollama models clearly", async () => {
    vi.stubEnv("OLLAMA_MODEL", "granite4.1:8b");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: "model 'granite4.1:8b' not found, try pulling it first"
    }), { status: 404 }));

    await expect(getJsonFromOllama("test")).rejects.toBeInstanceOf(OllamaModelMissingError);
  });
});
