import { createSignal, Show, For } from 'solid-js';
import { state } from '../../lib/store';
import { dmState, clearSearch, dmSearch } from '../../lib/dm/store';
import { t } from '../../lib/i18n';
import { PhMagnifyingGlass, PhX } from '../icons';
import { DmAvatar } from './DmAvatar';
import { DmChannelList } from './DmChannelList';
import { DmPresenceStatusMenu } from './DmPresenceStatusMenu';

/**
 * Left sidebar of the DM home page: the user's identity + presence menu, a
 * user/conversation search box, and the conversation list.
 */
export function DmSidebar() {
  const [query, setQuery] = createSignal('');

  const onQuery = (value: string) => {
    setQuery(value);
    void dmSearch(value);
  };

  const clear = () => {
    setQuery('');
    clearSearch();
  };

  return (
    <aside class="dm-sidebar" data-testid="dm-sidebar">
      <div class="dm-user-panel">
        <DmAvatar
          name={state.user?.username ?? '?'}
          avatarUrl={state.user?.avatarUrl}
          status={dmState.myPresence?.status ?? 'offline'}
          size="40px"
        />
        <div class="dm-user-meta">
          <span class="dm-user-name">{state.user?.username ?? ''}</span>
          <DmPresenceStatusMenu />
        </div>
      </div>

      <div class="dm-search">
        <PhMagnifyingGlass class="dm-search-icon" />
        <input
          class="dm-search-input"
          data-testid="dm-search-input"
          value={query()}
          placeholder={t('dm.searchPlaceholder')}
          onInput={(e) => onQuery(e.currentTarget.value)}
          aria-label={t('dm.searchPlaceholder')}
        />
        <Show when={query()}>
          <button class="dm-search-clear" onClick={clear} aria-label={t('common.close')} data-testid="dm-search-clear">
            <PhX />
          </button>
        </Show>
      </div>

      <div class="dm-list-scroll">
        <DmChannelList />
      </div>
    </aside>
  );
}