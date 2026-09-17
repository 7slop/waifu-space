import { describe, it, expect } from 'vitest';
import { resolveCalendarSwipe } from '../../src/lib/calendar-swipe';

describe('resolveCalendarSwipe (mobile calendar sidebar drawer)', () => {
  it('opens the drawer with a rightward swipe from the left edge on mobile', () => {
    expect(resolveCalendarSwipe({ deltaX: 120, deltaY: 0, startX: 8 }, false, 400)).toBe('open');
  });

  it('does not open unless the swipe starts near the left edge', () => {
    expect(resolveCalendarSwipe({ deltaX: 120, deltaY: 0, startX: 200 }, false, 400)).toBeNull();
  });

  it('does not open on desktop viewports (drawer is a static rail there)', () => {
    expect(resolveCalendarSwipe({ deltaX: 120, deltaY: 0, startX: 8 }, false, 1024)).toBeNull();
  });

  it('ignores vertical scroll gestures', () => {
    expect(resolveCalendarSwipe({ deltaX: 40, deltaY: 200, startX: 8 }, false, 400)).toBeNull();
  });

  it('ignores swipes below the distance threshold', () => {
    expect(resolveCalendarSwipe({ deltaX: 30, deltaY: 0, startX: 8 }, false, 400)).toBeNull();
  });

  it('closes an open drawer with a leftward swipe', () => {
    expect(resolveCalendarSwipe({ deltaX: -100, deltaY: 0, startX: 300 }, true, 400)).toBe('close');
  });

  it('does not close with a rightward swipe while open', () => {
    expect(resolveCalendarSwipe({ deltaX: 100, deltaY: 0, startX: 300 }, true, 400)).toBeNull();
  });

  it('does nothing for a leftward swipe while closed', () => {
    expect(resolveCalendarSwipe({ deltaX: -100, deltaY: 0, startX: 8 }, false, 400)).toBeNull();
  });
});