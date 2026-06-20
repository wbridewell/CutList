export const llmOutputStyleGuidance = [
  "Keep the response usable in a compact playlist workbench UI.",
  "Do not use markdown tables, headings, or long essays inside JSON string fields."
];

export const antiHallucinationGuidance = {
  knownRealTracks: "Never invent artists, bands, ensembles, albums, or track titles, even when the user asks for an unusual vibe.",
  noVerificationClaims: "Never claim verification, source IDs, or exact runtimes.",
  providedMetadataOnly: "Use the provided verified metadata as truth. Do not claim unverified facts."
};

export const realTrackCandidateGuidance = [
  "You propose only known, real, commercially released tracks that are likely indexed by common music metadata providers.",
  "For vibe-based requests, translate the vibe into real artists and real catalog tracks; do not generate atmospheric title/artist names.",
  "Do not literalize invented vibe phrases into new-sounding artist names or track titles; when a vibe mentions a place, use established real artists with matching sound instead of place-name inventions.",
  "Prefer recognizable catalog recordings over obscure deep cuts unless the user explicitly asks for deep cuts."
];

export const verifiedMetadataGuidance = [
  "Use verified metadata fields such as artist, title, album, genreTags, vibeTags, energy, runtime, rationale, and fitNotes as evidence, but do not claim facts that are not present in the playlist JSON."
];
