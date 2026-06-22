"use client";

import { useState } from "react";
import { getLLMSetup, saveLLMSetup, type CuratorPersona, type LLMProvider, type LLMSetupStatus } from "@/lib/client/llmSetupApi";

const personaOptions: Array<{
  persona: CuratorPersona;
  name: string;
  shortLabel: string;
  description: string;
  sample: string;
}> = [
  {
    persona: "razor",
    name: "The Razor",
    shortLabel: "Razor",
    description: "Lean, exacting, and quietly persuasive.",
    sample: "\"The pressure is there. Let me tighten the middle so the payoff actually lands.\""
  },
  {
    persona: "archivist",
    name: "The Archivist",
    shortLabel: "Archivist",
    description: "Measured, contextual, and musically grounded.",
    sample: "\"The lineage works; the sequencing memory does not.\""
  },
  {
    persona: "firestarter",
    name: "The Firestarter",
    shortLabel: "Firestarter",
    description: "Vivid, dangerous, and dramatically opinionated.",
    sample: "\"The opener bites, then the momentum starts throwing elbows at itself.\""
  }
];

function personaMeta(persona: CuratorPersona, loading: boolean): string {
  if (loading) {
    return "Checking";
  }
  return personaOptions.find((option) => option.persona === persona)?.shortLabel ?? "Razor";
}

function defaultModel(provider: LLMProvider): string {
  if (provider === "openai") {
    return "gpt-4.1-mini";
  }
  if (provider === "ollama") {
    return "granite4.1:8b";
  }
  if (provider === "none") {
    return "none";
  }
  return "gemini-2.5-flash";
}

export function CuratorPersonaButton({
  curatorPersona,
  onCuratorPersonaChange
}: {
  curatorPersona: CuratorPersona;
  onCuratorPersonaChange: (persona: CuratorPersona) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<LLMSetupStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refreshSetup() {
    setLoading(true);
    try {
      const result = await getLLMSetup();
      setStatus(result.status);
      onCuratorPersonaChange(result.status.curatorPersona);
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not read Curator persona.");
    } finally {
      setLoading(false);
    }
  }

  function openPersona() {
    setOpen(true);
    if (!status && !loading) {
      void refreshSetup();
    }
  }

  async function savePersona(persona: CuratorPersona) {
    setSaving(true);
    setNotice(null);
    try {
      const nextProvider = status?.provider ?? "gemini";
      const result = await saveLLMSetup({
        provider: nextProvider,
        model: status?.model === "none" ? defaultModel(nextProvider) : status?.model,
        timeoutMs: status?.timeoutMs,
        llmAssistedMatchReviewEnabled: status?.llmAssistedMatchReviewEnabled,
        curatorPersona: persona
      });
      setStatus(result.status);
      onCuratorPersonaChange(result.status.curatorPersona);
      setNotice(`${personaOptions.find((option) => option.persona === persona)?.name ?? "Curator persona"} is now active.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save Curator persona.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="terminal-status llm-setup-launcher" type="button" onClick={openPersona} aria-label="Open Curator persona">
        <span className="session-launcher-title">Curator persona</span>
        <span className="session-launcher-meta">{personaMeta(curatorPersona, loading)}</span>
      </button>
      {open ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <section
            aria-modal="true"
            className="dialog llm-setup-dialog"
            role="dialog"
            aria-labelledby="curator-persona-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="curator-persona-dialog-title">Curator persona</h2>
            <p>Choose how the Curator speaks across requests, reviews, and match guidance. This changes tone and continuity, not verification standards.</p>
            <div className="llm-setup-status-row" role="status">
              <span>Current voice</span>
              <span>{personaOptions.find((option) => option.persona === curatorPersona)?.name ?? "The Razor"}</span>
            </div>
            <div className="curator-persona-grid">
              {personaOptions.map((option) => (
                <label
                  className={`curator-persona-card${curatorPersona === option.persona ? " is-selected" : ""}`}
                  key={option.persona}
                >
                  <div className="curator-persona-card-head">
                    <div>
                      <strong>{option.name}</strong>
                      <span className="curator-persona-short">{option.shortLabel}</span>
                    </div>
                    <span className="curator-persona-indicator">
                      {curatorPersona === option.persona ? (saving ? "Saving" : "Active") : "Select"}
                    </span>
                  </div>
                  <p className="curator-persona-description">{option.description}</p>
                  <p className="curator-persona-sample">{option.sample}</p>
                  <input
                    checked={curatorPersona === option.persona}
                    disabled={saving || loading}
                    name="curator-persona"
                    type="radio"
                    onChange={() => {
                      onCuratorPersonaChange(option.persona);
                      void savePersona(option.persona);
                    }}
                  />
                </label>
              ))}
            </div>
            {notice ? <p className="llm-setup-notice">{notice}</p> : null}
            <div className="dialog-actions">
              <button className="button-secondary" type="button" onClick={() => setOpen(false)}>Close</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
