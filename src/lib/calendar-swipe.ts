// Pure swipe-gesture resolution for the calendar's off-canvas sidebar drawer.
// Kept framework-free so it can be unit-tested without a DOM.
//
//   - open:  a rightward swipe that starts near the left screen edge
//            (reveal gesture), only on mobile viewports where the drawer
//            actually lives off-canvas
//   - close: a leftward swipe while the drawer is open
//   - null:  everything else (vertical scrolls, short drags, desktop clicks)

export interface CalendarSwipe {
  deltaX: number;
  deltaY: number;
  startX: number;
}

export type SwipeAction = 'open' | 'close' | null;

export const SWIPE_MIN_DISTANCE = 60;
export const SWIPE_EDGE_ZONE = 24;
export const MOBILE_VIEWPORT_MAX = 768;

export function resolveCalendarSwipe(
  swipe: CalendarSwipe,
  sidebarOpen: boolean,
  viewportWidth: number,
  opts?: { minDistance?: number; edgeZone?: number; mobileMax?: number }
): SwipeAction {
  const minDistance = opts?.minDistance ?? SWIPE_MIN_DISTANCE;
  const edgeZone = opts?.edgeZone ?? SWIPE_EDGE_ZONE;
  const mobileMax = opts?.mobileMax ?? MOBILE_VIEWPORT_MAX;

  // Vertical gestures are scroll intent — never interfere with scrolling.
  if (Math.abs(swipe.deltaX) <= Math.abs(swipe.deltaY)) return null;
  if (Math.abs(swipe.deltaX) < minDistance) return null;

  if (!sidebarOpen) {
    if (swipe.deltaX > 0 && viewportWidth <= mobileMax && swipe.startX <= edgeZone) {
      return 'open';
    }
    return null;
  }
  if (swipe.deltaX < 0) return 'close';
  return null;
}