import { createSignal, Show } from 'solid-js';
import { isOwnMessage, mediaSourceOf, gifKeyOfUrl, formatMessageTime, MediaKind } from '../../lib/dm/api';
import { gifToggleFavoriteByUrl, isGifFavorited } from '../../lib/dm/store';
import { t } from '../../lib/i18n';
import { GlyphText, PhHeart, PhHeartFill } from '../icons';
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
  onAuthorClick?: (senderId: string, el: HTMLElement) => void;
}) {
  const own = () => isOwnMessage(props.message, props.myUserId);
  const media = () => mediaSourceOf(props.message);
  const mediaKind = (): MediaKind | null => media()?.kind ?? null;
  const mediaUrl = (): string | null => media()?.url ?? null;
  const favId = (): string | null => mediaUrl() ? gifKeyOfUrl(mediaUrl()!) : null;

  return (
    <div
      class={`dm-msg${props.showAvatar ? ' dm-msg-header' : ' dm-msg-cont'}${own() ? ' dm-msg-own' : ''}`}
      data-testid="dm-message"
      data-message-id={props.message.id}
    >
      <Show when={props.showAvatar}>
        <button
          class="dm-msg-avatar-btn"
          onClick={(e) => props.onAuthorClick?.(props.message.senderId, e.currentTarget)}
          aria-label={props.senderName}
        >
          <DmAvatar name={props.senderName} avatarUrl={props.senderAvatar} size="38px" class="dm-msg-avatar" />
        </button>
      </Show>
      <div class="dm-msg-body">
        <Show when={props.showAvatar}>
          <div class="dm-msg-meta">
            <button
              class="dm-msg-author"
              onClick={(e) => props.onAuthorClick?.(props.message.senderId, e.currentTarget)}
            >
              {props.senderName}
            </button>
            <Show when={own()}>
              <span class="dm-msg-you">({t('chat.you')})</span>
            </Show>
            <span class="dm-msg-time" title={new Date(props.message.createdAt).toLocaleString()}>
              {formatMessageTime(props.message.createdAt)}
            </span>
          </div>
        </Show>
        <div class="dm-msg-content">
          <Show
            when={media()}
            fallback={<GlyphText text={props.message.content} />}
          >
            <Show when={mediaKind() === 'video'} fallback={<img class="dm-msg-media" src={mediaUrl()!} alt="" loading="lazy" />}>
              <video class="dm-msg-media" controls preload="metadata" src={mediaUrl()!} />
            </Show>
          </Show>
          <Show when={media() && favId()}>
            <button
              class={`dm-msg-fav-btn${isGifFavorited(favId()!) ? ' favorited' : ''}`}
              data-testid={`dm-msg-fav-${favId()}`}
              aria-label={isGifFavorited(favId()!) ? 'Unfavorite' : 'Favorite'}
              onClick={() => void gifToggleFavoriteByUrl(mediaUrl()!, props.message.content)}
            >
              {isGifFavorited(favId()!) ? <PhHeartFill /> : <PhHeart />}
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}