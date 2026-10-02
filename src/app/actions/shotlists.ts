"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOwnedShotlist, readScriptFile, shotlistSchema, toRowRecords } from "@/lib/shotlists";
import type { ScriptInfo } from "@/lib/scripts";
import { parseScript, type ScriptScene } from "@/lib/scriptParse";

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
  try {
    rows = JSON.parse(String(formData.get("rows")));
  } catch {
    return { error: "Couldn't read the shotlist" };
  }
  const parsed = shotlistSchema.safeParse({ title: formData.get("title"), rows });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { title } = parsed.data;
  const records = toRowRecords(parsed.data.rows);

  const id = formData.get("id");
  if (typeof id === "string" && id) {
    if (!(await getOwnedShotlist(id, user.id))) return { error: "Shotlist not found" };
    await prisma.$transaction([
      prisma.shotlist.update({ where: { id }, data: { title } }),
      prisma.shotlistRow.deleteMany({ where: { shotlistId: id } }),
      prisma.shotlistRow.createMany({ data: records.map((r) => ({ ...r, shotlistId: id })) }),
    ]);
    revalidatePath("/", "layout");
    return { savedAt: Date.now(), id };
  }

  const script = await readScriptFile(formData.get("script"));
  if (script && "error" in script) return { error: script.error };
  const created = await prisma.shotlist.create({
    data: { title, userId: user.id, rows: { create: records }, script: script ? { create: script } : undefined },
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

export type ScriptResult = { error?: string; script?: ScriptInfo };

/** Attaches a script file to one of the user's saved shotlists, replacing any it already has. */
export async function attachScript(shotlistId: string, formData: FormData): Promise<ScriptResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You've been logged out. Log in again to attach a script." };
  const owned = await prisma.shotlist.findFirst({ where: { id: shotlistId, userId: user.id }, select: { id: true } });
  if (!owned) return { error: "Shotlist not found" };
  const script = await readScriptFile(formData.get("script"));
  if (!script) return { error: "Choose a script file to attach." };
  if ("error" in script) return { error: script.error };
  await prisma.script.upsert({
    where: { shotlistId },
    create: { ...script, shotlistId },
    update: { ...script, uploadedAt: new Date() },
  });
  revalidatePath(`/shotlists/${shotlistId}`);
  return { script: { fileName: script.fileName, size: script.size } };
}

/** Removes the script from one of the user's shotlists. */
export async function removeScript(shotlistId: string): Promise<ScriptResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You've been logged out. Log in again to remove the script." };
  await prisma.script.deleteMany({ where: { shotlistId, shotlist: { userId: user.id } } });
  revalidatePath(`/shotlists/${shotlistId}`);
  return {};
}

export type ParseScriptResult = { error?: string; scenes?: ScriptScene[] };

/** Reads scenes from a script file without storing it (a new shotlist's script, or one just picked). */
export async function parseScriptFile(formData: FormData): Promise<ParseScriptResult> {
  if (!(await getCurrentUser())) return { error: "You've been logged out. Log in again to autofill." };
  const file = await readScriptFile(formData.get("script"));
  if (!file) return { error: "Choose a script file." };
  if ("error" in file) return { error: file.error };
  return parseScript(file.fileName, file.data);
}

/** Reads scenes from the script stored with one of the user's shotlists. */
export async function parseStoredScript(shotlistId: string): Promise<ParseScriptResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You've been logged out. Log in again to autofill." };
  const script = await prisma.script.findFirst({ where: { shotlistId, shotlist: { userId: user.id } } });
  if (!script) return { error: "This shotlist has no script attached." };
  return parseScript(script.fileName, script.data);
}
