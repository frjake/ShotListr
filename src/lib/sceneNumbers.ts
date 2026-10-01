// PURE scene-number helpers (tested in tests/sceneNumbers.test.ts). Safe to import from client components.
//
// A scene number is dot-separated whole numbers whose last part isn't 0: 12, 12.1, 12.0.1, 0.1.
// Numbers sort part by part, and a number comes before its own subscenes:
//   12 < 12.0.1 < 12.1 < 12.1.1 < 12.2 < 13

export type SceneNumber = number[];

export function parseSceneNumber(text: string): SceneNumber | null {
  const t = text.trim();
  if (!/^\d+(\.\d+)*$/.test(t)) return null;
  const parts = t.split(".").map(Number);
  if (parts.some((p) => !Number.isSafeInteger(p)) || parts.at(-1) === 0) return null;
  return parts;
}

export function formatSceneNumber(n: SceneNumber): string {
  return n.join(".");
}

/** "012.10" → "12.10"; null if it isn't a valid scene number. */
export function normalizeSceneNumber(text: string): string | null {
  const n = parseSceneNumber(text);
  return n && formatSceneNumber(n);
}

export function compareSceneNumbers(a: SceneNumber, b: SceneNumber): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/** The number a scene after `prev` normally gets: 12 → 13, 12.1 → 12.2 (1 at the very top). */
export function nextSceneNumber(prev: SceneNumber | null): SceneNumber {
  if (!prev) return [1];
  return [...prev.slice(0, -1), prev[prev.length - 1] + 1];
}

/**
 * The shortest subscene of `prev` (or of 0, at the very top) that still sorts before `next`:
 * 12 & 13 → 12.1, 12.1 & 12.2 → 12.1.1, 12 & 12.1 → 12.0.1. Requires prev < next.
 */
export function subsceneBetween(prev: SceneNumber | null, next: SceneNumber | null): SceneNumber {
  const base = prev ?? [0];
  for (let zeros = 0; ; zeros++) {
    const candidate = [...base, ...Array<number>(zeros).fill(0), 1];
    if (!next || compareSceneNumbers(candidate, next) < 0) return candidate;
  }
}

function hasPrefix(n: SceneNumber, prefix: SceneNumber) {
  return n.length >= prefix.length && prefix.every((p, i) => n[i] === p);
}

/** Whether `n` or any subscene of it is in use. */
export function isOccupied(numbers: readonly SceneNumber[], n: SceneNumber): boolean {
  return numbers.some((m) => hasPrefix(m, n));
}

/** Whether `n` is `start` or a later sibling of it (or a subscene of one): 13, 15, 15.1 for start 13. */
function isSameOrLaterSibling(n: SceneNumber, start: SceneNumber) {
  const level = start.length - 1;
  return hasPrefix(n, start.slice(0, -1)) && n.length > level && n[level] >= start[level];
}

/**
 * The first and last siblings in use at or after `start` ({13, 16} for start 13 in 12, 13, 14, 16;
 * {14, 16} for start 13 in 12, 14, 16), or null if there are none. Siblings share a parent: for
 * 12.1 they're 12.2, 12.3… but never 13.
 */
export function siblingRange(numbers: readonly SceneNumber[], start: SceneNumber): { first: SceneNumber; last: SceneNumber } | null {
  const level = start.length - 1;
  const parent = start.slice(0, -1);
  const values = numbers.filter((n) => isSameOrLaterSibling(n, start)).map((n) => n[level]);
  if (!values.length) return null;
  return { first: [...parent, Math.min(...values)], last: [...parent, Math.max(...values)] };
}

/**
 * The run of consecutive siblings in use starting at `start`, up to the first gap ({13, 14} for
 * start 13 in 12, 13, 14, 16), or null if `start` itself is free.
 */
export function runRange(numbers: readonly SceneNumber[], start: SceneNumber): { first: SceneNumber; last: SceneNumber } | null {
  if (!isOccupied(numbers, start)) return null;
  const parent = start.slice(0, -1);
  let v = start[start.length - 1];
  while (isOccupied(numbers, [...parent, v + 1])) v += 1;
  return { first: start, last: [...parent, v] };
}

/**
 * Adds `delta` to the siblings from `first` to `last` (subscenes move with their scene):
 * shiftRange([12, 13, 13.1, 14, 16], 13, 14, +1) → [12, 14, 14.1, 15, 16]. Callers make sure the
 * numbers shifted into are free (always true for +1 when `last` ends a run or is the last sibling).
 */
export function shiftRange(numbers: readonly SceneNumber[], first: SceneNumber, last: SceneNumber, delta: 1 | -1): SceneNumber[] {
  const level = first.length - 1;
  const parent = first.slice(0, -1);
  return numbers.map((n) =>
    hasPrefix(n, parent) && n.length > level && n[level] >= first[level] && n[level] <= last[level]
      ? [...n.slice(0, level), n[level] + delta, ...n.slice(level + 1)]
      : [...n],
  );
}
