"use client";

import type { PointerEvent } from "react";
import type { Track } from "@/types/playlist";

type Props = {
  dragging: boolean;
  dropTarget: boolean;
  expanded: boolean;
  constraintViolationMessages?: string[];
  track: Track;
  index: number;
  onDragCancel: () => void;
  onDragOver: (trackId: string) => void;
  onDragStart: () => void;
  onDrop: (trackId?: string) => void;
  onRemove: () => void;
  onToggleExpand: () => void;
};

function vocalProfileLabel(value: NonNullable<Track["vocalProfile"]>): string {
  switch (value) {
    case "female_vocals":
      return "female vocals";
    case "male_vocals":
      return "male vocals";
    case "mixed_vocals":
      return "mixed vocals";
    case "instrumental":
      return "instrumental";
    case "unspecified":
    default:
      return "vocals unspecified";
  }
}

export function TrackCard({
  dragging,
  dropTarget,
  expanded,
  constraintViolationMessages = [],
  track,
  index,
  onDragCancel,
  onDragOver,
  onDragStart,
  onDrop,
  onRemove,
  onToggleExpand
}: Props) {
  function trackIdAtPoint(event: PointerEvent): string | undefined {
    return document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>(".track[data-track-id]")
      ?.dataset.trackId;
  }

  return (
    <div
      className="track"
      data-constraint-violating={constraintViolationMessages.length > 0}
      data-dragging={dragging}
      data-drop-target={dropTarget}
      data-track-id={track.id}
    >
      <div className="track-index">{String(index + 1).padStart(2, "0")}</div>
      <button
        type="button"
        className="drag-handle"
        aria-label={`Drag to reorder ${track.title}`}
        onPointerCancel={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            return;
          }
          onDragCancel();
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
          onDragStart();
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            return;
          }
          const targetTrackId = trackIdAtPoint(event);
          if (targetTrackId) {
            onDragOver(targetTrackId);
          }
        }}
        onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            return;
          }
          event.currentTarget.releasePointerCapture(event.pointerId);
          onDrop(trackIdAtPoint(event));
        }}
        title="Drag to reorder"
      >
        <span aria-hidden="true">::</span>
      </button>
      <div className="track-main">
        <button
          className="track-disclosure"
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} details for ${track.title}`}
        >
          <span className="track-chevron" aria-hidden="true" />
          <span className="track-disclosure-copy">
            <span className="track-title">
              <strong>{track.title}</strong>
              <span>{track.artist}</span>
            </span>
            <span className="track-compact-meta">
              <span className={track.verified ? "status-text ok" : "status-text bad"}>{track.verified ? "Verified" : "Unverified"}</span>
              {track.runtime ? <span className="chip">{track.runtime}</span> : null}
              {constraintViolationMessages.length > 0 ? <span className="chip chip-danger">Constraint issue</span> : null}
            </span>
          </span>
        </button>
        {expanded ? (
          <div className="track-details">
            {track.album ? <div className="muted">{track.album}</div> : null}
            <div className="stats track-meta">
              {track.source ? <span className="chip">{track.source}</span> : null}
              {track.verificationConfidence ? <span className="chip">{track.verificationConfidence} confidence</span> : null}
              {track.bpm ? <span className="chip">{Math.round(track.bpm)} BPM{track.bpmConfidence ? ` / ${track.bpmConfidence}` : ""}</span> : null}
              {track.vocalProfile ? <span className="chip">{vocalProfileLabel(track.vocalProfile)}{track.vocalProfileConfidence ? ` / ${track.vocalProfileConfidence}` : ""}</span> : null}
              {track.genreTags.slice(0, 3).map((tag) => <span className="chip" key={tag}>{tag}</span>)}
            </div>
            {track.evidenceNotes?.length ? (
              <div className="track-fit-note">
                <span>Evidence notes</span>
                <p>{track.evidenceNotes.join(" ")}</p>
              </div>
            ) : null}
            {constraintViolationMessages.length > 0 ? (
              <div className="track-fit-note track-constraint-note">
                <span>Constraint issue</span>
                <ul>
                  {constraintViolationMessages.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </div>
            ) : null}
            {track.fitNotes ? (
              <div className="track-fit-note">
                <span>Fit note</span>
                <p>{track.fitNotes}</p>
              </div>
            ) : null}
            {track.rationale ? (
              <div className="track-fit-note track-rationale-note">
                <span>Why it was added</span>
                <p>{track.rationale}</p>
              </div>
            ) : null}
            {track.sourceUrl ? <a className="muted" href={track.sourceUrl} target="_blank" rel="noreferrer">source</a> : null}
          </div>
        ) : null}
      </div>
      <div className="actions track-actions">
        <button className="button-glyph-danger" type="button" onClick={onRemove} aria-label={`Remove ${track.title}`} title="Remove">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
    </div>
  );
}
