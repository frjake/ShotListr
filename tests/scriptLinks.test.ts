import { describe, expect, it } from "vitest";
import { ROW_KIND } from "@/lib/constants";
import { emptyRow, type RowData } from "@/lib/rows";
import {
  addSection,
  coverageFor,
  formatParagraphs,
  formatRuns,
  paragraphGroups,
  linkSummary,
  readSceneLink,
  readShotLink,
  reanchorRows,
  removeSection,
  runsOf,
  sceneRowFor,
  scriptLinksTable,
  shotsUnder,
  staleShotsUnder,
  writeSceneLink,
  writeShotLink,
  type ShotLink,
} from "@/lib/scriptLinks";
import type { DocParagraph, ScriptDoc } from "@/lib/scriptParse/scenes";

const A = (text: string): DocParagraph => ({ type: "action", text });
const C = (text: string): DocParagraph => ({ type: "character", text });
const D = (text: string): DocParagraph => ({ type: "dialogue", text });
const P = (text: string): DocParagraph => ({ type: "parenthetical", text });

const doc: ScriptDoc = {
  segments: [
    { heading: "INT. KITCHEN - DAY", paragraphs: [A("Ana pours coffee."), C("ANA"), D("Morning."), C("BEN"), P("(sleepy)"), D("Hi."), A("They sit.")] },
    { heading: "EXT. GARDEN - NIGHT", paragraphs: [A("Wind."), C("BEN (V.O.)"), D("Later…")] },
  ],
};
const scene = (n: string, link = ""): RowData => ({ ...emptyRow(ROW_KIND.SCENE), sceneNumber: n, scriptLink: link });
const shot = (subject: string, link = ""): RowData => ({ ...emptyRow(ROW_KIND.SHOT), subject, scriptLink: link });
const linkTo = (s: number, v = "v1") => writeSceneLink({ v, scene: s, heading: doc.segments[s].heading });

describe("reading and writing links", () => {
  it("round-trips and ignores junk", () => {
    expect(readSceneLink(linkTo(1))).toEqual({ v: "v1", scene: 1, heading: "EXT. GARDEN - NIGHT" });
    expect(readSceneLink("")).toBeNull();
    expect(readSceneLink("{nope")).toBeNull();
    expect(readShotLink(writeShotLink({ v: "v1", sections: [] }))).toBeNull();
    expect(writeShotLink(null)).toBe("");
  });
});

describe("rows and scenes", () => {
  const rows = [shot("orphan"), scene("1"), shot("a"), shot("b"), scene("2"), shot("c")];
  it("finds a shot's scene row and a scene's shots", () => {
    expect(sceneRowFor(rows, 0)).toBe(-1);
    expect(sceneRowFor(rows, 3)).toBe(1);
    expect(shotsUnder(rows, 1)).toEqual([2, 3]);
    expect(shotsUnder(rows, 4)).toEqual([5]);
  });
});

describe("sections", () => {
  it("adds a run of paragraphs with their text", () => {
    expect(addSection(null, doc, "v1", 0, 3, 1)).toEqual({ v: "v1", sections: [{ scene: 0, from: 1, to: 3, paras: [C("ANA"), D("Morning."), C("BEN")] }] });
  });
  it("merges with overlapping or touching sections, keeps separate ones", () => {
    let link: ShotLink = addSection(null, doc, "v1", 0, 0, 0);
    link = addSection(link, doc, "v1", 0, 5, 6);
    expect(link.sections.map((s) => [s.from, s.to])).toEqual([[0, 0], [5, 6]]);
    link = addSection(link, doc, "v1", 0, 1, 4); // touches both
    expect(link.sections.map((s) => [s.from, s.to])).toEqual([[0, 6]]);
  });
  it("removes sections, down to nothing", () => {
    const link = addSection(addSection(null, doc, "v1", 0, 0, 0), doc, "v1", 0, 6, 6);
    expect(removeSection(link, 0)?.sections.map((s) => s.from)).toEqual([6]);
    expect(removeSection(removeSection(link, 0)!, 0)).toBeNull();
  });
  it("formats speeches and action as lines", () => {
    expect(formatParagraphs(doc.segments[0].paragraphs)).toEqual(["Ana pours coffee.", "ANA: Morning.", "BEN (sleepy): Hi.", "They sit."]);
    expect(formatParagraphs([C("ANA")])).toEqual(["ANA"]);
  });
  it("summarises a link for the Script column", () => {
    const link = addSection(addSection(null, doc, "v1", 0, 1, 2), doc, "v1", 0, 6, 6);
    expect(linkSummary(link)).toEqual({ first: "ANA: Morning.", more: 1, broken: 0 });
    expect(linkSummary(null)).toBeNull();
  });
  it("maps which shots cover each paragraph", () => {
    const shots = [
      { id: "1A", link: addSection(null, doc, "v1", 0, 0, 2) },
      { id: "1B", link: addSection(null, doc, "v1", 0, 2, 3) },
      { id: "2A", link: addSection(null, doc, "v1", 1, 0, 0) },
    ];
    const cov = coverageFor(shots, 0);
    expect([0, 1, 2, 3, 4].map((p) => cov.get(p) ?? [])).toEqual([["1A"], ["1A"], ["1A", "1B"], ["1B"], []]);
  });
});

describe("selected paragraphs", () => {
  it("keeps a character with their parentheticals and dialogue", () => {
    expect(paragraphGroups(doc.segments[0].paragraphs)).toEqual([[0, 0], [1, 2], [3, 5], [6, 6]]);
    expect(paragraphGroups([D("Stray line."), C("ANA"), A("She leaves.")])).toEqual([[0, 0], [1, 1], [2, 2]]);
  });
  it("writes character names in capitals", () => {
    expect(formatParagraphs([C("Ben (V.O.)"), D("Later.")])).toEqual(["BEN (V.O.): Later."]);
  });

  it("groups selections into runs of neighbours, in order", () => {
    expect(runsOf([6, 2, 1, 3, 3])).toEqual([[1, 3], [6, 6]]);
    expect(runsOf([])).toEqual([]);
    expect(formatRuns(runsOf([1, 2, 3, 6]))).toBe("¶2–4, ¶7");
  });
});

describe("reanchorRows (a new draft)", () => {
  const draft2: ScriptDoc = {
    segments: [
      { heading: "INT. HALLWAY - DAY", paragraphs: [A("New scene.")] },
      { heading: "INT. KITCHEN - DAY", paragraphs: [A("Ana yawns."), A("Ana pours coffee."), C("ANA"), D("Morning!"), C("BEN"), P("(sleepy)"), D("Hi.")] },
      { heading: "EXT. GARDEN - NIGHT", paragraphs: [A("Wind."), C("BEN (V.O.)"), D("Later…")] },
    ],
  };
  const rows = [
    scene("1", linkTo(0)),
    shot("a", writeShotLink(addSection(null, doc, "v1", 0, 0, 0))), // "Ana pours coffee." — moved
    shot("b", writeShotLink(addSection(null, doc, "v1", 0, 1, 2))), // "ANA: Morning." — changed
    shot("c", writeShotLink(addSection(null, doc, "v1", 0, 3, 5))), // BEN speech — moved
    shot("d"),
    scene("2", linkTo(1)),
    shot("e", writeShotLink(addSection(null, doc, "v1", 1, 1, 2))),
    scene("3", writeSceneLink({ v: "v1", scene: 9, heading: "INT. GONE - DAY" })),
  ];
  const { rows: out, brokenShots } = reanchorRows(rows, draft2, "v2");
  const shotOf = (i: number) => readShotLink(out[i].scriptLink)!;

  it("finds scenes again by heading", () => {
    expect(readSceneLink(out[0].scriptLink)).toEqual({ v: "v2", scene: 1, heading: "INT. KITCHEN - DAY" });
    expect(readSceneLink(out[5].scriptLink)).toEqual({ v: "v2", scene: 2, heading: "EXT. GARDEN - NIGHT" });
    expect(out[7].scriptLink).toBe(""); // heading no longer in the script
  });
  it("finds sections again by their text, and flags the rest", () => {
    expect(shotOf(1)).toEqual({ v: "v2", sections: [{ scene: 1, from: 1, to: 1, paras: [A("Ana pours coffee.")] }] });
    expect(shotOf(2).sections[0]).toMatchObject({ broken: true, paras: [C("ANA"), D("Morning.")] });
    expect(shotOf(3).sections[0]).toMatchObject({ scene: 1, from: 4, to: 6 });
    expect(out[4]).toBe(rows[4]);
    expect(shotOf(6).sections[0]).toMatchObject({ scene: 2, from: 1, to: 2 });
    expect(brokenShots).toBe(1);
  });
  it("leaves links already on this version alone", () => {
    const again = reanchorRows(out, draft2, "v2");
    expect(again.rows.every((r, i) => r === out[i])).toBe(true);
    expect(again.brokenShots).toBe(1);
  });
  it("re-finds a scene's shots after its script scene changes", () => {
    const moved = [scene("1", writeSceneLink({ v: "v1", scene: 1, heading: "EXT. GARDEN - NIGHT" })), shot("x", writeShotLink(addSection(null, doc, "v1", 0, 0, 0)))];
    const { rows: r2 } = reanchorRows(staleShotsUnder(moved, 0), doc, "v1");
    expect(readShotLink(r2[1].scriptLink)!.sections[0]).toMatchObject({ broken: true }); // not in the garden
  });
});

describe("scriptLinksTable", () => {
  it("lists every shot with its scene and up to 4 lines", () => {
    const rows = [
      { ...scene("1", linkTo(0)), intExt: "INT.", location: "Kitchen", time: "Day" },
      shot("a", writeShotLink(addSection(null, doc, "v1", 0, 0, 6))),
      shot("b"),
    ];
    expect(scriptLinksTable(rows, ["1", "1A", "1B"])).toEqual([
      ["Shot #", "Scene", "Linked lines"],
      ["1A", "1 INT. Kitchen - Day", "Ana pours coffee.\nANA: Morning.\nBEN (sleepy): Hi.\nThey sit."],
      ["1B", "1 INT. Kitchen - Day", "—"],
    ]);
    const long = [scene("1"), shot("a", writeShotLink({ v: "v1", sections: [{ scene: 0, from: 0, to: 5, paras: ["1", "2", "3", "4", "5"].map(A) }] }))];
    expect(scriptLinksTable(long, ["1", "1A"])[1][2]).toBe("1\n2\n3\n4\n…");
  });
});
