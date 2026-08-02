import {
  desktopCommandNames,
  type CuratorPersona,
  type KeychainProvider,
  type LLMProvider,
  type LLMSetupPayload,
  type LLMSetupResponse,
  type LLMSetupStatus,
  type LLMSetupTestResponse
} from "@/lib/desktop/contracts";
import { deleteDesktopProviderSecret, invokeDesktopGet, invokeDesktopSave, setDesktopProviderSecret } from "@/lib/client/desktopApi";

export type {
  CuratorPersona,
  KeychainProvider,
  LLMProvider,
  LLMSetupPayload,
  LLMSetupResponse,
  LLMSetupStatus,
  LLMSetupTestResponse
};

let llmSetupRequest: Promise<LLMSetupResponse> | null = null;

export async function getLLMSetup(): Promise<LLMSetupResponse> {
  llmSetupRequest ??= invokeDesktopGet<LLMSetupResponse>(desktopCommandNames.getLlmSetup).catch((error) => {
    llmSetupRequest = null;
    throw error;
  });
  return llmSetupRequest;
}

export async function saveLLMSetup(payload: LLMSetupPayload): Promise<LLMSetupResponse> {
  const result = await invokeDesktopSave<LLMSetupResponse>(desktopCommandNames.saveLlmSetup, payload);
  llmSetupRequest = Promise.resolve(result);
  return result;
}

export async function testLLMSetup(payload: LLMSetupPayload): Promise<LLMSetupTestResponse> {
  const result = await invokeDesktopSave<LLMSetupTestResponse>(desktopCommandNames.testLlmSetup, payload);
  llmSetupRequest = null;
  return result;
}

// Stores the key in the OS keychain directly; call this before saveLLMSetup/testLLMSetup
// so the fresh backend spawn those trigger already has it injected as an env var.
export async function setLLMProviderSecret(provider: KeychainProvider, secret: string): Promise<void> {
  await setDesktopProviderSecret({ provider, secret });
}

export async function deleteLLMProviderSecret(provider: KeychainProvider): Promise<void> {
  await deleteDesktopProviderSecret({ provider });
  llmSetupRequest = null;
}
