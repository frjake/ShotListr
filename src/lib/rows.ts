// PURE helpers for shotlist rows (tested in tests/rows.test.ts). Safe to import from client components.

import { ROW_KIND, type RowKind } from "./constants";
import {
  compareSceneNumbers,
  formatSceneNumber,
  isOccupied,
  nextSceneNumber,
  parseSceneNumber,
  siblingRange,
  runRange,
  shiftRange,
  subsceneBetween,
  type SceneNumber,
} from "./sceneNumbers";

export const SCENE_FIELDS = ["sceneNumber", "intExt", "location", "time", "characters"] as const;
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

/** Anything with a kind and a scene number ("" for shots). */
type Numbered = { kind: RowKind; sceneNumber: string };

/**
 * Display numbers for rows in order: a scene shows its own number; a shot takes the number of the
 * scene above it plus a letter that restarts at A in each scene (12A, 12B, 12.1A). Shots above the
 * first scene get letters only.
 */
export function rowLabels(rows: readonly Numbered[]): string[] {
  let scene = "";
  let shot = 0;
  return rows.map((row) => {
    if (row.kind === ROW_KIND.SCENE) {
      scene = row.sceneNumber;
      shot = 0;
      return scene;
    }
    shot += 1;
    return `${scene}${shotLetters(shot)}`;
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

// ---------- Scene numbers ----------
// Scenes are always kept in number order (see sceneNumbers.ts for the format and ordering).

function sceneNumbers(rows: readonly Numbered[]): SceneNumber[] {
  return rows.filter((r) => r.kind === ROW_KIND.SCENE).map((r) => parseSceneNumber(r.sceneNumber)!);
}

/** Scenes being renumbered by one: siblings `from` through `to`, e.g. 13–16 becoming 14–17. */
export type RunShift = { from: string; to: string; newFrom: string; newTo: string };

function describeRun(range: { first: SceneNumber; last: SceneNumber } | null, delta: 1 | -1): RunShift | null {
  if (!range) return null;
  const bump = (n: SceneNumber) => [...n.slice(0, -1), n[n.length - 1] + delta];
  return {
    from: formatSceneNumber(range.first),
    to: formatSceneNumber(range.last),
    newFrom: formatSceneNumber(bump(range.first)),
    newTo: formatSceneNumber(bump(range.last)),
  };
}

/**
 * How a scene inserted at `boundary` gets its number. With no scene below, it simply takes the next
 * whole number after the scene above (12.1 → 13). Otherwise the user always chooses:
 *  - `subscene`: the scene above's next subscene if it fits (12.1 → 12.2), else `subsceneBetween`
 *    (12 → 12.1, 12.1 → 12.1.1, 12 → 12.0.1).
 *  - `number` with `untilGap`: the next whole number if it fits before the scene below (12 → 13
 *    when the next is 15), otherwise the scene below's number; the consecutive run starting at that
 *    number shifts up to the first gap (null when the number is free, so nothing moves).
 *  - `number` with `all`: the same number, and every later sibling shifts up.
 */
export type ScenePlacement =
  | { type: "free"; number: string }
  | { type: "choose"; after: string | null; before: string; subscene: string; number: string; untilGap: RunShift | null; all: RunShift };

export function planSceneAt(rows: readonly Numbered[], boundary: number): ScenePlacement {
  const prevRow = rows.slice(0, boundary).findLast((r) => r.kind === ROW_KIND.SCENE);
  const nextRow = rows.slice(boundary).find((r) => r.kind === ROW_KIND.SCENE);
  const prev = prevRow ? parseSceneNumber(prevRow.sceneNumber) : null;
  const next = nextRow ? parseSceneNumber(nextRow.sceneNumber) : null;
  const whole = [prev ? prev[0] + 1 : 1];
  if (!next) return { type: "free", number: formatSceneNumber(whole) };

  const numbers = sceneNumbers(rows);
  const number = compareSceneNumbers(whole, next) < 0 ? whole : next;
  const natural = nextSceneNumber(prev);
  const subscene = prev && prev.length > 1 && compareSceneNumbers(natural, next) < 0 ? natural : subsceneBetween(prev, next);
  return {
    type: "choose",
    after: prevRow?.sceneNumber ?? null,
    before: nextRow!.sceneNumber,
    subscene: formatSceneNumber(subscene),
    number: formatSceneNumber(number),
    untilGap: describeRun(runRange(numbers, number), 1),
    // The scene below is always at or after `number` at its level, so there's something to shift.
    all: describeRun(siblingRange(numbers, number), 1)!,
  };
}

/** Rows with the scenes in `shift` (from–to, siblings, with their subscenes) renumbered by `delta`. */
export function shiftScenes<T extends Numbered>(rows: readonly T[], shift: RunShift, delta: 1 | -1): T[] {
  const shifted = shiftRange(sceneNumbers(rows), parseSceneNumber(shift.from)!, parseSceneNumber(shift.to)!, delta);
  let i = 0;
  return rows.map((r) => (r.kind === ROW_KIND.SCENE ? { ...r, sceneNumber: formatSceneNumber(shifted[i++]) } : r));
}

export type RenumberResult<T> =
  | { status: "ok"; rows: T[]; number: string }
  | { status: "unchanged" | "invalid" | "exists"; number: string };

/**
 * Gives the scene at `index` a new number and moves it (with its shots) to where that number
 * belongs. Refuses invalid numbers and numbers another scene already has.
 */
export function renumberScene<T extends Numbered>(rows: readonly T[], index: number, text: string): RenumberResult<T> {
  const parsed = parseSceneNumber(text);
  if (!parsed) return { status: "invalid", number: text.trim() };
  const number = formatSceneNumber(parsed);
  if (number === rows[index].sceneNumber) return { status: "unchanged", number };
  if (rows.some((r) => r.kind === ROW_KIND.SCENE && r.sceneNumber === number)) return { status: "exists", number };

  const kinds = rows.map((r) => r.kind);
  const end = blockEnd(kinds, index);
  const block = [{ ...rows[index], sceneNumber: number }, ...rows.slice(index + 1, end)];
  const rest = deleteRows(rows, index, end - index);
  const at = rest.findIndex((r) => r.kind === ROW_KIND.SCENE && compareSceneNumbers(parseSceneNumber(r.sceneNumber)!, parsed) > 0);
  const boundary = at === -1 ? rest.length : at;
  return { status: "ok", number, rows: [...rest.slice(0, boundary), ...block, ...rest.slice(boundary)] };
}

/** How the scenes after a deleted one can be renumbered down; see `renumberAfterDelete`. */
export type DeleteRenumbering = { untilGap: RunShift | null; all: RunShift };

/**
 * If the scene at `index` is deleted, the scenes after it can shift down by 1: `all` later siblings
 * (deleting 3 from 1, 2, 3, 4, 6, 7 → 4, 6, 7 become 3, 5, 6), or only the consecutive run right
 * after it, `untilGap` (→ just 4 becomes 3). `untilGap` is null when it would do nothing (the next
 * number is free) or the same as `all` (no gap). Null overall when no sibling comes after it, or
 * the number stays in use by one of its subscenes.
 */
export function renumberAfterDelete(rows: readonly Numbered[], index: number): DeleteRenumbering | null {
  const deleted = parseSceneNumber(rows[index].sceneNumber)!;
  const others = sceneNumbers(deleteRows(rows, index, 1));
  if (isOccupied(others, deleted)) return null;
  const after = nextSceneNumber(deleted);
  const all = describeRun(siblingRange(others, after), -1);
  if (!all) return null;
  const untilGap = describeRun(runRange(others, after), -1);
  return { untilGap: untilGap && untilGap.to !== all.to ? untilGap : null, all };
}
