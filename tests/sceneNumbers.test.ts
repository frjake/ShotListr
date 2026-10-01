import { describe, expect, it } from "vitest";
import {
  compareSceneNumbers,
  isOccupied,
  nextSceneNumber,
  normalizeSceneNumber,
  parseSceneNumber,
  siblingRange,
  runRange,
  shiftRange,
  subsceneBetween,
  type SceneNumber,
} from "@/lib/sceneNumbers";

const n = (s: string) => parseSceneNumber(s)!;
const f = (x: SceneNumber | null) => x && x.join(".");

describe("parseSceneNumber / normalizeSceneNumber", () => {
  it("accepts dot-separated whole numbers", () => {
    expect(parseSceneNumber("12")).toEqual([12]);
    expect(parseSceneNumber(" 12.0.1 ")).toEqual([12, 0, 1]);
    expect(parseSceneNumber("0.1")).toEqual([0, 1]);
    expect(normalizeSceneNumber("012.10")).toBe("12.10");
  });
  it("rejects anything else, including a trailing .0", () => {
    for (const bad of ["", "abc", "12.", ".5", "12..1", "-3", "1e3", "12A", "0", "12.0", "12.1.0"]) {
      expect(parseSceneNumber(bad)).toBeNull();
    }
  });
});

describe("compareSceneNumbers", () => {
  it("sorts part by part with each number before its subscenes", () => {
    const sorted = ["13", "12.2", "12.1.1", "12", "12.1", "12.0.1", "0.1", "2"].map(n).sort(compareSceneNumbers).map(f);
    expect(sorted).toEqual(["0.1", "2", "12", "12.0.1", "12.1", "12.1.1", "12.2", "13"]);
  });
});

describe("nextSceneNumber", () => {
  it("increments the last part", () => {
    expect(f(nextSceneNumber(n("12")))).toBe("13");
    expect(f(nextSceneNumber(n("12.1")))).toBe("12.2");
    expect(f(nextSceneNumber(null))).toBe("1");
  });
});

describe("subsceneBetween", () => {
  it("matches the examples", () => {
    expect(f(subsceneBetween(n("12"), n("13")))).toBe("12.1");
    expect(f(subsceneBetween(n("12.1"), n("12.2")))).toBe("12.1.1");
    expect(f(subsceneBetween(n("12"), n("12.1")))).toBe("12.0.1");
    expect(f(subsceneBetween(n("12"), n("12.0.1")))).toBe("12.0.0.1");
  });
  it("works at the top and the end", () => {
    expect(f(subsceneBetween(null, n("1")))).toBe("0.1");
    expect(f(subsceneBetween(n("4"), null))).toBe("4.1");
  });
});

describe("siblings", () => {
  const nums = ["12", "13", "13.1", "14", "16"].map(n);
  it("counts a number as occupied when it or a subscene exists", () => {
    expect(isOccupied(nums, n("13"))).toBe(true);
    expect(isOccupied([n("13.1")], n("13"))).toBe(true);
    expect(isOccupied(nums, n("15"))).toBe(false);
  });
  it("finds the first and last siblings at or after a number, across gaps", () => {
    const r = (nums: string[], start: string) => {
      const range = siblingRange(nums.map(n), n(start));
      return range && `${f(range.first)}–${f(range.last)}`;
    };
    expect(r(["12", "13", "13.1", "14", "16"], "13")).toBe("13–16");
    expect(r(["12", "13", "13.1", "14", "16"], "15")).toBe("16–16");
    expect(r(["12", "13", "16"], "17")).toBeNull();
    expect(r(["12", "12.1", "12.3", "13"], "12.2")).toBe("12.3–12.3");
  });
  it("finds the consecutive run up to the first gap", () => {
    const r = (nums: string[], start: string) => {
      const range = runRange(nums.map(n), n(start));
      return range && `${f(range.first)}–${f(range.last)}`;
    };
    expect(r(["12", "13", "13.1", "14", "16"], "13")).toBe("13–14");
    expect(r(["12", "13", "16"], "14")).toBeNull();
    expect(r(["12", "13.2", "14"], "13")).toBe("13–14"); // 13 is in use by its subscene
    expect(r(["12", "12.1", "12.2", "12.4", "13"], "12.1")).toBe("12.1–12.2");
  });
  it("shifts a range of siblings with their subscenes", () => {
    expect(shiftRange(nums, n("13"), n("14"), 1).map(f)).toEqual(["12", "14", "14.1", "15", "16"]);
    expect(shiftRange(nums, n("13"), n("16"), 1).map(f)).toEqual(["12", "14", "14.1", "15", "17"]);
    expect(shiftRange(["12", "14", "14.1", "15", "17"].map(n), n("14"), n("17"), -1).map(f)).toEqual(["12", "13", "13.1", "14", "16"]);
  });
  it("only shifts siblings inside the same parent", () => {
    expect(shiftRange(["12", "12.1", "12.2", "12.2.1", "12.4", "13"].map(n), n("12.1"), n("12.4"), 1).map(f)).toEqual(["12", "12.2", "12.3", "12.3.1", "12.5", "13"]);
  });
});
