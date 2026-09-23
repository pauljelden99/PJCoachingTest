"use client";

// Zentriertes Bestaetigungsfenster im Stil der Website (Overlay + .card-Box)
// als Ersatz fuer die bisherigen window.confirm()-Aufrufe beim Loeschen
// (siehe ActivityList.tsx, PlanProtokollDayRows.tsx, WeekPlanBoard.tsx,
// PlanEditor.tsx) - window.confirm sieht auf jedem Betriebssystem anders
// aus und passt sich nicht ans Farbschema/Dark-Mode der Seite an.
export function ConfirmDialog({
  open,
  title = "Wirklich löschen?",
  message,
  confirmLabel = "Löschen",
  cancelLabel = "Abbrechen",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card w-full max-w-sm space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-medium text-ink">{title}</h3>
        <p className="text-sm text-mist">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-mist transition-colors hover:text-ink"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn bg-danger text-paper shadow-sm hover:brightness-110"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
