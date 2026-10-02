import "server-only";

// A script's text (split by heading) and version, read once and stored on the Script row so a
// shot's scene can be shown without re-reading the file. Version = a hash of the file's bytes, so
// links made against a different draft can be recognised and found again.

import { createHash } from "node:crypto";
import { prisma } from "./db";
import { parseScript, type ScriptDoc, type ScriptScene } from "./scriptParse";
import { scenesFromDoc } from "./scriptParse/scenes";

export type ScriptText = { fileName: string; doc: ScriptDoc; scenes: ScriptScene[]; version: string; error?: string };

export function scriptVersion(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

/** Reads a script file's text, scenes and version (an unreadable file gives an empty doc and the reason). */
export async function readScriptText(fileName: string, data: Uint8Array): Promise<ScriptText> {
  const version = scriptVersion(data);
  const parsed = await parseScript(fileName, data);
  if ("error" in parsed) return { fileName, doc: { segments: [], error: parsed.error }, scenes: [], version, error: parsed.error };
  return { fileName, doc: parsed.doc, scenes: parsed.scenes, version };
}

/**
 * The text of the script attached to one of the user's shotlists (null if none). Scripts stored
 * before text was kept are read now and their text saved for next time.
 */
export async function storedScriptText(shotlistId: string, userId: string): Promise<ScriptText | null> {
  const script = await prisma.script.findFirst({
    where: { shotlistId, shotlist: { userId } },
    select: { id: true, fileName: true, doc: true, version: true },
  });
  if (!script) return null;
  if (script.doc && script.version) {
    const doc = JSON.parse(script.doc) as ScriptDoc;
    return { fileName: script.fileName, doc, scenes: doc.error ? [] : scenesFromDoc(doc), version: script.version, error: doc.error };
  }
  const { data } = await prisma.script.findUniqueOrThrow({ where: { id: script.id }, select: { data: true } });
  const text = await readScriptText(script.fileName, data);
  await prisma.script.update({ where: { id: script.id }, data: { doc: JSON.stringify(text.doc), version: text.version } });
  return text;
}
