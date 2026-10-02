// Auto-scroll while dragging (browser only). Called once per animation frame with the pointer's
// position, so scrolling continues while the pointer is held still.

/** Within this many pixels of a visible edge (or past it), a drag scrolls. */
export const SCROLL_EDGE = 32;

/**
 * One frame of drag auto-scroll. If the pointer is near (or past) the visible top or bottom edge of
 * `el` — clipped to the window, and below `topInset` (e.g. a sticky header) — scroll `el` that way,
 * faster the further in; once `el` can't scroll further, scroll the page if part of `el` is out of
 * view that way. Returns whether anything scrolled (so the drop target can be recomputed).
 */
export function autoScrollStep(el: HTMLElement, pointerY: number, topInset = 0): boolean {
  const box = el.getBoundingClientRect();
  const top = Math.max(box.top + topInset, 0) + SCROLL_EDGE;
  const bottom = Math.min(box.bottom, window.innerHeight) - SCROLL_EDGE;
  const into = pointerY < top ? pointerY - top : pointerY > bottom ? pointerY - bottom : 0;
  if (into === 0) return false;
  // Whole pixels, at least 1, at most 24 per frame.
  const delta = Math.sign(into) * Math.min(24, Math.max(1, Math.round(Math.abs(into) / 3)));
  const before = el.scrollTop;
  el.scrollTop += delta;
  if (el.scrollTop !== before) return true;
  if ((delta > 0 && box.bottom > window.innerHeight) || (delta < 0 && box.top < 0)) {
    const pageBefore = window.scrollY;
    window.scrollBy(0, delta);
    return window.scrollY !== pageBefore;
  }
  return false;
}
