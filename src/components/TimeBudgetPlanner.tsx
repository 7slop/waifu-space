import { createSignal, onMount, onCleanup, createEffect, For, Show } from 'solid-js';
import { t } from '../lib/i18n';
import {
  state,
  setState,
  saveState,
  showToast,
  logTime,
  undoLastLog,
  ensureWeeklyReset,
  requestNotificationPermission,
  checkCatchUpReminders,
  deleteTimeBudgetActivity,
  clearCatchUpReminderMemory
} from '../lib/store';
import {
  TimeBudgetActivity,
  getActivityZone,
  getWeekProgress,
  getCurrentBudgetWeek,
  formatDurationHours
} from '../lib/timebudget';
import { PhGearSix, PhPlus, PhSlidersHorizontal, PhUploadSimple, PhDownloadSimple } from './icons';
import { TimeActivityCard } from './TimeActivityCard';
import {
  TimeLogModal,
  TimeActivityFormModal,
  TimeBudgetSettingsModal,
  ConfirmDeleteModal
} from './TimeBudgetModals';

type SortKey = 'priority' | 'deficit' | 'progress' | 'name';
type FilterZone = 'all' | 'deficit' | 'progress' | 'target' | 'danger';

export function TimeBudgetPlanner() {
  const [sortKey, setSortKey] = createSignal<SortKey>('priority');
  const [filterZone, setFilterZone] = createSignal<FilterZone>('all');
  const [search, setSearch] = createSignal('');

  const [logModalOpen, setLogModalOpen] = createSignal(false);
  const [logTarget, setLogTarget] = createSignal<TimeBudgetActivity | null>(null);
  const [formModalOpen, setFormModalOpen] = createSignal(false);
  const [editTarget, setEditTarget] = createSignal<TimeBudgetActivity | null>(null);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [deleteTarget, setDeleteTarget] = createSignal<TimeBudgetActivity | null>(null);

  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    ensureWeeklyReset();
    saveState();
    requestNotificationPermission();
    refreshInterval = setInterval(() => {
      ensureWeeklyReset();
      checkCatchUpReminders();
    }, 90_000);
    onCleanup(() => {
      if (refreshInterval) clearInterval(refreshInterval);
      clearCatchUpReminderMemory();
    });
  });

  // Re-check every time the page is focused
  createEffect(() => {
    if (typeof window === 'undefined') return;
    const onVis = () => { if (!document.hidden) { ensureWeeklyReset(); checkCatchUpReminders(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });

  const settings = () => state.timebudget.settings;

  const week = () => getCurrentBudgetWeek(new Date(), settings().resetDay, settings().resetHour);

  const weekProgress = () => getWeekProgress(new Date(), settings().resetDay, settings().resetHour);

  const filtered = () => {
    let acts = [...(state.timebudget.activities || [])];
    const q = search().toLowerCase();
    if (q) acts = acts.filter(a => a.name.toLowerCase().includes(q) || (a.tags || []).some(tag => tag.includes(q)));
    if (filterZone() !== 'all') acts = acts.filter(a => getActivityZone(a) === filterZone());
    const sk = sortKey();
    acts.sort((a, b) => {
      if (sk === 'priority') return a.priority - b.priority;
      if (sk === 'deficit') {
        const za = getActivityZone(a);
        const zb = getActivityZone(b);
        const order: Record<string, number> = { deficit: 0, danger: 1, progress: 2, target: 3 };
        const dz = (order[za] ?? 4) - (order[zb] ?? 4);
        return dz !== 0 ? dz : a.priority - b.priority;
      }
      if (sk === 'progress') {
        const pa = a.currentMinutes / Math.max(1, a.targetHours * 60);
        const pb = b.currentMinutes / Math.max(1, b.targetHours * 60);
        return pa - pb;
      }
      return a.name.localeCompare(b.name);
    });
    return acts;
  };

  const totalLogged = () => (state.timebudget.activities || []).reduce((s, a) => s + a.currentMinutes, 0);
  const targetTotal = () => (state.timebudget.activities || []).reduce((s, a) => s + a.targetHours * 60, 0);

  const openManualLog = (act: TimeBudgetActivity) => { setLogTarget(act); setLogModalOpen(true); };
  const openEdit = (act: TimeBudgetActivity) => { setEditTarget(act); setFormModalOpen(true); };
  const openDeleteConfirm = (act: TimeBudgetActivity) => { setDeleteTarget(act); };

  const handleQuickAdd = (act: TimeBudgetActivity, minutes: number) => {
    logTime(act.id, minutes);
    showToast(t('timebudget.toasts.logAdded', { name: act.name, minutes: String(minutes) }));
  };

  const handleUndo = (act: TimeBudgetActivity) => {
    if (undoLastLog(act.id)) {
      showToast(t('timebudget.undoToast', { name: act.name, minutes: '1 session' }));
    } else {
      showToast(t('timebudget.nothingToUndo', { name: act.name }));
    }
  };

  const handleExport = () => {
    if (typeof window === 'undefined') return;
    const blob = new Blob([JSON.stringify(state.timebudget, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waifu_timebudget_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t('timebudget.exportSuccess'));
  };

  const handleImport = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const raw = JSON.parse(evt.target?.result as string);
        if (raw && typeof raw === 'object' && Array.isArray(raw.activities)) {
          setState('timebudget', raw);
          saveState();
          showToast(t('timebudget.importSuccess', { count: String(raw.activities.length) }));
        } else {
          showToast(t('timebudget.importFailed'));
        }
      } catch {
        showToast(t('timebudget.importFailed'));
      }
    };
    reader.readAsText(file);
    input.value = '';
  };

  return (
    <div class="timebudget-layout">
      {/* Header */}
      <div class="timebudget-header">
        <div class="timebudget-heading">
          <h1>{t('timebudget.title')}</h1>
          <p class="timebudget-subtitle">{t('timebudget.subtitle')}</p>
        </div>
        <div class="timebudget-toolbar">
          <div class="timebudget-week-chip">📅 {t('timebudget.weekLabel', { week: week().slice(-2) })}</div>
          <button type="button" class="timebudget-btn" onClick={() => setSettingsOpen(true)} title={t('timebudget.settingsTitle')}><PhGearSix /></button>
          <button type="button" class="timebudget-btn" onClick={() => { setEditTarget(null); setFormModalOpen(true); }}><PhPlus /> {t('timebudget.addActivity')}</button>
          <button type="button" class="timebudget-btn" onClick={handleExport} title={t('timebudget.export')}><PhDownloadSimple /></button>
          <label class="timebudget-btn" title={t('timebudget.import')} style={{ cursor: 'pointer' }}><PhUploadSimple />
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </label>
        </div>
      </div>

      {/* Stats strip */}
      <div class="timebudget-stats">
        <div class="timebudget-stat">
          <span class="stat-value">{formatDurationHours(totalLogged())}</span>
          <span class="stat-label">Total logged</span>
        </div>
        <div class="timebudget-stat">
          <span class="stat-value">{formatDurationHours(targetTotal())}</span>
          <span class="stat-label">Target total</span>
        </div>
        <div class="timebudget-stat">
          <span class="stat-value">{targetTotal() > 0 ? Math.round((totalLogged() / targetTotal()) * 100) : 0}%</span>
          <span class="stat-label">Week progress</span>
        </div>
        <div class="timebudget-stat">
          <span class="stat-value">{Math.round(weekProgress() * 100)}%</span>
          <span class="stat-label">Elapsed</span>
        </div>
      </div>

      {/* Sort/filter bar */}
      <div style={{ 'display': 'flex', 'gap': '10px', 'flex-wrap': 'wrap', 'align-items': 'center', 'margin-bottom': '18px' }}>
        <div style={{ 'display': 'flex', 'gap': '6px', 'align-items': 'center' }}>
          <span style={{ 'font-size': '0.82rem', 'color': 'var(--text-muted)', 'font-weight': '600' }}>{t('timebudget.sortBy')}</span>
          <For each={[
            { value: 'priority' as SortKey, label: t('timebudget.sortPriority') },
            { value: 'deficit' as SortKey, label: t('timebudget.sortDeficit') },
            { value: 'progress' as SortKey, label: t('timebudget.sortProgress') },
            { value: 'name' as SortKey, label: t('timebudget.sortName') }
          ]}>
            {opt => (
              <button
                type="button"
                class={`timebudget-btn${sortKey() === opt.value ? ' primary' : ''}`}
                style={{ 'padding': '6px 12px', 'font-size': '0.8rem' }}
                onClick={() => setSortKey(opt.value)}
              >{opt.label}</button>
            )}
          </For>
        </div>
        <div style={{ 'display': 'flex', 'gap': '6px', 'align-items': 'center' }}>
          <span style={{ 'font-size': '0.82rem', 'color': 'var(--text-muted)', 'font-weight': '600' }}>{t('timebudget.filterZone')}</span>
          <For each={[
            { value: 'all' as FilterZone, label: t('timebudget.zoneAll') },
            { value: 'deficit' as FilterZone, label: t('timebudget.zone.deficit') },
            { value: 'progress' as FilterZone, label: t('timebudget.zone.progress') },
            { value: 'target' as FilterZone, label: t('timebudget.zone.target') },
            { value: 'danger' as FilterZone, label: t('timebudget.zone.danger') }
          ]}>
            {opt => (
              <button
                type="button"
                class={`timebudget-btn${filterZone() === opt.value ? ' primary' : ''}`}
                style={{ 'padding': '6px 12px', 'font-size': '0.8rem' }}
                onClick={() => setFilterZone(opt.value)}
              >{opt.label}</button>
            )}
          </For>
        </div>
        <input
          type="text"
          class="modal-input"
          style={{ 'padding': '6px 12px', 'font-size': '0.85rem', 'flex': '1', 'min-width': '160px', 'max-width': '260px' }}
          placeholder={t('timebudget.search')}
          value={search()}
          onInput={e => setSearch(e.currentTarget.value)}
          data-testid="tb-search"
        />
      </div>

      {/* Activity grid */}
      <div class="timebudget-grid">
        <Show when={filtered().length > 0} fallback={
          <div class="tb-empty" data-testid="tb-empty">
            <div class="tb-empty-icon">📊</div>
            <p>{t('timebudget.empty')}</p>
            <button type="button" class="gcal-btn gcal-btn-primary" onClick={() => { setEditTarget(null); setFormModalOpen(true); }}>
              <PhPlus /> {t('timebudget.addActivity')}
            </button>
          </div>
        }>
          {filtered().map(a => (
            <TimeActivityCard
              activity={a}
              onQuickAdd={(mins) => handleQuickAdd(a, mins)}
              onOpenManualLog={() => openManualLog(a)}
              onUndo={() => handleUndo(a)}
              onEdit={() => openEdit(a)}
              onDelete={() => openDeleteConfirm(a)}
            />
          ))}
        </Show>
      </div>

      {/* Modals */}
      <TimeLogModal
        isOpen={logModalOpen()}
        activity={logTarget()}
        onClose={() => setLogModalOpen(false)}
      />
      <TimeActivityFormModal
        isOpen={formModalOpen()}
        editActivity={editTarget()}
        onClose={() => setFormModalOpen(false)}
      />
      <TimeBudgetSettingsModal
        isOpen={settingsOpen()}
        settings={settings()}
        onClose={() => setSettingsOpen(false)}
      />
      <ConfirmDeleteModal
        isOpen={!!deleteTarget()}
        name={deleteTarget()?.name || ''}
        onConfirm={() => {
          if (deleteTarget()) {
            const name = deleteTarget()!.name;
            deleteTimeBudgetActivity(deleteTarget()!.id);
            showToast(t('timebudget.toasts.activityDeleted', { name }));
            setDeleteTarget(null);
          }
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}