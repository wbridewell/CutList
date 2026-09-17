// Thrown by the hosted provider clients when the selected provider has no API key. A
// dedicated class lets the desktop boundary classify it as llm_unconfigured without
// matching on message text; the messages stay the ones users and tests already know.
export class LLMProviderNotConfiguredError extends Error {
  provider: "gemini" | "openai";

  constructor(provider: "gemini" | "openai") {
    super(provider === "gemini" ? "GEMINI_API_KEY is not configured." : "OPENAI_API_KEY is not configured.");
    this.name = "LLMProviderNotConfiguredError";
    this.provider = provider;
  }
}
