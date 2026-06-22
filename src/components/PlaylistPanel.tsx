"use client";

import { useEffect, useState } from "react";
import { ExportMenu } from "@/components/ExportMenu";
import { PlaylistRulesDisclosure } from "@/components/PlaylistRulesDisclosure";
import { TrackCard } from "@/components/TrackCard";
import { createPlaylistHealth } from "@/components/playlist/playlistHealth";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { appCommandIds, dispatchAppCommand, exportCommandId, labelForCommand, registerAppCommand } from "@/lib/client/appCommands";
import { revealDesktopPath } from "@/lib/client/desktopApi";
import { downloadPlaylistExport } from "@/lib/client/playlistApi";
import { exportFormatRegistry } from "@/lib/playlist/io/exports";
import type { PlaylistExportFormat } from "@/lib/playlist/io/exportFormats";
import {
  applyPlaylistOperationUndo,
  createRemoveOperationUndoPayload,
  destructiveLabelForPlaylistOperation,
  undoLabelForPlaylistOperation,
  undoSummaryForPlaylistOperation,
  type PlaylistOperationUndoPayload
} from "@/lib/playlist/operations";
import {
  nowIso,
  removePlaylistConstraint,
  removeTrackFromPlaylist,
  removeTracksFromPlaylist,
  reorderTrackInPlaylist,
  updatePlaylistTextField
} from "@/lib/playlist/state";
import type { PlaylistState } from "@/types/playlist";

type Props = {
  canResetDraft?: boolean;
  liveRejectedCount?: number;
  mobileActive?: boolean;
  onOpenIssues?: () => void;
  playlist: PlaylistState;
  onPlaylistChange: (playlist: PlaylistState) => void;
  onResetDraft: () => void;
};

type PlaylistUndoRevisionState = {
  armedUpdatedAt: string | null;
  sourceUpdatedAt: string;
};

function pluralizeTrack(count: number): string {
  return `${count} flagged track${count === 1 ? "" : "s"}`;
}

function pluralizeWarning(count: number): string {
  return `${count} evidence warning${count === 1 ? "" : "s"}`;
}

export function advancePlaylistUndoRevisionState(
  state: PlaylistUndoRevisionState,
  playlistUpdatedAt: string
): PlaylistUndoRevisionState | null {
  if (state.armedUpdatedAt == null) {
    return playlistUpdatedAt === state.sourceUpdatedAt
      ? state
      : { ...state, armedUpdatedAt: playlistUpdatedAt };
  }
  return playlistUpdatedAt === state.armedUpdatedAt ? state : null;
}

export function PlaylistPanel({
  canResetDraft = true,
  liveRejectedCount = 0,
  mobileActive = true,
  onOpenIssues,
  playlist,
  onPlaylistChange,
  onResetDraft
}: Props) {
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [detailsInspectorOpen, setDetailsInspectorOpen] = useState(false);
  const [outputsInspectorOpen, setOutputsInspectorOpen] = useState(false);
  const [undoPayload, setUndoPayload] = useState<PlaylistOperationUndoPayload | null>(null);
  const [undoRevisionState, setUndoRevisionState] = useState<PlaylistUndoRevisionState | null>(null);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<PlaylistExportFormat>("migration_csv");
  const [lastExportPath, setLastExportPath] = useState<string | null>(null);
  const [outputStatus, setOutputStatus] = useState<{ tone: "ok" | "bad"; message: string } | null>(null);

  useEffect(() => {
    if (!undoPayload || !undoRevisionState) {
      return;
    }
    const nextState = advancePlaylistUndoRevisionState(undoRevisionState, playlist.updatedAt);
    if (nextState) {
      if (nextState !== undoRevisionState) {
        setUndoRevisionState(nextState);
      }
      return;
    }
    setUndoPayload(null);
    setUndoRevisionState(null);
  }, [playlist.updatedAt, undoPayload, undoRevisionState]);

  function selectedFormatLabel(): string {
    return exportFormatRegistry.find((format) => format.id === selectedFormat)?.label ?? "Export";
  }

  function exportWithFormat(format: PlaylistExportFormat) {
    return async () => {
      setSelectedFormat(format);
      setOutputStatus(null);
      const result = await downloadPlaylistExport(playlist, format);
      if (result.status === "cancelled") {
        return;
      }
      if (result.path) {
        setLastExportPath(result.path);
      }
      const label = exportFormatRegistry.find((item) => item.id === format)?.label ?? "export";
      setOutputStatus({ tone: "ok", message: `Exported ${label}.` });
    };
  }

  function containingFolder(path: string): string {
    const separatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return separatorIndex >= 0 ? path.slice(0, separatorIndex) : path;
  }

  function updatePlaylistText(field: "title" | "mood" | "arc", value: string) {
    onPlaylistChange(updatePlaylistTextField(playlist, field, value));
  }

  function removeConstraint(key: string) {
    onPlaylistChange(removePlaylistConstraint(playlist, key));
  }

  function dragTrack(trackId: string) {
    setDraggedTrackId(trackId);
    setDropTargetTrackId(trackId);
  }

  function previewDropTarget(trackId: string) {
    if (draggedTrackId) {
      setDropTargetTrackId(trackId);
    }
  }

  function dropTrack(targetTrackId: string | undefined) {
    if (!draggedTrackId || !targetTrackId) {
      cancelDrag();
      return;
    }
    const fromIndex = playlist.tracks.findIndex((track) => track.id === draggedTrackId);
    const toIndex = playlist.tracks.findIndex((track) => track.id === targetTrackId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      cancelDrag();
      return;
    }
    onPlaylistChange(reorderTrackInPlaylist(playlist, fromIndex, toIndex));
    cancelDrag();
  }

  function cancelDrag() {
    setDraggedTrackId(null);
    setDropTargetTrackId(null);
  }

  function removeTrack(trackId: string) {
    const payload = createRemoveOperationUndoPayload(playlist, [trackId]);
    if (!payload) {
      return;
    }
    setUndoPayload(payload);
    setUndoRevisionState({ armedUpdatedAt: null, sourceUpdatedAt: playlist.updatedAt });
    onPlaylistChange(removeTrackFromPlaylist(playlist, trackId));
  }

  function undoRemoveTrack() {
    if (!undoPayload) {
      return;
    }
    onPlaylistChange(applyPlaylistOperationUndo(playlist, undoPayload, nowIso()));
    setUndoPayload(null);
    setUndoRevisionState(null);
  }

  function removeConstraintViolatingTracks() {
    const trackIds = [...new Set(constraintViolations.map((violation) => violation.trackId).filter((trackId): trackId is string => trackId != null))];
    if (trackIds.length === 0) {
      return;
    }

    const payload = createRemoveOperationUndoPayload(playlist, trackIds, { qualifier: "flagged" });
    if (!payload) {
      return;
    }

    setUndoPayload(payload);
    setUndoRevisionState({ armedUpdatedAt: null, sourceUpdatedAt: playlist.updatedAt });
    if (payload.operationId === "remove") {
      onPlaylistChange(removeTracksFromPlaylist(playlist, payload.removedTracks.map((item) => item.track.id)));
    }
  }

  function confirmResetDraft() {
    setConfirmResetOpen(false);
    setUndoPayload(null);
    setUndoRevisionState(null);
    setExpandedTrackId(null);
    setDetailsInspectorOpen(false);
    setOutputsInspectorOpen(false);
    onResetDraft();
  }

  async function copyTracklist() {
    try {
      setOutputStatus(null);
      await navigator.clipboard.writeText(playlist.tracks.map((track, index) => `${index + 1}. ${track.artist} - ${track.title}`).join("\n"));
      setOutputStatus({ tone: "ok", message: "Copied playlist text." });
    } catch {
      setOutputStatus({ tone: "bad", message: "Copy failed." });
    }
  }

  const exportPlaylist = exportWithFormat(selectedFormat);

  async function revealOutput() {
    if (!lastExportPath) {
      setOutputStatus({ tone: "bad", message: "Export a playlist first, then use Reveal Output to open it." });
      return;
    }
    await revealDesktopPath({ path: lastExportPath });
    setOutputStatus({ tone: "ok", message: `${labelForCommand(appCommandIds.revealOutput)}.` });
  }

  useEffect(() => {
    const unbind = [
      registerAppCommand(appCommandIds.newWorkspace, () => {
        setConfirmResetOpen(true);
      }),
      registerAppCommand(appCommandIds.exportPlaylist, exportPlaylist),
      ...exportFormatRegistry.map((format) => registerAppCommand(exportCommandId(format.id), exportWithFormat(format.id))),
      registerAppCommand(appCommandIds.revealOutput, revealOutput),
      registerAppCommand(appCommandIds.changeOutputDestination, () => {
        setOutputStatus({ tone: "bad", message: "CutList asks where to save each export when you export it." });
      }),
      registerAppCommand(appCommandIds.toggleInspector, () => {
        setDetailsInspectorOpen((current) => !current);
      })
    ];
    return () => {
      for (const dispose of unbind) {
        dispose();
      }
    };
  }, [lastExportPath, playlist, selectedFormat]);

  const {
    constraintPresentation,
    constraintViolations,
    evidenceWarnings,
    hasConstraintSupport,
    runtime,
    verificationStatus
  } = createPlaylistHealth(playlist);

  return (
    <section className="panel playlist-panel" data-mobile-active={mobileActive}>
      <div className="section playlist-summary">
        <div className="section-header">
          <div className="playlist-summary-heading">
            <h2>{playlist.title ?? "Untitled CutList"}</h2>
            {playlist.mood ? <p className="muted playlist-summary-mood">{playlist.mood}</p> : null}
          </div>
          <div className="playlist-summary-actions">
            <button className="button-secondary button-compact" type="button" onClick={() => setDetailsInspectorOpen(true)}>
              Edit details
            </button>
            <button className="button-secondary button-compact" type="button" onClick={() => setOutputsInspectorOpen(true)}>
              Outputs
            </button>
            {canResetDraft ? (
              <button className="button-danger button-compact" type="button" onClick={() => void dispatchAppCommand(appCommandIds.newWorkspace)}>New session</button>
            ) : null}
          </div>
        </div>
        <div className="stats">
          <span className="chip">{playlist.tracks.length} tracks</span>
          <span className="chip">{runtime}</span>
          <span className={playlist.tracks.length > 0 && playlist.tracks.every((track) => track.verified) ? "chip chip-success" : "chip"}>{verificationStatus}</span>
          {liveRejectedCount > 0 ? (
            <button className="chip chip-danger chip-action" type="button" onClick={onOpenIssues}>
              Review {liveRejectedCount} rejected
            </button>
          ) : null}
        </div>
        {liveRejectedCount > 0 ? <p className="playlist-summary-note">Open Issues to resolve rejected matches and blocked tracks.</p> : null}
        {constraintPresentation.ruleChips.length > 0 || constraintPresentation.guidance.length > 0
          ? <PlaylistRulesDisclosure constraints={playlist.constraints} onRemove={removeConstraint} />
          : null}
        {hasConstraintSupport ? (
          <details className="playlist-support-drawer">
            <summary>
              <span>Verification details</span>
              <span className="playlist-support-meta">
                {constraintViolations.length > 0
                  ? `${constraintViolations.length} constraint issue${constraintViolations.length === 1 ? "" : "s"}`
                  : "No current issues"}
                {evidenceWarnings.length > 0
                  ? ` · ${evidenceWarnings.length} warning${evidenceWarnings.length === 1 ? "" : "s"}`
                  : ""}
              </span>
            </summary>
            {constraintPresentation.guidance.length > 0 ? (
              <div className="playlist-support-block">
                <strong>Curator guidance</strong>
                <p>{constraintPresentation.guidance.join(" · ")}</p>
              </div>
            ) : null}
            {constraintViolations.length > 0 ? (
              <div className="constraint-status constraint-status-failed" role="status">
                <div className="constraint-status-header">
                  <div>
                    <strong>Constraint issues</strong>
                    {constraintPresentation.violationTrackCount > 0 ? <p className="constraint-issue-count">{pluralizeTrack(constraintPresentation.violationTrackCount)} will be removed if you use the bulk action.</p> : null}
                  </div>
                  {constraintPresentation.violationTrackCount > 0 ? (
                    <button className="button-danger button-compact" type="button" onClick={removeConstraintViolatingTracks}>
                      {destructiveLabelForPlaylistOperation("remove", {
                        count: constraintPresentation.violationTrackCount,
                        qualifier: "flagged"
                      })}
                    </button>
                  ) : null}
                </div>
                <ul className="constraint-violation-list">
                  {constraintPresentation.violationViews.map((view) => (
                    <li key={view.key}>
                      {view.trackTitle ? (
                        <>
                          <strong>&quot;{view.trackTitle}&quot;</strong>: {view.summary}
                        </>
                      ) : view.summary}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {evidenceWarnings.length > 0 || constraintPresentation.evidenceCoverageSummary.length > 0 ? (
              <div className="constraint-status constraint-evidence-warning" role="status">
                <div className="constraint-status-header">
                  <div>
                    <strong>Not enough evidence for all verified rules</strong>
                    <p className="constraint-warning-count">
                      {constraintPresentation.evidenceCoverageSummary.length > 0
                        ? `${constraintPresentation.evidenceCoverageSummary.length} coverage note${constraintPresentation.evidenceCoverageSummary.length === 1 ? "" : "s"}`
                        : pluralizeWarning(evidenceWarnings.length)}
                      {constraintPresentation.evidenceWarningTrackCount > 0 ? ` across ${constraintPresentation.evidenceWarningTrackCount} track${constraintPresentation.evidenceWarningTrackCount === 1 ? "" : "s"}` : ""}.
                    </p>
                  </div>
                </div>
                {constraintPresentation.evidenceCoverageSummary.length > 0 ? (
                  <ul className="constraint-violation-list">
                    {constraintPresentation.evidenceCoverageSummary.map((summary) => (
                      <li key={summary}>{summary}</li>
                    ))}
                  </ul>
                ) : null}
                {constraintPresentation.evidenceWarningViews.length > 0 ? (
                  <ul className="constraint-violation-list">
                    {constraintPresentation.evidenceWarningViews.map((view) => (
                      <li key={view.key}>
                        {view.trackTitle ? (
                          <>
                            <strong>&quot;{view.trackTitle}&quot;</strong>: {view.summary}
                          </>
                        ) : view.summary}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </details>
        ) : null}
      </div>

      <div className="section playlist-tracks">
        <div className="playlist-tracks-head">
          <h2>Playlist</h2>
          {playlist.arc ? <p className="muted playlist-arc">Arc: {playlist.arc}</p> : null}
        </div>
        {undoPayload ? (
          <div className="undo-banner" role="status">
            <span>{undoSummaryForPlaylistOperation(undoPayload)}</span>
            <button className="button-secondary button-compact" type="button" onClick={undoRemoveTrack}>{undoLabelForPlaylistOperation(undoPayload.operationId) ?? "Undo"}</button>
          </div>
        ) : null}
        <div className="playlist-track-scroll">
          {playlist.tracks.length === 0 ? (
            <div className="empty-state">
              <img src="/cutlist_mascot_app.png" alt="" />
              <div>
                <strong>No tracks yet.</strong>
                <p>Start by describing the playlist you want in the Curator Console. Import a draft or verify seed tracks when you already know the songs. Nothing joins the list until it is verified.</p>
              </div>
            </div>
          ) : null}
          {playlist.tracks.map((track, index) => (
            <TrackCard
              key={track.id}
              dragging={draggedTrackId === track.id}
              dropTarget={dropTargetTrackId === track.id && draggedTrackId !== track.id}
              track={track}
              index={index}
              constraintViolationMessages={constraintPresentation.violationMessagesByTrackId.get(track.id) ?? []}
              expanded={expandedTrackId === track.id}
              onDragCancel={cancelDrag}
              onDragOver={previewDropTarget}
              onDragStart={() => dragTrack(track.id)}
              onDrop={dropTrack}
              onRemove={() => removeTrack(track.id)}
              onToggleExpand={() => setExpandedTrackId(expandedTrackId === track.id ? null : track.id)}
            />
          ))}
        </div>
      </div>
      {outputsInspectorOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setOutputsInspectorOpen(false)}>
          <section
            aria-modal="true"
            className="dialog playlist-details-dialog"
            role="dialog"
            aria-labelledby="playlist-outputs-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="playlist-details-dialog-head">
              <h2 id="playlist-outputs-title">Copy or export this playlist</h2>
              <button className="button-secondary button-compact" type="button" onClick={() => setOutputsInspectorOpen(false)}>
                Done
              </button>
            </div>
            <div className="playlist-output-actions">
              <button className="button-secondary button-compact" type="button" disabled={playlist.tracks.length === 0} onClick={() => void copyTracklist()}>
                Copy tracklist
              </button>
              <ExportMenu
                playlist={playlist}
                selectedFormat={selectedFormat}
                onExport={() => void dispatchAppCommand(appCommandIds.exportPlaylist)}
                onSelectedFormatChange={setSelectedFormat}
              />
              <button className="button-secondary button-compact" type="button" disabled={!lastExportPath} onClick={() => void dispatchAppCommand(appCommandIds.revealOutput)}>
                {labelForCommand(appCommandIds.revealOutput)}
              </button>
            </div>
            <div className="playlist-output-summary">
              <p><strong>Destination:</strong> {lastExportPath ? containingFolder(lastExportPath) : "Choose during export"}</p>
              <p><strong>Format:</strong> {selectedFormatLabel()}</p>
            </div>
            {playlist.tracks.length === 0 ? <p className="muted">Add verified tracks before exporting.</p> : null}
            {outputStatus ? <p className={outputStatus.tone}>{outputStatus.message}</p> : null}
          </section>
        </div>
      ) : null}
      {detailsInspectorOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setDetailsInspectorOpen(false)}>
          <section
            aria-modal="true"
            className="dialog playlist-details-dialog"
            role="dialog"
            aria-labelledby="playlist-details-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="playlist-details-dialog-head">
              <h2 id="playlist-details-title">Playlist details</h2>
              <button className="button-secondary button-compact" type="button" onClick={() => setDetailsInspectorOpen(false)}>
                Done
              </button>
            </div>
            <div className="form playlist-edit">
              <label className="field">
                <span>Title</span>
                <input value={playlist.title ?? ""} onChange={(event) => updatePlaylistText("title", event.target.value)} placeholder="Untitled CutList" />
              </label>
              <label className="field">
                <span>Mood</span>
                <textarea rows={3} value={playlist.mood ?? ""} onChange={(event) => updatePlaylistText("mood", event.target.value)} placeholder="Describe the current mood." />
              </label>
              <label className="field">
                <span>Arc</span>
                <textarea rows={3} value={playlist.arc ?? ""} onChange={(event) => updatePlaylistText("arc", event.target.value)} placeholder="Describe the sequence or emotional arc." />
              </label>
            </div>
          </section>
        </div>
      ) : null}
      {confirmResetOpen ? (
        <ConfirmDialog
          title="Start a new session?"
          message="This clears the local playlist, curator messages, and review history. This cannot be undone."
          confirmLabel="New session"
          onCancel={() => setConfirmResetOpen(false)}
          onConfirm={confirmResetDraft}
        />
      ) : null}
    </section>
  );
}
