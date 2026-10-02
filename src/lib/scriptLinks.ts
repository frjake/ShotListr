// PURE: links between shotlist rows and the attached script's text (tested in tests/scriptLinks.test.ts).
//
// A scene row links to one segment of the ScriptDoc (its heading kept, to find it again in a new
// draft). A shot row links to sections of its scene's segment: runs of whole paragraphs, with their
// text kept so they can be shown without the script and found again in a new draft. Links live in
// the row's `scriptLink` field as JSON, and carry the version of the script they were made against.

import { ROW_KIND } from "./constants";
import type { RowData } from "./rows";
import type { DocParagraph, ScriptDoc } from "./scriptParse/scenes";

export type SceneLink = { v: string; scene: number; heading: string };
export type Section = { scene: number; from: number; to: number; paras: DocParagraph[]; broken?: true };
export type ShotLink = { v: string; sections: Section[] };

function parse(json: string): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function readSceneLink(json: string): SceneLink | null {
  const v = parse(json) as SceneLink | null;
  return v && typeof v.scene === "number" && typeof v.heading === "string" ? v : null;
}

export function readShotLink(json: string): ShotLink | null {
  const v = parse(json) as ShotLink | null;
  return v && Array.isArray(v.sections) && v.sections.length ? v : null;
}

export function writeSceneLink(link: SceneLink | null): string {
  return link ? JSON.stringify(link) : "";
}

export function writeShotLink(link: ShotLink | null): string {
  return link && link.sections.length ? JSON.stringify(link) : "";
}

/** The scene row a shot belongs to: the nearest scene row above it, or -1. */
export function sceneRowFor(rows: readonly RowData[], index: number): number {
  for (let i = index - 1; i >= 0; i--) if (rows[i].kind === ROW_KIND.SCENE) return i;
  return -1;
}

/** The shot rows under a scene row (up to the next scene row). */
export function shotsUnder(rows: readonly RowData[], sceneIndex: number): number[] {
  const out: number[] = [];
  for (let i = sceneIndex + 1; i < rows.length && rows[i].kind !== ROW_KIND.SCENE; i++) out.push(i);
  return out;
}

const byPosition = (a: Section, b: Section) => a.scene - b.scene || a.from - b.from;

/**
 * Adds paragraphs `from`–`to` (inclusive) of segment `scene` to a shot's link. Sections of the same
 * scene that overlap or touch it merge into one.
 */
export function addSection(link: ShotLink | null, doc: ScriptDoc, version: string, scene: number, from: number, to: number): ShotLink {
  let lo = Math.min(from, to);
  let hi = Math.max(from, to);
  const keep: Section[] = [];
  for (const s of link?.sections ?? []) {
    if (!s.broken && s.scene === scene && s.from <= hi + 1 && s.to >= lo - 1) {
      lo = Math.min(lo, s.from);
      hi = Math.max(hi, s.to);
    } else {
      keep.push(s);
    }
  }
  const paras = doc.segments[scene].paragraphs.slice(lo, hi + 1);
  return { v: version, sections: [...keep, { scene, from: lo, to: hi, paras }].sort(byPosition) };
}

/**
 * How paragraphs are selected and linked: a character cue together with the parentheticals and
 * dialogue under it is one speech; anything else stands alone. Returns each group's [from, to].
 */
export function paragraphGroups(paras: readonly DocParagraph[]): [number, number][] {
  const groups: [number, number][] = [];
  paras.forEach((p, i) => {
    const last = groups.at(-1);
    if (last && paras[last[0]].type === "character" && (p.type === "parenthetical" || p.type === "dialogue")) last[1] = i;
    else groups.push([i, i]);
  });
  return groups;
}

/** Selected paragraph indexes as runs of neighbours, in order: [1, 2, 3, 6] → [[1, 3], [6, 6]]. */
export function runsOf(indexes: Iterable<number>): [number, number][] {
  const runs: [number, number][] = [];
  for (const i of [...new Set(indexes)].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && last[1] === i - 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs;
}

/** Runs as paragraph numbers for people: [[1, 3], [6, 6]] → "¶2–4, ¶7". */
export function formatRuns(runs: readonly [number, number][]): string {
  return runs.map(([from, to]) => (to > from ? `¶${from + 1}–${to + 1}` : `¶${from + 1}`)).join(", ");
}

/** A shot's link without section `index` (null when none are left). */
export function removeSection(link: ShotLink, index: number): ShotLink | null {
  const sections = link.sections.filter((_, i) => i !== index);
  return sections.length ? { ...link, sections } : null;
}

/**
 * Script text as display lines: a speech becomes "NAME (parenthetical): words" (the name in capitals,
 * as scripts write it), everything else its own text — "BEN (sleepy): Hi.", "Ana pours coffee."
 */
export function formatParagraphs(paras: readonly DocParagraph[]): string[] {
  const lines: string[] = [];
  let speech: { name: string; parens: string[]; words: string[] } | null = null;
  const flush = () => {
    if (!speech) return;
    const who = [speech.name, ...speech.parens].join(" ");
    lines.push(speech.words.length ? `${who}: ${speech.words.join(" ")}` : who);
    speech = null;
  };
  for (const p of paras) {
    if (p.type === "character") {
      flush();
      speech = { name: p.text.toUpperCase(), parens: [], words: [] };
    } else if (speech && p.type === "parenthetical") {
      speech.parens.push(p.text);
    } else if (speech && p.type === "dialogue") {
      speech.words.push(p.text);
    } else {
      flush();
      lines.push(p.text);
    }
  }
  flush();
  return lines;
}

/** For the Script column: the first linked line, how many more sections, and how many need re-linking. */
export function linkSummary(link: ShotLink | null): { first: string; more: number; broken: number } | null {
  if (!link) return null;
  const first = formatParagraphs(link.sections[0].paras)[0] ?? "";
  return { first, more: link.sections.length - 1, broken: link.sections.filter((s) => s.broken).length };
}

/** For the coverage view: which shots (by id) cover each paragraph of segment `scene`. */
export function coverageFor<Id>(shots: readonly { id: Id; link: ShotLink | null }[], scene: number): Map<number, Id[]> {
  const out = new Map<number, Id[]>();
  for (const { id, link } of shots) {
    for (const s of link?.sections ?? []) {
      if (s.broken || s.scene !== scene) continue;
      for (let p = s.from; p <= s.to; p++) out.set(p, [...(out.get(p) ?? []).filter((x) => x !== id), id]);
    }
  }
  return out;
}

// ---------- After the script changes ----------

const norm = (text: string) => text.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

/** The segment with this heading closest to `near`, or -1. */
function findSegment(doc: ScriptDoc, heading: string, near: number): number {
  let best = -1;
  doc.segments.forEach((seg, i) => {
    if (norm(seg.heading) === norm(heading) && (best === -1 || Math.abs(i - near) < Math.abs(best - near))) best = i;
  });
  return best;
}

/** Where a run of paragraphs appears in a segment (closest to `near`), or -1. */
function findRun(paras: readonly DocParagraph[], run: readonly DocParagraph[], near: number): number {
  let best = -1;
  for (let i = 0; i + run.length <= paras.length; i++) {
    if (run.every((p, k) => norm(paras[i + k].text) === norm(p.text)) && (best === -1 || Math.abs(i - near) < Math.abs(best - near))) best = i;
  }
  return best;
}

/** Marks the shots under a scene row as needing to be found again (e.g. after picking another script scene). */
export function staleShotsUnder<T extends RowData>(rows: readonly T[], sceneIndex: number): T[] {
  const under = new Set(shotsUnder(rows, sceneIndex));
  return rows.map((r, i) => {
    const link = under.has(i) ? readShotLink(r.scriptLink) : null;
    return link ? { ...r, scriptLink: writeShotLink({ ...link, v: "" }) } : r;
  });
}

/**
 * Brings links made against another version of the script up to date with `doc`: scene links are
 * found again by heading (dropped if the heading's gone — the scene can be picked again), and shot
 * sections by their text within their scene's new segment; any not found are kept but marked
 * `broken` ("needs re-linking"). Links already at `version` are left alone.
 */
export function reanchorRows<T extends RowData>(rows: readonly T[], doc: ScriptDoc, version: string): { rows: T[]; brokenShots: number } {
  const out = rows.map((r) => {
    if (r.kind !== ROW_KIND.SCENE) return r;
    const link = readSceneLink(r.scriptLink);
    if (!link || link.v === version) return r;
    const scene = findSegment(doc, link.heading, link.scene);
    return { ...r, scriptLink: writeSceneLink(scene === -1 ? null : { v: version, scene, heading: doc.segments[scene].heading }) };
  });
  let brokenShots = 0;
  out.forEach((r, i) => {
    if (r.kind !== ROW_KIND.SHOT) return;
    const link = readShotLink(r.scriptLink);
    if (!link) return;
    if (link.v !== version) {
      const sceneLink = readSceneLink(out[sceneRowFor(out, i)]?.scriptLink ?? "");
      const segment = sceneLink ? doc.segments[sceneLink.scene] : undefined;
      const sections = link.sections.map((s): Section => {
        const at = segment ? findRun(segment.paragraphs, s.paras, s.from) : -1;
        if (at === -1) return { scene: s.scene, from: s.from, to: s.to, paras: s.paras, broken: true };
        return { scene: sceneLink!.scene, from: at, to: at + s.paras.length - 1, paras: segment!.paragraphs.slice(at, at + s.paras.length) };
      });
      out[i] = { ...r, scriptLink: writeShotLink({ v: version, sections: sections.sort(byPosition) }) };
    }
    if (readShotLink(out[i].scriptLink)?.sections.some((s) => s.broken)) brokenShots += 1;
  });
  return { rows: out, brokenShots };
}

// ---------- Download ----------

/** How many lines of a shot's linked text the download shows before "…". */
export const DOWNLOAD_LINES = 4;

/** The "Script links" sheet: every shot, its scene, and its linked lines ("—" when none). */
export function scriptLinksTable(rows: readonly RowData[], labels: readonly string[]): string[][] {
  const out = [["Shot #", "Scene", "Linked lines"]];
  rows.forEach((r, i) => {
    if (r.kind !== ROW_KIND.SHOT) return;
    const sceneIndex = sceneRowFor(rows, i);
    const scene = sceneIndex === -1 ? null : rows[sceneIndex];
    const sceneText = scene ? [labels[sceneIndex], scene.intExt, [scene.location, scene.time].filter(Boolean).join(" - ")].filter(Boolean).join(" ") : "";
    const link = readShotLink(r.scriptLink);
    const lines = link ? link.sections.flatMap((s) => formatParagraphs(s.paras)) : [];
    const shown = lines.length > DOWNLOAD_LINES ? [...lines.slice(0, DOWNLOAD_LINES), "…"] : lines;
    out.push([labels[i], sceneText, shown.length ? shown.join("\n") : "—"]);
  });
  return out;
}
