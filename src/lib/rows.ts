// PURE helpers for shotlist rows (tested in tests/rows.test.ts). Safe to import from client components.

import { ROW_KIND, type RowKind } from "./constants";

export const SCENE_FIELDS = ["intExt", "location", "time", "characters"] as const;
export const SHOT_FIELDS = ["subject", "framing", "angle", "description"] as const;
export type RowField = (typeof SCENE_FIELDS)[number] | (typeof SHOT_FIELDS)[number];
export const ROW_FIELDS: readonly RowField[] = [...SCENE_FIELDS, ...SHOT_FIELDS];

/** One spreadsheet row as edited and saved. Fields that don't belong to `kind` are "". */
export type RowData = { kind: RowKind } & Record<RowField, string>;

export function fieldsFor(kind: RowKind): readonly RowField[] {
  return kind === ROW_KIND.SCENE ? SCENE_FIELDS : SHOT_FIELDS;
}

export function emptyRow(kind: RowKind): RowData {
  return { kind, ...(Object.fromEntries(ROW_FIELDS.map((f) => [f, ""])) as Record<RowField, string>) };
}

/** Copy of `row` keeping only the fields that belong to its kind (others blanked). */
export function cleanRow(row: RowData): RowData {
  const keep = fieldsFor(row.kind);
  const clean = emptyRow(row.kind);
  for (const f of keep) clean[f] = row[f];
  return clean;
}

/** 1 → "A", 26 → "Z", 27 → "AA", 28 → "AB" (spreadsheet-column style). */
export function shotLetters(n: number): string {
  let out = "";
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) {
    out = String.fromCharCode(65 + ((i - 1) % 26)) + out;
  }
  return out;
}

/**
 * Display numbers for rows in order: scenes count 1, 2, 3…; shots take the number of the scene
 * above them plus a letter that restarts at A in each scene (1A, 1B, 2A). Shots above the first
 * scene get letters only.
 */
export function rowLabels(kinds: readonly RowKind[]): string[] {
  let scene = 0;
  let shot = 0;
  return kinds.map((kind) => {
    if (kind === ROW_KIND.SCENE) {
      scene += 1;
      shot = 0;
      return String(scene);
    }
    shot += 1;
    return `${scene || ""}${shotLetters(shot)}`;
  });
}
