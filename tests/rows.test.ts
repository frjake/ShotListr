import { describe, expect, it } from "vitest";
import { ROW_KIND } from "@/lib/constants";
import { blockEnd, cleanRow, deleteRows, dropTargets, emptyRow, moveRows, rowLabels, shotLetters, stepTarget } from "@/lib/rows";

const { SCENE, SHOT } = ROW_KIND;

describe("shotLetters", () => {
  it("counts like spreadsheet columns", () => {
    expect([1, 2, 26, 27, 28, 52, 53, 702, 703].map(shotLetters)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });
});

describe("rowLabels", () => {
  it("numbers scenes and letters shots within each scene", () => {
    expect(rowLabels([SCENE, SHOT, SHOT, SCENE, SHOT])).toEqual(["1", "1A", "1B", "2", "2A"]);
  });
  it("restarts letters after each scene, even an empty one", () => {
    expect(rowLabels([SCENE, SCENE, SHOT])).toEqual(["1", "2", "2A"]);
  });
  it("gives shots above the first scene letters only", () => {
    expect(rowLabels([SHOT, SHOT, SCENE, SHOT])).toEqual(["A", "B", "1", "1A"]);
  });
  it("renumbers when a scene is inserted between shots", () => {
    expect(rowLabels([SCENE, SHOT, SCENE, SHOT])).toEqual(["1", "1A", "2", "2A"]);
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
