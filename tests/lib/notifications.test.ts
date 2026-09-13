import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  state,
  setState,
  addCalendarEvent,
  DEFAULT_STATE,
  dateKeyOf,
} from '../../src/lib/store';
import {
  runNotificationCheck,
  getNotificationPermission,
  getNotificationSentMap,
  resetNotificationSentState,
  startNotificationScheduler,
  stopNotificationScheduler,
} from '../../src/lib/notifications';

type CapturedNotification = { title: string; body: string };

const captured: CapturedNotification[] = [];

class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = async (): Promise<NotificationPermission> => 'granted';
  constructor(title: string, opts?: NotificationOptions) {
    captured.push({ title, body: opts?.body ?? '' });
  }
}

const FIXED_NOW = new Date(2026, 5, 15, 10, 0, 0); // Mon 2026-06-15 10:00 local

function minutesAgo(mins: number): Date {
  return new Date(FIXED_NOW.getTime() - mins * 60 * 1000);
}
function minutesFromNow(mins: number): Date {
  return new Date(FIXED_NOW.getTime() + mins * 60 * 1000);
}

function addEvent(opts: {
  title: string;
  type?: 'event' | 'task' | 'birthday';
  start: Date;
  end?: Date;
  allDay?: boolean;
  recurrence?: string;
  completed?: boolean;
}) {
  addCalendarEvent({
    title: opts.title,
    type: opts.type ?? 'event',
    start: opts.start.toISOString(),
    end: (opts.end ?? minutesFromNow(60)).toISOString(),
    allDay: opts.allDay ?? false,
    recurrence: opts.recurrence ?? 'none',
    completed: opts.completed ?? false,
  });
}

describe('Browser notifications (notifications.ts)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    localStorage.clear();
    captured.length = 0;
    resetNotificationSentState();
    setState(JSON.parse(JSON.stringify(DEFAULT_STATE)));
    vi.stubGlobal('Notification', FakeNotification);
  });

  afterEach(() => {
    stopNotificationScheduler();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reports unsupported when the browser has no Notification API', () => {
    vi.stubGlobal('Notification', undefined);
    expect(getNotificationPermission()).toBe('unsupported');
  });

  it('fires a 30-min "upcoming" notification for timed events', () => {
    addEvent({ title: 'Standup', start: minutesFromNow(20) });
    runNotificationCheck();
    expect(captured.length).toBe(1);
    expect(captured[0].title).toBe('Standup');
    expect(captured[0].body).toContain('30 minutes');
  });

  it('does NOT fire "upcoming" for tasks', () => {
    addEvent({ title: 'Water plants', type: 'task', start: minutesFromNow(20) });
    runNotificationCheck();
    expect(captured.length).toBe(0);
  });

  it('fires a "started" notification for events once their start has passed', () => {
    addEvent({ title: 'Lunch', start: minutesAgo(5) });
    runNotificationCheck();
    expect(captured.length).toBe(1);
    expect(captured[0].title).toBe('Lunch');
    expect(captured[0].body).toContain('started');
  });

  it('fires a "started" notification for tasks', () => {
    addEvent({ title: 'Study', type: 'task', start: minutesAgo(5) });
    runNotificationCheck();
    expect(captured.length).toBe(1);
    expect(captured[0].body).toContain('started');
  });

  it('does not fire twice for the same occurrence', () => {
    addEvent({ title: 'Standup', start: minutesFromNow(20) });
    runNotificationCheck();
    runNotificationCheck();
    expect(captured.length).toBe(1);
  });

  it('is silent when permission was not granted', () => {
    class DeniedNotification {
      static permission: NotificationPermission = 'denied';
      constructor() {
        captured.push({ title: 'should not fire', body: '' });
      }
    }
    vi.stubGlobal('Notification', DeniedNotification);
    addEvent({ title: 'Lunch', start: minutesAgo(5) });
    runNotificationCheck();
    expect(captured.length).toBe(0);
  });

  it('sends a 9 AM digest for all-day events and tasks', () => {
    vi.setSystemTime(new Date(2026, 5, 15, 9, 30, 0));
    addEvent({ title: 'Conference', allDay: true, start: FIXED_NOW });
    addEvent({ title: 'Clean room', type: 'task', allDay: true, start: FIXED_NOW });
    runNotificationCheck();
    expect(captured.length).toBe(2);
  });

  it('does not digest all-day items outside the 9–10 AM window', () => {
    vi.setSystemTime(new Date(2026, 5, 15, 11, 0, 0));
    addEvent({ title: 'Conference', allDay: true, start: FIXED_NOW });
    runNotificationCheck();
    expect(captured.length).toBe(0);
  });

  it('announces a recurring daily task for the current occurrence', () => {
    addEvent({ title: 'Gym', type: 'task', start: minutesAgo(5), recurrence: 'daily' });
    runNotificationCheck();
    expect(captured.length).toBe(1);
    expect(captured[0].title).toBe('Gym');
    const sent = getNotificationSentMap();
    expect(Object.keys(sent).some(k => k.includes(dateKeyOf(FIXED_NOW)))).toBe(true);
  });

  it('skips completed and holiday events', () => {
    addEvent({ title: 'Done task', type: 'task', start: minutesAgo(5) });
    addEvent({ title: 'Holiday day', start: minutesAgo(5) });
    setState('calendar', 'events', events =>
      events.map(e => {
        if (e.title === 'Done task') return { ...e, completed: true };
        if (e.title === 'Holiday day') return { ...e, _holiday: true };
        return e;
      })
    );
    runNotificationCheck();
    expect(captured.length).toBe(0);
  });

  it('starts and stops the interval scheduler when toggled', () => {
    const setSpy = vi.spyOn(globalThis, 'setInterval');
    startNotificationScheduler();
    expect(setSpy).toHaveBeenCalledTimes(1);
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    stopNotificationScheduler();
    expect(clearSpy).toHaveBeenCalledTimes(1);
    // Calling stop again (or after the effect re-runs) is a no-op.
    stopNotificationScheduler();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});