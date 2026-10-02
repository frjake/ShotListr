import { formatFileSize, type ScriptInfo } from "@/lib/scripts";

export type ScriptBusy = "uploading" | "removing" | "reading";
const BUSY_LABEL: Record<ScriptBusy, string> = { uploading: "Uploading…", removing: "Removing…", reading: "Reading script…" };

/**
 * The script line at the top of the shotlist editor: the attached file (a download link once it's
 * stored) with Autofill / Replace / Remove, or "Add script" when there's none. A new shotlist's
 * script is only held in the browser (`pending`) until the shotlist's first save.
 */
export function ScriptBar({
  shotlistId,
  script,
  pending,
  busy,
  error,
  notice,
  onPick,
  onRemove,
  onAutofill,
}: {
  shotlistId?: string;
  script: ScriptInfo | null;
  pending: File | null;
  busy: ScriptBusy | null;
  error: string | null;
  /** A non-error heads-up, e.g. shots whose script links need re-linking. */
  notice?: string | null;
  onPick: () => void;
  onRemove: () => void;
  onAutofill: () => void;
}) {
  const current = pending ? { fileName: pending.name, size: pending.size } : script;
  const action = "font-medium text-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-muted">Script:</span>
      {current ? (
        <>
          <span className="flex min-w-0 items-center gap-1.5">
            <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0 fill-none stroke-current" strokeWidth={1.25}>
              <path d="M4 1.5h5l3.5 3.5v9.5h-8.5z M9 1.5v3.5h3.5" strokeLinejoin="round" />
            </svg>
            {shotlistId && !pending ? (
              // `download` keeps this from counting as leaving the page (no unsaved-changes warning).
              <a href={`/shotlists/${shotlistId}/script`} download={current.fileName} className="truncate font-medium underline-offset-2 hover:underline" title="Download the script">
                {current.fileName}
              </a>
            ) : (
              <span className="truncate font-medium">{current.fileName}</span>
            )}
          </span>
          <span className="text-muted">
            {formatFileSize(current.size)}
            {pending && " · attached when you save"}
          </span>
          <button type="button" className="btn-secondary px-3 py-1 text-sm" disabled={!!busy} onClick={onAutofill}>
            Autofill from script
          </button>
          <button type="button" className={action} disabled={!!busy} onClick={onPick}>Replace</button>
          <button type="button" className={action} disabled={!!busy} onClick={onRemove}>Remove</button>
        </>
      ) : (
        <>
          <span className="text-muted">None attached</span>
          <button type="button" className="btn-secondary px-3 py-1 text-sm" disabled={!!busy} onClick={onPick}>Add script</button>
        </>
      )}
      {busy && <span className="text-muted">{BUSY_LABEL[busy]}</span>}
      {error && <p role="alert" className="w-full text-red-300">{error}</p>}
      {notice && <p role="status" className="w-full text-amber-200">⚠ {notice}</p>}
    </div>
  );
}
