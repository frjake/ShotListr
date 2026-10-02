// PURE: the shotlist's character list and how scene Characters cells follow it (tested in
// tests/characters.test.ts). Cells are free text ("Ana, Ben"); names match case-insensitively and
// take the list's spelling. Every name in a cell is on the list (missing ones are appended), and a
// cell lists its names in list order.

import { ROW_KIND } from "./constants";
import type { RowData } from "./rows";
import { normalizeSceneNumber } from "./sceneNumbers";
import type { ScriptScene } from "./scriptParse/scenes";

const key = (name: string) => name.trim().toLowerCase();

/** "Ana, ben ,, Ana" → ["Ana", "ben"]: split on commas, trimmed, blanks and repeats dropped. */
export function parseCharacters(cell: string): string[] {
  const out: string[] = [];
  for (const raw of cell.split(",")) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (name && !out.some((n) => key(n) === key(name))) out.push(name);
  }
  return out;
}

/** `list` plus any of `names` it doesn't have yet, at the end, in the order given. */
export function addCharacters(list: readonly string[], names: readonly string[]): string[] {
  const out = [...list];
  for (const name of names) if (!out.some((n) => key(n) === key(name))) out.push(name);
  return out;
}

/** Every character in the scenes' cells, in order of first appearance down the sheet. */
export function charactersInRows(rows: readonly RowData[]): string[] {
  return addCharacters([], rows.filter((r) => r.kind === ROW_KIND.SCENE).flatMap((r) => parseCharacters(r.characters)));
}

/** Every character in a script's scenes, in order of first mention. */
export function scriptCharacters(scenes: readonly ScriptScene[]): string[] {
  return addCharacters([], scenes.flatMap((s) => s.characters));
}

/** A cell's names in list order, with the list's spelling (names not on the list go last). */
export function sortCell(cell: string, list: readonly string[]): string {
  const index = (name: string) => {
    const i = list.findIndex((n) => key(n) === key(name));
    return i === -1 ? Infinity : i;
  };
  return parseCharacters(cell)
    .map((name, order) => ({ name: list[index(name)] ?? name, rank: index(name), order }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((c) => c.name)
    .join(", ");
}

/** Rows with every scene's Characters cell in list order (unchanged rows are kept as they are). */
export function sortAllCells<T extends RowData>(rows: readonly T[], list: readonly string[]): T[] {
  return rows.map((r) => {
    if (r.kind !== ROW_KIND.SCENE) return r;
    const sorted = sortCell(r.characters, list);
    return sorted === r.characters ? r : { ...r, characters: sorted };
  });
}

/** How many scenes list this character. */
export function scenesWith(rows: readonly RowData[], name: string): number {
  return rows.filter((r) => r.kind === ROW_KIND.SCENE && parseCharacters(r.characters).some((n) => key(n) === key(name))).length;
}

/** Moves the character at `from` to position `to` (both in the list before the move). */
export function moveCharacter(list: readonly string[], from: number, to: number): string[] {
  const out = [...list];
  const [name] = out.splice(from, 1);
  out.splice(to, 0, name);
  return out;
}

export type RenameResult<T> =
  | { status: "ok"; list: string[]; rows: T[] }
  | { status: "unchanged" | "empty" | "exists"; name: string };

/** Renames a character in the list and in every scene that lists them. Refuses blanks and clashes. */
export function renameCharacter<T extends RowData>(rows: readonly T[], list: readonly string[], index: number, newName: string): RenameResult<T> {
  const name = newName.replace(/\s+/g, " ").replace(/,/g, "").trim();
  if (!name) return { status: "empty", name };
  const old = list[index];
  if (name === old) return { status: "unchanged", name };
  if (list.some((n, i) => i !== index && key(n) === key(name))) return { status: "exists", name };
  const nextList = list.map((n, i) => (i === index ? name : n));
  const nextRows = rows.map((r) => {
    if (r.kind !== ROW_KIND.SCENE) return r;
    const names = parseCharacters(r.characters);
    if (!names.some((n) => key(n) === key(old))) return r;
    return { ...r, characters: names.map((n) => (key(n) === key(old) ? name : n)).join(", ") };
  });
  return { status: "ok", list: nextList, rows: nextRows };
}

/** Removes a character from the list and from every scene that lists them. */
export function removeCharacter<T extends RowData>(rows: readonly T[], list: readonly string[], index: number): { list: string[]; rows: T[] } {
  const gone = key(list[index]);
  return {
    list: list.filter((_, i) => i !== index),
    rows: rows.map((r) => {
      if (r.kind !== ROW_KIND.SCENE) return r;
      const names = parseCharacters(r.characters);
      return names.some((n) => key(n) === gone) ? { ...r, characters: names.filter((n) => key(n) !== gone).join(", ") } : r;
    }),
  };
}

export type AddToSceneResult<T> =
  | { status: "added"; number: string; rows: T[] }
  | { status: "already" | "missing"; number: string };

/**
 * Adds a character to the scene with the typed number ("012" finds scene 12), keeping the cell in
 * list order. "already" if that scene lists them, "missing" if there's no such scene.
 */
export function addToScene<T extends RowData>(rows: readonly T[], list: readonly string[], name: string, sceneText: string): AddToSceneResult<T> {
  const number = normalizeSceneNumber(sceneText) ?? sceneText.trim();
  const index = rows.findIndex((r) => r.kind === ROW_KIND.SCENE && r.sceneNumber === number);
  if (index === -1) return { status: "missing", number };
  const cell = rows[index].characters;
  if (parseCharacters(cell).some((n) => key(n) === key(name))) return { status: "already", number };
  const next = [...rows];
  next[index] = { ...rows[index], characters: sortCell(cell ? `${cell}, ${name}` : name, list) };
  return { status: "added", number, rows: next };
}
