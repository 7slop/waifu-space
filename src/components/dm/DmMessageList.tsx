import { createMemo, For, Show } from 'solid-js';
import { state } from '../../lib/store';
import { dmState, loadOlder } from '../../lib/dm/store';
import { formatDayDivider, isOwnMessage } from '../../lib/dm/api';
import { t } from '../../lib/i18n';
import { DmMessageGroup } from './DmMessageGroup';
import type { DmMessage } from '../../lib/dm/types';

interface Row {
  kind: 'divider' | 'message';
  key: string;
  day?: string;
  message?: DmMessage;
  showAvatar?: boolean;
}

const GROUPING_MS = 5 * 60 * 1000;

/** Scrolls a conversation's message view to the newest message. */
export function scrollDmToBottom(el: HTMLDivElement) {
  el.scrollTop = el.scrollHeight;
}

/**
 * The message timeline for the active conversation: inserts "Today /
 * Yesterday / date" day dividers and splits messages into visual groups
 * (avatar shown only for the first message of a run from the same author).
 */
export function DmMessageList(props?: { onAuthorClick?: (senderId: string, el: HTMLElement) => void }) {
  const convId = () => dmState.activeConversationId;
  const messages = () => dmState.messages[convId() ?? ''] ?? [];
  const otherUser = () => dmState.conversations.find((c) => c.id === convId())?.otherUser;

  const rows = createMemo<Row[]>(() => {
    const list = messages();
    const out: Row[] = [];
    let lastDay = '';
    let lastSender = '';
    let lastTime = 0;
    for (const message of list) {
      const day = formatDayDivider(message.createdAt);
      if (day && day !== lastDay) {
        out.push({ kind: 'divider', key: `day-${message.id}`, day });
        lastDay = day;
        lastSender = '';
        lastTime = 0;
      }
      const grouped = lastSender === message.senderId && new Date(message.createdAt).getTime() - lastTime < GROUPING_MS;
      out.push({ kind: 'message', key: message.id, message, showAvatar: !grouped });
      lastSender = message.messageType === 'system' ? '' : message.senderId;
      lastTime = new Date(message.createdAt).getTime();
    }
    return out;
  });

  const senderName = (msg: DmMessage) =>
    isOwnMessage(msg, state.user?.id)
      ? state.user?.username || 'You'
      : otherUser()?.username || 'User';

  const senderAvatar = (msg: DmMessage) =>
    isOwnMessage(msg, state.user?.id) ? state.user?.avatarUrl : otherUser()?.avatarUrl;

  return (
    <div class="dm-messages" data-testid="dm-messages">
      <Show when={messages().length === 0}>
        <div class="dm-no-messages">{t('dm.noMessages')}</div>
      </Show>
      <For each={rows()}>
        {(row) =>
          row.kind === 'divider' ? (
            <div class="dm-day-divider" data-testid="dm-day-divider">
              <span class="dm-day-divider-line" />
              <span class="dm-day-divider-text">{row.day}</span>
              <span class="dm-day-divider-line" />
            </div>
          ) : (
            <DmMessageGroup
              message={row.message!}
              showAvatar={row.showAvatar!}
              senderName={senderName(row.message!)}
              senderAvatar={senderAvatar(row.message!)}
              myUserId={state.user?.id}
              onAuthorClick={props?.onAuthorClick}
            />
          )
        }
      </For>
      <Show when={dmState.hasOlder[convId() ?? '']}>
        <div class="dm-load-older">
          <button
            class="dm-load-older-btn"
            data-testid="dm-load-older"
            disabled={dmState.loadingMessages.includes(convId() ?? '')}
            onClick={() => void loadOlder()}
          >
            {t('dm.loadOlder')}
          </button>
        </div>
      </Show>
    </div>
  );
}