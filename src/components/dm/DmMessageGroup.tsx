import { Show } from 'solid-js';
import { isOwnMessage, mediaSourceOf, formatMessageTime } from '../../lib/dm/api';
import { t } from '../../lib/i18n';
import { GlyphText } from '../icons';
import { DmAvatar } from './DmAvatar';
import type { DmMessage } from '../../lib/dm/types';

/**
 * A single message row. When `showAvatar` is set the full "group header" is
 * rendered (avatar, author, timestamp); otherwise it is a compact continuation
 * line for messages from the same author within a few minutes.
 */
export function DmMessageGroup(props: {
  message: DmMessage;
  showAvatar: boolean;
  senderName: string;
  senderAvatar?: string | null;
  myUserId?: string | null;
}) {
  const own = () => isOwnMessage(props.message, props.myUserId);
  const media = () => mediaSourceOf(props.message);

  return (
    <div
      class={`dm-msg${props.showAvatar ? ' dm-msg-header' : ' dm-msg-cont'}${own() ? ' dm-msg-own' : ''}`}
      data-testid="dm-message"
      data-message-id={props.message.id}
    >
      <Show when={props.showAvatar}>
        <DmAvatar name={props.senderName} avatarUrl={props.senderAvatar} size="38px" class="dm-msg-avatar" />
      </Show>
      <div class="dm-msg-body">
        <Show when={props.showAvatar}>
          <div class="dm-msg-meta">
            <span class="dm-msg-author">{props.senderName}</span>
            <Show when={own()}>
              <span class="dm-msg-you">({t('chat.you')})</span>
            </Show>
            <span class="dm-msg-time" title={new Date(props.message.createdAt).toLocaleString()}>
              {formatMessageTime(props.message.createdAt)}
            </span>
          </div>
        </Show>
        <div class="dm-msg-content">
          <Show when={media()} fallback={<GlyphText text={props.message.content} />}>
            <img class="dm-msg-media" src={media()!} alt="" loading="lazy" />
          </Show>
        </div>
      </div>
    </div>
  );
}