import { describe, it, expect } from 'vitest';
import { snapMinute, minuteFromClientY, CALENDAR_SNAP_STEP } from '../../src/lib/calendar-drag';

function columnRect(top = 0, height = 1440) {
  return {
    getBoundingClientRect: () => ({ top, bottom: top + height, height })
  } as unknown as HTMLElement;
}

describe('calendar-drag time snapping', () => {
  it('defaults the grid step to 5 minutes', () => {
    expect(CALENDAR_SNAP_STEP).toBe(5);
  });

  it('snaps a minute-of-day to the nearest 5-minute mark', () => {
    expect(snapMinute(0)).toBe(0);
    expect(snapMinute(132)).toBe(130);
    expect(snapMinute(133)).toBe(135);
    expect(snapMinute(630)).toBe(630); // 10:30 stays put
    expect(snapMinute(1439)).toBe(1440); // 23:59 -> 24:00
  });

  it('clamps results outside the day', () => {
    expect(snapMinute(-12)).toBe(0);
    expect(snapMinute(1450)).toBe(1440);
  });

  it('accepts a custom step', () => {
    expect(snapMinute(132, 15)).toBe(135);
  });

  it('maps a pointer offset to a snapped minute inside a 1440px column', () => {
    const el = columnRect(100);
    // 630px below the top edge -> exactly 10:30
    expect(minuteFromClientY(730, el)).toBe(630);
    // 132px -> 132.0 min -> snaps to 130 (10:30 is the nearest 5-min mark)
    expect(minuteFromClientY(232, el)).toBe(130);
    // above the top edge clamps to 00:00
    expect(minuteFromClientY(40, el)).toBe(0);
    // the bottom edge resolves to 24:00 (single-column callers clamp to 23:45)
    expect(minuteFromClientY(1540, el)).toBe(1440);
  });
});