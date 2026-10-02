import { describe, expect, it } from "vitest";
import {
  addCharacters,
  charactersInRows,
  moveCharacter,
  parseCharacters,
  removeCharacter,
  renameCharacter,
  scenesWith,
  scriptCharacters,
  sortAllCells,
  sortCell,
} from "@/lib/characters";
import { ROW_KIND } from "@/lib/constants";
import { emptyRow, type RowData } from "@/lib/rows";

const scene = (n: string, characters: string): RowData => ({ ...emptyRow(ROW_KIND.SCENE), sceneNumber: n, characters });
const shot = (subject: string): RowData => ({ ...emptyRow(ROW_KIND.SHOT), subject });
const cells = (rows: RowData[]) => rows.filter((r) => r.kind === ROW_KIND.SCENE).map((r) => r.characters);

describe("parsing and building lists", () => {
  it("splits cells on commas, dropping blanks and repeats", () => {
    expect(parseCharacters(" Ana ,  ben,, ANA , Mrs.  O'Brien")).toEqual(["Ana", "ben", "Mrs. O'Brien"]);
    expect(parseCharacters("")).toEqual([]);
  });
  it("appends only names the list doesn't have", () => {
    expect(addCharacters(["Ana", "Ben"], ["ben", "Carol", "ana", "Dev"])).toEqual(["Ana", "Ben", "Carol", "Dev"]);
  });
  it("collects names from cells in order of first appearance, ignoring shots", () => {
    expect(charactersInRows([scene("1", "Ben, Ana"), shot("Zed"), scene("2", "Carol, ana")])).toEqual(["Ben", "Ana", "Carol"]);
  });
  it("orders a script's characters by first mention", () => {
    const s = (characters: string[]) => ({ sceneNumber: "1", intExt: "", location: "", time: "", characters });
    expect(scriptCharacters([s(["Ben", "Ana"]), s(["Carol", "Ben"]), s([])])).toEqual(["Ben", "Ana", "Carol"]);
  });
});

describe("cells follow the list", () => {
  const list = ["Ana", "Ben", "Carol"];
  it("sorts a cell into list order with the list's spelling, unknown names last", () => {
    expect(sortCell("carol, Zed, ana", list)).toBe("Ana, Carol, Zed");
    expect(sortCell("", list)).toBe("");
  });
  it("sorts every scene cell and keeps untouched rows as they are", () => {
    const rows = [scene("1", "Ana, Ben"), shot("x"), scene("2", "Carol, Ana")];
    const sorted = sortAllCells(rows, list);
    expect(cells(sorted)).toEqual(["Ana, Ben", "Ana, Carol"]);
    expect(sorted[0]).toBe(rows[0]);
    expect(sorted[1]).toBe(rows[1]);
  });
  it("re-sorts every cell when the list is reordered", () => {
    const reordered = moveCharacter(list, 2, 0);
    expect(reordered).toEqual(["Carol", "Ana", "Ben"]);
    expect(cells(sortAllCells([scene("1", "Ana, Ben, Carol")], reordered))).toEqual(["Carol, Ana, Ben"]);
    expect(moveCharacter(list, 0, 2)).toEqual(["Ben", "Carol", "Ana"]);
  });
  it("counts the scenes a character is in", () => {
    expect(scenesWith([scene("1", "Ana, Ben"), scene("2", "ben"), scene("3", "Carol")], "Ben")).toBe(2);
  });
});

describe("renameCharacter", () => {
  const list = ["Ana", "Ben"];
  const rows = [scene("1", "Ana, Ben"), shot("Ben"), scene("2", "ben")];
  it("renames in the list and every scene (not shots)", () => {
    const r = renameCharacter(rows, list, 1, " Benjamin ");
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.list).toEqual(["Ana", "Benjamin"]);
      expect(cells(r.rows)).toEqual(["Ana, Benjamin", "Benjamin"]);
      expect(r.rows[1]).toBe(rows[1]);
    }
  });
  it("can fix capitalisation of the same name", () => {
    expect(renameCharacter(rows, list, 1, "BEN")).toMatchObject({ status: "ok", list: ["Ana", "BEN"] });
  });
  it("refuses blanks, clashes and no-ops", () => {
    expect(renameCharacter(rows, list, 1, "  ")).toMatchObject({ status: "empty" });
    expect(renameCharacter(rows, list, 1, ",")).toMatchObject({ status: "empty" });
    expect(renameCharacter(rows, list, 1, "ana")).toMatchObject({ status: "exists", name: "ana" });
    expect(renameCharacter(rows, list, 1, "Ben")).toMatchObject({ status: "unchanged" });
  });
});

describe("removeCharacter", () => {
  it("removes from the list and every scene", () => {
    const r = removeCharacter([scene("1", "Ana, Ben"), scene("2", "BEN")], ["Ana", "Ben"], 1);
    expect(r.list).toEqual(["Ana"]);
    expect(cells(r.rows)).toEqual(["Ana", ""]);
  });
});
