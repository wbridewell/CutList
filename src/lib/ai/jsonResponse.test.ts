import { describe, expect, it } from "vitest";
import { JsonExtractionError, parseJsonResponse } from "@/lib/ai/jsonResponse";

describe("parseJsonResponse", () => {
  it("parses strict JSON without marking it repaired", () => {
    const result = parseJsonResponse("{\"ok\":true}");

    expect(result).toEqual({
      value: { ok: true },
      repaired: false
    });
  });

  it("recovers fenced JSON", () => {
    const result = parseJsonResponse("```json\n{\"ok\":true}\n```");

    expect(result).toEqual({
      value: { ok: true },
      repaired: true
    });
  });

  it("recovers a single balanced JSON object wrapped in commentary", () => {
    const result = parseJsonResponse("Here you go:\n{\"ok\":true,\"items\":[1,2]}\nThanks.");

    expect(result).toEqual({
      value: { ok: true, items: [1, 2] },
      repaired: true
    });
  });

  it("rejects ambiguous multi-object junk", () => {
    expect(() => parseJsonResponse("{\"ok\":true}\n{\"extra\":true}")).toThrow(JsonExtractionError);
  });
});
