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

import { state } from './store';
import { CalendarEventItem } from './ical';
import { getOccurrenceForDate, dateKeyOf, isEventOnDate } from './store';
import { t, formatClock } from './i18n';

const SENT_STORAGE_KEY = 'waifu_space_notif_sent_v1';
const CHECK_INTERVAL_MS = 30 * 1000;
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

function sendNotification(title: string, body: string): void {
  try {
    new Notification(title, { body });
  } catch (e) {
    console.warn('Failed to send browser notification:', e);
  }
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

/**
 * Scans the calendar once and fires every notification whose window is active.
 * Exported for tests; the scheduler calls it on each interval tick.
 */
export function runNotificationCheck(): void {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nowMs = now.getTime();
  const minutesOfDay = now.getHours() * 60 + now.getMinutes();
  const inAllDayWindow = minutesOfDay >= ALL_DAY_START_MIN && minutesOfDay < ALL_DAY_END_MIN;

  for (const ev of state.calendar.events) {
    if (ev._holiday) continue;

    if (ev.allDay) {
      if (!inAllDayWindow) continue;
      const occ = occurrenceForDay(ev, today);
      if (!occ) continue;
      const dayKey = dateKeyOf(today);
      if (occurrenceIsSkipped(ev, dayKey, occ)) continue;
      const key = `allday:${ev.id}:${dayKey}`;
      if (wasSent(key)) continue;
      markSent(key);
      sendNotification(t('notifications.allDayTitle'), t('notifications.allDayBody', { title: occ.title }));
      continue;
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
          sendNotification(occ.title, t('notifications.upcomingBody', { time: formatClock(start) }));
        }
      }

      const startedKey = `started:${ev.type === 'task' ? 'task' : 'event'}:${ev.id}:${dayKey}`;
      if (!wasSent(startedKey) && nowMs >= start && nowMs < start + STARTED_GRACE_MS) {
        markSent(startedKey);
        const body =
          ev.type === 'task'
            ? t('notifications.taskStartedBody', { time: formatClock(start) })
            : t('notifications.eventStartedBody', { time: formatClock(start) });
        sendNotification(occ.title, body);
      }
    }
  }
}

export function startNotificationScheduler(): void {
  if (typeof window === 'undefined' || timer) return;
  loadSent();
  runNotificationCheck();
  timer = setInterval(runNotificationCheck, CHECK_INTERVAL_MS);
}

export function stopNotificationScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}