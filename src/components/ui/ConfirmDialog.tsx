"use client";

type Props = {
  cancelLabel?: string;
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
};

export function ConfirmDialog({
  cancelLabel = "Stay here",
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  title
}: Props) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-modal="true" className="dialog" role="dialog" aria-labelledby="confirm-dialog-title">
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="dialog-actions">
          <button className="button-secondary" type="button" onClick={onCancel}>{cancelLabel}</button>
          <button className="button-danger" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
