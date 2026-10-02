// PDF: text comes with positions, and screenplays have standard indents (from the action margin:
// dialogue ~1", parentheticals ~1.6", character cues ~2.2", transitions far right). Scene numbers
// sit in the page margins. Scanned PDFs have no text, so they find no scenes.
// `classifyPdfLines` is PURE and tested in tests/scriptPdf.test.ts.

import { headingElement, looksLikeCue } from "./lines";
import type { ScriptElement } from "./scenes";

/** A line of text on a page: its left edge (points) and any scene number printed in the margins. */
export type PdfLine = { x: number; text: string; number?: string };

const NUMBER = /^[A-Z]{0,2}\d+[A-Z]{0,2}\.?$/;
const FURNITURE = /^(\(?MORE\)?|\(?CONTINUED\)?:?|CONTINUED:\s*\(\d+\)|\d+\.?)$/i;
const TRANSITION = /^(FADE (IN|OUT|TO)|CUT TO|SMASH CUT|MATCH CUT|DISSOLVE TO|JUMP CUT|WIPE TO)\b|TO:$/;

/** The action margin: the leftmost x that a fair share of lines start at. */
function actionMargin(lines: readonly PdfLine[]) {
  const counts = new Map<number, number>();
  for (const l of lines) counts.set(Math.round(l.x / 3) * 3, (counts.get(Math.round(l.x / 3) * 3) ?? 0) + 1);
  const enough = Math.max(3, lines.length * 0.05);
  const frequent = [...counts].filter(([, n]) => n >= enough).map(([x]) => x);
  if (frequent.length) return Math.min(...frequent);
  return lines.length ? Math.min(...lines.map((l) => l.x)) : 0;
}

export function classifyPdfLines(lines: readonly PdfLine[]): ScriptElement[] {
  const body = lines.filter((l) => !FURNITURE.test(l.text.trim()));
  const margin = actionMargin(body);
  const out: ScriptElement[] = [];
  for (const line of body) {
    const text = line.text.replace(/\s+/g, " ").trim();
    const offset = line.x - margin;
    if (offset < 25) {
      const heading = headingElement(line.number ? `${line.number} ${text}` : text);
      if (heading) out.push(heading);
      else out.push({ type: TRANSITION.test(text) ? "transition" : "action", text });
    } else if (offset < 100) {
      out.push({ type: text.startsWith("(") ? "parenthetical" : "dialogue", text });
    } else if (offset < 140) {
      out.push({ type: "parenthetical", text });
    } else if (offset < 260 && looksLikeCue(text)) {
      out.push({ type: "character", text });
    } else {
      out.push({ type: TRANSITION.test(text) ? "transition" : "action", text });
    }
  }
  return out;
}

type Item = { str: string; x: number; y: number; width: number; fontSize: number };

/** Groups a page's text items into lines (top to bottom), pulling scene numbers out of the margins. */
export function pageLines(items: readonly Item[], pageWidth = 612): PdfLine[] {
  const rows: Item[][] = [];
  for (const item of [...items].filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r[0].y - item.y) < 2.5);
    if (row) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let number: string | undefined;
    if (row.length > 1 && NUMBER.test(row[0].str.trim()) && row[0].x < 100) number = row.shift()!.str.trim().replace(/\.$/, "");
    if (row.length > 1 && NUMBER.test(row.at(-1)!.str.trim()) && row.at(-1)!.x > pageWidth * 0.75) {
      const right = row.pop()!.str.trim().replace(/\.$/, "");
      number ??= right;
    }
    let text = "";
    let end = -Infinity;
    for (const item of row) {
      if (text && item.x - end > item.fontSize * 0.2 && !text.endsWith(" ") && !item.str.startsWith(" ")) text += " ";
      text += item.str;
      end = item.x + item.width;
    }
    return { x: row[0].x, text: text.trim(), number };
  });
}

export async function readPdf(bytes: Uint8Array): Promise<ScriptElement[]> {
  const { extractTextItems } = await import("unpdf");
  const { items } = await extractTextItems(new Uint8Array(bytes)); // pdf.js may detach the buffer it's given
  return classifyPdfLines(items.flatMap((page) => pageLines(page)));
}
