"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOwnedShotlist, shotlistSchema, toRowRecords } from "@/lib/shotlists";

export type SaveShotlistState = { error?: string; savedAt?: number; id?: string } | undefined;

/**
 * Creates a shotlist (no `id`) or replaces an existing one's title and rows, and returns its id.
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

  const created = await prisma.shotlist.create({
    data: { title, userId: user.id, rows: { create: records } },
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
