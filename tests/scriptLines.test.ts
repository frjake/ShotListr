import { describe, expect, it } from "vitest";
import { classifyLines, splitSceneNumber } from "@/lib/scriptParse/lines";
import { buildScenes } from "@/lib/scriptParse/scenes";

describe("splitSceneNumber", () => {
  it("takes scene numbers from either side of a heading", () => {
    expect(splitSceneNumber("12 INT. KITCHEN - DAY 12")).toEqual({ number: "12", text: "INT. KITCHEN - DAY" });
    expect(splitSceneNumber("12A. INT. KITCHEN - DAY")).toEqual({ number: "12A", text: "INT. KITCHEN - DAY" });
    expect(splitSceneNumber("INT. KITCHEN - DAY A12")).toEqual({ number: "A12", text: "INT. KITCHEN - DAY" });
    expect(splitSceneNumber("INT. KITCHEN - DAY")).toEqual({ text: "INT. KITCHEN - DAY" });
    expect(splitSceneNumber("EXT. ROAD -- 1985")).toEqual({ text: "EXT. ROAD -- 1985" });
    expect(splitSceneNumber("INT. ROOM 101")).toEqual({ text: "INT. ROOM 101" });
    expect(splitSceneNumber("INT. ROOM 101 - NIGHT 7")).toEqual({ number: "7", text: "INT. ROOM 101 - NIGHT" });
  });
});

const BLANK_SEPARATED = `
FADE IN:

1 INT. KITCHEN - DAY 1

Ana pours coffee. BEN (30s) shuffles in.

ANA
Morning.

BEN (O.S.)
(sleepy)
Hi.

OKAY
That's settled.

CUT TO:

2 EXT. GARDEN - NIGHT 2

INTERCUT - PHONE CALL

CAROL (V.O.)
Hello?

(MORE)

12.
`.split("\n");

describe("classifyLines", () => {
  it("finds headings, cues, dialogue and transitions in blank-separated text", () => {
    const els = classifyLines(BLANK_SEPARATED);
    expect(els.filter((e) => e.type === "heading")).toEqual([
      { type: "heading", text: "INT. KITCHEN - DAY", number: "1" },
      { type: "heading", text: "EXT. GARDEN - NIGHT", number: "2" },
      { type: "heading", text: "INTERCUT - PHONE CALL" },
    ]);
    expect(els.filter((e) => e.type === "character").map((e) => e.text)).toEqual(["ANA", "BEN (O.S.)", "OKAY", "CAROL (V.O.)"]);
    expect(els.filter((e) => e.type === "transition").map((e) => e.text)).toEqual(["FADE IN:", "CUT TO:"]);
    expect(els.some((e) => /MORE|^12\.$/.test(e.text))).toBe(false); // page furniture dropped
  });

  it("works without blank lines between blocks", () => {
    const tight = ["INT. KITCHEN - DAY", "Ana pours coffee.", "ANA", "Morning.", "BEN", "(sleepy)", "Hi.", "EXT. GARDEN - NIGHT", "CAROL", "Hello?"];
    expect(buildScenes(classifyLines(tight)).map((s) => [s.sceneNumber, s.location, s.characters.join(", ")])).toEqual([
      ["1", "Kitchen", "Ana, Ben"],
      ["2", "Garden", "Carol"],
    ]);
  });

  it("doesn't take shouted dialogue or sound effects for cues", () => {
    const els = classifyLines(["INT. A - DAY", "", "ANA", "Watch out!", "", "BANG!", "", "The door flies open."]);
    expect(els.filter((e) => e.type === "character").map((e) => e.text)).toEqual(["ANA"]);
  });
});
