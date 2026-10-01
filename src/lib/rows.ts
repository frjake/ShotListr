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

// ---------- Reordering & deleting ----------
// A "block" is what moves together: a scene plus the shots under it, or a single shot.
// Boundaries are numbered 0..n: boundary b sits just above row b (n = below the last row).

/** End (exclusive) of the block starting at `index`. */
export function blockEnd(kinds: readonly RowKind[], index: number): number {
  if (kinds[index] !== ROW_KIND.SCENE) return index + 1;
  let end = index + 1;
  while (end < kinds.length && kinds[end] !== ROW_KIND.SCENE) end += 1;
  return end;
}

/**
 * Boundaries where the block starting at `from` may be dropped. A shot can go anywhere; a scene
 * block only between scenes (above a scene or at the very end), so no other scene is split.
 * Includes the block's own top/bottom boundaries (dropping there is a no-op).
 */
export function dropTargets(kinds: readonly RowKind[], from: number): number[] {
  const all = Array.from({ length: kinds.length + 1 }, (_, b) => b);
  if (kinds[from] !== ROW_KIND.SCENE) return all;
  const end = blockEnd(kinds, from);
  return all.filter((b) => (b === kinds.length || kinds[b] === ROW_KIND.SCENE) && (b <= from || b >= end));
}

/** Moves rows [from, from + count) so they sit at boundary `to` (numbered before the move). */
export function moveRows<T>(rows: readonly T[], from: number, count: number, to: number): T[] {
  if (to >= from && to <= from + count) return [...rows];
  const moving = rows.slice(from, from + count);
  const rest = [...rows.slice(0, from), ...rows.slice(from + count)];
  const at = to > from ? to - count : to;
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

/** Boundary one step up (-1) or down (1) for the block at `from`, or null at the edge. */
export function stepTarget(kinds: readonly RowKind[], from: number, dir: -1 | 1): number | null {
  const end = blockEnd(kinds, from);
  const targets = dropTargets(kinds, from);
  const next = dir < 0 ? targets.filter((b) => b < from).at(-1) : targets.find((b) => b > end);
  return next ?? null;
}

/** Removes rows [index, index + count). */
export function deleteRows<T>(rows: readonly T[], index: number, count: number): T[] {
  return [...rows.slice(0, index), ...rows.slice(index + count)];
}
