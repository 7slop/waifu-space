import { createSignal, Show, For } from 'solid-js';
import { state } from '../../lib/store';
import { dmState, clearSearch, dmSearch } from '../../lib/dm/store';
import { t } from '../../lib/i18n';
import { PhMagnifyingGlass, PhX } from '../icons';
import { DmAvatar } from './DmAvatar';
import { DmProfilePopover } from './DmProfilePopover';
import { DmChannelList } from './DmChannelList';
import { DmPresenceStatusMenu } from './DmPresenceStatusMenu';

/**
 * Left sidebar of the DM home page: a user/conversation search box, the
 * conversation list, and the user's identity + presence menu pinned to the
 * bottom (Discord-style). Clicking the own profile opens a popup near it.
 */
export function DmSidebar() {
  const [query, setQuery] = createSignal('');
  const [profileOpen, setProfileOpen] = createSignal(false);
  let userPanelRef: HTMLDivElement | undefined;

  const onQuery = (value: string) => {
    setQuery(value);
    void dmSearch(value);
  };

  const clear = () => {
    setQuery('');
    clearSearch();
  };

  const openProfile = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.dm-status-wrap')) return;
    setProfileOpen((v) => !v);
  };

  const ownId = () => state.user?.id ?? null;
  const anchor = () => (userPanelRef ? userPanelRef.getBoundingClientRect() : new DOMRect(0, 0, 0, 0));

  return (
    <aside class="dm-sidebar" data-testid="dm-sidebar">
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

      <div class="dm-user-panel" data-testid="dm-user-panel" ref={userPanelRef} onClick={openProfile}>
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

      <Show when={profileOpen() && ownId()}>
        <DmProfilePopover userId={ownId()!} anchor={anchor} onClose={() => setProfileOpen(false)} />
      </Show>
    </aside>
  );
}