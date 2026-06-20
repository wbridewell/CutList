import {
  desktopCommandNames,
  type CuratorPersona,
  type LLMProvider,
  type LLMSetupPayload,
  type LLMSetupResponse,
  type LLMSetupStatus,
  type LLMSetupTestResponse
} from "@/lib/desktop/contracts";
import { invokeDesktopGet, invokeDesktopSave } from "@/lib/client/desktopApi";

export type {
  CuratorPersona,
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
