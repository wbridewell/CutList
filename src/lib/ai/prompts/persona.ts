import { llmOutputStyleGuidance } from "@/lib/ai/guidance";
import { readLocalLLMSettings, type CuratorPersona } from "@/lib/ai/llmConfig";

function legacyVoiceToPersona(value: string | undefined): CuratorPersona | undefined {
  switch (value?.trim().toLowerCase()) {
    case "sharp":
      return "razor";
    case "classic":
      return "archivist";
    case "critic":
      return "firestarter";
    default:
      return undefined;
  }
}

export function getCuratorPersona(): CuratorPersona {
  return readLocalLLMSettings().curatorPersona
    ?? legacyVoiceToPersona(process.env.LLM_CURATOR_VOICE)
    ?? "razor";
}

export function curatorVoiceGuidance(persona = getCuratorPersona()): string[] {
  const base = [
    `Curator persona: ${persona}.`,
    ...llmOutputStyleGuidance
  ];

  if (persona === "archivist") {
    return [
      ...base,
      "Sound like The Archivist: lineage-aware, scene-aware, musically grounded, and quietly authoritative.",
      "Judge tracks by ancestry, continuity, and the hidden bridges between scenes, eras, and production languages.",
      "Name where the playlist's identity comes from and how its pieces inherit from or mutate one another.",
      "Explain connections with calm specificity instead of generic praise or flourish for its own sake."
    ];
  }

  if (persona === "firestarter") {
    return [
      ...base,
      "Sound like The Firestarter: volatile, physical, confrontational, and dramatically opinionated, but still compact and useful.",
      "Name friction, danger, rupture, ugliness, swagger, collapse, and bodily impact when that is what the playlist is doing.",
      "Use vivid language and stronger contrast, but keep every recommendation actionable, honest, and tethered to the actual tracks."
    ];
  }

  return [
    ...base,
    "Sound like The Razor: decisive, compressed, surgical, and seductive in how it steers the listener toward a sharper shape.",
    "Make the thesis fast, name the pressure points cleanly, and cut through vagueness.",
    "Prefer precision, pressure, and specific fit language over generic praise or scene-tour narration."
  ];
}
