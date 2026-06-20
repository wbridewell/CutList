"use client";

import type { CuratorPersona } from "@/lib/client/llmSetupApi";
import type { DiscoveryRadius } from "@/types/playlist";

type Props = {
  busy: boolean;
  curatorPersona?: CuratorPersona;
  discoveryRadius?: DiscoveryRadius;
  discoveryRadiusOverride?: DiscoveryRadius | null;
  playlistHasTracks?: boolean;
  progressStatus: string | null;
  userMessage: string;
  onDiscoveryRadiusChange?: (value: DiscoveryRadius) => void;
  onAnalyze: () => void;
  onInterrupt: () => void;
  onSend: () => void;
  onUserMessageChange: (value: string) => void;
};

type TaskStarter = {
  label: string;
  prompt: string;
};

const emptyPlaylistTaskStartersByPersona: Record<CuratorPersona, TaskStarter[]> = {
  razor: [
    { label: "Build", prompt: "Build a short playlist for a heat-warped strip mall: sleaze, panic, cheap neon, and no song over 4.5 minutes." },
    { label: "Seed", prompt: "Use Warm Leatherette by The Normal, Ghost Rider by Suicide, and Nag Nag Nag by Cabaret Voltaire as anchors. Build outward without cleaning up the grime." },
    { label: "Constrain", prompt: "Build a playlist with no polished arena rock, no tasteful dark canon, and no track over 4 minutes." }
  ],
  archivist: [
    { label: "Build", prompt: "Build a playlist that traces the lineage from late-70s art-punk into industrial, mutant dance, and damaged electronic music." },
    { label: "Seed", prompt: "Use Warm Leatherette by The Normal, Being Boiled by The Human League, and Nag Nag Nag by Cabaret Voltaire as anchors. Build the historical bridge outward." },
    { label: "Constrain", prompt: "Build a playlist under 4.5 minutes per track that prioritizes ancestry, mutation, and continuity over obvious canon picks." }
  ],
  firestarter: [
    { label: "Build", prompt: "Build a playlist for a summer-night riot in a dead strip mall: fluorescent nausea, body impact, panic, and bad decisions." },
    { label: "Seed", prompt: "Use Gantz Graf by Autechre, Milk It by Nirvana, and Come to Daddy by Aphex Twin as anchors. Keep the room humid, dirty, and unstable." },
    { label: "Constrain", prompt: "Build a short playlist with no sleek outrun heroics, no prestige electronic monuments, and no clean industrial metal." }
  ]
};

const existingPlaylistTaskStartersByPersona: Record<CuratorPersona, TaskStarter[]> = {
  razor: [
    { label: "Add", prompt: "Add three tracks that make the ending feel more earned without softening the pressure." },
    { label: "Review", prompt: "Review this playlist and name the two tracks that weaken its identity." },
    { label: "Tighten", prompt: "Tighten the middle and cut anything that reads as dead weight." },
    { label: "Replace", prompt: "Replace the two weakest tracks with nastier, more precise fits." },
    { label: "Reorder", prompt: "Reorder the playlist to improve flow without adding or removing songs." }
  ],
  archivist: [
    { label: "Add", prompt: "Add three tracks that deepen the historical line between the current anchors without turning the playlist into a museum survey." },
    { label: "Review", prompt: "Review this playlist and identify where the historical argument becomes too tasteful or reverent." },
    { label: "Tighten", prompt: "Tighten the playlist while preserving continuity, mutation, and physical atmosphere." },
    { label: "Replace", prompt: "Replace the two tracks that preserve lineage on paper but weaken the room." },
    { label: "Reorder", prompt: "Reorder the playlist so each track feels like the next mutation of the same inherited tension." }
  ],
  firestarter: [
    { label: "Add", prompt: "Add three tracks that sound trapped in the same room: humid, fluorescent, ugly, and physically unwell." },
    { label: "Review", prompt: "Review this playlist and identify the tracks that feel tourist-grade, too polished, or too eager for a crowd." },
    { label: "Tighten", prompt: "Tighten the playlist and strip away anything too stylish, too clever, or too clean." },
    { label: "Replace", prompt: "Replace the two tracks that brighten the room or make the decay feel performative." },
    { label: "Reorder", prompt: "Reorder the playlist so the pressure builds like a room slowly shorting out." }
  ]
};

const discoveryRadiusOptions: Array<{ value: DiscoveryRadius; label: string; description: string }> = [
  {
    value: "safe",
    label: "Safe",
    description: "Stay close to verified anchors, dominant genres, existing emotional arc, and familiar adjacency."
  },
  {
    value: "moderate",
    label: "Moderate",
    description: "Allow tasteful adjacent moves while preserving clear continuity with the current playlist identity."
  },
  {
    value: "adventurous",
    label: "Adventurous",
    description: "Broaden era, scene, and texture choices while still matching the requested identity."
  },
  {
    value: "highly_experimental",
    label: "Highly experimental",
    description: "Maximize exploratory breadth while still respecting verified rules and explicit exclusions."
  }
];

export function NaturalRequestForm({
  busy,
  curatorPersona = "razor",
  discoveryRadius = "moderate",
  discoveryRadiusOverride = null,
  playlistHasTracks = true,
  progressStatus,
  userMessage,
  onDiscoveryRadiusChange = () => undefined,
  onAnalyze,
  onInterrupt,
  onSend,
  onUserMessageChange
}: Props) {
  const promptExamples = playlistHasTracks
    ? existingPlaylistTaskStartersByPersona[curatorPersona]
    : emptyPlaylistTaskStartersByPersona[curatorPersona];
  const promptExampleLabel = playlistHasTracks ? "Common moves" : "Ways to start";
  const placeholder = playlistHasTracks
    ? "Describe the next change you want, ask for a review, or tell the Curator how the flow should shift."
    : "Describe the playlist you want: mood, occasion, genre, duration, constraints, or a few known tracks.";
  const consoleIntro = playlistHasTracks
    ? "Tell the Curator what move to make next: add, review, tighten, replace, or reorder."
    : "Describe the playlist you want. The Curator builds the first pass, then checks the records before anything joins the list.";
  const primaryLabel = playlistHasTracks ? "Send request" : "Build playlist";
  const activeDiscoveryRadius = discoveryRadiusOptions.find((option) => option.value === discoveryRadius) ?? discoveryRadiusOptions[1];

  return (
    <div className="section form command-composer">
      <div className="composer-heading">
        <img src="/cutlist_mascot_app.png" alt="" />
        <div>
          <h2>Curator Console</h2>
          <p className="section-intro">{consoleIntro}</p>
        </div>
      </div>
      <label className="field">
        <span>{playlistHasTracks ? "Instruction" : "Describe playlist"}</span>
        <textarea rows={4} value={userMessage} onChange={(event) => onUserMessageChange(event.target.value)} placeholder={placeholder} />
      </label>
      <details className="reorder-guidance prompt-examples discovery-radius-disclosure" aria-label="Discovery radius">
        <summary>
          <span>Discovery radius</span>
          <span>{activeDiscoveryRadius.label}</span>
        </summary>
        <div className="actions discovery-radius-group" role="radiogroup" aria-label="Discovery radius">
          {discoveryRadiusOptions.map(({ value, label, description }) => (
            <label
              aria-checked={discoveryRadius === value}
              className={discoveryRadius === value ? "button-secondary is-active discovery-radius-option" : "button-secondary discovery-radius-option"}
              data-disabled={busy ? "true" : "false"}
              key={value}
              role="radio"
              title={description}
            >
              <input
                checked={discoveryRadius === value}
                disabled={busy}
                name="discovery-radius"
                type="radio"
                value={value}
                onChange={() => onDiscoveryRadiusChange(value)}
              />
              {label}
            </label>
          ))}
        </div>
        {discoveryRadiusOverride ? (
          <p className="drawer-note">
            This request is temporarily using <strong>{discoveryRadiusOverride.replace(/_/g, " ")}</strong> instead of the saved default.
          </p>
        ) : null}
      </details>
      <details className="reorder-guidance prompt-examples" aria-label={`${promptExampleLabel} examples`} open={!playlistHasTracks}>
        <summary>
          <span>{promptExampleLabel}</span>
          <span>{promptExamples.length} examples</span>
        </summary>
        <div>
          {promptExamples.map((example) => (
            <button
              className="prompt-chip"
              disabled={busy}
              key={example.label}
              onClick={() => onUserMessageChange(example.prompt)}
              type="button"
            >
              {example.label}
            </button>
          ))}
        </div>
      </details>
      <div className="actions">
        <button className="button-primary" type="button" disabled={busy} onClick={onSend}>{busy ? "Working..." : primaryLabel}</button>
        <button
          className="button-secondary"
          type="button"
          disabled={busy || !playlistHasTracks}
          onClick={onAnalyze}
          title={playlistHasTracks ? "Review playlist" : "Add verified tracks before requesting a playlist review."}
        >
          Review playlist
        </button>
        {busy ? <button className="button-secondary" type="button" onClick={onInterrupt}>Stop request</button> : null}
      </div>
      {!playlistHasTracks ? <p className="drawer-note">Import and known-track tools are still available when you already have a draft or a few anchor tracks.</p> : null}
      {progressStatus ? <div className="progress-status" role="status">{progressStatus}</div> : null}
    </div>
  );
}
