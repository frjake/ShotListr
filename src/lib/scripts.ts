// PURE rules for script files attached to shotlists (tested in tests/scripts.test.ts). Shared by the
// editor (to check a file before uploading) and the server (which checks again before storing).

export const SCRIPT_EXTENSIONS = [".doc", ".docx", ".pdf", ".fdx"] as const;
/** For `<input type="file" accept>`. */
export const SCRIPT_ACCEPT = SCRIPT_EXTENSIONS.join(",");
export const MAX_SCRIPT_BYTES = 20 * 1024 * 1024; // keep next.config's serverActions.bodySizeLimit above this

/** Attached script details shown in the editor. */
export type ScriptInfo = { fileName: string; size: number };

function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

/** Why a file can't be attached as a script, or null if it can. */
export function scriptProblem(fileName: string, size: number): string | null {
  if (!(SCRIPT_EXTENSIONS as readonly string[]).includes(extensionOf(fileName))) {
    return "Scripts must be .doc, .docx, .pdf or .fdx files.";
  }
  if (size === 0) return "That file is empty.";
  if (size > MAX_SCRIPT_BYTES) return `Scripts can be at most ${formatFileSize(MAX_SCRIPT_BYTES)}.`;
  return null;
}

/** The Content-Type to serve a script with. Final Draft (.fdx) is served as a plain download. */
export function scriptContentType(fileName: string): string {
  switch (extensionOf(fileName)) {
    case ".pdf":
      return "application/pdf";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "application/octet-stream";
  }
}

/** 532 → "532 B", 48_300 → "47 KB", 2_400_000 → "2.3 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** A title from a script's file name: "Super Quincy.fdx" → "Super Quincy" (extension dropped, at most 200 characters). */
export function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return (dot > 0 ? fileName.slice(0, dot) : fileName).replace(/\s+/g, " ").trim().slice(0, 200);
}
