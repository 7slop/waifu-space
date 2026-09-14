import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { render } from '@solidjs/testing-library';
import { CalendarWeekView } from '../../src/components/CalendarWeekView';
import { state, setState, addCalendarEvent, DEFAULT_STATE } from '../../src/lib/store';

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
  it('renders all seven consecutive day columns Mon..Sun across the Oct 2026 fall-back weekend', () => {
    const { container } = renderWeekAt(new Date(2026, 9, 31)); // Saturday Oct 31, 2026

    const numbers = Array.from(container.querySelectorAll('.week-day-num')).map(el => el.textContent);
    // With the old fixed-24h arithmetic this week produced "25 25 26 27 28 29 30".
    expect(numbers).toEqual(['26', '27', '28', '29', '30', '31', '1']);

    const names = Array.from(container.querySelectorAll('.week-day-name')).map(el => el.textContent);
    expect(names).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
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

const DRAG_COLUMN_RECT = { top: 0, left: 0, right: 200, bottom: 1440, width: 200, height: 1440, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;

function stubColumnRects(container: HTMLElement) {
  container.querySelectorAll('.week-day-column').forEach(col => {
    (col as HTMLElement).getBoundingClientRect = () => DRAG_COLUMN_RECT;
  });
}

describe('CalendarWeekView event move-drag preview', () => {
  beforeEach(() => {
    setState(JSON.parse(JSON.stringify(DEFAULT_STATE)));
    setState('settings', 'weekStart', 1);
  });

  it('renders a solid placement preview that snaps to the 5-minute grid, hides the source, and cancels on Escape', () => {
    const monday = addCalendarEvent({
      title: 'Sprint Review',
      type: 'event',
      start: '2026-10-26T09:00:00',
      end: '2026-10-26T10:00:00',
      color: '#6c5ce7'
    })!;

    const { container } = render(() => (
      <CalendarWeekView
        currentDate={new Date(2026, 9, 31)} // Saturday Oct 31, 2026; Mon-start week
        events={[monday]}
        onSelectSlot={vi.fn()}
        onSelectRange={vi.fn()}
        onOpenEvent={vi.fn()}
      />
    ));
    stubColumnRects(container);

    const card = container.querySelector('.week-event-card') as HTMLElement;
    expect(card).toBeTruthy();

    card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 540 }));

    // Pointer at 132px into the 1440px day = 132 minutes -> snaps to 130 (02:10).
    const col = container.querySelectorAll('.week-day-column')[0] as HTMLElement;
    col.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 132 }));

    const preview = container.querySelector('.drag-move-preview') as HTMLElement;
    expect(preview).toBeTruthy();
    // 130 min / 1440 -> top; 60 min duration -> height
    expect(parseFloat(preview.style.top)).toBeCloseTo(130 / 1440 * 100, 2);
    expect(parseFloat(preview.style.height)).toBeCloseTo(60 / 1440 * 100, 2);
    expect(preview.textContent).toContain('Sprint Review');

    // The source card is hidden while the preview drives the placement.
    expect(card.classList.contains('is-dragging-source')).toBe(true);

    // Escape cancels: preview disappears, the event stays put.
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    expect(container.querySelector('.drag-move-preview')).toBeNull();
    expect(card.classList.contains('is-dragging-source')).toBe(false);
    const evt = state.calendar.events[0];
    expect(evt.start).toBe('2026-10-26T09:00:00');
  });

  it('moves a dragged event to the hovered column at a 5-minute snapped time on release', () => {
    const monday = addCalendarEvent({
      title: 'Deep Work',
      type: 'task',
      start: '2026-10-26T09:00:00',
      end: '2026-10-26T10:00:00',
      color: '#00cec9'
    })!;

    const onOpenEvent = vi.fn();
    const { container } = render(() => (
      <CalendarWeekView
        currentDate={new Date(2026, 9, 31)}
        events={[monday]}
        onSelectSlot={vi.fn()}
        onSelectRange={vi.fn()}
        onOpenEvent={onOpenEvent}
      />
    ));
    stubColumnRects(container);

    const card = container.querySelector('.week-event-card') as HTMLElement;
    card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 540 }));

    // Hang over the SECOND day column (Tuesday) at 10:22 -> snaps to 10:20.
    const cols = container.querySelectorAll('.week-day-column');
    const col2 = cols[1] as HTMLElement;
    col2.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 622 }));

    // The placement preview now lives inside the second column.
    const preview = container.querySelector('.drag-move-preview') as HTMLElement;
    expect(col2.contains(preview)).toBe(true);
    expect(parseFloat(preview.style.top)).toBeCloseTo((10 * 60 + 20) / 1440 * 100, 2);

    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 622 }));

    const moved = state.calendar.events[0];
    expect(moved.start).toBe(new Date(2026, 9, 27, 10, 20).toISOString());

    // The release also produced a click; it must NOT reopen the event modal.
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenEvent).not.toHaveBeenCalled();
  });

  it('still opens the event on a plain click (no drag)', () => {
    const monday = addCalendarEvent({
      title: 'Sprint Review',
      type: 'event',
      start: '2026-10-26T09:00:00',
      end: '2026-10-26T10:00:00',
      color: '#6c5ce7'
    })!;

    const onOpenEvent = vi.fn();
    const { container } = render(() => (
      <CalendarWeekView
        currentDate={new Date(2026, 9, 31)}
        events={[monday]}
        onSelectSlot={vi.fn()}
        onSelectRange={vi.fn()}
        onOpenEvent={onOpenEvent}
      />
    ));
    stubColumnRects(container);

    const card = container.querySelector('.week-event-card') as HTMLElement;
    card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 540 }));
    card.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 540 }));
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpenEvent).toHaveBeenCalledTimes(1);
  });
});