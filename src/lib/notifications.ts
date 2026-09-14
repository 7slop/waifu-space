// Browser notification scheduler for the calendar.
//
// While `state.settings.notificationsEnabled` is on, a lightweight interval
// scans the calendar and fires native browser notifications:
//   - timed events  -> "starting in 30 minutes", then "started"
//   - timed tasks   -> "started"
//   - all-day items -> one morning digest at 9 AM per day
// Recurring events are handled per-occurrence, so every instance is notified.
//
// Notifications are suppressed per-device via a small localStorage map (the
// same id/day/type never fires twice), which intentionally does NOT ride along
// with cloud sync — a device that already notified must not notify again on a
// newly-synced duplicate.
//
// Robustness: one malformed event can never kill the scheduler (each event is
// guarded), and when the browser cannot deliver a native notification (API
// missing, permission blocked/denied) the same message is shown as an in-app
// toast so the reminder is never silently lost. Permissions are the browser's
// responsibility; a "test notification" flow in the calendar settings modal
// lets the user verify native delivery directly.

import { state, showToast } from './store';
import { CalendarEventItem } from './ical';
import { getOccurrenceForDate, dateKeyOf, isEventOnDate } from './store';
import { t, formatClock } from './i18n';

const SENT_STORAGE_KEY = 'waifu_space_notif_sent_v1';
const CHECK_INTERVAL_MS = 15 * 1000;
const UPCOMING_MS = 30 * 60 * 1000;
const STARTED_GRACE_MS = 60 * 60 * 1000;
const ALL_DAY_START_MIN = 9 * 60; // 09:00
const ALL_DAY_END_MIN = 10 * 60; // 10:00 (1h window so an open tab catch it)

export type SentMap = Record<string, number>;

let sent: SentMap = {};
let timer: ReturnType<typeof setInterval> | null = null;

function loadSent(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(SENT_STORAGE_KEY);
    if (raw) sent = JSON.parse(raw);
  } catch {
    sent = {};
  }
}

function persistSent(): void {
  if (typeof window === 'undefined') return;
  try {
    // Keep the map tiny: drop anything older than 3 days.
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const pruned: SentMap = {};
    for (const [k, ts] of Object.entries(sent)) {
      if ((ts || 0) >= cutoff) pruned[k] = ts;
    }
    sent = pruned;
    localStorage.setItem(SENT_STORAGE_KEY, JSON.stringify(sent));
  } catch {
    // Storage unavailable/full: still safe to notify for this session.
  }
}

function markSent(key: string): void {
  sent[key] = Date.now();
  persistSent();
}

function wasSent(key: string): boolean {
  return !!sent[key];
}

export function resetNotificationSentState(): void {
  sent = {};
}

export function getNotificationSentMap(): SentMap {
  return sent;
}

export type NotificationPermissionStatus = NotificationPermission | 'unsupported';

/** True when the browser can actually pop a native notification right now. */
export function canNotifyNatively(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted'
  );
}

export function getNotificationPermission(): NotificationPermissionStatus {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Delivers a reminder. Prefers a native OS notification; when the browser
 * cannot or will not show one, falls back to an in-app toast with the same
 * message so no reminder is ever silently dropped.
 */
function deliver(title: string, body: string): void {
  if (canNotifyNatively()) {
    try {
      new Notification(title, { body });
      return;
    } catch (e) {
      console.warn('Failed to send browser notification:', e);
    }
  }
  showToast(`${title} — ${body}`);
}

/**
 * Fires a single test notification so the user can verify that native
 * delivery works in their browser. Returns 'native' when the OS notification
 * was created, 'toast' when only the in-app fallback ran.
 */
export function sendTestNotification(): 'native' | 'toast' {
  const title = t('notifications.testTitle');
  const body = t('notifications.testBody');
  if (canNotifyNatively()) {
    try {
      new Notification(title, { body });
      return 'native';
    } catch (e) {
      console.warn('Failed to send test browser notification:', e);
    }
  }
  deliver(title, body);
  return 'toast';
}

/** Today's or a given day's occurrence of an event, or null when it does not fall on that day. */
function occurrenceForDay(ev: CalendarEventItem, day: Date): CalendarEventItem | null {
  if (!isEventOnDate(ev, day)) return null;
  return getOccurrenceForDate(ev, day);
}

/** Respects per-occurrence completion/deletion for recurring events. */
function occurrenceIsSkipped(ev: CalendarEventItem, dayKey: string, occ: CalendarEventItem): boolean {
  if (occ.completed) return true;
  const ovr = state.calendar.occurrenceOverrides.find(o => o.parentId === ev.id && o.dateKey === dayKey);
  if (ovr?.deleted || ovr?.completed) return true;
  return false;
}

function checkEvent(ev: CalendarEventItem, now: Date): void {
  if (ev._holiday) return;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nowMs = now.getTime();
  const minutesOfDay = now.getHours() * 60 + now.getMinutes();
  const inAllDayWindow = minutesOfDay >= ALL_DAY_START_MIN && minutesOfDay < ALL_DAY_END_MIN;

  if (ev.allDay) {
    if (!inAllDayWindow) return;
    const occ = occurrenceForDay(ev, today);
    if (!occ) return;
    const dayKey = dateKeyOf(today);
    if (occurrenceIsSkipped(ev, dayKey, occ)) return;
    const key = `allday:${ev.id}:${dayKey}`;
    if (wasSent(key)) return;
    markSent(key);
    deliver(t('notifications.allDayTitle'), t('notifications.allDayBody', { title: occ.title }));
    return;
  }

  // Timed events/tasks: consider today's AND tomorrow's occurrences so an
  // early-morning event is announced while it is still "30 minutes away"
  // when the check runs the previous evening.
  for (const day of [today, tomorrow]) {
    const occ = occurrenceForDay(ev, day);
    if (!occ) continue;
    const dayKey = dateKeyOf(day);
    if (occurrenceIsSkipped(ev, dayKey, occ)) continue;
    const start = new Date(occ.start).getTime();

    if (ev.type !== 'task') {
      const upKey = `upcoming:${ev.id}:${dayKey}`;
      if (!wasSent(upKey) && nowMs >= start - UPCOMING_MS && nowMs < start) {
        markSent(upKey);
        deliver(occ.title, t('notifications.upcomingBody', { time: formatClock(start) }));
      }
    }

    const startedKey = `started:${ev.type === 'task' ? 'task' : 'event'}:${ev.id}:${dayKey}`;
    if (!wasSent(startedKey) && nowMs >= start && nowMs < start + STARTED_GRACE_MS) {
      markSent(startedKey);
      const body =
        ev.type === 'task'
          ? t('notifications.taskStartedBody', { time: formatClock(start) })
          : t('notifications.eventStartedBody', { time: formatClock(start) });
      deliver(occ.title, body);
    }
  }
}

/**
 * Scans the calendar once and fires every notification whose window is active.
 * Each event is individually guarded so a single malformed item can never
 * interrupt the rest of the scan. Exported for tests; the scheduler calls it
 * on each interval tick.
 */
export function runNotificationCheck(): void {
  if (typeof window === 'undefined') return;
  const now = new Date();
  for (const ev of state.calendar.events) {
    try {
      checkEvent(ev, now);
    } catch (e) {
      console.warn('Notification check failed for an event:', e);
    }
  }
}

export function startNotificationScheduler(): void {
  if (typeof window === 'undefined' || timer) return;
  loadSent();
  try {
    runNotificationCheck();
  } catch (e) {
    console.warn('Notification scheduler failed its first check:', e);
  }
  timer = setInterval(runNotificationCheck, CHECK_INTERVAL_MS);
}

export function stopNotificationScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}