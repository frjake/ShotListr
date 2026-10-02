import { describe, expect, it } from "vitest";
import { buildScenes, characterName, mapScriptNumber, parseHeading, titleCase, type ScriptElement } from "@/lib/scriptParse/scenes";

const h = (text: string, number?: string): ScriptElement => ({ type: "heading", text, number });
const c = (text: string): ScriptElement => ({ type: "character", text });
const d = (text: string): ScriptElement => ({ type: "dialogue", text });
const a = (text: string): ScriptElement => ({ type: "action", text });

describe("parseHeading", () => {
  it("splits Int./Ext., Location and Time at the last dash", () => {
    expect(parseHeading("INT. HOUSE - KITCHEN - NIGHT")).toEqual({ intExt: "INT.", location: "HOUSE - KITCHEN", time: "NIGHT" });
    expect(parseHeading("EXT. ROAD – SUNSET")).toEqual({ intExt: "EXT.", location: "ROAD", time: "SUNSET" });
    expect(parseHeading("EXT. ROAD -- 1985")).toEqual({ intExt: "EXT.", location: "ROAD", time: "1985" });
    expect(parseHeading("INT. WAREHOUSE")).toEqual({ intExt: "INT.", location: "WAREHOUSE", time: "" });
  });
  it("recognises the Int./Ext. variants", () => {
    for (const p of ["INT./EXT.", "INT/EXT", "EXT./INT.", "I/E", "I/E."]) expect(parseHeading(`${p} CAR - DAY`)?.intExt).toBe("INT./EXT.");
    expect(parseHeading("int kitchen - day")?.intExt).toBe("INT.");
    expect(parseHeading("EXT KITCHEN")?.intExt).toBe("EXT.");
  });
  it("isn't fooled by words starting with INT/EXT", () => {
    expect(parseHeading("INTERCUT - PHONE CALL")).toBeNull();
    expect(parseHeading("EXTREME CLOSE UP")).toBeNull();
  });
});

describe("mapScriptNumber", () => {
  it("maps plain, suffixed and prefixed numbers", () => {
    expect(mapScriptNumber("12")).toEqual([12]);
    expect(mapScriptNumber("12.")).toEqual([12]);
    expect(mapScriptNumber("12A")).toEqual([12, 1]);
    expect(mapScriptNumber("12b")).toEqual([12, 2]);
    expect(mapScriptNumber("12AA")).toEqual([12, 27]);
    expect(mapScriptNumber("A12")).toEqual([11, 1]);
    expect(mapScriptNumber("B12")).toEqual([11, 2]);
    expect(mapScriptNumber("A1")).toEqual([0, 1]);
    expect(mapScriptNumber("twelve")).toBeNull();
  });
});

describe("titleCase", () => {
  it("capitalizes each word, including after dashes, dots and apostrophes", () => {
    expect(titleCase("KITCHEN")).toBe("Kitchen");
    expect(titleCase("HOUSE - KITCHEN")).toBe("House - Kitchen");
    expect(titleCase("ANA'S MID-CENTURY FLAT")).toBe("Ana's Mid-Century Flat");
    expect(titleCase("ST. MARY'S / U.S. EMBASSY")).toBe("St. Mary's / U.S. Embassy");
  });
  it("keeps short words lowercase inside a part when asked", () => {
    expect(titleCase("TOP OF THE STAIRS", { minorWords: true })).toBe("Top of the Stairs");
    expect(titleCase("BACK TO SCENE", { minorWords: true })).toBe("Back to Scene");
    expect(titleCase("THE HOUSE - ON THE ROOF", { minorWords: true })).toBe("The House - On the Roof");
    expect(titleCase("WHAT IT COMES TO", { minorWords: true })).toBe("What It Comes To");
    expect(titleCase("TOP OF THE STAIRS")).toBe("Top Of The Stairs");
  });
  it("keeps A.M. and P.M. in capitals", () => {
    expect(titleCase("MORNING, 7 A.M.", { minorWords: true, times: true })).toBe("Morning, 7 A.M.");
    expect(titleCase("late p.m.", { times: true })).toBe("Late P.M.");
    expect(titleCase("7AM", { times: true })).toBe("7AM");
    expect(titleCase("10:30 pm")).toBe("10:30 PM");
    expect(titleCase("EARLY AM", { times: true })).toBe("Early AM");
    expect(titleCase("I AM BAR")).toBe("I Am Bar");
  });
});

describe("characterName", () => {
  it("drops extensions and title-cases", () => {
    expect(characterName("ANA")).toBe("Ana");
    expect(characterName("BEN (V.O.)")).toBe("Ben");
    expect(characterName("BEN (O.S.) (CONT'D)")).toBe("Ben");
    expect(characterName("CAROL CONT’D")).toBe("Carol");
    expect(characterName("MRS. O'BRIEN")).toBe("Mrs. O'Brien");
    expect(characterName("JEAN-LUC ^")).toBe("Jean-Luc");
    expect(characterName("BEN'S MOM")).toBe("Ben's Mom");
    expect(characterName("(V.O.)")).toBe("");
  });
});

describe("buildScenes", () => {
  const script = [
    a("FADE IN:"),
    h("INT. KITCHEN - DAY"),
    c("ANA"), d("Morning."), c("BEN (O.S.)"), d("Hi!"), c("ANA (CONT'D)"), d("Coffee?"),
    h("EXT. GARDEN - NIGHT"),
    c("BEN (V.O.)"), d("Later that night…"),
    h("INTERCUT - PHONE CALL"),
    c("CAROL"), d("Hello?"),
    h("BACK TO SCENE"),
    c("MRS. O'BRIEN"), d("Who was it?"),
    h("I/E CAR - MOVING - CONTINUOUS"),
    a("Ana drives. Ben sleeps."),
  ];

  it("title-cases Location and Time, keeping A.M./P.M.", () => {
    expect(buildScenes([h("EXT. TOP OF THE HILL - DAWN, 5 A.M.")])[0]).toMatchObject({ location: "Top of the Hill", time: "Dawn, 5 A.M." });
    expect(buildScenes([h("INT. ANA'S FLAT - 11PM")])[0]).toMatchObject({ location: "Ana's Flat", time: "11PM" });
  });

  it("finds scenes, subscenes and speaking characters in order, in title case", () => {
    expect(buildScenes(script)).toEqual([
      { sceneNumber: "1", intExt: "INT.", location: "Kitchen", time: "Day", characters: ["Ana", "Ben"] },
      { sceneNumber: "2", intExt: "EXT.", location: "Garden", time: "Night", characters: ["Ben"] },
      { sceneNumber: "2.1", intExt: "", location: "Intercut - Phone Call", time: "", characters: ["Carol"] },
      { sceneNumber: "2.2", intExt: "", location: "Back to Scene", time: "", characters: ["Mrs. O'Brien"] },
      { sceneNumber: "3", intExt: "INT./EXT.", location: "Car - Moving", time: "Continuous", characters: [] },
    ]);
  });

  it("keeps the script's numbers, mapping letters", () => {
    const numbered = [h("INT. A", "5"), h("INT. B", "5A"), h("INT. C", "6"), h("INT. D", "A7"), h("INT. E", "7"), h("INT. F", "7B")];
    expect(buildScenes(numbered).map((s) => s.sceneNumber)).toEqual(["5", "5.1", "6", "6.1", "7", "7.2"]);
  });

  it("renumbers 1, 2, 3 when numbers are missing, out of order or clash", () => {
    expect(buildScenes([h("INT. A", "4"), h("INT. B")]).map((s) => s.sceneNumber)).toEqual(["1", "2"]);
    expect(buildScenes([h("INT. A", "4"), h("INT. B", "3")]).map((s) => s.sceneNumber)).toEqual(["1", "2"]);
    expect(buildScenes([h("INT. A", "5A"), h("INT. B", "A6")]).map((s) => s.sceneNumber)).toEqual(["1", "2"]);
  });

  it("fits a subscene between the scene above and a lettered scene below", () => {
    const s = buildScenes([h("INT. A", "2"), h("FLASHBACK"), h("INT. B", "2A"), h("INT. C", "3")]);
    expect(s.map((x) => x.sceneNumber)).toEqual(["2", "2.0.1", "2.1", "3"]);
  });

  it("ignores other headings and cues before the first scene", () => {
    expect(buildScenes([h("MONTAGE"), c("NARRATOR"), h("INT. A - DAY"), c("ANA")])).toEqual([
      { sceneNumber: "1", intExt: "INT.", location: "A", time: "Day", characters: ["Ana"] },
    ]);
  });

  it("returns nothing when there are no INT./EXT. headings", () => {
    expect(buildScenes([a("Just some text"), c("ANA"), d("Hi")])).toEqual([]);
  });
});
