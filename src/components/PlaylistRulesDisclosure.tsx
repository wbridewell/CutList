"use client";

import {
  getConstraintChips,
  getConstraintGuidance,
  type ConstraintChipView,
  createConstraintPresentation
} from "@/lib/playlist/constraints/presentation";
import type { PlaylistConstraints } from "@/types/playlist";

type Props = {
  constraints: PlaylistConstraints;
  onRemove?: (key: string) => void;
};

export function PlaylistRulesDisclosure({ constraints, onRemove }: Props) {
  const verifiedRules = getConstraintChips(constraints);
  const guidance = getConstraintGuidance(constraints);
  const guidanceChips = createConstraintPresentation([], constraints, {
    passed: true,
    totalDurationMs: 0,
    violations: [],
    evidenceWarnings: []
  }).curatorGuidanceChips;

  if (verifiedRules.length === 0 && guidance.length === 0) {
    return <span className="muted">No active verified rules or curator guidance yet.</span>;
  }

  function renderChip(chip: ConstraintChipView) {
    return (
      <span className="chip removable-chip constraint-chip" key={chip.key}>
        {chip.label}
        {onRemove ? (
          <button
            aria-label={`Remove item: ${chip.label}`}
            className="chip-remove"
            onClick={() => onRemove(chip.key)}
            type="button"
          >
            ×
          </button>
        ) : null}
      </span>
    );
  }

  return (
    <details className="playlist-rules-drawer">
      <summary>
        <span>Verified rules and guidance</span>
        <span className="playlist-rules-meta">
          {verifiedRules.length > 0 ? `${verifiedRules.length} verified rule${verifiedRules.length === 1 ? "" : "s"}` : "No verified rules"}
          {guidance.length > 0 ? ` · ${guidance.length} guidance item${guidance.length === 1 ? "" : "s"}` : ""}
        </span>
      </summary>
      <div className="constraint-summary">
        {verifiedRules.length > 0 ? (
          <div>
            <span className="constraint-heading">Verified rules · {verifiedRules.length}</span>
            <div className="stats">
              {verifiedRules.map(renderChip)}
            </div>
          </div>
        ) : null}
        {guidance.length > 0 ? (
          <div>
            <span className="constraint-heading">Curator guidance · {guidance.length}</span>
            <div className="stats">
              {guidanceChips.map(renderChip)}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
