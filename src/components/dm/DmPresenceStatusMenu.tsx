import { createSignal, Show } from 'solid-js';
import { dmState, setOwnPresence } from '../../lib/dm/store';
import { isStorableStatus, statusColor } from '../../lib/dm/presence';
import { t } from '../../lib/i18n';
import { PhCheck, PhX } from '../icons';
import type { PresenceStatus } from '../../lib/dm/types';

const STATUS_OPTIONS: PresenceStatus[] = ['online', 'idle', 'dnd', 'invisible'];

/**
 * Dropdown that lets the user change their own presence status and set a
 * custom status line (shown to others under the sidebar username).
 */
export function DmPresenceStatusMenu() {
  const [open, setOpen] = createSignal(false);
  const [custom, setCustom] = createSignal('');

  const currentStatus = (): PresenceStatus => {
    const status = dmState.myPresence?.status;
    return isStorableStatus(status) ? status : 'offline';
  };

  const choose = (status: PresenceStatus) => {
    void setOwnPresence(status, dmState.myPresence?.customStatus ?? null);
    setOpen(false);
  };

  const saveCustom = () => {
    const value = custom().trim();
    void setOwnPresence(currentStatus(), value || null);
    setCustom('');
    setOpen(false);
  };

  return (
    <div class="dm-status-wrap">
      <button
        class="dm-user-status-btn"
        data-testid="dm-status-menu-btn"
        aria-label={t('dm.setStatus')}
        onClick={() => setOpen((v) => !v)}
      >
        <span class="dm-status-dot" style={{ background: statusColor(currentStatus()) }} />
        <span class="dm-user-status-label">{t(`dm.${currentStatus()}`)}</span>
      </button>

      <Show when={open()}>
        <div class="dm-status-menu" data-testid="dm-status-menu">
          {STATUS_OPTIONS.map((status) => (
            <button
              class={`dm-status-option${status === currentStatus() ? ' active' : ''}`}
              data-testid={`dm-status-${status}`}
              onClick={() => choose(status)}
            >
              <span class="dm-status-dot" style={{ background: statusColor(status) }} />
              <span class="dm-status-option-text">{t(`dm.${status}`)}</span>
              <Show when={status === currentStatus()}>
                <PhCheck class="dm-status-check" />
              </Show>
            </button>
          ))}
          <div class="dm-status-custom-row">
            <input
              class="dm-status-custom-input"
              data-testid="dm-status-custom-input"
              value={custom()}
              placeholder={t('dm.customStatusPlaceholder')}
              onInput={(e) => setCustom(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCustom();
              }}
            />
            <button class="dm-status-custom-save" data-testid="dm-status-custom-save" onClick={saveCustom}>
              <PhCheck />
            </button>
            <button class="dm-status-custom-clear" onClick={() => { void setOwnPresence(currentStatus(), null); setCustom(''); setOpen(false); }} title={t('dm.clearCustomStatus')}>
              <PhX />
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}