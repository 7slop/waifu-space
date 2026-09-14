import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { initDm, disconnectDm, dmState } from '../../lib/dm/store';
import { t } from '../../lib/i18n';
import { DmSidebar } from './DmSidebar';
import { DmChatPanel } from './DmChatPanel';

/**
 * The home page when a registered user is signed in: a Discord-style DM
 * interface. Boots the DM realtime connections + data on mount, and tears them
 * down on unmount or logout.
 */
export function DmHome() {
  const [booted, setBooted] = createSignal(false);

  onMount(() => {
    void initDm().finally(() => setBooted(true));
  });

  onCleanup(() => {
    void disconnectDm();
  });

  const ready = () => dmState.ready;

  return (
    <div class="dm-home" data-testid="dm-home">
      <Show
        when={ready()}
        fallback={
          <div class="dm-boot" data-testid="dm-boot">
            <Show when={dmState.error} fallback={<>{t('dm.loading')}</>}>
              <span class="dm-boot-error">{dmState.error}</span>
            </Show>
          </div>
        }
      >
        <DmSidebar />
        <DmChatPanel />
      </Show>
    </div>
  );
}