// PURE: classifies plain lines of screenplay text (when a file gives no layout or styles, as with
// .doc files or unstyled .docx). Tested in tests/scriptLines.test.ts.

import type { ScriptElement } from "./scenes";

const SCENE_NUMBER = String.raw`[A-Z]{0,2}\d+[A-Z]{0,2}\.?`;

/** "12 INT. KITCHEN - DAY 12" → { number: "12", text: "INT. KITCHEN - DAY" }. */
export function splitSceneNumber(line: string): { number?: string; text: string } {
  const m = new RegExp(String.raw`^\s*(${SCENE_NUMBER})\s+(.*?)(?:\s+\1)?\s*$`).exec(line);
  if (m && /\d/.test(m[1]) && /[A-Za-z]/.test(m[2])) return { number: m[1].replace(/\.$/, ""), text: m[2] };
  // A number only on the right counts when it follows a full "LOCATION - TIME" heading, so the year
  // in "EXT. ROAD - 1985" or the room in "INT. ROOM 101" isn't taken for one.
  const trailing = new RegExp(String.raw`^(.*?\S)\s+(${SCENE_NUMBER})\s*$`).exec(line);
  if (trailing && /^(INT|EXT|I\/E)/i.test(trailing[1]) && /\s(?:-{1,2}|[–—])\s+\S/.test(trailing[1]) && !/[-–—]$/.test(trailing[1])) {
    return { number: trailing[2].replace(/\.$/, ""), text: trailing[1] };
  }
  return { text: line.trim() };
}

const INT_EXT_START = /^(INT|EXT|I\/E|INT\.?\/EXT|EXT\.?\/INT)[.\s/]/i;
/** Headings that aren't INT./EXT. but still mark a new part of a scene. */
const OTHER_HEADING = /^(INTERCUT|INTER-CUT|FLASHBACK|FLASH BACK|BACK TO (THE )?(SCENE|PRESENT)|MONTAGE|SERIES OF SHOTS|MOMENTS LATER|LATER|SAME TIME|DREAM SEQUENCE)\b/;
const TRANSITION = /^(FADE (IN|OUT|TO)|CUT TO|SMASH CUT|MATCH CUT|DISSOLVE TO|JUMP CUT|WIPE TO)\b|TO:$/;
/** Running page furniture in exported scripts. */
const FURNITURE = /^(\(?MORE\)?|\(?CONTINUED\)?:?|CONTINUED:\s*\(\d+\)|\d+\.?)$/i;

function isCaps(text: string) {
  const letters = text.replace(/\([^)]*\)/g, "").replace(/[^\p{L}]/gu, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

/** Whether a line looks like a character cue: short, all caps, a few words, no closing punctuation. */
export function looksLikeCue(text: string) {
  const words = text.replace(/\([^)]*\)/g, "").trim().split(/\s+/);
  return isCaps(text) && text.length <= 40 && words.length <= 5 && /[\p{L}\d)'’^]$/u.test(text) && !TRANSITION.test(text);
}

/** Classifies a heading-like line, or returns null if it isn't one. */
export function headingElement(line: string): ScriptElement | null {
  const { number, text } = splitSceneNumber(line);
  if (INT_EXT_START.test(text) && isCaps(text)) return { type: "heading", text, number };
  if (OTHER_HEADING.test(text) && isCaps(text)) return { type: "heading", text };
  return null;
}

/**
 * Elements from plain lines: headings, transitions, then cue + dialogue blocks; the rest is action.
 * A cue is a caps line followed by dialogue (or a parenthetical). When the text separates blocks
 * with blank lines, a cue must also follow one, which keeps short caps dialogue ("OKAY") out.
 */
export function classifyLines(lines: readonly string[]): ScriptElement[] {
  const clean = lines.map((l) => l.replace(/\s+/g, " ").trim());
  const blankSeparated = clean.filter((l) => !l).length >= clean.length * 0.1;
  const out: ScriptElement[] = [];
  let inDialogue = false;
  clean.forEach((text, i) => {
    if (!text) return void (inDialogue = false);
    if (FURNITURE.test(text)) return;
    const heading = headingElement(text);
    if (heading) {
      inDialogue = false;
      return void out.push(heading);
    }
    if (isCaps(text) && TRANSITION.test(text)) {
      inDialogue = false;
      return void out.push({ type: "transition", text });
    }
    const next = clean.slice(i + 1).find((l) => l);
    const afterBlank = i === 0 || !clean[i - 1];
    if (looksLikeCue(text) && next && (next.startsWith("(") || !isCaps(next)) && (!blankSeparated || afterBlank)) {
      inDialogue = true;
      return void out.push({ type: "character", text });
    }
    if (inDialogue) return void out.push({ type: text.startsWith("(") ? "parenthetical" : "dialogue", text });
    out.push({ type: "action", text });
  });
  return out;
}
