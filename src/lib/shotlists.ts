import "server-only";

import { z } from "zod";
import { ROW_KIND } from "./constants";
import { prisma } from "./db";
import { cleanRow, ROW_FIELDS, type RowData, type RowField } from "./rows";
import { compareSceneNumbers, parseSceneNumber, type SceneNumber } from "./sceneNumbers";
import { scriptProblem } from "./scripts";

const cell = z.string().trim().max(1000, "A cell can hold at most 1000 characters");

const rowSchema = z.object({
  kind: z.enum([ROW_KIND.SCENE, ROW_KIND.SHOT]),
  ...(Object.fromEntries(ROW_FIELDS.map((f) => [f, cell])) as Record<RowField, typeof cell>),
});

export const shotlistSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Add a title before saving")
    .max(200, "Title must be at most 200 characters"),
  characters: z
    .array(z.string().trim().min(1).max(200, "A character name can be at most 200 characters"))
    .max(1000, "A shotlist can have at most 1000 characters")
    .refine((names) => new Set(names.map((n) => n.toLowerCase())).size === names.length, "Each character can only be listed once"),
  rows: z
    .array(rowSchema)
    .max(2000, "A shotlist can have at most 2000 rows")
    .superRefine((rows, ctx) => {
      // Scene numbers must be valid, unique and increasing down the sheet.
      let prev: SceneNumber | null = null;
      for (const row of rows) {
        if (row.kind !== ROW_KIND.SCENE) continue;
        const n = parseSceneNumber(row.sceneNumber);
        if (!n) {
          ctx.addIssue({ code: "custom", message: `"${row.sceneNumber}" isn't a valid scene number` });
          return;
        }
        if (prev && compareSceneNumbers(prev, n) >= 0) {
          ctx.addIssue({ code: "custom", message: "Scenes must be in number order, with no repeats" });
          return;
        }
        prev = n;
      }
    }),
});

/** The shotlist with its rows in order, or null if it doesn't exist or isn't `userId`'s. */
export function getOwnedShotlist(id: string, userId: string) {
  return prisma.shotlist.findFirst({
    where: { id, userId },
    include: {
      rows: { orderBy: { position: "asc" } },
      script: { select: { fileName: true, size: true } }, // never the bytes
      characters: { orderBy: { position: "asc" }, select: { name: true } },
    },
  });
}

/** Rows ready for createMany: only each kind's own fields, plus their position. */
export function toRowRecords(rows: RowData[]) {
  return rows.map((row, position) => ({ ...cleanRow(row), position }));
}

/**
 * Reads an uploaded script from form data: null if none was sent, `{ error }` if it isn't allowed,
 * otherwise what to store. The file is kept exactly as uploaded.
 */
export async function readScriptFile(entry: FormDataEntryValue | null) {
  if (!(entry instanceof File)) return null;
  // Browsers send just the name; strip any path some send anyway.
  const fileName = entry.name.split(/[\\/]/).pop()!.trim().slice(0, 255);
  const problem = scriptProblem(fileName, entry.size);
  if (problem) return { error: problem };
  return { fileName, size: entry.size, data: new Uint8Array(await entry.arrayBuffer()) };
}
