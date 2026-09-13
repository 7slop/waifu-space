import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render } from '@solidjs/testing-library';
import { CalendarWeekView } from '../../src/components/CalendarWeekView';

// Issue: the fall-back DST weekend (e.g. 2026-10-25 in most of Europe) has a
// 25-hour day. Building the 7 day columns with fixed 24h steps (start + i*86400000)
// duplicated the first column and dropped the last day (Oct 31, a Saturday).
// Run this file under a DST timezone so the old arithmetic is guaranteed to fail.
const originalTZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Europe/Berlin';
});
afterAll(() => {
  if (originalTZ !== undefined) process.env.TZ = originalTZ;
  else delete process.env.TZ;
});

function renderWeekAt(saturday: Date) {
  return render(() => (
    <CalendarWeekView
      currentDate={saturday}
      events={[]}
      onSelectSlot={vi.fn()}
      onSelectRange={vi.fn()}
      onOpenEvent={vi.fn()}
    />
  ));
}

describe('CalendarWeekView daylight-saving safety (Issue: Oct 31 missing)', () => {
  it('renders all seven consecutive day columns Sun..Sat across the Oct 2026 fall-back weekend', () => {
    const { container } = renderWeekAt(new Date(2026, 9, 31)); // Saturday Oct 31, 2026

    const numbers = Array.from(container.querySelectorAll('.week-day-num')).map(el => el.textContent);
    // With the old fixed-24h arithmetic this week produced "25 25 26 27 28 29 30".
    expect(numbers).toEqual(['25', '26', '27', '28', '29', '30', '31']);

    const names = Array.from(container.querySelectorAll('.week-day-name')).map(el => el.textContent);
    expect(names).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });

  it('keeps the grid and allday strip in sync for the same week', () => {
    const { container } = renderWeekAt(new Date(2026, 9, 31));

    const headerDays = container.querySelectorAll('.week-header-day').length;
    const alldayDays = container.querySelectorAll('.week-allday-day').length;
    const columns = container.querySelectorAll('.week-day-column').length;

    expect(headerDays).toBe(7);
    expect(alldayDays).toBe(headerDays);
    expect(columns).toBe(headerDays);
  });

  it('visually stretches the drag-to-create ghost while dragging', () => {
    const { container } = renderWeekAt(new Date(2026, 9, 31));

    const col = container.querySelectorAll('.week-day-column')[0] as HTMLElement;
    // happy-dom has no layout; give the column a real 1440px day height
    col.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 200, bottom: 1440, width: 200, height: 1440, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    // mousedown at 9:00 AM (540 min as a pixel offset)
    col.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 540 }));

    // drag down to 11:00 AM while still holding the button
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 660 }));

    const preview = container.querySelector('.drag-create-preview') as HTMLElement;
    expect(preview).toBeTruthy();

    // start=540, currentMin=660 -> 120 min = 8.33% of the 1440px day
    expect(parseFloat(preview.style.height)).toBeCloseTo(8.33, 2);
    // top should stay anchored at the 9:00 AM start
    expect(parseFloat(preview.style.top)).toBeCloseTo(37.5, 2);
  });

  it('anchors the ghost start where the drag began even when dragging upward', () => {
    const { container } = renderWeekAt(new Date(2026, 9, 31));

    const col = container.querySelectorAll('.week-day-column')[0] as HTMLElement;
    col.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 200, bottom: 1440, width: 200, height: 1440, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    // mousedown at 10:00 AM (600px), then drag up to 8:00 AM (480px)
    col.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 600 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 480 }));

    const preview = container.querySelector('.drag-create-preview') as HTMLElement;
    expect(preview).toBeTruthy();
    // start=480, currentMin=600 -> 120 min
    expect(parseFloat(preview.style.height)).toBeCloseTo(8.33, 2);
    expect(parseFloat(preview.style.top)).toBeCloseTo(33.33, 2);
  });
});