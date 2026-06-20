import { getLlmContract } from "@/lib/ai/contracts";
import { timeAsync } from "@/lib/debugTiming";
import { isJsonExtractionError, isLLMDisabledError, isLLMTimeoutError, isOpenAIQuotaError } from "@/lib/ai/errors";
import { getJsonFromLLM } from "@/lib/ai/llmClient";
import { isModelShapeError, summarizeModelError } from "@/lib/ai/modelErrors";

type ContractId = Parameters<typeof getLlmContract>[0];
type ContractParseFailureReason = "shape_error" | "json_extraction_error";
type ContractFallbackReason = "disabled" | "timeout" | "quota" | ContractParseFailureReason;

export type LlmContractSuccess<T> = {
  status: "success" | "success_repaired";
  raw: unknown;
  parsed: T;
  repairedFromRaw: unknown | null;
};

export type LlmContractFallback = {
  status: "fallback";
  reason: ContractFallbackReason;
  raw: unknown;
  error: unknown;
};

export type LlmContractAttempt<T> = LlmContractSuccess<T> | LlmContractFallback;

function repairPromptForContract(
  contractId: ContractId,
  rawOutput: unknown,
  error: unknown
): string {
  const contract = getLlmContract(contractId);
  const serializedOutput = typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput, null, 2);

  return [
    `Repair this model output into valid JSON for the "${contractId}" contract.`,
    `Return only JSON with this exact shape: ${contract.shapeDescription}.`,
    "Do not add commentary, markdown fences, headings, or explanation.",
    "Preserve the original meaning when possible. Do not invent new facts.",
    ...contract.safetyGuidance,
    ...(contract.outputGuidance ?? []),
    `Validation problem: ${summarizeModelError(error)}`,
    "",
    "Original output to repair:",
    serializedOutput
  ].join("\n");
}

async function fetchRawContractOutput(
  prompt: string,
  options: { signal?: AbortSignal }
): Promise<{ status: "success"; raw: unknown } | LlmContractFallback> {
  try {
    return {
      status: "success",
      raw: await getJsonFromLLM(prompt, { signal: options.signal })
    };
  } catch (error) {
    if (isOpenAIQuotaError(error)) {
      return { status: "fallback", reason: "quota", raw: null, error };
    }
    if (isLLMDisabledError(error)) {
      return { status: "fallback", reason: "disabled", raw: null, error };
    }
    if (isLLMTimeoutError(error)) {
      return { status: "fallback", reason: "timeout", raw: null, error };
    }
    if (isJsonExtractionError(error)) {
      return { status: "fallback", reason: "json_extraction_error", raw: error.rawText, error };
    }
    throw error;
  }
}

export async function attemptLlmContract<T>(
  contractId: ContractId,
  prompt: string,
  options: { signal?: AbortSignal } = {}
): Promise<LlmContractAttempt<T>> {
  const initialAttempt = await timeAsync("llm_contract_initial", () => fetchRawContractOutput(prompt, options), {
    contract: contractId
  });
  if (initialAttempt.status === "fallback") {
    return initialAttempt;
  }

  const raw = initialAttempt.raw;
  const contract = getLlmContract(contractId);

  try {
    return {
      status: "success",
      raw,
      parsed: contract.parse(raw) as T,
      repairedFromRaw: null
    };
  } catch (error) {
    if (!isModelShapeError(error)) {
      throw error;
    }

    const repairedAttempt = await timeAsync(
      "llm_contract_repair",
      () => fetchRawContractOutput(
        repairPromptForContract(contractId, raw, error),
        options
      ),
      { contract: contractId }
    );
    if (repairedAttempt.status === "fallback") {
      return repairedAttempt;
    }

    try {
      return {
        status: "success_repaired",
        raw: repairedAttempt.raw,
        parsed: contract.parse(repairedAttempt.raw) as T,
        repairedFromRaw: raw
      };
    } catch (repairError) {
      if (isModelShapeError(repairError)) {
        return { status: "fallback", reason: "shape_error", raw: repairedAttempt.raw, error: repairError };
      }
      throw repairError;
    }
  }
}
