// Content for the editor's pop-ups (rendered inside a <dialog>): a question, one card per possible
// outcome, and Back/Cancel.

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
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted">{body}</p>
      <div className="flex flex-col gap-2">{children}</div>
      <div className={`flex ${onBack ? "justify-between" : "justify-end"}`}>
        {onBack && <button type="button" className="btn-ghost" onClick={onBack}>Back</button>}
        <button type="button" className="btn-ghost" onClick={onCancel}>{cancelLabel}</button>
      </div>
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
