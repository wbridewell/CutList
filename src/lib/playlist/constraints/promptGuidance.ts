export const instructionConstraintGuidance = [
  "Verified rules are backend-checkable rules that belong in verifiedRules, such as maxTrackDurationMs, minTrackDurationMs, blocked artists, artist quotas, blocked genres, explicit-content rules, playlist-level limits, and BPM when known.",
  "Curator guidance is preference language that belongs in curatorGuidance, such as vocal profile, energy arc, vibes, sequencing feel, rare genres, preferred genres, and request-driving genre additions.",
  "Generic artist-repeat rules such as 'one track per artist', 'only one song per artist', or 'no repeated artists' belong in verifiedRules.maxTracksPerArtist = 1.",
  "verifiedRules.excludedArtists must always be an array of artist-name strings. Artist quota rules such as 'no more than one total song from Def Leppard' belong in verifiedRules.artistLimits as objects shaped like {\"artist\":\"Def Leppard\",\"maxTotalTracks\":1}.",
  "Artist-blocking instructions such as 'No Motley Crue', 'without Drake', or 'avoid Taylor Swift' belong in verifiedRules.excludedArtists.",
  "Artist-targeted addition requests such as 'suggest two tracks by Tori Amos' or 'add songs from Prince' belong in curatorGuidance.requiredArtists and should usually be request-scoped unless the user says the rule should persist.",
  "Request-driving curator guidance for only the current batch of additions, such as 'add 4 pop songs', 'find me hard rock tracks', or 'give me some cowpunk', belongs in curatorGuidance.requiredGenreAdditions with that field listed in scopeIntent.requestScopedGuidanceFields.",
  "Requests like 'covers only', 'only cover songs', or 'strictly covers' are curator guidance, not verified rules. Store them in curatorGuidance.notes and persist them unless the user explicitly scopes them to this pass only.",
  "requiredGenreAdditions must always be an array of objects shaped like {\"genre\":\"hard rock\",\"count\":4}; never return a string, null, or a bare array of genre names for this field.",
  "If no required genre additions apply, omit requiredGenreAdditions or return an empty array.",
  "Blocked genre/category instructions such as 'no country', 'keep country out', or 'avoid bro-country' belong in verifiedRules.excludedGenres, not curatorGuidance.requiredGenreAdditions.",
  "Vibe-based or invented genres such as 'dark Kansas metal' are curatorial direction for candidate generation, not metadata facts that the backend can prove.",
  "If a genre/category phrase modifies the requested additions, keep it request-scoped via scopeIntent even when the request cannot be fully satisfied.",
  "Convert duration limits exactly into milliseconds. For example, 'under 3 minutes' means verifiedRules.maxTrackDurationMs = 180000.",
  "Duration limits on requested tracks, such as 'under 3 minutes', 'shorter than 4 minutes', or 'no songs over 5 minutes', belong in verifiedRules.maxTrackDurationMs.",
  "'over 4 minutes', 'longer than 4 minutes', and 'more than 4 minutes' mean verifiedRules.minTrackDurationMs = 240000 unless the user says no/nothing over that duration.",
  "A phrase like '20 minute playlist' or 'about 45 minute mix' is a total playlist runtime target, not a per-track duration. Put it in verifiedRules.targetTotalDurationMs with a reasonable totalDurationToleranceMs.",
  "BPM constraints belong in verifiedRules as minBpm, maxBpm, targetBpm, and targetBpmTolerance. For 'around 110 BPM', use targetBpm = 110 and targetBpmTolerance = 5.",
  "Vocal profile requests such as 'female vocalists only', 'all male vocals', 'mixed vocals only', or 'instrumental only' are curator guidance, not verified rules. Store them in curatorGuidance.vocalProfile and use scopeIntent to decide whether they persist.",
  "Additive vocalist requests such as 'add some female vocalists', 'find male singers', or 'include a few instrumental tracks' are request-scoped curator guidance for this batch only. Put them in curatorGuidance.vocalProfile and list vocalProfile in scopeIntent.requestScopedGuidanceFields.",
  "Sequence constraints such as 'gradually increase energy', 'must peak before track 12', or 'end hopeful' are curator guidance. Put them in curatorGuidance.energyTrajectory and use scopeIntent for persistence.",
  "Use operationIntent.type = \"replace\" when the user wants existing tracks swapped out and backfilled; replacing is not the same as pure remove or pure add.",
  "Use operationIntent.requestedTrackCount for add-count requests like 'add 3 tracks', operationIntent.targetTotalTrackCount for requests like 'bring this to 15 total', and operationIntent.replaceCount for requests like 'replace 2 tracks'.",
  "Use scopeIntent persistent field lists for lasting rules and requestScoped field lists for one-shot instructions such as 'for this batch' or 'this time'.",
  "Treat BPM as a verified rule when BPM data exists. Treat vocal profile, rare genres, vibes, and energy trajectory as curator guidance; do not claim they are verified facts."
];

export const candidateConstraintGuidance = [
  "Honor verified rules in the request, knowing backend code will enforce them when the required metadata is available.",
  "For exact runtime, genre, explicitness, BPM when known, and metadata constraints, propose plausible real catalog matches without trying to prove exact metadata in the prompt; backend verification will enforce those rules and reject clear misses.",
  "Do not include runtimes or source claims in candidate objects.",
  "Do not propose tracks already in the current playlist, artists listed in excludedArtists, or artists that have already reached an artistLimits maximum in the current playlist.",
  "If artistLimits says an artist can have at most N tracks and the current playlist already has N tracks by that artist, do not propose that artist again.",
  "If maxTracksPerArtist is set, do not propose artists that already have that many tracks in the current playlist.",
  "If requiredArtists is set, every proposed track must be by one of those artists unless the latest user message explicitly broadens the request.",
  "If curator guidance or notes say the playlist is covers only, propose only songs that are clearly covers rather than originals.",
  "When proposing more than one track, avoid putting two tracks by the same artist back to back unless the user explicitly wants an artist-focused run or there is a clear sequencing reason.",
  "If the playlist has BPM rules, use them when possible, but do not claim exact BPM verification in candidate objects.",
  "If the playlist has vocalProfile, energyTrajectory, rare-genre, or vibe guidance, treat it as curator guidance that should shape suggestions without being presented as verified evidence."
];

export const importConstraintGuidance = [
  "Extract explicit constraints such as runtime limits, blocked artists, artist quotas, required genre additions, and blocked genres where possible."
];
