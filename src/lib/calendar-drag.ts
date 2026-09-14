// Shared time-snapping helpers for the calendar grid interactions
// (moving/resizing events and click-drag creation).

/** Grid snap step in minutes — 5 minutes for effortless half/quarter placement. */
export const CALENDAR_SNAP_STEP = 5;

/** Snaps a minute-of-day to the nearest step, clamped to [0, 1440]. */
export function snapMinute(min: number, step = CALENDAR_SNAP_STEP): number {
  const snapped = Math.round(min / step) * step;
  return Math.max(0, Math.min(1440, snapped));
}

/**
 * Converts a pointer client Y relative to a 1440px-tall day column into a
 * snapped minute-of-day. The 1px bottom padding keeps a drop on the column
 * edge inside the day (23:55) instead of wrapping around to 00:00.
 */
export function minuteFromClientY(
  clientY: number,
  el: HTMLElement,
  step = CALENDAR_SNAP_STEP
): number {
  const rect = el.getBoundingClientRect();
  const relY = Math.max(0, Math.min(rect.height - 1, clientY - rect.top));
  return snapMinute((relY / rect.height) * 1440, step);
}