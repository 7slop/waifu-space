import { createSignal, createEffect, Show } from 'solid-js';
import { t, getLocale } from '../lib/i18n';
import { showToast, logTime } from '../lib/store';
import {
  addTimeBudgetActivity,
  updateTimeBudgetActivity,
  deleteTimeBudgetActivity,
  setTimeBudgetSettings
} from '../lib/store';
import {
  TimeBudgetActivity,
  TimeBudgetSettings,
  ACTIVITY_COLORS
} from '../lib/timebudget';
import { PhX } from './icons';

// ─── Manual time-logging modal ─────────────────────────────────────────────
export function TimeLogModal(props: {
  isOpen: boolean;
  activity: TimeBudgetActivity | null;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = createSignal<number>(30);
  const [note, setNote] = createSignal('');

  createEffect(() => {
    if (props.isOpen) {
      setMinutes(30);
      setNote('');
    }
  });

  const QUICK = [15, 30, 60];

  const submit = (e: Event) => {
    e.preventDefault();
    const act = props.activity;
    if (!act) return;
    const m = Number(minutes());
    if (!m || m <= 0) return;
    logTime(act.id, m, note() || undefined);
    showToast(t('timebudget.toasts.logAdded', { name: act.name, minutes: String(Math.round(m)) }));
    props.onClose();
  };

  return (
    <div class={`gcal-modal-overlay ${props.isOpen ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="gcal-modal" style={{ 'max-width': '420px' }} data-testid="tb-log-modal">
        <div class="modal-header">
          <h3 style={{ margin: 0, 'font-size': '1.1rem', color: 'var(--text-primary)' }}>
            {t('timebudget.manualLogTitle', { name: props.activity?.name || '' })}
          </h3>
          <button type="button" class="modal-close-btn" onClick={props.onClose}><PhX /></button>
        </div>
        <form class="tb-modal-form" onSubmit={submit}>
          <div class="form-group">
            <label class="form-label">{t('timebudget.logMinutes')}</label>
            <input type="number" class="modal-input" min={1} value={minutes()} onInput={e => setMinutes(parseInt(e.currentTarget.value, 10) || 0)} required data-testid="tb-log-minutes" />
          </div>
          <div class="form-group">
            <div class="tb-quick-amount-chips">
              {QUICK.map(m => (
                <button type="button" class="tb-mini-chip" onClick={() => setMinutes(m)}>+{m >= 60 ? `${m / 60}h` : `${m}m`}</button>
              ))}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">{t('timebudget.manualLogNote')}</label>
            <input type="text" class="modal-input" placeholder="..." value={note()} onInput={e => setNote(e.currentTarget.value.slice(0, 200))} />
          </div>
          <div class="modal-actions">
            <button type="button" class="gcal-btn gcal-btn-outline" onClick={props.onClose}>{t('common.cancel')}</button>
            <button type="submit" class="gcal-btn gcal-btn-primary" data-testid="tb-log-submit">{t('timebudget.addTime')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Activity CRUD form modal ──────────────────────────────────────────────
export function TimeActivityFormModal(props: {
  isOpen: boolean;
  editActivity: TimeBudgetActivity | null;
  onClose: () => void;
}) {
  const [name, setName] = createSignal('');
  const [minH, setMinH] = createSignal(4);
  const [targetH, setTargetH] = createSignal(6);
  const [dangerH, setDangerH] = createSignal<number | null>(null);
  const [tags, setTags] = createSignal('');
  const [priority, setPriority] = createSignal(5);
  const [color, setColor] = createSignal('');
  const [error, setError] = createSignal('');

  createEffect(() => {
    if (props.isOpen) {
      setError('');
      if (props.editActivity) {
        const a = props.editActivity;
        setName(a.name);
        setMinH(a.minHours);
        setTargetH(a.targetHours);
        setDangerH(a.dangerHours);
        setTags((a.tags || []).join(', '));
        setPriority(a.priority);
        setColor(a.color || '');
      } else {
        setName('');
        setMinH(4);
        setTargetH(6);
        setDangerH(null);
        setTags('');
        setPriority(5);
        setColor(ACTIVITY_COLORS[Math.floor(Math.random() * ACTIVITY_COLORS.length)]);
      }
    }
  });

  const isEdit = () => !!props.editActivity;

  const submit = (e: Event) => {
    e.preventDefault();
    const n = (name() || '').trim();
    if (!n) { setError(t('timebudget.activityName')); return; }

    if (isEdit() && props.editActivity) {
      const patched = {
        name: n,
        minHours: Math.max(0, minH()),
        targetHours: Math.max(1, targetH()),
        dangerHours: dangerH() && dangerH()! > 0 ? dangerH() : null,
        tags: (tags() || '').split(',').map(t => t.trim()).filter(Boolean),
        priority: priority(),
        color: color() || undefined
      };
      updateTimeBudgetActivity(props.editActivity.id, patched);
      showToast(t('timebudget.toasts.activityUpdated', { name: n }));
    } else {
      const act = addTimeBudgetActivity({
        name: n,
        minHours: Math.max(0, minH()),
        targetHours: Math.max(1, targetH()),
        dangerHours: dangerH() && dangerH()! > 0 ? dangerH() : null,
        tags: (tags() || '').split(',').map(t => t.trim()).filter(Boolean),
        priority: priority(),
        color: color() || undefined
      });
      if (act) showToast(t('timebudget.toasts.activityAdded', { name: n }));
    }
    props.onClose();
  };

  const confirmDelete = () => {
    if (!props.editActivity) return;
    deleteTimeBudgetActivity(props.editActivity.id);
    showToast(t('timebudget.toasts.activityDeleted', { name: props.editActivity.name }));
    props.onClose();
  };

  return (
    <div class={`gcal-modal-overlay ${props.isOpen ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="gcal-modal" style={{ 'max-width': '460px' }}>
        <div class="modal-header">
          <h3 style={{ margin: 0, 'font-size': '1.1rem', color: 'var(--text-primary)' }}>
            {isEdit() ? t('timebudget.editActivity') : t('timebudget.addActivity')}
          </h3>
          <button type="button" class="modal-close-btn" onClick={props.onClose}><PhX /></button>
        </div>
        <form class="tb-modal-form" onSubmit={submit}>
          <div class="form-group">
            <label class="form-label">{t('timebudget.activityName')}</label>
            <input type="text" class="modal-input" value={name()} onInput={e => setName(e.currentTarget.value.slice(0, 60))} placeholder={t('timebudget.activityNamePlaceholder')} required data-testid="tb-act-name" />
          </div>

          <div class="form-group" style={{ 'display': 'grid', 'grid-template-columns': '1fr 1fr 1fr', 'gap': '12px' }}>
            <div class="tb-setting-row">
              <label class="form-label">{t('timebudget.minHours')}</label>
              <input type="number" class="modal-input" min={0} step={0.5} value={minH()} onInput={e => setMinH(parseFloat(e.currentTarget.value) || 0)} />
            </div>
            <div class="tb-setting-row">
              <label class="form-label">{t('timebudget.targetHours')}</label>
              <input type="number" class="modal-input" min={1} step={0.5} value={targetH()} onInput={e => setTargetH(parseFloat(e.currentTarget.value) || 1)} />
            </div>
            <div class="tb-setting-row">
              <label class="form-label">{t('timebudget.dangerHours')}</label>
              <input type="number" class="modal-input" min={0} step={0.5} value={dangerH() ?? ''} placeholder="..." onInput={e => setDangerH(parseFloat(e.currentTarget.value) || null)} />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">{t('timebudget.tags')}</label>
            <input type="text" class="modal-input" value={tags()} onInput={e => setTags(e.currentTarget.value.slice(0, 200))} placeholder="code, study, health" />
          </div>

          <div class="form-group">
            <label class="form-label">{t('timebudget.priority')}</label>
            <div style={{ 'display': 'flex', 'gap': '8px' }}>
              {[1, 5, 10].map(p => {
                const label = p === 1 ? t('timebudget.priorityHigh') : p === 5 ? t('timebudget.priorityMedium') : t('timebudget.priorityLow');
                return (
                  <button type="button" class={`gcal-btn gcal-btn-outline${priority() === p ? '' : ''}`} style={{ 'flex': 1, 'background': priority() === p ? 'var(--accent-soft)' : undefined, 'border-color': priority() === p ? 'var(--primary-accent)' : undefined, 'color': priority() === p ? 'var(--primary-accent)' : undefined, 'font-weight': '600', 'font-size': '0.85rem', 'border-radius': 'var(--radius-sm)', 'padding': '8px 10px' }} onClick={() => setPriority(p)}>{label}</button>
                );
              })}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Color</label>
            <div style={{ 'display': 'flex', 'gap': '8px', 'flex-wrap': 'wrap' }}>
              {ACTIVITY_COLORS.map(c => (
                <button type="button" class={`color-dot${color() === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>

          {error() && <p class="tb-form-error" role="alert">{error()}</p>}

          <div class="modal-actions">
            <Show when={isEdit()}>
              <button type="button" class="gcal-btn gcal-btn-danger" onClick={confirmDelete}>{t('timebudget.deleteActivity')}</button>
            </Show>
            <div style={{ flex: 1 }} />
            <button type="button" class="gcal-btn gcal-btn-outline" onClick={props.onClose}>{t('common.cancel')}</button>
            <button type="submit" class="gcal-btn gcal-btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Settings / schedule modal ─────────────────────────────────────────────
export function TimeBudgetSettingsModal(props: {
  isOpen: boolean;
  settings: TimeBudgetSettings;
  onClose: () => void;
}) {
  const [resetDay, setResetDay] = createSignal(props.settings.resetDay);
  const [resetHour, setResetHour] = createSignal(props.settings.resetHour);
  const [notifications, setNotifications] = createSignal(props.settings.notifications);
  const [catchUp, setCatchUp] = createSignal(props.settings.catchUpReminders);

  createEffect(() => {
    if (props.isOpen) {
      setResetDay(props.settings.resetDay);
      setResetHour(props.settings.resetHour);
      setNotifications(props.settings.notifications);
      setCatchUp(props.settings.catchUpReminders);
    }
  });

  const DAYS = () =>
    Array.from({ length: 7 }, (_, i) =>
      new Date(2026, 0, 5 + i).toLocaleDateString(getLocale(), { weekday: 'long' })
    );
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const save = () => {
    setTimeBudgetSettings({
      resetDay: resetDay(),
      resetHour: resetHour(),
      notifications: notifications(),
      catchUpReminders: catchUp()
    });
    props.onClose();
  };

  return (
    <div class={`gcal-modal-overlay ${props.isOpen ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="gcal-modal" style={{ 'max-width': '440px' }}>
        <div class="modal-header">
          <h3 style={{ margin: 0, 'font-size': '1.1rem', color: 'var(--text-primary)' }}>{t('timebudget.settingsTitle')}</h3>
          <button type="button" class="modal-close-btn" onClick={props.onClose}><PhX /></button>
        </div>
        <div class="tb-settings-form">
          <div class="tb-setting-row">
            <label class="form-label">{t('timebudget.resetDay')}</label>
            <select class="modal-select" value={resetDay()} onChange={e => setResetDay(parseInt(e.currentTarget.value, 10))}>
              {DAYS().map((d, i) => <option value={i + 1}>{d}</option>)}
            </select>
          </div>
          <div class="tb-setting-row">
            <label class="form-label">{t('timebudget.resetHour')}</label>
            <select class="modal-select" value={resetHour()} onChange={e => setResetHour(parseInt(e.currentTarget.value, 10))}>
              {hours.map(h => <option value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </div>
          <div class="tb-toggle-row">
            <div class="tb-toggle-text">
              <strong>{t('timebudget.notifications')}</strong>
              <small>{t('timebudget.notifications')}</small>
            </div>
            <input type="checkbox" checked={notifications()} onChange={e => setNotifications(e.currentTarget.checked)} />
          </div>
          <div class="tb-toggle-row">
            <div class="tb-toggle-text">
              <strong>{t('timebudget.catchUp')}</strong>
              <small>{t('timebudget.catchUp')}</small>
            </div>
            <input type="checkbox" checked={catchUp()} onChange={e => setCatchUp(e.currentTarget.checked)} />
          </div>
          <div class="modal-actions">
            <div style={{ flex: 1 }} />
            <button type="button" class="gcal-btn gcal-btn-outline" onClick={props.onClose}>{t('common.cancel')}</button>
            <button type="button" class="gcal-btn gcal-btn-primary" onClick={save}>{t('common.save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm delete modal ──────────────────────────────────────────────────
export function ConfirmDeleteModal(props: {
  isOpen: boolean;
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div class={`gcal-modal-overlay ${props.isOpen ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="gcal-modal" style={{ 'max-width': '380px', 'text-align': 'center' }}>
        <p style={{ 'font-size': '1.05rem', 'font-weight': 600, color: 'var(--text-primary)', 'margin-bottom': '8px' }}>{t('timebudget.deleteActivity')}</p>
        <p style={{ color: 'var(--text-secondary)', 'margin-bottom': '18px' }}>Remove <strong>{props.name}</strong> from your weekly budget?</p>
        <div style={{ 'display': 'flex', 'gap': '10px', 'justify-content': 'center' }}>
          <button type="button" class="gcal-btn gcal-btn-outline" onClick={props.onClose}>{t('common.cancel')}</button>
          <button type="button" class="gcal-btn gcal-btn-danger" onClick={props.onConfirm} data-testid="tb-confirm-delete">{t('common.delete')}</button>
        </div>
      </div>
    </div>
  );
}
