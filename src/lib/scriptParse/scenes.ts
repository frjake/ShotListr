// PURE: turns the elements read from a script (any format) into shotlist scenes. Tested in
// tests/scriptScenes.test.ts. The format readers (fdx.ts, docx.ts, pdf.ts, doc.ts) only have to
// say what each paragraph is; all screenplay rules live here.

import {
  compareSceneNumbers,
  formatSceneNumber,
  nextSceneNumber,
  subsceneBetween,
  type SceneNumber,
} from "../sceneNumbers";

export type ElementType = "heading" | "action" | "character" | "dialogue" | "parenthetical" | "transition";

/** One paragraph of a script. `number` is a scene number printed with a heading (12, 12A, A12). */
export type ScriptElement = { type: ElementType; text: string; number?: string };

/** A scene found in a script, ready to become a scene row. */
export type ScriptScene = { sceneNumber: string; intExt: string; location: string; time: string; characters: string[] };

/** INT., EXT., INT./EXT. (also EXT./INT., I/E) at the start of a heading; "INTERCUT" doesn't match. */
const INT_EXT = /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|INT\.?|EXT\.?)(?=\s|$)\s*(.*)$/i;

/** Splits a heading into Int./Ext., Location and Time, or null if it isn't an INT./EXT. heading. */
export function parseHeading(text: string): { intExt: string; location: string; time: string } | null {
  const m = INT_EXT.exec(text.trim());
  if (!m) return null;
  const prefix = m[1].toUpperCase().replace(/[\s.]/g, "");
  const intExt = prefix === "INT" ? "INT." : prefix === "EXT" ? "EXT." : "INT./EXT.";
  // Time is whatever follows the last " - " (or en/em dash, or "--"); the rest is the location.
  const rest = m[2].trim();
  const dashes = [...rest.matchAll(/\s+(?:-{1,2}|[–—])\s+/g)];
  const last = dashes.at(-1);
  if (!last) return { intExt, location: rest, time: "" };
  return { intExt, location: rest.slice(0, last.index).trim(), time: rest.slice(last.index + last[0].length).trim() };
}

/** "A" → 1, "Z" → 26, "AA" → 27 (the inverse of shotLetters in rows.ts). */
function letterValue(letters: string) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/**
 * A script's scene number in ShotListr form: 12 → 12, 12A → 12.1, 12B → 12.2, and A12 (a scene
 * inserted before 12) → 11.1. Null if it isn't a scene number.
 */
export function mapScriptNumber(raw: string): SceneNumber | null {
  const t = raw.trim().replace(/\.$/, "").toUpperCase();
  let m;
  if ((m = /^(\d+)$/.exec(t))) return [Number(m[1])];
  if ((m = /^(\d+)([A-Z]{1,2})$/.exec(t))) return [Number(m[1]), letterValue(m[2])];
  if ((m = /^([A-Z]{1,2})(\d+)$/.exec(t))) return [Number(m[2]) - 1, letterValue(m[1])];
  return null;
}

/** Short words kept lowercase inside titles ("Top of the Stairs"), unless they start a part. */
const MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "off", "on", "onto", "or", "over", "the", "to", "up", "upon", "via", "vs", "vs.", "with"]);

/**
 * Title case for script text: "MRS. O'BRIEN" → "Mrs. O'Brien", "ANA'S KITCHEN" → "Ana's Kitchen".
 * With `minorWords`, short words stay lowercase except first, last, or after a " - " / "/" / "(":
 * "BACK TO THE HOUSE - TOP OF THE STAIRS" → "Back to the House - Top of the Stairs". A.M. and P.M.
 * stay capitals ("7am" → "7AM"); with `times`, so do AM/PM on their own ("EARLY AM" → "Early AM").
 */
export function titleCase(text: string, { minorWords = false, times = false } = {}): string {
  const cased = text
    .toLowerCase()
    .replace(/(^|[\s\-./(])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/(['’])(\p{L})(?=\p{L})/gu, (_, q: string, ch: string) => q + ch.toUpperCase());
  const parts = cased.split(/(\s+)/);
  const words = parts.filter((_, i) => i % 2 === 0);
  let w = 0;
  let startOfPart = true;
  const out = parts.map((part, i) => {
    if (i % 2 === 1) return part; // whitespace
    const index = w++;
    let word = part;
    if (minorWords && !startOfPart && index !== words.length - 1 && MINOR_WORDS.has(word.toLowerCase())) word = word.toLowerCase();
    // A dash or slash on its own, or a word ending in ":" or "(", starts a new part.
    startOfPart = /^(?:-{1,2}|[–—/])$|[:(]$/.test(part);
    return word;
  });
  let result = out
    .join("")
    .replace(/\b[ap]\.m\./gi, (m) => m.toUpperCase())
    .replace(/(\d\s*)([ap])(\.?)m\b(\.?)/gi, (_, n: string, ap: string, d1: string, d2: string) => `${n}${ap.toUpperCase()}${d1}M${d2}`);
  if (times) result = result.replace(/\b[ap]m\b/gi, (m) => m.toUpperCase());
  return result;
}

/**
 * A character cue as a name: extensions like (V.O.), (O.S.), (CONT'D) and dual-dialogue marks
 * removed, then title case — "MRS. O'BRIEN (V.O.)" → "Mrs. O'Brien". Empty if nothing is left.
 */
export function characterName(cue: string): string {
  const bare = cue
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bCONT['’]?D\b|\bCONTINUED\b/gi, " ")
    .replace(/[\^:]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return titleCase(bare);
}

type Draft = { main: boolean; rawNumber?: string; intExt: string; location: string; time: string; characters: string[] };

/**
 * Scenes from script elements:
 *  - every INT./EXT. heading starts a scene;
 *  - other headings (INTERCUT, FLASHBACK…) become subscenes of the scene they're in, with the
 *    heading as the Location; any before the first scene are ignored;
 *  - Location and Time are in title case (Int./Ext. stays INT./EXT.);
 *  - Characters are everyone with dialogue (V.O. and O.S. included), in order of first line;
 *  - scenes keep the script's numbers (12A → 12.1) when every scene has one and they go up in
 *    order; otherwise they're numbered 1, 2, 3…
 */
export function buildScenes(elements: readonly ScriptElement[]): ScriptScene[] {
  const drafts: Draft[] = [];
  for (const el of elements) {
    if (el.type === "heading") {
      const parsed = parseHeading(el.text);
      if (parsed) drafts.push({ main: true, rawNumber: el.number, ...parsed, characters: [] });
      else if (drafts.length) drafts.push({ main: false, intExt: "", location: el.text.trim(), time: "", characters: [] });
    } else if (el.type === "character" && drafts.length) {
      const name = characterName(el.text);
      const scene = drafts[drafts.length - 1];
      if (name && !scene.characters.some((c) => c.toLowerCase() === name.toLowerCase())) scene.characters.push(name);
    }
  }

  // Numbers for the INT./EXT. scenes: the script's, if complete and increasing; else 1, 2, 3…
  const mains = drafts.filter((d) => d.main);
  const mapped = mains.map((d) => (d.rawNumber ? mapScriptNumber(d.rawNumber) : null));
  const usable = mapped.every((n, i) => n && (i === 0 || compareSceneNumbers(mapped[i - 1]!, n) < 0));
  const mainNumbers = usable ? (mapped as SceneNumber[]) : mains.map((_, i) => [i + 1]);

  // Subscenes slot in after the scene (or subscene) above, before the next scene.
  const numbers: SceneNumber[] = [];
  let m = 0;
  drafts.forEach((d, i) => {
    if (d.main) return void numbers.push(mainNumbers[m++]);
    const prev = numbers[i - 1];
    const next = m < mainNumbers.length ? mainNumbers[m] : null;
    const candidate = drafts[i - 1].main ? [...prev, 1] : nextSceneNumber(prev);
    numbers.push(!next || compareSceneNumbers(candidate, next) < 0 ? candidate : subsceneBetween(prev, next));
  });

  return drafts.map((d, i) => ({
    sceneNumber: formatSceneNumber(numbers[i]),
    intExt: d.intExt,
    location: titleCase(d.location, { minorWords: true }),
    time: titleCase(d.time, { minorWords: true, times: true }),
    characters: d.characters,
  }));
}
