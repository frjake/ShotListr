import { describe, expect, it } from "vitest";
import { ROW_KIND } from "@/lib/constants";
import {
  blockEnd,
  cleanRow,
  deleteRows,
  dropTargets,
  emptyRow,
  exportTable,
  renumberAfterDelete,
  moveRows,
  planSceneAt,
  renumberScene,
  rowLabels,
  shiftScenes,
  shotLetters,
  stepTarget,
} from "@/lib/rows";

const { SCENE, SHOT } = ROW_KIND;

describe("shotLetters", () => {
  it("counts like spreadsheet columns", () => {
    expect([1, 2, 26, 27, 28, 52, 53, 702, 703].map(shotLetters)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });
});

/** Rows from a compact spec: "12" is a scene numbered 12, "-" is a shot (named by position). */
const sheetOf = (...spec: string[]) =>
  spec.map((x, i) => (x === "-" ? { kind: SHOT, sceneNumber: "", name: `shot${i}` } : { kind: SCENE, sceneNumber: x, name: `scene${x}` }));
const numbersOf = (rows: { sceneNumber: string; kind: string }[]) => rows.map((r) => (r.kind === SCENE ? r.sceneNumber : "-")).join(" ");

describe("rowLabels", () => {
  it("shows scene numbers and letters shots within each scene", () => {
    expect(rowLabels(sheetOf("1", "-", "-", "2", "-"))).toEqual(["1", "1A", "1B", "2", "2A"]);
  });
  it("uses manual and subscene numbers", () => {
    expect(rowLabels(sheetOf("3", "-", "12.1", "-", "-", "20"))).toEqual(["3", "3A", "12.1", "12.1A", "12.1B", "20"]);
  });
  it("gives shots above the first scene letters only", () => {
    expect(rowLabels(sheetOf("-", "-", "1", "-"))).toEqual(["A", "B", "1", "1A"]);
  });
  it("handles an empty list", () => {
    expect(rowLabels([])).toEqual([]);
  });
});

describe("cleanRow", () => {
  it("keeps only the fields that belong to the row's kind", () => {
    const row = { ...emptyRow(SCENE), location: "Kitchen", subject: "stray" };
    expect(cleanRow(row)).toEqual({ ...emptyRow(SCENE), location: "Kitchen" });
    const shot = { ...emptyRow(SHOT), framing: "CU", time: "stray" };
    expect(cleanRow(shot)).toEqual({ ...emptyRow(SHOT), framing: "CU" });
  });
});

// S1 a S2 b c S3  — indices 0..5
const sheet = [SCENE, SHOT, SCENE, SHOT, SHOT, SCENE];
const names = ["S1", "a", "S2", "b", "c", "S3"];

describe("blockEnd", () => {
  it("spans a scene and its shots", () => {
    expect(blockEnd(sheet, 0)).toBe(2);
    expect(blockEnd(sheet, 2)).toBe(5);
    expect(blockEnd(sheet, 5)).toBe(6);
  });
  it("is just the row for a shot", () => {
    expect(blockEnd(sheet, 3)).toBe(4);
  });
});

describe("dropTargets", () => {
  it("lets a shot go anywhere", () => {
    expect(dropTargets(sheet, 3)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("only lets a scene go between scenes, never inside its own block", () => {
    expect(dropTargets(sheet, 0)).toEqual([0, 2, 5, 6]);
    expect(dropTargets(sheet, 2)).toEqual([0, 2, 5, 6]);
  });
  it("never puts a scene above shots that have no scene", () => {
    expect(dropTargets([SHOT, SCENE, SHOT, SCENE], 3)).toEqual([1, 3, 4]);
  });
});

describe("moveRows", () => {
  it("moves a shot down into another scene", () => {
    expect(moveRows(names, 1, 1, 4)).toEqual(["S1", "S2", "b", "a", "c", "S3"]);
  });
  it("moves a shot up", () => {
    expect(moveRows(names, 4, 1, 1)).toEqual(["S1", "c", "a", "S2", "b", "S3"]);
  });
  it("moves a scene block down past the next scene", () => {
    expect(moveRows(names, 0, 2, 5)).toEqual(["S2", "b", "c", "S1", "a", "S3"]);
  });
  it("moves a scene block to the end", () => {
    expect(moveRows(names, 2, 3, 6)).toEqual(["S1", "a", "S3", "S2", "b", "c"]);
  });
  it("is a no-op at the block's own boundaries", () => {
    expect(moveRows(names, 2, 3, 2)).toEqual(names);
    expect(moveRows(names, 2, 3, 5)).toEqual(names);
  });
});

describe("stepTarget", () => {
  it("steps a shot one row at a time", () => {
    expect(stepTarget(sheet, 3, -1)).toBe(2);
    expect(stepTarget(sheet, 3, 1)).toBe(5);
  });
  it("steps a scene block past whole neighbouring blocks", () => {
    expect(moveRows(names, 0, 2, stepTarget(sheet, 0, 1)!)).toEqual(["S2", "b", "c", "S1", "a", "S3"]);
    expect(moveRows(names, 5, 1, stepTarget(sheet, 5, -1)!)).toEqual(["S1", "a", "S3", "S2", "b", "c"]);
  });
  it("returns null at the edges", () => {
    expect(stepTarget(sheet, 0, -1)).toBeNull();
    expect(stepTarget(sheet, 5, 1)).toBeNull();
    expect(stepTarget([SHOT, SCENE], 1, -1)).toBeNull();
  });
});

describe("deleteRows", () => {
  it("removes a scene and its shots, or just the scene", () => {
    expect(deleteRows(names, 2, blockEnd(sheet, 2) - 2)).toEqual(["S1", "a", "S3"]);
    expect(deleteRows(names, 2, 1)).toEqual(["S1", "a", "b", "c", "S3"]);
  });
});

describe("planSceneAt", () => {
  it("takes the next whole number without asking when no scene is below", () => {
    expect(planSceneAt(sheetOf("12"), 1)).toEqual({ type: "free", number: "13" });
    expect(planSceneAt(sheetOf("12.1", "-"), 2)).toEqual({ type: "free", number: "13" });
    expect(planSceneAt(sheetOf("-"), 0)).toEqual({ type: "free", number: "1" });
    expect(planSceneAt([], 0)).toEqual({ type: "free", number: "1" });
  });
  it("offers subscene, shift until the gap, or shift everything", () => {
    expect(planSceneAt(sheetOf("12", "13", "14", "16", "17"), 1)).toEqual({
      type: "choose",
      after: "12",
      before: "13",
      subscene: "12.1",
      number: "13",
      untilGap: { from: "13", to: "14", newFrom: "14", newTo: "15" },
      all: { from: "13", to: "17", newFrom: "14", newTo: "18" },
    });
  });
  it("still asks when the whole number is free; shifting until the gap moves nothing", () => {
    expect(planSceneAt(sheetOf("12", "-", "15", "20"), 2)).toEqual({
      type: "choose",
      after: "12",
      before: "15",
      subscene: "12.1",
      number: "13",
      untilGap: null,
      all: { from: "15", to: "20", newFrom: "16", newTo: "21" },
    });
    expect(planSceneAt(sheetOf("-", "5"), 0)).toMatchObject({ after: null, number: "1", untilGap: null, subscene: "0.1" });
    expect(planSceneAt(sheetOf("12.1", "15"), 1)).toMatchObject({ number: "13", untilGap: null, subscene: "12.2" });
  });
  it("gives the same shift both ways when there's no gap", () => {
    const p = planSceneAt(sheetOf("1", "1.1", "2", "3"), 2);
    expect(p).toMatchObject({ number: "2", subscene: "1.2" });
    expect(p.type === "choose" && p.untilGap).toEqual(p.type === "choose" && p.all);
  });
  it("takes the scene below's number when it's a subscene of the one above", () => {
    expect(planSceneAt(sheetOf("12", "12.1", "12.2", "12.5"), 1)).toMatchObject({
      number: "12.1",
      subscene: "12.0.1",
      untilGap: { from: "12.1", to: "12.2" },
      all: { from: "12.1", to: "12.5" },
    });
  });
  it("looks past shots to find the neighbouring scenes", () => {
    expect(planSceneAt(sheetOf("12", "-", "-", "13"), 2)).toMatchObject({ before: "13", subscene: "12.1" });
  });
});

describe("shiftScenes", () => {
  it("renumbers the given range and leaves shots alone", () => {
    const rows = sheetOf("12", "13", "-", "14", "16");
    expect(numbersOf(shiftScenes(rows, { from: "13", to: "14", newFrom: "14", newTo: "15" }, 1))).toBe("12 14 - 15 16");
    expect(numbersOf(shiftScenes(rows, { from: "13", to: "16", newFrom: "14", newTo: "17" }, 1))).toBe("12 14 - 15 17");
  });
});

describe("renumberScene", () => {
  const rows = sheetOf("1", "-", "2", "-", "-", "5");
  it("moves the scene and its shots to where the new number belongs", () => {
    const r = renumberScene(rows, 0, "3");
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(numbersOf(r.rows)).toBe("2 - - 3 - 5");
      expect(r.rows[4].name).toBe("shot1"); // scene 1's shot travelled with it
    }
  });
  it("can move a scene to the top or bottom", () => {
    const up = renumberScene(rows, 5, "0.5");
    expect(up.status === "ok" && numbersOf(up.rows)).toBe("0.5 1 - 2 - -");
    const down = renumberScene(rows, 0, "9");
    expect(down.status === "ok" && numbersOf(down.rows)).toBe("2 - - 5 9 -");
  });
  it("keeps the position when the order doesn't change", () => {
    const r = renumberScene(rows, 2, "4");
    expect(r.status === "ok" && numbersOf(r.rows)).toBe("1 - 4 - - 5");
  });
  it("normalizes the number", () => {
    expect(renumberScene(rows, 2, " 04 ")).toMatchObject({ status: "ok", number: "4" });
  });
  it("refuses numbers that exist, are invalid, or haven't changed", () => {
    expect(renumberScene(rows, 0, "5")).toMatchObject({ status: "exists", number: "5" });
    expect(renumberScene(rows, 0, "05")).toMatchObject({ status: "exists", number: "5" });
    expect(renumberScene(rows, 0, "2.0")).toMatchObject({ status: "invalid" });
    expect(renumberScene(rows, 0, "abc")).toMatchObject({ status: "invalid" });
    expect(renumberScene(rows, 0, "1")).toMatchObject({ status: "unchanged" });
  });
  it("keeps shots that have no scene at the top", () => {
    const r = renumberScene(sheetOf("-", "3", "7"), 2, "1");
    expect(r.status === "ok" && numbersOf(r.rows)).toBe("- 1 3");
  });
});

describe("renumberAfterDelete", () => {
  it("offers until-the-gap and all when they differ", () => {
    expect(renumberAfterDelete(sheetOf("1", "2", "3", "4", "6", "7"), 2)).toEqual({
      untilGap: { from: "4", to: "4", newFrom: "3", newTo: "3" },
      all: { from: "4", to: "7", newFrom: "3", newTo: "6" },
    });
  });
  it("drops until-the-gap when there's no gap", () => {
    expect(renumberAfterDelete(sheetOf("1", "2", "3", "4"), 1)).toEqual({
      untilGap: null,
      all: { from: "3", to: "4", newFrom: "2", newTo: "3" },
    });
  });
  it("drops until-the-gap when the next number is free (it would change nothing)", () => {
    expect(renumberAfterDelete(sheetOf("1", "2", "5", "7"), 1)).toEqual({
      untilGap: null,
      all: { from: "5", to: "7", newFrom: "4", newTo: "6" },
    });
  });
  it("works inside a parent scene", () => {
    expect(renumberAfterDelete(sheetOf("12", "12.1", "12.2", "12.4", "13"), 1)).toEqual({
      untilGap: { from: "12.2", to: "12.2", newFrom: "12.1", newTo: "12.1" },
      all: { from: "12.2", to: "12.4", newFrom: "12.1", newTo: "12.3" },
    });
  });
  it("is null when no scene comes after it", () => {
    expect(renumberAfterDelete(sheetOf("1", "2"), 1)).toBeNull();
    expect(renumberAfterDelete(sheetOf("12", "12.1", "13"), 1)).toBeNull(); // 13 isn't a sibling of 12.1
  });
  it("is null when a subscene still uses the number", () => {
    expect(renumberAfterDelete(sheetOf("12", "12.1", "13"), 0)).toBeNull();
  });
});

describe("exportTable", () => {
  it("has one combined header and each row's number and fields in order", () => {
    const rows = [
      { ...emptyRow(SCENE), sceneNumber: "12", intExt: "INT.", location: "Kitchen", time: "DAY", characters: "Ana" },
      { ...emptyRow(SHOT), subject: "Ana", framing: "CU", angle: "Low angle", description: "Pours tea" },
      { ...emptyRow(SCENE), sceneNumber: "12.1" },
    ];
    expect(exportTable(rows)).toEqual([
      ["Scene #/Shot #", "Int./Ext./Subject", "Location/Framing", "Time/Angle", "Characters/Description"],
      ["12", "INT.", "Kitchen", "DAY", "Ana"],
      ["12A", "Ana", "CU", "Low angle", "Pours tea"],
      ["12.1", "", "", "", ""],
    ]);
  });
});
