import { createEffect, createMemo, For, Show } from 'solid-js';
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

/** Distance (px) from the bottom under which new messages still snap to the latest. */
const SCROLL_SNAP_MARGIN = 120;

/** The currently mounted message timeline, driven by scrollDmThreadToBottom(). */
let mountedScrollEl: HTMLDivElement | null = null;

/** Scrolls a conversation's message view to the newest message. */
export function scrollDmToBottom(el: HTMLDivElement) {
  el.scrollTop = el.scrollHeight;
}

function isNearBottom(el: HTMLDivElement): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_SNAP_MARGIN;
}

/**
 * Scrolls the mounted timeline (if any) to the newest message. Runs a double
 * requestAnimationFrame so media that loads after the message row is inserted
 * (GIFs/images change the row height) can settle before the final position is
 * computed — this lands at the true bottom instead of "almost at the bottom".
 */
export function scrollDmThreadToBottom() {
  const el = mountedScrollEl;
  if (!el) return;
  const tick = () => {
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
  };
  tick();
  requestAnimationFrame(tick);
  requestAnimationFrame(() => requestAnimationFrame(tick));
}

/**
 * Re-scrolls to the bottom only when the reader is already near it (used by
 * media load events so a freshly sent GIF snaps closed instead of leaving a
 * gap at the bottom of the timeline).
 */
export function scrollDmThreadToBottomIfNear() {
  const el = mountedScrollEl;
  if (!el || !isNearBottom(el)) return;
  requestAnimationFrame(() => {
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
  });
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

  // --- Auto-scroll (issue B) ---
  let lastConvId: string | null = null;
  let lastMessageCount = 0;
  let lastFirstId: string | null = null;
  let shouldSnapToBottom = false;

  // Opening a conversation always snaps to the newest message.
  createEffect(() => {
    const id = convId();
    if (id !== lastConvId) {
      lastConvId = id;
      lastMessageCount = 0;
      lastFirstId = null;
      shouldSnapToBottom = true;
    }
  });

  // New messages snap when the newest one is ours, or when the reader is near
  // the bottom. Prepending older history (load-more) never yanks the viewport.
  createEffect(() => {
    const el = mountedScrollEl;
    const list = messages();
    const count = list.length;
    const firstId = count ? list[0].id : null;
    const prepended = lastFirstId !== null && firstId !== null && firstId !== lastFirstId;

    if (!el || count === 0) {
      lastMessageCount = count;
      lastFirstId = firstId;
      return;
    }

    if (shouldSnapToBottom) {
      shouldSnapToBottom = false;
      scrollDmThreadToBottom();
    } else if (count > lastMessageCount && !prepended) {
      const newestIsMine = isOwnMessage(list[count - 1], state.user?.id);
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_SNAP_MARGIN;
      if (newestIsMine || nearBottom) scrollDmThreadToBottom();
    }
    lastMessageCount = count;
    lastFirstId = firstId;
  });

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
    <div class="dm-messages" data-testid="dm-messages" ref={(el) => (mountedScrollEl = el)}>
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