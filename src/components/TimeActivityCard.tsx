import { Show } from 'solid-js';
import { t } from '../lib/i18n';
import {
  TimeBudgetActivity,
  getActivityZone,
  getLoggedTimeFraction,
  getZoneSegments,
  formatDurationHours,
  getActivityProgressPercent,
  minutesRemainingToTarget
} from '../lib/timebudget';
import { PhArrowsClockwise, PhClock, PhPencilSimple, PhTrash } from './icons';

export function TimeActivityCard(props: {
  activity: TimeBudgetActivity;
  onQuickAdd: (minutes: number) => void;
  onOpenManualLog: () => void;
  onUndo: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const a = () => props.activity;
  const zone = () => getActivityZone(a());
  const segments = () => getZoneSegments(a());
  const loggedFrac = () => getLoggedTimeFraction(a());
  const pct = () => getActivityProgressPercent(a());
  const remaining = () => minutesRemainingToTarget(a());
  const zoneLabel = () => t(`timebudget.zone.${zone()}`);
  const hasHistory = () => (a().history || []).length > 0;
  const priorityLabel = () =>
    a().priority === 1
      ? t('timebudget.priorityHigh')
      : a().priority <= 3
      ? t('timebudget.priorityMedium')
      : t('timebudget.priorityLow');

  const priorityClass = () => (a().priority === 1 ? 'p-high' : a().priority <= 3 ? 'p-medium' : '');

  const dangerEnd = () => {
    const act = a();
    if (act.dangerHours && act.dangerHours > 0) return act.dangerHours * 60;
    return Math.max(act.targetHours * 1.5, 1) * 60;
  };
  const barEnd = dangerEnd();
  const minPx = (a().minHours * 60) / barEnd;
  const targetPx = (a().targetHours * 60) / barEnd;

  return (
    <article
      class={`tb-card ${zone() === 'danger' ? 'tb-zone-danger' : ''}`}
      data-testid="tb-card"
      data-activity={a().id}
    >
      <div class="tb-card-header">
        <div>
          <div class="tb-card-title-row">
            <h3 class="tb-card-name">{a().name}</h3>
            <span class={`tb-priority-badge ${priorityClass()}`}>{priorityLabel()}</span>
          </div>
          <Show when={(a().tags || []).length > 0}>
            <div class="tb-tags">
              {a().tags.map(tag => (
                <span class="tb-tag">#{tag}</span>
              ))}
            </div>
          </Show>
        </div>
        <div class="tb-card-actions">
          <button type="button" class="tb-icon-btn" title={t('timebudget.manualLogTitle', { name: a().name })} onClick={props.onOpenManualLog}>
            <PhClock />
          </button>
          <button type="button" class="tb-icon-btn" title={t('timebudget.editActivity')} onClick={props.onEdit}>
            <PhPencilSimple />
          </button>
          <button type="button" class="tb-icon-btn danger" title={t('timebudget.deleteActivity')} onClick={props.onDelete}>
            <PhTrash />
          </button>
        </div>
      </div>

      <div class="tb-card-stats">
        <span class="tb-logged-line">
          {formatDurationHours(a().currentMinutes)}
          <span class="tb-target-suffix"> / {formatDurationHours(a().targetHours * 60)}</span>
        </span>
        <span class={`tb-zone-label zone-${zone()}`}>{zoneLabel()}</span>
      </div>

      {/* Multi-zone segmented progress bar */}
      <div class="tb-bar-wrap">
        <div class="tb-bar" role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(barEnd)} aria-valuenow={a().currentMinutes} onClick={props.onOpenManualLog} data-testid="tb-bar">
          <div class="tb-bar-segment tb-seg-deficit" style={{ width: `${(segments().deficit) * 100}%` }} />
          <div class="tb-bar-segment tb-seg-progress" style={{ left: `${(segments().deficit) * 100}%`, width: `${(segments().progress) * 100}%` }} />
          <div class="tb-bar-segment tb-seg-target" style={{ left: `${(segments().deficit + segments().progress) * 100}%`, width: `${(segments().target) * 100}%` }} />
          {/* Threshold markers */}
          <div class="tb-bar-marker" style={{ left: `${minPx * 100}%` }} title={t('timebudget.resetLegend.min')} />
          <div class="tb-bar-marker" style={{ left: `${targetPx * 100}%` }} title={t('timebudget.resetLegend.target')} />
          {/* Logged-time fill */}
          <div class={`tb-bar-fill zone-${zone()}`} style={{ width: `${loggedFrac() * 100}%` }} />
        </div>
        <div class="tb-bar-ticks">
          <span class="tb-bar-tick">{t('timebudget.completion', { pct: pct() })}</span>
          <span class="tb-bar-tick">
            {zone() === 'target' || zone() === 'danger'
              ? t('timebudget.resetLegend.target')
              : t('timebudget.resetLegend.min')}
          </span>
          <span class="tb-bar-tick">{t('timebudget.resetLegend.target')}</span>
        </div>
      </div>

      <div class="tb-card-eta">
        {zone() === 'target'
          ? t('timebudget.zone.target')
          : zone() === 'danger'
          ? t('timebudget.zone.danger')
          : remaining() > 0
          ? t('timebudget.remainingToTarget', { remaining: formatDurationHours(remaining()) })
          : t('timebudget.zone.target')}
      </div>

      <div class="tb-quick-row">
        <button type="button" class="tb-quick-btn" data-testid="tb-quick-15" onClick={() => props.onQuickAdd(15)}>{t('timebudget.quickAdd15')}</button>
        <button type="button" class="tb-quick-btn" data-testid="tb-quick-30" onClick={() => props.onQuickAdd(30)}>{t('timebudget.quickAdd30')}</button>
        <button type="button" class="tb-quick-btn" data-testid="tb-quick-60" onClick={() => props.onQuickAdd(60)}>{t('timebudget.quickAdd60')}</button>
        <button type="button" class="tb-quick-btn tb-undo-btn" data-testid="tb-undo" onClick={props.onUndo} disabled={!hasHistory()}>
          <PhArrowsClockwise /> {t('timebudget.undo')}
        </button>
      </div>
    </article>
  );
}