// The same sample screenplay in every supported format (tests/fixtures/scripts, made by
// generate.mjs) must come out as the same scenes.

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { readDoc } from "@/lib/scriptParse/doc";
import { readDocx } from "@/lib/scriptParse/docx";
import { readFdx } from "@/lib/scriptParse/fdx";
import { readPdf } from "@/lib/scriptParse/pdf";
import { buildScenes, type ScriptElement } from "@/lib/scriptParse/scenes";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/scripts/${name}`, import.meta.url)));
const summary = (els: ScriptElement[]) =>
  buildScenes(els).map((s) => `${s.sceneNumber} | ${s.intExt} | ${s.location} | ${s.time} | ${s.characters.join(", ")}`);

// Formats that carry the script's scene numbers (1, 2, 2A, 3): 2A → 2.1, and the INTERCUT /
// BACK TO SCENE subscenes fit between 2 and 2.1.
const NUMBERED = [
  "1 | INT. | Kitchen | Day | Ana, Ben",
  "2 | EXT. | Garden | Night | Ben",
  "2.0.1 |  | Intercut - Phone Call |  | Carol",
  "2.0.2 |  | Back to Scene |  | Mrs. O'Brien",
  "2.1 | INT./EXT. | Car - Moving | Continuous | ",
  "3 | EXT. | Road | 1985 | ",
];
// Formats without scene numbers: numbered in order.
const UNNUMBERED = [
  "1 | INT. | Kitchen | Day | Ana, Ben",
  "2 | EXT. | Garden | Night | Ben",
  "2.1 |  | Intercut - Phone Call |  | Carol",
  "2.2 |  | Back to Scene |  | Mrs. O'Brien",
  "3 | INT./EXT. | Car - Moving | Continuous | ",
  "4 | EXT. | Road | 1985 | ",
];

describe("script formats", () => {
  it(".fdx (labelled paragraphs, numbered; title page ignored)", () => {
    expect(summary(readFdx(new TextDecoder().decode(fixture("sample.fdx"))))).toEqual(NUMBERED);
  });
  it(".pdf (indentation, margin scene numbers, page breaks)", async () => {
    expect(summary(await readPdf(fixture("sample.pdf")))).toEqual(NUMBERED);
  });
  it(".docx with screenplay styles", async () => {
    expect(summary(await readDocx(fixture("sample-styled.docx")))).toEqual(UNNUMBERED);
  });
  it(".docx without styles (plain lines, no blank lines)", async () => {
    expect(summary(await readDocx(fixture("sample-plain.docx")))).toEqual(UNNUMBERED);
  });
  it(".doc (text only, blank lines between blocks)", async () => {
    expect(summary(await readDoc(fixture("sample.doc")))).toEqual(UNNUMBERED);
  });
  it("rejects files that aren't what they claim", async () => {
    expect(() => readFdx("<html></html>")).toThrow();
    await expect(readDocx(new TextEncoder().encode("not a zip"))).rejects.toThrow();
  });
});

describe("parseScript", () => {
  it("explains unreadable files and scripts without scenes", async () => {
    vi.doMock("server-only", () => ({}));
    const { parseScript } = await import("@/lib/scriptParse");
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(await parseScript("broken.docx", enc("nope"))).toEqual({ error: "Couldn't read “broken.docx”. The file may be damaged or not really a .docx file." });
    expect(await parseScript("notes.fdx", enc('<FinalDraft><Content><Paragraph Type="Action"><Text>Hi</Text></Paragraph></Content></FinalDraft>'))).toEqual({
      error: "No scenes found in “notes.fdx”. Scene headings need to start with INT. or EXT.",
    });
    expect(await parseScript("scan.pdf", fixture("sample.pdf").slice(0, 0))).toMatchObject({ error: expect.stringMatching(/Couldn't read|scanned PDF/) });
    expect(await parseScript("sample.fdx", fixture("sample.fdx"))).toMatchObject({ scenes: expect.arrayContaining([expect.objectContaining({ sceneNumber: "2.1" })]) });
  });
});
