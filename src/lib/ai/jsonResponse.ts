export class JsonExtractionError extends SyntaxError {
  rawText: string;

  constructor(message: string, rawText: string) {
    super(message);
    this.name = "JsonExtractionError";
    this.rawText = rawText;
  }
}

export type ParsedJsonResponse = {
  value: unknown;
  repaired: boolean;
};

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stripCodeFence(text: string): string | null {
  const fencedMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch?.[1]?.trim() ?? null;
}

function containsExtraJsonStart(text: string): boolean {
  let inString = false;
  let escaped = false;

  for (const character of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{" || character === "[") {
      return true;
    }
  }

  return false;
}

function extractBalancedJsonSegment(text: string): string | null {
  const startIndex = text.search(/[\[{]/);
  if (startIndex === -1) {
    return null;
  }

  const openingCharacter = text[startIndex];
  const closingCharacter = openingCharacter === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === openingCharacter) {
      depth += 1;
      continue;
    }

    if (character === closingCharacter) {
      depth -= 1;
      if (depth === 0) {
        const candidate = text.slice(startIndex, index + 1);
        const leading = text.slice(0, startIndex).trim();
        const trailing = text.slice(index + 1).trim();

        if (containsExtraJsonStart(leading) || containsExtraJsonStart(trailing)) {
          return null;
        }

        return candidate;
      }
    }
  }

  return null;
}

export function parseJsonResponse(text: string): ParsedJsonResponse {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new JsonExtractionError("Model returned an empty JSON response.", text);
  }

  const strict = tryParseJson(trimmed);
  if (strict !== null) {
    return { value: strict, repaired: false };
  }

  const unfenced = stripCodeFence(trimmed);
  if (unfenced) {
    const parsedFence = tryParseJson(unfenced);
    if (parsedFence !== null) {
      return { value: parsedFence, repaired: true };
    }
  }

  const extractedSegment = extractBalancedJsonSegment(trimmed);
  if (extractedSegment) {
    const extracted = tryParseJson(extractedSegment);
    if (extracted !== null) {
      return { value: extracted, repaired: true };
    }
  }

  throw new JsonExtractionError("Could not recover a single valid JSON object or array from the model response.", text);
}

export function isJsonExtractionError(error: unknown): error is JsonExtractionError {
  return error instanceof JsonExtractionError;
}
