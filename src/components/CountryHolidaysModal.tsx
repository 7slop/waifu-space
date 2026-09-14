import { createSignal, createEffect, For, Show } from 'solid-js';
import {
  state,
  setState,
  saveState,
  showToast,
  fetchCountryCatalog,
  setCountryHolidays,
  setCulturalHolidaysEnabled,
} from '../lib/store';
import {
  requestNotificationPermission,
  getNotificationPermission,
  sendTestNotification,
} from '../lib/notifications';
import { CountryInfo, countryFlagEmoji } from '../lib/countries';
import { t } from '../lib/i18n';
import { useFocusTrap } from '../lib/accessibility';
import { SettingsIcon, PhX, PhConfetti, PhClock } from './icons';

const TITLE_ID = 'holidays-modal-title';

/**
 * Calendar settings dialog (opened from the toolbar gear). Holds a
 * "Calendar view settings" section (time format + browser notifications) and
 * the country-holidays picker. Toggling applies immediately and is saved to
 * settings, synced to the cloud.
 */
export function CountryHolidaysModal(props: { isOpen: boolean; onClose: () => void }) {
  const dialogRef = useFocusTrap(() => props.isOpen, () => props.onClose());

  const [countries, setCountries] = createSignal<CountryInfo[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loadError, setLoadError] = createSignal(false);
  const [search, setSearch] = createSignal('');

  const loadCatalog = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const list = await fetchCountryCatalog();
      if (list.length === 0) {
        setLoadError(true);
      } else {
        setCountries(list);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.isOpen) void loadCatalog();
  });

  const selected = () => (state.settings.countryHolidays || []) as string[];

  const toggle = (code: string, on: boolean) => {
    const next = selected().filter(c => c !== code);
    if (on) next.push(code);
    setCountryHolidays(next);
  };

  const filtered = () => {
    const q = search().trim().toLowerCase();
    const list = countries();
    if (!q) return list;
    return list.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  };

  const clearSelection = () => {
    setCountryHolidays([]);
  };

  const toggleNotifications = async (checked: boolean) => {
    if (!checked) {
      setState('settings', 'notificationsEnabled', false);
      saveState();
      return;
    }
    const permission = await requestNotificationPermission();
    if (permission === 'granted') {
      setState('settings', 'notificationsEnabled', true);
      saveState();
      showToast(t('notifications.enabledToast'));
    } else {
      setState('settings', 'notificationsEnabled', false);
      saveState();
      showToast(t('notifications.permissionDenied'));
    }
  };

  const setTimeFormat = (format: '24h' | '12h') => {
    if (state.settings.timeFormat === format) return;
    setState('settings', 'timeFormat', format);
    saveState();
  };

  const setWeekStart = (ws: 0 | 1 | 6) => {
    if (state.settings.weekStart === ws) return;
    setState('settings', 'weekStart', ws);
    saveState();
  };

  const toggleSound = (checked: boolean) => {
    if (state.settings.soundEnabled === checked) return;
    setState('settings', 'soundEnabled', checked);
    saveState();
  };

  const handleTestNotification = async () => {
    let permission = getNotificationPermission();
    if (permission === 'default' || permission === 'unsupported') {
      permission = await requestNotificationPermission();
    }
    if (permission === 'granted') {
      sendTestNotification();
      showToast(t('calendar.viewSettings.testDelivered'));
    } else {
      showToast(t('calendar.viewSettings.testFallback'));
    }
  };

  const permissionLabel = () => {
    switch (getNotificationPermission()) {
      case 'granted':
        return t('calendar.viewSettings.permissionGranted');
      case 'denied':
        return t('calendar.viewSettings.permissionDenied');
      case 'default':
        return t('calendar.viewSettings.permissionDefault');
      default:
        return t('calendar.viewSettings.permissionUnsupported');
    }
  };

  return (
    <div
      ref={dialogRef}
      class={`gcal-modal-overlay ${props.isOpen ? 'active' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      onClick={e => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="gcal-modal" style={{ 'max-width': '460px' }}>
        <div class="modal-header">
          <h3 id={TITLE_ID}>
            <SettingsIcon size={16} class="modal-title-icon" /> {t('calendar.holidays.title')}
          </h3>
          <button class="modal-close-btn" type="button" onClick={props.onClose} aria-label={t('common.close')}>
            <PhX />
          </button>
        </div>

        <div class="holiday-modal-body">
          {/* ------------- CALENDAR VIEW SETTINGS ------------- */}
          <section class="view-settings-section" aria-label={t('calendar.viewSettings.title')}>
            <h4 class="vs-section-title">{t('calendar.viewSettings.title')}</h4>

            <div class="vs-row">
              <div class="vs-label-wrap">
                <span class="vs-title">{t('calendar.viewSettings.timeFormat')}</span>
                <span class="vs-desc">{t('calendar.viewSettings.timeFormatDesc')}</span>
              </div>
              <div class="vs-options">
                <button
                  type="button"
                  class={`vs-option ${state.settings.timeFormat === '12h' ? 'active' : ''}`}
                  onClick={() => setTimeFormat('12h')}
                >
                  {t('calendar.viewSettings.timeFormat12h')}
                </button>
                <button
                  type="button"
                  class={`vs-option ${state.settings.timeFormat === '24h' ? 'active' : ''}`}
                  onClick={() => setTimeFormat('24h')}
                >
                  {t('calendar.viewSettings.timeFormat24h')}
                </button>
              </div>
            </div>

            <div class="vs-row">
              <div class="vs-label-wrap">
                <span class="vs-title">{t('calendar.viewSettings.notifications')}</span>
                <span class="vs-desc">{t('calendar.viewSettings.notificationsDesc')}</span>
              </div>
              <input
                type="checkbox"
                class="vs-switch"
                checked={state.settings.notificationsEnabled}
                onChange={e => toggleNotifications(e.currentTarget.checked)}
                aria-label={t('calendar.viewSettings.notifications')}
              />
            </div>
            <div class="vs-notif-actions">
              <span class="vs-status"><PhClock /> {permissionLabel()}</span>
              <button type="button" class="vs-test-btn" onClick={() => void handleTestNotification()}>
                {t('calendar.viewSettings.test')}
              </button>
            </div>

            <div class="vs-row">
              <div class="vs-label-wrap">
                <span class="vs-title">{t('calendar.viewSettings.sound')}</span>
                <span class="vs-desc">{t('calendar.viewSettings.soundDesc')}</span>
              </div>
              <input
                type="checkbox"
                class="vs-switch"
                checked={state.settings.soundEnabled}
                onChange={e => toggleSound(e.currentTarget.checked)}
                aria-label={t('calendar.viewSettings.sound')}
              />
            </div>

            <div class="vs-row">
              <div class="vs-label-wrap">
                <span class="vs-title">{t('calendar.viewSettings.weekStart')}</span>
                <span class="vs-desc">{t('calendar.viewSettings.weekStartDesc')}</span>
              </div>
              <div class="vs-options">
                <button
                  type="button"
                  class={`vs-option ${state.settings.weekStart === 0 ? 'active' : ''}`}
                  onClick={() => setWeekStart(0)}
                >
                  {t('calendar.viewSettings.weekStartSun')}
                </button>
                <button
                  type="button"
                  class={`vs-option ${state.settings.weekStart === 1 ? 'active' : ''}`}
                  onClick={() => setWeekStart(1)}
                >
                  {t('calendar.viewSettings.weekStartMon')}
                </button>
                <button
                  type="button"
                  class={`vs-option ${state.settings.weekStart === 6 ? 'active' : ''}`}
                  onClick={() => setWeekStart(6)}
                >
                  {t('calendar.viewSettings.weekStartSat')}
                </button>
              </div>
            </div>
          </section>

          <div class="vs-section-divider" />

          {/* ------------- COUNTRY HOLIDAYS ------------- */}
          <p class="holiday-modal-subtitle">{t('calendar.holidays.subtitle')}</p>

          <label class="holiday-culture-toggle">
            <input
              type="checkbox"
              checked={!!state.settings.showCulturalHolidays}
              onChange={e => setCulturalHolidaysEnabled(e.currentTarget.checked)}
            />
            <span class="holiday-culture-emoji"><PhConfetti /></span>
            <span class="holiday-culture-label">{t('calendar.holidays.culturalLabel')}</span>
          </label>
          <p class="holiday-culture-desc">{t('calendar.holidays.culturalDesc')}</p>

          <input
            type="text"
            class="holiday-search-input"
            placeholder={t('calendar.holidays.searchPlaceholder')}
            aria-label={t('calendar.holidays.searchPlaceholder')}
            value={search()}
            onInput={e => setSearch(e.currentTarget.value)}
          />

          <Show when={!(loading() || loadError())}>
            <div class="holiday-country-list">
              <For each={filtered()}>
                {c => (
                  <label class="holiday-country-item">
                    <input
                      type="checkbox"
                      checked={selected().includes(c.code)}
                      onChange={e => toggle(c.code, e.currentTarget.checked)}
                    />
                    <span class="holiday-flag">{countryFlagEmoji(c.code)}</span>
                    <span class="holiday-country-name">{c.name}</span>
                    <span class="holiday-country-code">{c.code}</span>
                  </label>
                )}
              </For>
              <Show when={!loading() && filtered().length === 0}>
                <p class="holiday-modal-note">{t('calendar.holidays.noResults')}</p>
              </Show>
            </div>
          </Show>

          <Show when={loading()}>
            <p class="holiday-modal-note">{t('calendar.holidays.loading')}</p>
          </Show>

          <Show when={!loading() && loadError()}>
            <p class="holiday-modal-note holiday-modal-error">{t('calendar.holidays.loadError')}</p>
          </Show>

          <div class="holiday-modal-footer">
            <Show when={selected().length > 0}>
              <button type="button" class="gcal-btn gcal-btn-outline holiday-clear-btn" onClick={clearSelection}>
                {t('calendar.holidays.clear')}
              </button>
            </Show>
            <span class="holiday-modal-source">{t('calendar.holidays.sourceNote')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}