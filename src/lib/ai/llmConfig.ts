import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

export const LLMProviderSchema = z.enum(["ollama", "openai", "gemini", "none"]);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;
export const CuratorPersonaSchema = z.enum(["razor", "archivist", "firestarter"]);
export type CuratorPersona = z.infer<typeof CuratorPersonaSchema>;

const LocalLLMSettingsSchema = z.object({
  provider: LLMProviderSchema.optional(),
  geminiApiKey: z.string().optional(),
  geminiModel: z.string().optional(),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().optional(),
  ollamaBaseUrl: z.string().optional(),
  ollamaModel: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  llmAssistedMatchReviewEnabled: z.boolean().optional(),
  curatorPersona: CuratorPersonaSchema.optional()
}).default({});

export type LocalLLMSettings = z.infer<typeof LocalLLMSettingsSchema>;

export type EffectiveLLMConfig = {
  provider: LLMProvider;
  geminiApiKey?: string;
  geminiModel: string;
  openaiApiKey?: string;
  openaiModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaGptOssThink: "low" | "medium" | "high";
  timeoutMs: number;
};

export type LLMSetupStatus = {
  provider: LLMProvider;
  model: string;
  timeoutMs: number;
  curatorPersona: CuratorPersona;
  configured: boolean;
  keyPresent: boolean;
  llmAssistedMatchReviewEnabled: boolean;
  keySource: "env" | "local" | "not_required" | "missing";
  envOverrides: {
    provider: boolean;
    key: boolean;
    model: boolean;
    timeout: boolean;
  };
};

const defaultConfig: EffectiveLLMConfig = {
  provider: "gemini",
  geminiModel: "gemini-2.5-flash",
  openaiModel: "gpt-4.1-mini",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "granite4.1:8b",
  ollamaGptOssThink: "medium",
  timeoutMs: 120_000
};

export const defaultCuratorPersona: CuratorPersona = "razor";

export const LOCAL_LLM_SETTINGS_PATH = ".cutlist.local-settings.json";

function settingsPath(): string {
  const explicitPath = process.env.CUTLIST_LLM_SETTINGS_PATH;
  if (explicitPath) {
    return resolve(process.cwd(), explicitPath);
  }
  const desktopDataDir = nonEmpty(process.env.CUTLIST_DESKTOP_DATA_DIR);
  if (desktopDataDir) {
    return resolve(desktopDataDir, LOCAL_LLM_SETTINGS_PATH);
  }
  return resolve(process.cwd(), LOCAL_LLM_SETTINGS_PATH);
}

function normalizeProvider(value: string | undefined): LLMProvider | undefined {
  const result = LLMProviderSchema.safeParse(value?.trim().toLowerCase());
  return result.success ? result.data : undefined;
}

function normalizeThinkLevel(value: string | undefined): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function positiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readLocalLLMSettings(): LocalLLMSettings {
  if (!existsSync(settingsPath())) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), "utf8"));
    return LocalLLMSettingsSchema.parse(parsed);
  } catch {
    return {};
  }
}

export function writeLocalLLMSettings(settings: LocalLLMSettings): void {
  const normalized = LocalLLMSettingsSchema.parse(settings);
  mkdirSync(dirname(settingsPath()), { recursive: true });
  writeFileSync(settingsPath(), `${JSON.stringify(normalized, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

export function resolveLLMConfig(env: NodeJS.ProcessEnv = process.env): EffectiveLLMConfig {
  const local = readLocalLLMSettings();
  return {
    provider: normalizeProvider(env.LLM_PROVIDER) ?? local.provider ?? defaultConfig.provider,
    geminiApiKey: nonEmpty(env.GEMINI_API_KEY) ?? nonEmpty(local.geminiApiKey),
    geminiModel: nonEmpty(env.GEMINI_MODEL) ?? nonEmpty(local.geminiModel) ?? defaultConfig.geminiModel,
    openaiApiKey: nonEmpty(env.OPENAI_API_KEY) ?? nonEmpty(local.openaiApiKey),
    openaiModel: nonEmpty(env.OPENAI_MODEL) ?? nonEmpty(local.openaiModel) ?? defaultConfig.openaiModel,
    ollamaBaseUrl: (nonEmpty(env.OLLAMA_BASE_URL) ?? nonEmpty(local.ollamaBaseUrl) ?? defaultConfig.ollamaBaseUrl).replace(/\/+$/, ""),
    ollamaModel: nonEmpty(env.OLLAMA_MODEL) ?? nonEmpty(local.ollamaModel) ?? defaultConfig.ollamaModel,
    ollamaGptOssThink: normalizeThinkLevel(nonEmpty(env.OLLAMA_GPT_OSS_THINK)),
    timeoutMs: positiveInteger(env.LLM_TIMEOUT_MS) ?? local.timeoutMs ?? defaultConfig.timeoutMs
  };
}

export function llmModelForProvider(config: EffectiveLLMConfig): string {
  if (config.provider === "openai") {
    return config.openaiModel;
  }
  if (config.provider === "ollama") {
    return config.ollamaModel;
  }
  if (config.provider === "gemini") {
    return config.geminiModel;
  }
  return "none";
}

export function llmSetupStatus(env: NodeJS.ProcessEnv = process.env): LLMSetupStatus {
  const local = readLocalLLMSettings();
  const config = resolveLLMConfig(env);
  const keyPresent = config.provider === "gemini"
    ? Boolean(config.geminiApiKey)
    : config.provider === "openai"
      ? Boolean(config.openaiApiKey)
      : config.provider === "ollama" || config.provider === "none";
  const keySource = config.provider === "ollama" || config.provider === "none"
    ? "not_required"
    : config.provider === "gemini" && nonEmpty(env.GEMINI_API_KEY)
      ? "env"
      : config.provider === "openai" && nonEmpty(env.OPENAI_API_KEY)
        ? "env"
        : keyPresent
          ? "local"
          : "missing";

  return {
    provider: config.provider,
    model: llmModelForProvider(config),
    timeoutMs: config.timeoutMs,
    curatorPersona: local.curatorPersona ?? defaultCuratorPersona,
    configured: config.provider !== "none" && keyPresent,
    keyPresent,
    llmAssistedMatchReviewEnabled: local.llmAssistedMatchReviewEnabled ?? true,
    keySource,
    envOverrides: {
      provider: nonEmpty(env.LLM_PROVIDER) != null,
      key: config.provider === "gemini"
        ? nonEmpty(env.GEMINI_API_KEY) != null
        : config.provider === "openai"
          ? nonEmpty(env.OPENAI_API_KEY) != null
          : false,
      model: config.provider === "gemini"
        ? nonEmpty(env.GEMINI_MODEL) != null
        : config.provider === "openai"
          ? nonEmpty(env.OPENAI_MODEL) != null
          : config.provider === "ollama"
            ? nonEmpty(env.OLLAMA_MODEL) != null
            : false,
      timeout: nonEmpty(env.LLM_TIMEOUT_MS) != null
    }
  };
}

export function mergeLocalLLMSettings(update: LocalLLMSettings): LocalLLMSettings {
  const current = readLocalLLMSettings();
  const next = LocalLLMSettingsSchema.parse({
    ...current,
    ...Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined))
  });
  writeLocalLLMSettings(next);
  return next;
}
