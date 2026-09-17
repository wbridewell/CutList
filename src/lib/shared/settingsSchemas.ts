import { z } from "zod";

// The one place the provider and persona vocabularies are spelled out. The desktop
// contracts, the backend settings file, the persisted workspace, and the command payload
// validators all derive from these so adding a value is a single edit.
export const LLMProviderSchema = z.enum(["ollama", "openai", "gemini", "none"]);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

export const CuratorPersonaSchema = z.enum(["razor", "archivist", "firestarter"]);
export type CuratorPersona = z.infer<typeof CuratorPersonaSchema>;

// Providers whose API key can be stored in the OS keychain. Ollama needs no key and
// "none" disables the LLM, so neither has a keychain entry. Rust validates the value at
// the command boundary, so there is no Zod schema for it here.
export type KeychainProvider = Extract<LLMProvider, "gemini" | "openai">;
