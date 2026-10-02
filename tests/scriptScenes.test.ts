import { describe, expect, it } from "vitest";
import { buildScenes, buildScriptDoc, characterName, displayHeading, docElements, mapScriptNumber, parseHeading, scenesFromDoc, titleCase, type ScriptElement } from "@/lib/scriptParse/scenes";

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

describe("displayHeading", () => {
  it("keeps Int./Ext. in capitals and title-cases the rest, like autofill", () => {
    expect(displayHeading("INT. MOM'S KITCHEN - NIGHT")).toBe("INT. Mom's Kitchen - Night");
    expect(displayHeading("int./ext. top of the stairs -- 7 a.m.")).toBe("INT./EXT. Top of the Stairs - 7 A.M.");
    expect(displayHeading("EXT. GARDEN")).toBe("EXT. Garden");
    expect(displayHeading("INTERCUT - PHONE CALL")).toBe("Intercut - Phone Call");
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
  it("straightens curly apostrophes", () => {
    expect(titleCase("EVIL FELIX’S LAIR", { minorWords: true })).toBe("Evil Felix's Lair");
    expect(titleCase("MAYOR‘S OFFICE")).toBe("Mayor's Office");
    expect(characterName("MRS. O’BRIEN")).toBe(characterName("MRS. O'BRIEN"));
  });
  it("keeps roman numerals in capitals", () => {
    expect(titleCase("EVIL QUINCY’S LAIR, EARTH II", { minorWords: true })).toBe("Evil Quincy's Lair, Earth II");
    expect(titleCase("PART IV (FLASHBACK) - YEAR XXIII", { minorWords: true })).toBe("Part IV (Flashback) - Year XXIII");
    expect(titleCase("CHAPTER VI, ROOM XI", { minorWords: true })).toBe("Chapter VI, Room XI");
    expect(titleCase("EARTH I")).toBe("Earth I");
    expect(characterName("HENRY VIII")).toBe("Henry VIII");
    expect(characterName("VI")).toBe("Vi");
    expect(characterName("XI JINPING")).toBe("Xi Jinping");
  });
  it("leaves words that only look like numerals alone", () => {
    expect(titleCase("MIX DIVISION LIV CIVIC VIX IIV", { minorWords: true })).toBe("Mix Division Liv Civic Vix Iiv");
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
      { sceneNumber: "1", intExt: "INT.", location: "Kitchen", time: "Day", characters: ["Ana", "Ben"], segment: 0, heading: "INT. KITCHEN - DAY" },
      { sceneNumber: "2", intExt: "EXT.", location: "Garden", time: "Night", characters: ["Ben"], segment: 1, heading: "EXT. GARDEN - NIGHT" },
      { sceneNumber: "2.1", intExt: "", location: "Intercut - Phone Call", time: "", characters: ["Carol"], segment: 2, heading: "INTERCUT - PHONE CALL" },
      { sceneNumber: "2.2", intExt: "", location: "Back to Scene", time: "", characters: ["Mrs. O'Brien"], segment: 3, heading: "BACK TO SCENE" },
      { sceneNumber: "3", intExt: "INT./EXT.", location: "Car - Moving", time: "Continuous", characters: [], segment: 4, heading: "I/E CAR - MOVING - CONTINUOUS" },
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
      { sceneNumber: "1", intExt: "INT.", location: "A", time: "Day", characters: ["Ana"], segment: 0, heading: "INT. A - DAY" },
    ]);
  });

  it("returns nothing when there are no INT./EXT. headings", () => {
    expect(buildScenes([a("Just some text"), c("ANA"), d("Hi")])).toEqual([]);
  });
});

describe("buildScriptDoc", () => {
  const els: ScriptElement[] = [
    { type: "transition", text: "FADE IN:" },
    { type: "heading", text: "MONTAGE" },
    { type: "heading", text: "INT. KITCHEN - DAY", number: "4" },
    { type: "action", text: "Ana pours coffee." },
    { type: "character", text: "ANA" },
    { type: "dialogue", text: "Morning." },
    { type: "heading", text: "INTERCUT - PHONE" },
    { type: "character", text: "BEN (V.O.)" },
    { type: "dialogue", text: "Hi." },
  ];
  it("splits the script into one segment per scene, dropping what comes before the first", () => {
    expect(buildScriptDoc(els)).toEqual({
      segments: [
        { heading: "INT. KITCHEN - DAY", number: "4", paragraphs: [
          { type: "action", text: "Ana pours coffee." }, { type: "character", text: "ANA" }, { type: "dialogue", text: "Morning." },
        ] },
        { heading: "INTERCUT - PHONE", paragraphs: [{ type: "character", text: "BEN (V.O.)" }, { type: "dialogue", text: "Hi." }] },
      ],
    });
  });
  it("lines segments up with scenes, and a stored doc gives the same scenes", () => {
    const doc = buildScriptDoc(els);
    const scenes = buildScenes(els);
    expect(scenes.map((s) => [s.segment, s.heading])).toEqual([[0, "INT. KITCHEN - DAY"], [1, "INTERCUT - PHONE"]]);
    expect(scenesFromDoc(doc)).toEqual(scenes);
    expect(buildScenes(docElements(doc))).toEqual(scenes);
  });
});
