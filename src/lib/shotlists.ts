import "server-only";

import { z } from "zod";
import { ROW_KIND } from "./constants";
import { prisma } from "./db";
import { cleanRow, ROW_FIELDS, type RowData, type RowField } from "./rows";
import { compareSceneNumbers, parseSceneNumber, type SceneNumber } from "./sceneNumbers";

export const DEFAULT_TITLE = "Untitled shotlist";

const cell = z.string().trim().max(1000, "A cell can hold at most 1000 characters");

const rowSchema = z.object({
  kind: z.enum([ROW_KIND.SCENE, ROW_KIND.SHOT]),
  ...(Object.fromEntries(ROW_FIELDS.map((f) => [f, cell])) as Record<RowField, typeof cell>),
});

export const shotlistSchema = z.object({
  title: z
    .string()
    .trim()
    .max(200, "Title must be at most 200 characters")
    .transform((s) => s || DEFAULT_TITLE),
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
    include: { rows: { orderBy: { position: "asc" } } },
  });
}

/** Rows ready for createMany: only each kind's own fields, plus their position. */
export function toRowRecords(rows: RowData[]) {
  return rows.map((row, position) => ({ ...cleanRow(row), position }));
}
