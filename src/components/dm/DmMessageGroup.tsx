import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { isOwnMessage, mediaSourceOf, gifKeyOfUrl, formatMessageTime, MediaKind } from '../../lib/dm/api';
import { gifToggleFavoriteByUrl, isGifFavorited, toggleReaction } from '../../lib/dm/store';
import { QUICK_REACTIONS } from '../../lib/dm/emoji';
import { t } from '../../lib/i18n';
import { PhHeart, PhHeartFill, PhPhoneCall, PhPhoneDisconnect, PhPhoneIncoming } from '../icons';
import { DmAvatar } from './DmAvatar';
import { DmEmojiText, EmojiGlyph } from './DmEmojiText';
import type { DmMessage } from '../../lib/dm/types';

/** Parses a system payload stored in `content` ({"kind":"call-started","callType":"voice"}). */
export interface DmSystemContent {
  kind?: string;
  callType?: string;
}

export function parseDmSystemContent(content: string): DmSystemContent {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      return { kind: typeof parsed.kind === 'string' ? parsed.kind : undefined, callType: typeof parsed.callType === 'string' ? parsed.callType : undefined };
    }
  } catch {
    // falls through to the legacy plain-kind form ('call-started')
  }
  return { kind: content };
}

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

  const [addOpen, setAddOpen] = createSignal(false);

  const closeAddOnClickAway = (e: PointerEvent) => {
    if (!addOpen()) return;
    const el = e.target as HTMLElement | null;
    if (!el || (!el.closest('.dm-reaction-menu') && !el.closest('.dm-reaction-add'))) setAddOpen(false);
  };

  onMount(() => document.addEventListener('pointerdown', closeAddOnClickAway));
  onCleanup(() => document.removeEventListener('pointerdown', closeAddOnClickAway));

  const react = (emoji: string) => {
    void toggleReaction(props.message.id, emoji);
    setAddOpen(false);
  };

  const sys = () => (props.message.messageType === 'system' ? parseDmSystemContent(props.message.content) : null);

  const systemLabel = () => {
    const kind = sys()?.kind;
    switch (kind) {
      case 'call-started':
        return t(sys()?.callType ? 'dm.systemCallStartedVideo' : 'dm.systemCallStartedVoice');
      case 'call-end':
      case 'call-ended':
        return t('dm.systemCallEnded');
      case 'call-declined':
        return t('dm.systemCallDeclined');
      case 'call-missed':
        return t('dm.systemCallMissed');
      default:
        return props.message.content;
    }
  };

  const systemIcon = () => {
    switch (sys()?.kind) {
      case 'call-started':
        return <PhPhoneCall class="dm-system-icon started" />;
      case 'call-end':
      case 'call-ended':
        return <PhPhoneDisconnect class="dm-system-icon ended" />;
      case 'call-declined':
        return <PhPhoneDisconnect class="dm-system-icon declined" />;
      case 'call-missed':
        return <PhPhoneIncoming class="dm-system-icon missed" />;
      default:
        return <PhPhoneCall class="dm-system-icon started" />;
    }
  };

  return (
    <div
      class={`dm-msg${props.showAvatar ? ' dm-msg-header' : ' dm-msg-cont'}${own() ? ' dm-msg-own' : ''}`}
      data-testid="dm-message"
      data-message-id={props.message.id}
    >
      <Show when={props.message.messageType === 'system'} fallback={
        <>
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
                <span class="dm-msg-time" title={new Date(props.message.createdAt).toLocaleString()}>
                  {formatMessageTime(props.message.createdAt)}
                </span>
              </div>
            </Show>
            <div class="dm-msg-content">
              <Show
                when={media()}
                fallback={<DmEmojiText text={props.message.content} />}
              >
                <div class="dm-msg-media-wrap">
                  <Show when={mediaKind() === 'video'} fallback={<img class="dm-msg-media" src={mediaUrl()!} alt="" loading="lazy" />}>
                    <video class="dm-msg-media" controls preload="metadata" src={mediaUrl()!} />
                  </Show>
                  <Show when={favId()}>
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
              </Show>
            </div>
            <Show when={(props.message.reactions?.length ?? 0) > 0}>
              <div class="dm-reactions-row" data-testid="dm-reactions-row">
                <For each={props.message.reactions ?? []}>
                  {(reaction) => {
                    const mine = () => (props.myUserId ? reaction.userIds.includes(props.myUserId) : false);
                    return (
                      <button
                        class={`dm-reaction-btn${mine() ? ' mine' : ''}`}
                        data-testid={`dm-reaction-${reaction.emoji.length > 4 ? reaction.emoji.codePointAt(0)!.toString(16) : reaction.emoji}`}
                        onClick={() => void react(reaction.emoji)}
                      >
                        <EmojiGlyph emoji={reaction.emoji} />
                        <span class="dm-reaction-count">{reaction.count}</span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>
            <div class="dm-reaction-add-wrap">
              <button
                class={`dm-reaction-add${addOpen() ? ' active' : ''}`}
                data-testid="dm-reaction-add"
                aria-label="Add reaction"
                onClick={() => setAddOpen(!addOpen())}
              >
                +
              </button>
              <Show when={addOpen()}>
                <div class="dm-reaction-menu" data-testid="dm-reaction-menu">
                  <For each={QUICK_REACTIONS}>
                    {(emoji) => (
                      <button class="dm-reaction-menu-item" aria-label={emoji} data-testid={`dm-reaction-menu-${emoji}`} onClick={() => react(emoji)}>
                        <EmojiGlyph emoji={emoji} />
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </>
      }>
        <div class="dm-msg-system" data-testid="dm-message-system">
          {systemIcon()}
          <span class="dm-system-text">{systemLabel()}</span>
        </div>
      </Show>
    </div>
  );
}