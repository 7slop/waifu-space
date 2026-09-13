import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getIsoWeekKey,
  getCurrentBudgetWeek,
  getWeekProgress,
  getActivityZone,
  getActivityProgressPercent,
  getZoneSegments,
  getLoggedTimeFraction,
  formatDurationHours,
  minutesRemainingToTarget,
  mostRecentResetBoundary,
  clampMinutes,
  clampHours,
  ActivityZone
} from '../../src/lib/timebudget';
import {
  state,
  setState,
  logTime,
  undoLastLog,
  ensureWeeklyReset,
  addTimeBudgetActivity,
  updateTimeBudgetActivity,
  deleteTimeBudgetActivity,
  reorderTimeBudgetActivities,
  setTimeBudgetSettings,
  checkCatchUpReminders,
  DEFAULT_STATE,
  getActivityZone as storeGetActivityZone
} from '../../src/lib/store';
import { getDefaultTimeBudgetState } from '../../src/lib/timebudget';
import type { TimeBudgetActivity } from '../../src/lib/store';

function makeActivity(partial: Partial<TimeBudgetActivity> = {}): TimeBudgetActivity {
  return {
    id: 'act-test',
    name: 'Test',
    minHours: 4,
    targetHours: 6,
    dangerHours: 10,
    currentMinutes: 0,
    history: [],
    lastResetWeek: getCurrentBudgetWeek(),
    priority: 1,
    ...partial
  };
}

describe('Time Budget pure logic', () => {
  describe('ISO week keys', () => {
    it('computes a standard ISO week key for a mid-week date', () => {
      expect(getIsoWeekKey(new Date(2026, 8, 9))).toBe('2026-W37'); // Wed Sep 9 2026
    });

    it('handles ISO year boundaries (early January)', () => {
      expect(getIsoWeekKey(new Date(2026, 0, 5))).toBe('2026-W02'); // Mon Jan 5 2026
    });
  });

  describe('zone classification', () => {
    it('classifies deficit, progress, target and danger zones', () => {
      expect(getActivityZone(makeActivity({ currentMinutes: 0 }))).toBe('deficit');
      expect(getActivityZone(makeActivity({ currentMinutes: 4 * 60 }))).toBe('progress');
      expect(getActivityZone(makeActivity({ currentMinutes: 6 * 60 }))).toBe('target');
      expect(getActivityZone(makeActivity({ currentMinutes: 10 * 60 }))).toBe('danger');
    });

    it('treats a missing danger threshold as unbounded', () => {
      const a = makeActivity({ dangerHours: null as any });
      expect(getActivityZone({ ...a, currentMinutes: 100 * 60 })).toBe('target');
    });

    it('sorts a list by deficit', () => {
      const acts = [
        makeActivity({ id: 'a', currentMinutes: 60 }),
        makeActivity({ id: 'b', currentMinutes: 0 })
      ];
      const zones: ActivityZone[] = acts.map(a => storeGetActivityZone(a));
      expect(zones).toEqual(['deficit', 'deficit']);
    });
  });

  describe('formatting & segments', () => {
    it('formats minutes as hours and minutes', () => {
      expect(formatDurationHours(0)).toBe('0m');
      expect(formatDurationHours(60)).toBe('1h');
      expect(formatDurationHours(260)).toBe('4h 20m');
    });

    it('splits the bar into deficit/progress/target segments', () => {
      const segs = getZoneSegments(makeActivity());
      expect(segs.deficit).toBeCloseTo(4 / 10);
      expect(segs.progress).toBeCloseTo(2 / 10);
      expect(segs.target).toBeCloseTo(4 / 10);
    });

    it('caps completion percentage at 100', () => {
      expect(getActivityProgressPercent(makeActivity({ currentMinutes: 12 * 60 }))).toBe(100);
      expect(getActivityProgressPercent(makeActivity({ currentMinutes: 60 }))).toBe(17);
    });

    it('computes minutes remaining to target', () => {
      expect(minutesRemainingToTarget(makeActivity({ currentMinutes: 5 * 60 }))).toBe(60);
    });

    it('clamps logged minutes to the bar end', () => {
      expect(getLoggedTimeFraction(makeActivity({ currentMinutes: 12 * 60 }))).toBe(1);
    });
  });

  describe('weekly reset boundary', () => {
    it('defaults to Monday 00:00 boundaries', () => {
      // Wed Sep 2 2026 (ISO week 36)
      const wednesday = new Date(2026, 8, 2, 12, 0, 0);
      const boundary = mostRecentResetBoundary(wednesday, 1, 0);
      // previous Monday was Aug 31 2026
      expect(boundary.getDay()).toBe(1);
      expect(boundary.getDate()).toBe(31);
      expect(boundary.getMonth()).toBe(7);
    });

    it('uses the most recent boundary even when the reset day is late in the week', () => {
      // Wed Sep 2 2026 with resetDay=6 (Saturday) should anchor to Sat Aug 29
      const wednesday = new Date(2026, 8, 2, 12, 0, 0);
      const boundary = mostRecentResetBoundary(wednesday, 6, 0);
      expect(boundary.getDay()).toBe(6);
      expect(boundary.getDate()).toBe(29);
    });

    it('rounds the week progress between 0 and 1', () => {
      const atBoundary = new Date(2026, 7, 31, 0, 0, 0);
      expect(getWeekProgress(atBoundary)).toBe(0);
      const midWeek = new Date(2026, 8, 3, 12, 0, 0); // ~3.5 days in
      const p = getWeekProgress(midWeek);
      expect(p).toBeGreaterThan(0.4);
      expect(p).toBeLessThan(0.6);
    });
  });

  describe('sanitization helpers', () => {
    it('clamps negative or non-finite inputs', () => {
      expect(clampMinutes(-5)).toBe(0);
      expect(clampMinutes(90.6)).toBe(91);
      expect(clampMinutes(Number.NaN)).toBe(0);
      expect(clampHours(30)).toBe(30);
      expect(clampHours(9999)).toBe(168);
    });
  });
});

describe('Time Budget store', () => {
  beforeEach(() => {
    localStorage.clear();
    setState(JSON.parse(JSON.stringify(DEFAULT_STATE)));
    // Default state has no example activities, so the shared store tests need
    // a starter activity to operate on.
    addTimeBudgetActivity({ name: 'Test', minHours: 4, targetHours: 6, dangerHours: 10, priority: 1 });
    vi.restoreAllMocks();
  });

  it('starts with an empty activity list (no baked-in examples)', () => {
    expect(getDefaultTimeBudgetState().activities).toEqual([]);
  });

  describe('logTime', () => {
    it('appends history and advances the weekly counter', () => {
      const id = state.timebudget.activities[0].id;
      expect(logTime(id, 90)).toBe(true);
      const act = state.timebudget.activities[0];
      expect(act.currentMinutes).toBe(90);
      expect(act.history.length).toBe(1);
      expect(act.history[0].minutes).toBe(90);
    });

    it('rejects non-positive amounts', () => {
      const id = state.timebudget.activities[0].id;
      expect(logTime(id, 0)).toBe(false);
      expect(logTime(id, -10)).toBe(false);
    });

    it('does not log to an unknown activity', () => {
      expect(logTime('nope', 30)).toBe(false);
    });
  });

  describe('undoLastLog', () => {
    it('removes the latest session and restores the counter', () => {
      const id = state.timebudget.activities[0].id;
      logTime(id, 30);
      logTime(id, 60);
      expect(state.timebudget.activities[0].currentMinutes).toBe(90);
      expect(undoLastLog(id)).toBe(true);
      expect(state.timebudget.activities[0].currentMinutes).toBe(30);
      expect(state.timebudget.activities[0].history.length).toBe(1);
      expect(undoLastLog(id)).toBe(true);
      expect(state.timebudget.activities[0].currentMinutes).toBe(0);
      expect(undoLastLog(id)).toBe(false);
    });
  });

  describe('weekly reset', () => {
    it('resets the counter when the week key changes but archives history', () => {
      const id = state.timebudget.activities[0].id;
      logTime(id, 120);
      setState('timebudget', 'activities', a => a.id === id, 'lastResetWeek', '1999-W01');
      expect(ensureWeeklyReset()).toBe(true);
      const act = state.timebudget.activities[0];
      expect(act.currentMinutes).toBe(0);
      expect(act.history.length).toBe(1);
      expect(ensureWeeklyReset()).toBe(false);
    });
  });

  describe('CRUD', () => {
    it('creates, updates and deletes activities', () => {
      const act = addTimeBudgetActivity({ name: '  Guitar  ', minHours: 2, targetHours: 4, dangerHours: 7, icon: 'music-notes', priority: 2 });
      expect(act).not.toBeNull();
      expect(act!.name).toBe('Guitar');
      expect(act!.icon).toBe('music-notes');

      expect(updateTimeBudgetActivity(act!.id, { name: 'Bass', targetHours: 5 })).toBe(true);
      const found = state.timebudget.activities.find(a => a.id === act!.id);
      expect(found!.name).toBe('Bass');
      expect(found!.targetHours).toBe(5);

      deleteTimeBudgetActivity(act!.id);
      expect(state.timebudget.activities.find(a => a.id === act!.id)).toBeUndefined();
    });

    it('refuses an empty name', () => {
      expect(addTimeBudgetActivity({ name: '   ', minHours: 1, targetHours: 2, dangerHours: null })).toBeNull();
    });

    it('enforces target >= min and danger >= target', () => {
      const act = addTimeBudgetActivity({ name: 'X', minHours: 5, targetHours: 2, dangerHours: 3 });
      expect(act!.minHours).toBe(5);
      expect(act!.targetHours).toBeGreaterThanOrEqual(5);
      expect(act!.dangerHours).toBeGreaterThanOrEqual(act!.targetHours);
    });

    it('normalises danger null to no threshold', () => {
      const act = addTimeBudgetActivity({ name: 'Y', minHours: 1, targetHours: 2, dangerHours: null });
      expect(act!.dangerHours).toBeNull();
    });
  });

  describe('drag reorder', () => {
    it('moves one activity before another and persists the new order', () => {
      const a = addTimeBudgetActivity({ name: 'A', minHours: 1, targetHours: 2, dangerHours: null });
      const b = addTimeBudgetActivity({ name: 'B', minHours: 1, targetHours: 2, dangerHours: null });
      const c = addTimeBudgetActivity({ name: 'C', minHours: 1, targetHours: 2, dangerHours: null });
      // Default order: Test, A, B, C
      expect(reorderTimeBudgetActivities(c!.id, a!.id)).toBe(true);
      const ids = state.timebudget.activities.map(x => x.name);
      expect(ids).toEqual(['Test', 'C', 'A', 'B']);
    });

    it('ignores unknown or self-moves', () => {
      const a = state.timebudget.activities[0];
      const before = state.timebudget.activities.map(x => x.name);
      expect(reorderTimeBudgetActivities(a.id, a.id)).toBe(false);
      expect(reorderTimeBudgetActivities('nope', a.id)).toBe(false);
      expect(reorderTimeBudgetActivities(a.id, 'nope')).toBe(false);
      expect(state.timebudget.activities.map(x => x.name)).toEqual(before);
    });
  });

  describe('settings', () => {
    it('updates reset schedule and settings', () => {
      setTimeBudgetSettings({ resetDay: 3, resetHour: 6, notifications: false });
      expect(state.timebudget.settings.resetDay).toBe(3);
      expect(state.timebudget.settings.resetHour).toBe(6);
      expect(state.timebudget.settings.notifications).toBe(false);
    });
  });

  describe('catch-up reminders', () => {
    it('does not fire before mid-week', () => {
      vi.setSystemTime(new Date(2026, 7, 31, 10, 0, 0)); // Monday morning
      setState('timebudget', 'activities', acts => acts.map(a => ({ ...a, minHours: 1, currentMinutes: 0 })));
      expect(checkCatchUpReminders()).toBe(false);
      vi.useRealTimers();
    });

    it('fires for high-priority habits that are far behind by mid-week', () => {
      vi.setSystemTime(new Date(2026, 8, 3, 12, 0, 0)); // Thursday noon
      const id = state.timebudget.activities[0].id;
      setState('timebudget', 'activities', acts => acts.map(a => ({ ...a, minHours: 1, currentMinutes: a.id === id ? 0 : 60 })));
      expect(checkCatchUpReminders()).toBe(true);
      expect(checkCatchUpReminders()).toBe(false); // once per week
      vi.useRealTimers();
    });
  });
});