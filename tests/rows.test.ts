import { describe, expect, it } from "vitest";
import { ROW_KIND } from "@/lib/constants";
import { cleanRow, emptyRow, rowLabels, shotLetters } from "@/lib/rows";

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
