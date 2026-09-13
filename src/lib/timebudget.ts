// Weekly time-accounting core for the Time Budget tracker.
//
// Every activity carries a weekly hour budget with three thresholds
// (min / target / danger) that split the logged time into workload zones.
// Weeks are tracked with an ISO-style key (e.g. "2026-W37") computed from
// the configured reset day/time so logged minutes roll over automatically
// while the full history stays archived.

export interface TimeLogEntry {
  timestamp: string;
  minutes: number;
  note?: string;
}

export interface TimeBudgetActivity {
  id: string;
  name: string;
  minHours: number;
  targetHours: number;
  dangerHours: number | null;
  currentMinutes: number;
  history: TimeLogEntry[];
  lastResetWeek: string;
  tags: string[];
  priority: number;
  color?: string;
}

export interface TimeBudgetSettings {
  resetDay: number; // ISO weekday: 1 = Monday ... 7 = Sunday
  resetHour: number; // 0-23
  notifications: boolean; // system/in-app milestone notifications
  catchUpReminders: boolean; // mid-week catch-up nudges
}

export interface TimeBudgetState {
  activities: TimeBudgetActivity[];
  settings: TimeBudgetSettings;
}

export type ActivityZone = 'deficit' | 'progress' | 'target' | 'danger';

export const DEFAULT_RESET_DAY = 1; // Monday
export const DEFAULT_RESET_HOUR = 0; // 00:00
export const WEEK_MINUTES = 7 * 24 * 60;
export const MAX_ACTIVITIES = 60;

export const ACTIVITY_COLORS = [
  '#ff659a',
  '#f9a03f',
  '#f6c177',
  '#a6d189',
  '#4fd6be',
  '#6fb3e8',
  '#c4a7e7',
  '#ea76cb'
];

export const DEFAULT_TIME_BUDGET_SETTINGS: TimeBudgetSettings = {
  resetDay: DEFAULT_RESET_DAY,
  resetHour: DEFAULT_RESET_HOUR,
  notifications: true,
  catchUpReminders: true
};

export function getDefaultTimeBudgetState(): TimeBudgetState {
  const week = getCurrentBudgetWeek();
  return {
    activities: [
      { id: 'act-code', name: 'Coding', minHours: 5, targetHours: 8, dangerHours: null, currentMinutes: 0, history: [], lastResetWeek: week, tags: ['code'], priority: 1 },
      { id: 'act-japanese', name: 'Japanese', minHours: 3, targetHours: 5, dangerHours: null, currentMinutes: 0, history: [], lastResetWeek: week, tags: ['study'], priority: 2 },
      { id: 'act-gym', name: 'Gym', minHours: 2, targetHours: 4, dangerHours: 8, currentMinutes: 0, history: [], lastResetWeek: week, tags: ['health'], priority: 3 },
      { id: 'act-music', name: 'Music', minHours: 1, targetHours: 3, dangerHours: 6, currentMinutes: 0, history: [], lastResetWeek: week, tags: ['hobby'], priority: 4 }
    ],
    settings: { ...DEFAULT_TIME_BUDGET_SETTINGS }
  };
}

export function isoWeekdayOf(date: Date): number {
  const day = date.getDay(); // 0 = Sunday
  return day === 0 ? 7 : day;
}

export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.round(minutes));
}

export function clampHours(hours: number, fallback = 0): number {
  if (!Number.isFinite(hours)) return fallback;
  return Math.max(0, Math.min(168, Math.round(hours * 100) / 100));
}

/** The most recent reset boundary (resetDay at resetHour) that is <= now. */
export function mostRecentResetBoundary(now: Date, resetDay: number, resetHour: number): Date {
  const resetDayIso = Number.isFinite(resetDay) ? ((Math.floor(resetDay) - 1 + 7) % 7) + 1 : DEFAULT_RESET_DAY;
  const resetHourClamped = Number.isFinite(resetHour) ? Math.max(0, Math.min(23, Math.floor(resetHour))) : DEFAULT_RESET_HOUR;
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), resetHourClamped, 0, 0, 0);
  const backDays = (isoWeekdayOf(candidate) - resetDayIso + 7) % 7;
  candidate.setDate(candidate.getDate() - backDays);
  if (candidate.getTime() > now.getTime()) {
    candidate.setDate(candidate.getDate() - 7);
  }
  return candidate;
}

/** ISO-8601 week key, e.g. "2026-W37". */
export function getIsoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Week key for the budget period governed by the given reset schedule. */
export function getCurrentBudgetWeek(now: Date = new Date(), resetDay = DEFAULT_RESET_DAY, resetHour = DEFAULT_RESET_HOUR): string {
  return getIsoWeekKey(mostRecentResetBoundary(now, resetDay, resetHour));
}

/** Fraction (0..1) of the current budget week that has already elapsed. */
export function getWeekProgress(now: Date = new Date(), resetDay = DEFAULT_RESET_DAY, resetHour = DEFAULT_RESET_HOUR): number {
  const boundary = mostRecentResetBoundary(now, resetDay, resetHour);
  const elapsed = Math.max(0, now.getTime() - boundary.getTime()) / (WEEK_MINUTES * 60000);
  return Math.min(1, elapsed);
}

export function getActivityZone(a: Pick<TimeBudgetActivity, 'currentMinutes' | 'minHours' | 'targetHours' | 'dangerHours'>): ActivityZone {
  const mins = a.currentMinutes;
  const min = a.minHours * 60;
  const target = a.targetHours * 60;
  const danger = a.dangerHours ? a.dangerHours * 60 : Infinity;
  if (mins >= danger) return 'danger';
  if (mins >= target) return 'target';
  if (mins >= min) return 'progress';
  return 'deficit';
}

/** Completion percentage against the target budget (capped at 100). */
export function getActivityProgressPercent(a: Pick<TimeBudgetActivity, 'currentMinutes' | 'targetHours'>): number {
  const target = a.targetHours * 60;
  if (target <= 0) return 0;
  return Math.min(100, Math.round((a.currentMinutes / target) * 100));
}

export function formatDurationHours(minutes: number): string {
  const m = clampMinutes(minutes);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0 && rem > 0) return `${h}h ${rem}m`;
  if (h > 0) return `${h}h`;
  return `${rem}m`;
}

export function formatMinutesShort(minutes: number): string {
  const m = clampMinutes(minutes);
  return `${m}m`;
}

/** Human-readable label for a workload zone used by the UI. */
export function zoneLabel(zone: ActivityZone): string {
  switch (zone) {
    case 'deficit':
      return 'Deficit';
    case 'progress':
      return 'On Track';
    case 'target':
      return 'Target Met';
    case 'danger':
      return 'Overdrive';
  }
}

/** Segment widths (0..1) of the multi-zone progress bar. */
export function getZoneSegments(a: Pick<TimeBudgetActivity, 'minHours' | 'targetHours' | 'dangerHours'>): {
  deficit: number;
  progress: number;
  target: number;
  danger: number;
} {
  const end = a.dangerHours && a.dangerHours > 0 ? a.dangerHours * 60 : Math.max(a.targetHours * 1.5, 1) * 60;
  const denominator = Math.max(1, end);
  const min = Math.max(0, (a.minHours * 60) / denominator);
  const target = Math.max(min, a.targetHours * 60 / denominator);
  return {
    deficit: min,
    progress: target - min,
    target: 1 - target,
    danger: 0
  };
}

/** Width of the logged-time fill inside the full bar (0..1). */
export function getLoggedTimeFraction(a: Pick<TimeBudgetActivity, 'currentMinutes' | 'dangerHours' | 'targetHours'>): number {
  const end = a.dangerHours && a.dangerHours > 0 ? a.dangerHours * 60 : Math.max(a.targetHours * 1.5, 1) * 60;
  return Math.min(1, a.currentMinutes / Math.max(1, end));
}

/** Number of minutes needed to reach the target for the current week. */
export function minutesRemainingToTarget(a: Pick<TimeBudgetActivity, 'currentMinutes' | 'targetHours'>): number {
  return Math.max(0, a.targetHours * 60 - a.currentMinutes);
}