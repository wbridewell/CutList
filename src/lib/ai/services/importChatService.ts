import { isLLMDisabledError } from "@/lib/ai/errors";
import { getLlmContract } from "@/lib/ai/contracts";
import { getJsonFromLLM } from "@/lib/ai/llmClient";
import { importPrompt } from "@/lib/ai/prompts";
import { verifyTracks } from "@/lib/music/verifyTrack";
import { emptyConstraints, parseTrackRowsFromText } from "@/lib/playlist/io/textImport";
import type { ImportChatResponse } from "@/types/playlist";

export async function handleImportChat(text: string): Promise<ImportChatResponse> {
  const parsedTracks = parseTrackRowsFromText(text);
  if (parsedTracks.length > 0) {
    const verified = await verifyTracks(parsedTracks);
    return {
      extractedVibeBrief: null,
      extractedConstraints: emptyConstraints(),
      verifiedTracks: verified.verified,
      rejectedCandidates: verified.rejected,
      unresolvedNotes: [],
      suggestedNextPrompt: "Ask for a critique, sequencing pass, or hard constraints like no songs over 3 minutes."
    };
  }

  let raw: unknown;
  try {
    raw = await getJsonFromLLM(importPrompt(text));
  } catch (error) {
    if (isLLMDisabledError(error)) {
      return {
        extractedVibeBrief: null,
        extractedConstraints: emptyConstraints(),
        verifiedTracks: [],
        rejectedCandidates: [],
        unresolvedNotes: ["LLM provider is disabled. Pasted table-style track lists can still be imported and verified, but freeform chat extraction requires LLM_PROVIDER=ollama, LLM_PROVIDER=openai, or LLM_PROVIDER=gemini."],
        suggestedNextPrompt: "Paste a table with Name, Artist, and Album columns, or enable a local Ollama model."
      };
    }
    throw error;
  }
  const extracted = getLlmContract("importChat").parse(raw);
  const verified = await verifyTracks(extracted.tracks);

  return {
    extractedVibeBrief: extracted.extractedVibeBrief,
    extractedConstraints: extracted.extractedConstraints,
    verifiedTracks: verified.verified,
    rejectedCandidates: verified.rejected,
    unresolvedNotes: extracted.unresolvedNotes,
    suggestedNextPrompt: extracted.suggestedNextPrompt
  };
}
