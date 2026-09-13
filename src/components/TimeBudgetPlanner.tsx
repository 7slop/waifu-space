import { createSignal, onMount, onCleanup, createEffect, Show } from 'solid-js';
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
  reorderTimeBudgetActivities,
  clearCatchUpReminderMemory,
  budgetCloudStatus,
  budgetKeyReady,
  unlockBudgetKey
} from '../lib/store';
import {
  TimeBudgetActivity,
  getWeekProgress,
  getCurrentBudgetWeek,
  formatDurationHours
} from '../lib/timebudget';
import { PhGearSix, PhPlus, PhUploadSimple, PhDownloadSimple } from './icons';
import { TimeActivityCard } from './TimeActivityCard';
import {
  TimeLogModal,
  TimeActivityFormModal,
  TimeBudgetSettingsModal,
  ConfirmDeleteModal
} from './TimeBudgetModals';

export function TimeBudgetPlanner() {
  const [logModalOpen, setLogModalOpen] = createSignal(false);
  const [logTarget, setLogTarget] = createSignal<TimeBudgetActivity | null>(null);
  const [formModalOpen, setFormModalOpen] = createSignal(false);
  const [editTarget, setEditTarget] = createSignal<TimeBudgetActivity | null>(null);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [deleteTarget, setDeleteTarget] = createSignal<TimeBudgetActivity | null>(null);

  // One-time unlock for devices that found cloud data but never had the account
  // password entered (auto-restored sessions). After this succeeds once, the
  // derived key is persisted and every later boot unlocks automatically.
  const [unlockPassword, setUnlockPassword] = createSignal('');
  const [unlockBusy, setUnlockBusy] = createSignal(false);
  const [unlockError, setUnlockError] = createSignal('');

  const locked = () => budgetCloudStatus() === 'locked' && !!state.user;

  const handleUnlock = async () => {
    if (unlockBusy() || !unlockPassword()) return;
    setUnlockBusy(true);
    setUnlockError('');
    try {
      const ok = await unlockBudgetKey(unlockPassword());
      if (ok) {
        setUnlockPassword('');
        showToast(t('timebudget.cloud.unlocked'));
      } else {
        setUnlockError(t('timebudget.cloud.unlockError'));
      }
    } catch {
      setUnlockError(t('timebudget.cloud.unlockError'));
    } finally {
      setUnlockBusy(false);
    }
  };

  // Drag & drop reorder state
  const [dragId, setDragId] = createSignal<string | null>(null);
  const [dropTargetId, setDropTargetId] = createSignal<string | null>(null);

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

  const activities = () => state.timebudget.activities || [];

  const totalLogged = () => activities().reduce((s, a) => s + a.currentMinutes, 0);
  const targetTotal = () => activities().reduce((s, a) => s + a.targetHours * 60, 0);

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

  const handleDropOn = (targetId: string) => {
    const sourceId = dragId();
    setDragId(null);
    setDropTargetId(null);
    if (sourceId && sourceId !== targetId) {
      reorderTimeBudgetActivities(sourceId, targetId);
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
          <Show when={budgetKeyReady() && budgetCloudStatus() === 'offline'}>
            <span class="tb-sync-status tb-sync-offline" title={t('timebudget.cloud.offline')}>{t('timebudget.cloud.offline')}</span>
          </Show>
          <Show when={budgetKeyReady() && budgetCloudStatus() === 'error'}>
            <span class="tb-sync-status tb-sync-error">{t('timebudget.cloud.syncError')}</span>
          </Show>
          <button type="button" class="timebudget-btn" onClick={() => setSettingsOpen(true)} title={t('timebudget.settingsTitle')}><PhGearSix /></button>
          <button type="button" class="timebudget-btn" onClick={() => { setEditTarget(null); setFormModalOpen(true); }}><PhPlus /> {t('timebudget.addActivity')}</button>
          <button type="button" class="timebudget-btn" onClick={handleExport} title={t('timebudget.export')}><PhDownloadSimple /></button>
          <label class="timebudget-btn" title={t('timebudget.import')} style={{ cursor: 'pointer' }}><PhUploadSimple />
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </label>
        </div>
      </div>

      {/* Locked state: a cloud copy exists that this device could not decrypt
          because the account password was never entered here. Asking once is the
          only way a second device can ever read the encrypted data. */}
      <Show when={locked()}>
        <div class="tb-locked-bar" data-testid="tb-locked-bar">
          <div class="tb-locked-icon">🔒</div>
          <div class="tb-locked-copy">
            <span class="tb-locked-title">{t('timebudget.cloud.locked')}</span>
            <span class="tb-locked-hint">{t('timebudget.cloud.unlockHint')}</span>
          </div>
          <form class="tb-unlock-form" onSubmit={e => { e.preventDefault(); void handleUnlock(); }}>
            <input
              type="password"
              class="tb-unlock-input"
              value={unlockPassword()}
              onInput={e => { setUnlockPassword((e.target as HTMLInputElement).value); setUnlockError(''); }}
              placeholder={t('timebudget.cloud.unlockPlaceholder')}
              aria-label={t('timebudget.cloud.unlockPlaceholder')}
              autocomplete="current-password"
            />
            <button type="submit" class="timebudget-btn" disabled={unlockBusy() || !unlockPassword()}>
              {unlockBusy() ? t('timebudget.cloud.unlocking') : t('timebudget.cloud.unlockButton')}
            </button>
          </form>
          <Show when={unlockError()}>
            <span class="tb-locked-error">{unlockError()}</span>
          </Show>
        </div>
      </Show>

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

      {/* Activity grid */}
      <div class="timebudget-grid">
        <Show when={activities().length > 0} fallback={
          <div class="tb-empty" data-testid="tb-empty">
            <div class="tb-empty-icon">📊</div>
            <p>{t('timebudget.empty')}</p>
            <button type="button" class="gcal-btn gcal-btn-primary" onClick={() => { setEditTarget(null); setFormModalOpen(true); }}>
              <PhPlus /> {t('timebudget.addActivity')}
            </button>
          </div>
        }>
          {activities().map(a => (
            <TimeActivityCard
              activity={a}
              draggable
              isDragging={dragId() === a.id}
              isDropTarget={dropTargetId() === a.id}
              onDragStart={setDragId}
              onDragEnd={() => { setDragId(null); setDropTargetId(null); }}
              onDragHover={setDropTargetId}
              onDropOn={(targetId) => {
                setDropTargetId(null);
                handleDropOn(targetId);
              }}
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