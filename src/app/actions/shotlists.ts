"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOwnedShotlist, readScriptFile, shotlistSchema, toRowRecords } from "@/lib/shotlists";
import type { ScriptInfo } from "@/lib/scripts";
import type { ScriptDoc, ScriptScene } from "@/lib/scriptParse";
import { readScriptText, storedScriptText } from "@/lib/scriptStore";

export type SaveShotlistState = { error?: string; savedAt?: number; id?: string } | undefined;

/**
 * Creates a shotlist (no `id`) or replaces an existing one's title and rows, and returns its id.
 * A new shotlist can include its script (`script` file field); existing ones use attachScript.
 * It doesn't redirect: the editor decides where to go next (the new shotlist's page, or wherever
 * the user was leaving to).
 */
export async function saveShotlist(_prev: SaveShotlistState, formData: FormData): Promise<SaveShotlistState> {
  // Return an error rather than redirecting, so unsaved edits aren't lost.
  const user = await getCurrentUser();
  if (!user) return { error: "You've been logged out. Log in in another tab, then save again." };

  let rows: unknown;
  let characters: unknown;
  try {
    rows = JSON.parse(String(formData.get("rows")));
    characters = JSON.parse(String(formData.get("characters") ?? "[]"));
  } catch {
    return { error: "Couldn't read the shotlist" };
  }
  const parsed = shotlistSchema.safeParse({ title: formData.get("title"), rows, characters });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { title } = parsed.data;
  const records = toRowRecords(parsed.data.rows);
  const characterRecords = parsed.data.characters.map((name, position) => ({ name, position }));

  const id = formData.get("id");
  if (typeof id === "string" && id) {
    if (!(await getOwnedShotlist(id, user.id))) return { error: "Shotlist not found" };
    await prisma.$transaction([
      prisma.shotlist.update({ where: { id }, data: { title } }),
      prisma.shotlistRow.deleteMany({ where: { shotlistId: id } }),
      prisma.shotlistRow.createMany({ data: records.map((r) => ({ ...r, shotlistId: id })) }),
      prisma.shotlistCharacter.deleteMany({ where: { shotlistId: id } }),
      prisma.shotlistCharacter.createMany({ data: characterRecords.map((c) => ({ ...c, shotlistId: id })) }),
    ]);
    revalidatePath("/", "layout");
    return { savedAt: Date.now(), id };
  }

  const file = await readScriptFile(formData.get("script"));
  if (file && "error" in file) return { error: file.error };
  const text = file ? await readScriptText(file.fileName, file.data) : null;
  const script = file && text ? { ...file, doc: JSON.stringify(text.doc), version: text.version } : null;
  const created = await prisma.shotlist.create({
    data: {
      title,
      userId: user.id,
      rows: { create: records },
      characters: { create: characterRecords },
      script: script ? { create: script } : undefined,
    },
  });
  revalidatePath("/", "layout");
  return { savedAt: Date.now(), id: created.id };
}

/** Permanently deletes one of the current user's shotlists (its rows go with it). */
export async function deleteShotlist(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "You've been logged out. Log in again to delete shotlists." };
  if (typeof id !== "string" || !id) return { error: "Shotlist not found" };
  // Scoped to the user, so nobody can delete someone else's shotlist by id.
  const { count } = await prisma.shotlist.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) return { error: "Shotlist not found" };
  revalidatePath("/", "layout");
  return {};
}

export type ScriptResult = {
  error?: string;
  script?: ScriptInfo;
  /** The attached script's text and scenes (or why they couldn't be read: `parseError`). */
  doc?: ScriptDoc;
  scenes?: ScriptScene[];
  version?: string;
  parseError?: string;
};

/** Attaches a script file to one of the user's saved shotlists, replacing any it already has. */
export async function attachScript(shotlistId: string, formData: FormData): Promise<ScriptResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You've been logged out. Log in again to attach a script." };
  const owned = await prisma.shotlist.findFirst({ where: { id: shotlistId, userId: user.id }, select: { id: true } });
  if (!owned) return { error: "Shotlist not found" };
  const file = await readScriptFile(formData.get("script"));
  if (!file) return { error: "Choose a script file to attach." };
  if ("error" in file) return { error: file.error };
  const text = await readScriptText(file.fileName, file.data);
  const script = { ...file, doc: JSON.stringify(text.doc), version: text.version };
  await prisma.script.upsert({
    where: { shotlistId },
    create: { ...script, shotlistId },
    update: { ...script, uploadedAt: new Date() },
  });
  revalidatePath(`/shotlists/${shotlistId}`);
  return {
    script: { fileName: file.fileName, size: file.size },
    doc: text.doc,
    scenes: text.scenes,
    version: text.version,
    parseError: text.error,
  };
}

/** Removes the script from one of the user's shotlists. */
export async function removeScript(shotlistId: string): Promise<ScriptResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You've been logged out. Log in again to remove the script." };
  await prisma.script.deleteMany({ where: { shotlistId, shotlist: { userId: user.id } } });
  revalidatePath(`/shotlists/${shotlistId}`);
  return {};
}

/**
 * A script's text and scenes. `error` alone means it couldn't be looked at (signed out, no script);
 * `error` with a `doc` means the file was read but has no usable scenes (e.g. a scanned PDF).
 */
export type ParseScriptResult = { error?: string; scenes?: ScriptScene[]; doc?: ScriptDoc; version?: string };

/** Reads a script file without storing it (a new shotlist's script, before its first save). */
export async function parseScriptFile(formData: FormData): Promise<ParseScriptResult> {
  if (!(await getCurrentUser())) return { error: "You've been logged out. Log in again to read the script." };
  const file = await readScriptFile(formData.get("script"));
  if (!file) return { error: "Choose a script file." };
  if ("error" in file) return { error: file.error };
  const { doc, scenes, version, error } = await readScriptText(file.fileName, file.data);
  return { doc, scenes, version, error };
}

/** The text and scenes of the script stored with one of the user's shotlists. */
export async function parseStoredScript(shotlistId: string): Promise<ParseScriptResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You've been logged out. Log in again to read the script." };
  const text = await storedScriptText(shotlistId, user.id);
  if (!text) return { error: "This shotlist has no script attached." };
  return { doc: text.doc, scenes: text.scenes, version: text.version, error: text.error };
}
