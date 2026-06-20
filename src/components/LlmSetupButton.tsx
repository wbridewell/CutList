"use client";

import { useEffect, useState } from "react";
import {
  getLLMSetup,
  saveLLMSetup,
  testLLMSetup,
  type LLMProvider,
  type LLMSetupStatus
} from "@/lib/client/llmSetupApi";

const providerOptions: Array<{
  label: string;
  model: string;
  provider: LLMProvider;
  requiresKey: boolean;
}> = [
  { provider: "gemini", label: "Gemini (recommended)", model: "gemini-2.5-flash", requiresKey: true },
  { provider: "openai", label: "OpenAI", model: "gpt-4.1-mini", requiresKey: true },
  { provider: "ollama", label: "Ollama local", model: "granite4.1:8b", requiresKey: false },
  { provider: "none", label: "No LLM", model: "none", requiresKey: false }
];

function defaultModel(provider: LLMProvider): string {
  return providerOptions.find((option) => option.provider === provider)?.model ?? "gemini-2.5-flash";
}

function providerRequiresKey(provider: LLMProvider): boolean {
  return providerOptions.find((option) => option.provider === provider)?.requiresKey ?? false;
}

function setupMeta(status: LLMSetupStatus | null, loading: boolean): string {
  if (loading) {
    return "Checking";
  }
  if (!status) {
    return "Setup";
  }
  if (status.configured) {
    return "Ready";
  }
  if (status.provider === "none") {
    return "Disabled";
  }
  return "Setup";
}

type Props = {
  initialOpen?: boolean;
};

export function LlmSetupButton({ initialOpen = false }: Props) {
  const [open, setOpen] = useState(initialOpen);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<LLMSetupStatus | null>(null);
  const [provider, setProvider] = useState<LLMProvider>("gemini");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [apiKey, setApiKey] = useState("");
  const [timeoutMs, setTimeoutMs] = useState(120000);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://localhost:11434");
  const [llmAssistedMatchReviewEnabled, setLlmAssistedMatchReviewEnabled] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  function setupHint(currentProvider: LLMProvider): string {
    if (currentProvider === "ollama") {
      return "Ollama stays local on your machine. Start Ollama first, then save and test.";
    }
    if (currentProvider === "none") {
      return "No LLM turns off playlist generation and critique, but import, export, and verified track tools still work.";
    }
    return "For this local alpha, API keys are saved only on this machine in a local app settings file. Gemini is the easiest first-run path.";
  }

  async function refreshSetup() {
    setLoading(true);
    try {
      const result = await getLLMSetup();
      setStatus(result.status);
      setProvider(result.status.provider);
      setModel(result.status.model === "none" ? defaultModel(result.status.provider) : result.status.model);
      setTimeoutMs(result.status.timeoutMs);
      setLlmAssistedMatchReviewEnabled(result.status.llmAssistedMatchReviewEnabled);
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not read LLM setup.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialOpen) {
      void refreshSetup();
    }
  }, [initialOpen]);

  function openSetup() {
    setOpen(true);
    if (!status && !loading) {
      void refreshSetup();
    }
  }

  async function saveSetup() {
    setSaving(true);
    setNotice(null);
    try {
      const result = await saveLLMSetup({
        provider,
        model,
        timeoutMs,
        ollamaBaseUrl,
        apiKey: apiKey.trim() || undefined,
        llmAssistedMatchReviewEnabled
      });
      setStatus(result.status);
      setApiKey("");
      setNotice("Saved setup locally. API keys stay on this machine.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save LLM setup.");
    } finally {
      setSaving(false);
    }
  }

  async function testSetup() {
    setTesting(true);
    setNotice(null);
    try {
      const result = await testLLMSetup({
        provider,
        model,
        timeoutMs,
        ollamaBaseUrl,
        apiKey: apiKey.trim() || undefined,
        llmAssistedMatchReviewEnabled
      });
      setStatus(result.status);
      setApiKey("");
      setNotice(result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not test LLM setup.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <button className="terminal-status llm-setup-launcher" type="button" onClick={openSetup} aria-label="Open LLM setup">
        <span className="session-launcher-title">LLM setup</span>
        <span className="session-launcher-meta">{setupMeta(status, loading)}</span>
      </button>
      {open ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <section
            aria-modal="true"
            className="dialog llm-setup-dialog"
            role="dialog"
            aria-labelledby="llm-setup-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="llm-setup-dialog-title">LLM setup</h2>
            <p>{setupHint(provider)}</p>
            <div className="llm-setup-status-row" role="status">
              <span>{status?.configured ? "Curator is ready" : "Setup needed"}</span>
              <span>{status ? `${status.provider} · ${status.model}` : "Not checked yet"}</span>
            </div>
            <div className="llm-setup-dialog-body">
              <label className="field">
                <span>Provider</span>
                <select
                  value={provider}
                  onChange={(event) => {
                    const nextProvider = event.target.value as LLMProvider;
                    setProvider(nextProvider);
                    setModel(defaultModel(nextProvider));
                    setApiKey("");
                  }}
                >
                  {providerOptions.map((option) => (
                    <option key={option.provider} value={option.provider}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Model</span>
                <input disabled={provider === "none"} value={model} onChange={(event) => setModel(event.target.value)} />
              </label>
              {providerRequiresKey(provider) ? (
                <label className="field">
                  <span>{provider === "gemini" ? "Gemini API key" : "OpenAI API key"}</span>
                  <input
                    autoComplete="off"
                    placeholder={status?.keyPresent ? "Key already saved; leave blank to keep it" : "Paste API key"}
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </label>
              ) : null}
              {provider === "ollama" ? (
                <label className="field">
                  <span>Ollama URL</span>
                  <input value={ollamaBaseUrl} onChange={(event) => setOllamaBaseUrl(event.target.value)} />
                </label>
              ) : null}
              <label className="field">
                <span>Timeout</span>
                <input min={10000} step={10000} type="number" value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value))} />
              </label>
              <label className="field checkbox-field">
                <span>LLM-assisted match review</span>
                <input
                  checked={llmAssistedMatchReviewEnabled}
                  type="checkbox"
                  onChange={(event) => setLlmAssistedMatchReviewEnabled(event.target.checked)}
                />
              </label>
            </div>
            <p className="llm-setup-note">When enabled, the Curator may prune obvious non-matches and recommend one provider match in ambiguous verification cases, but it will never auto-accept a track.</p>
            {status?.envOverrides.provider || status?.envOverrides.key || status?.envOverrides.model || status?.envOverrides.timeout ? (
              <p className="llm-setup-note">Some values are controlled by shell environment variables, which override local settings.</p>
            ) : null}
            {notice ? <p className="llm-setup-notice">{notice}</p> : null}
            <div className="dialog-actions">
              <button className="button-secondary" type="button" onClick={() => setOpen(false)}>Close</button>
              <button className="button-secondary" disabled={saving || testing} type="button" onClick={() => void saveSetup()}>{saving ? "Saving..." : "Save setup"}</button>
              <button className="button-primary" disabled={saving || testing || provider === "none"} type="button" onClick={() => void testSetup()}>{testing ? "Testing..." : "Save and test"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
