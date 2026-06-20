import { ZodError } from "zod";

export function isModelShapeError(error: unknown): boolean {
  return error instanceof ZodError || error instanceof SyntaxError;
}

export function shouldExposeModelDebug(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.LLM_DEBUG_RAW === "1";
}

export function summarizeModelError(error: unknown): string {
  if (error instanceof ZodError) {
    return JSON.stringify(error.flatten());
  }
  return error instanceof Error ? error.message : "Unknown model validation error.";
}
