"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

type Props = {
  cancelLabel?: string;
  confirmLabel: string;
  defaultValue?: string;
  label: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
  title: string;
};

// Replaces window.prompt, which has no place in the Tauri webview and does not match the
// app's ConfirmDialog. Enter submits, Escape cancels, and a blank value cannot be confirmed.
export function TextPromptDialog({
  cancelLabel = "Cancel",
  confirmLabel,
  defaultValue = "",
  label,
  onCancel,
  onConfirm,
  title
}: Props) {
  const [value, setValue] = useState(defaultValue);
  const trimmed = value.trim();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed) {
      onConfirm(trimmed);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <form
        aria-labelledby="text-prompt-dialog-title"
        aria-modal="true"
        className="dialog"
        role="dialog"
        onKeyDown={handleKeyDown}
        onSubmit={submit}
      >
        <h2 id="text-prompt-dialog-title">{title}</h2>
        <label className="dialog-field">
          <span>{label}</span>
          <input autoFocus type="text" value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        <div className="dialog-actions">
          <button className="button-secondary" type="button" onClick={onCancel}>{cancelLabel}</button>
          <button className="button-primary" disabled={!trimmed} type="submit">{confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}
