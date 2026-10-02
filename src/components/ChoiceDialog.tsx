// Content for the app's pop-ups (rendered inside a <dialog>): ChoiceDialog asks a question with one
// card per possible outcome; ConfirmDialog asks "are you sure?" with two buttons.

/** Layout shared by the pop-ups: a question, one card per possible outcome, Back/Cancel. */
export function ChoiceDialog({
  title,
  body,
  children,
  cancelLabel = "Cancel",
  onBack,
  onCancel,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
  cancelLabel?: string;
  onBack?: () => void;
  /** Leave out when one of the cards already means "no thanks" (Escape still closes the dialog). */
  onCancel?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted">{body}</p>
      <div className="flex flex-col gap-2">{children}</div>
      {(onBack || onCancel) && (
        <div className={`flex ${onBack ? "justify-between" : "justify-end"}`}>
          {onBack && <button type="button" className="btn-ghost" onClick={onBack}>Back</button>}
          {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>{cancelLabel}</button>}
        </div>
      )}
    </div>
  );
}

/** One outcome in a ChoiceDialog; clicking it applies that outcome (or moves to the next question). */
export function ChoiceCard({ title, detail, autoFocus, onClick }: { title: string; detail: string; autoFocus?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      className="flex flex-col items-start rounded-md border border-line px-4 py-2.5 text-left hover:bg-scene focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70"
      onClick={onClick}
    >
      <span className="font-medium">{title}</span>
      <span className="text-xs text-muted">{detail}</span>
    </button>
  );
}

/**
 * "Are you sure?" for a destructive action: the action and Cancel side by side. Cancel starts with
 * focus so Enter by reflex doesn't destroy anything. It's marked with the HTML `autofocus`
 * attribute, which `showModal()` honours; React's `autoFocus` runs before the dialog opens, after
 * which showModal would move focus to the first button.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busyLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  busyLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted">{body}</p>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-danger flex-1" disabled={busy} onClick={onConfirm}>
          {busy ? busyLabel : confirmLabel}
        </button>
        <button ref={(el) => el?.setAttribute("autofocus", "")} type="button" className="btn-secondary flex-1" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
