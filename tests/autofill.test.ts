import { describe, expect, it } from "vitest";
import { appendScenes, mergeScenes, scenesToRows, scriptSummary, sheetIsEmpty } from "@/lib/autofill";
import { ROW_KIND } from "@/lib/constants";
import { emptyRow, type RowData } from "@/lib/rows";
import type { ScriptScene } from "@/lib/scriptParse/scenes";

const scene = (sceneNumber: string, location: string, characters: string[] = [], extra: Partial<ScriptScene> = {}): ScriptScene => ({
  sceneNumber, intExt: "INT.", location, time: "DAY", characters, segment: 0, heading: `INT. ${location} - DAY`, ...extra,
});
const sceneRow = (sceneNumber: string, fields: Partial<RowData> = {}): RowData => ({ ...emptyRow(ROW_KIND.SCENE), sceneNumber, ...fields });
const shot = (subject: string): RowData => ({ ...emptyRow(ROW_KIND.SHOT), subject });
const same = (r: RowData) => r;
const view = (rows: RowData[]) => rows.map((r) => (r.kind === ROW_KIND.SCENE ? `${r.sceneNumber}:${r.intExt}|${r.location}|${r.time}|${r.characters}` : `-${r.subject}`));

describe("sheetIsEmpty / scriptSummary", () => {
  it("treats a new shotlist as empty", () => {
    expect(sheetIsEmpty([sceneRow("1"), emptyRow(ROW_KIND.SHOT)])).toBe(true);
    expect(sheetIsEmpty([sceneRow("1"), shot(" x ")])).toBe(false);
  });
  it("counts scenes and distinct characters", () => {
    expect(scriptSummary([scene("1", "A", ["Ana", "Ben"]), scene("2", "B", ["ben", "Carol"])])).toEqual({ scenes: 2, characters: 3 });
  });
});

describe("scenesToRows", () => {
  it("makes one scene row per scene, characters comma-separated", () => {
    expect(view(scenesToRows([scene("1", "KITCHEN", ["Ana", "Ben"]), scene("1.1", "INTERCUT", [], { intExt: "", time: "" })], "v1"))).toEqual([
      "1:INT.|KITCHEN|DAY|Ana, Ben",
      "1.1:|INTERCUT||",
    ]);
  });
});

describe("mergeScenes", () => {
  const rows = [sceneRow("1", { location: "MY KITCHEN" }), shot("a"), sceneRow("3"), shot("b"), sceneRow("9", { characters: "Zed" })];
  const script = [scene("1", "KITCHEN", ["Ana"]), scene("2", "HALL"), scene("3", "GARDEN", ["Ben"]), scene("10", "ROOF")];

  it("fills empty cells only, keeps shots and extra scenes, adds missing scenes in order", () => {
    expect(view(mergeScenes(rows, script, same, "v1"))).toEqual([
      "1:INT.|MY KITCHEN|DAY|Ana", // typed location kept, empty cells filled
      "-a",
      "2:INT.|HALL|DAY|", // added after scene 1's shots
      "3:INT.|GARDEN|DAY|Ben",
      "-b",
      "9:|||Zed", // not in the script: unchanged
      "10:INT.|ROOF|DAY|",
    ]);
  });

  it("uses the factory for new rows only", () => {
    const made: string[] = [];
    mergeScenes(rows, script, (r) => (made.push(r.sceneNumber), r), "v1");
    expect(made).toEqual(["2", "10"]);
  });
});

describe("appendScenes", () => {
  it("continues numbering after the last scene, keeping script subscenes under their scene", () => {
    const rows = [sceneRow("1"), shot("a"), sceneRow("20.3")];
    const script = [scene("1", "A"), scene("1.1", "INTERCUT"), scene("2", "B"), scene("5", "C")];
    expect(appendScenes(rows, script, same, "v1").map((r) => (r.kind === ROW_KIND.SCENE ? r.sceneNumber : "-"))).toEqual(["1", "-", "20.3", "21", "21.1", "22", "23"]);
  });
  it("starts at 1 on a sheet with no scenes", () => {
    expect(appendScenes([shot("a")], [scene("4", "A"), scene("4.0.1", "B")], same, "v1").map((r) => r.sceneNumber)).toEqual(["", "1", "1.0.1"]);
  });
  it("gives a leading subscene (A1 → 0.1) its own number", () => {
    expect(appendScenes([sceneRow("3")], [scene("0.1", "A"), scene("1", "B")], same, "v1").map((r) => r.sceneNumber)).toEqual(["3", "4.1", "5"]);
  });
});

describe("script links from autofill", () => {
  it("links new and filled-in scenes to their script scene, keeping existing links", () => {
    const rows = scenesToRows([scene("1", "KITCHEN", [], { segment: 3, heading: "INT. KITCHEN - DAY" })], "v1");
    expect(JSON.parse(rows[0].scriptLink)).toEqual({ v: "v1", scene: 3, heading: "INT. KITCHEN - DAY" });
    const existing = [sceneRow("1"), sceneRow("2", { scriptLink: '{"v":"v0","scene":7,"heading":"X"}' })];
    const merged = mergeScenes(existing, [scene("1", "A", [], { segment: 0 }), scene("2", "B", [], { segment: 1 })], same, "v1");
    expect(JSON.parse(merged[0].scriptLink).scene).toBe(0);
    expect(JSON.parse(merged[1].scriptLink).scene).toBe(7);
  });
});
