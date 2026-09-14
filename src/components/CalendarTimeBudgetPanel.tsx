import { Show } from 'solid-js';
import { t } from '../lib/i18n';
import { state } from '../lib/store';
import {
  getActivityZone,
  getCurrentBudgetWeek,
  formatDurationHours,
  minutesRemainingToTarget
} from '../lib/timebudget';
import { ActivityIcon } from './activityIcons';
import { PhTimer, PhArrowRight } from './icons';

const ZONE_VARS: Record<string, string> = {
  deficit: 'var(--text-muted)',
  progress: 'var(--primary-accent)',
  target: 'var(--success)',
  danger: 'var(--danger)'
};

/**
 * Read-only "Today's Time Budget" panel rendered in the calendar's left sidebar.
 * Purely derived from state.timebudget — it never writes to calendar state.
 */
export function CalendarTimeBudgetPanel() {
  const settings = () => state.timebudget?.settings;
  const activities = () => state.timebudget?.activities || [];
  const week = () => {
    const s = settings();
    return s ? getCurrentBudgetWeek(new Date(), s.resetDay, s.resetHour) : '';
  };

  const totalLogged = () => activities().reduce((sum, a) => sum + a.currentMinutes, 0);
  const totalTarget = () => activities().reduce((sum, a) => sum + a.targetHours * 60, 0);

  // The panel is purely derived from the user's own time-budget activities.
  // With none defined there is nothing worth showing - hide the whole widget so
  // the calendar sidebar stays clean for users who never set up a budget.
  return (
    <Show when={activities().length > 0}>
      <div class="tb-side-panel" data-testid="tb-calendar-panel">
        <div class="tb-side-head">
          <h4 class="sidebar-heading">
            <PhTimer /> {t('timebudget.nav')}
          </h4>
          <span class="tasks-badge">{activities().length}</span>
        </div>

        {activities().slice(0, 5).map(a => {
          const zone = () => getActivityZone(a);
          const frac = () =>
            a.targetHours > 0 ? Math.min(1, a.currentMinutes / (a.targetHours * 60)) : 0;
          const remaining = () => minutesRemainingToTarget(a);
          return (
            <div class="tb-side-item">
              <span class="tb-side-icon"><ActivityIcon icon={a.icon} /></span>
              <div class="tb-side-main">
                <div class="tb-side-name-row">
                  <span class="tb-side-name" title={a.name}>{a.name}</span>
                  <span class={`tb-side-zone zone-${zone()}`}>{t(`timebudget.zone.${zone()}`)}</span>
                </div>
                <div class="tb-side-bar">
                  <div class={`tb-side-fill zone-${zone()}`} style={{ width: `${frac() * 100}%`, background: ZONE_VARS[zone()] }} />
                </div>
                <div class="tb-side-sub">
                  <span>{formatDurationHours(a.currentMinutes)} / {formatDurationHours(a.targetHours * 60)}</span>
                  <span class={remaining() > 0 ? 'tb-side-remaining' : 'tb-side-remaining done'}>
                    {remaining() > 0 ? `${formatDurationHours(remaining())} left` : '✓'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        <div class="tb-side-summary">
          <span>{formatDurationHours(totalLogged())} / {formatDurationHours(totalTarget())} {t('timebudget.calPanel.week', { week: week().slice(-2) })}</span>
        </div>

        <a class="tb-side-link" href="/timebudget">
          {t('timebudget.calPanel.open')} <PhArrowRight />
        </a>
      </div>
    </Show>
  );
}