// PURE: applies scenes found in a script to the shotlist's rows (tested in tests/autofill.test.ts).
// Three ways, chosen by the user when the sheet already has data: fill in (merge), replace
// everything, or add the script's scenes after the last scene.

import { ROW_KIND } from "./constants";
import { emptyRow, ROW_FIELDS, type RowData } from "./rows";
import { compareSceneNumbers, formatSceneNumber, parseSceneNumber } from "./sceneNumbers";
import { readSceneLink, writeSceneLink } from "./scriptLinks";
import type { ScriptScene } from "./scriptParse/scenes";

const SCENE_CELLS = ["intExt", "location", "time", "characters"] as const;

/** A scene row from a script scene, linked to that scene's text (in script version `version`). */
function sceneRow(scene: ScriptScene, version: string, sceneNumber = scene.sceneNumber): RowData {
  return {
    ...emptyRow(ROW_KIND.SCENE),
    sceneNumber,
    intExt: scene.intExt,
    location: scene.location,
    time: scene.time,
    characters: scene.characters.join(", "),
    scriptLink: writeSceneLink({ v: version, scene: scene.segment, heading: scene.heading }),
  };
}

/** True when no row has anything typed in it (scene numbers don't count), e.g. a new shotlist. */
export function sheetIsEmpty(rows: readonly RowData[]): boolean {
  return rows.every((r) => ROW_FIELDS.every((f) => f === "sceneNumber" || f === "scriptLink" || !r[f].trim()));
}

/** "Found 42 scenes and 18 characters". */
export function scriptSummary(scenes: readonly ScriptScene[]) {
  const characters = new Set(scenes.flatMap((s) => s.characters.map((c) => c.toLowerCase())));
  return { scenes: scenes.length, characters: characters.size };
}

/** Replace everything: just the script's scenes (no shots). */
export function scenesToRows(scenes: readonly ScriptScene[], version: string): RowData[] {
  return scenes.map((s) => sceneRow(s, version));
}

/**
 * Fill in from the script: scenes are matched by number. A matched scene's empty cells are filled
 * (typed cells are never changed) and it's linked to the script if it wasn't; script scenes the sheet doesn't have are added where their
 * number belongs (after the shots of the scene before); everything else stays as it is.
 */
export function mergeScenes<T extends RowData>(rows: readonly T[], scenes: readonly ScriptScene[], create: (row: RowData) => T, version: string): T[] {
  let out = [...rows];
  for (const scene of scenes) {
    const at = out.findIndex((r) => r.kind === ROW_KIND.SCENE && r.sceneNumber === scene.sceneNumber);
    if (at !== -1) {
      const filled = sceneRow(scene, version);
      const row = { ...out[at] };
      for (const f of SCENE_CELLS) if (!row[f].trim()) row[f] = filled[f];
      if (!readSceneLink(row.scriptLink)) row.scriptLink = filled.scriptLink; // link it to the script if it wasn't
      out[at] = row;
      continue;
    }
    const number = parseSceneNumber(scene.sceneNumber)!;
    const before = out.findIndex(
      (r) => r.kind === ROW_KIND.SCENE && compareSceneNumbers(parseSceneNumber(r.sceneNumber)!, number) > 0,
    );
    const boundary = before === -1 ? out.length : before;
    out = [...out.slice(0, boundary), create(sceneRow(scene, version)), ...out.slice(boundary)];
  }
  return out;
}

/**
 * Add to the end: the script's scenes go after everything, renumbered to continue from the last
 * scene (sheet ends at 20 → 21, 22…; a script subscene stays under its renumbered scene: 21.1).
 */
export function appendScenes<T extends RowData>(rows: readonly T[], scenes: readonly ScriptScene[], create: (row: RowData) => T, version: string): T[] {
  const tops = rows.filter((r) => r.kind === ROW_KIND.SCENE).map((r) => parseSceneNumber(r.sceneNumber)![0]);
  let counter = tops.length ? Math.max(...tops) : 0;
  let lastOriginalTop: number | null = null;
  const added = scenes.map((scene) => {
    const parts = parseSceneNumber(scene.sceneNumber)!;
    if (!(parts.length > 1 && parts[0] === lastOriginalTop)) {
      counter += 1;
      lastOriginalTop = parts[0];
    }
    return create(sceneRow(scene, version, formatSceneNumber([counter, ...parts.slice(1)])));
  });
  return [...rows, ...added];
}
