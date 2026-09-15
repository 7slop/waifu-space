import { createSignal, Show } from 'solid-js';
import { dmState, emitTyping, sendText, setEmojiOpen, setGifOpen } from '../../lib/dm/store';
import { t } from '../../lib/i18n';
import { PhPaperPlaneTilt, PhSmiley } from '../icons';
import { GifPicker } from './GifPicker';
import { EmojiPicker } from './EmojiPicker';

/**
 * The chat composer: a one-line textarea (Enter to send, Shift+Enter for a
 * newline), emoji + GIF buttons on the right side of the box, and a send
 * button. Keystrokes also broadcast a throttled "typing" indicator.
 */
export function DmInputBar() {
  const [text, setText] = createSignal('');
  const [textareaRef, setTextareaRef] = createSignal<HTMLTextAreaElement | undefined>(undefined);

  const otherName = () => dmState.conversations.find((c) => c.id === dmState.activeConversationId)?.otherUser?.username ?? '';
  const typingNames = () => {
    const ids = dmState.typing[dmState.activeConversationId ?? ''] ?? [];
    const conv = dmState.conversations.find((c) => c.id === dmState.activeConversationId);
    return ids.length ? [`${conv?.otherUser?.username ?? 'Someone'}`] : [];
  };

  const send = () => {
    const value = text().trim();
    if (!value || !dmState.activeConversationId) return;
    void sendText(value);
    setText('');
  };

  const insertEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
    setEmojiOpen(false);
    textareaRef()?.focus();
  };

  return (
    <div class="dm-input-area" data-testid="dm-input-area">
      <Show when={typingNames().length > 0}>
        <div class="dm-typing-indicator" data-testid="dm-typing-indicator">
          {t('dm.typingOne', { name: typingNames()[0] })}
        </div>
      </Show>
      <div class="dm-input-bar">
        <textarea
          ref={setTextareaRef}
          class="dm-input-textarea"
          data-testid="dm-input-textarea"
          value={text()}
          rows={1}
          placeholder={t('dm.messagePlaceholder', { name: otherName() })}
          onInput={(e) => {
            setText(e.currentTarget.value);
            emitTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div class="dm-input-actions">
          <button
            class="dm-emoji-btn"
            data-testid="dm-emoji-btn"
            onClick={() => {
              setEmojiOpen(!dmState.emojiOpen);
              setGifOpen(false);
            }}
            title={t('dm.emojiTooltip')}
          >
            <PhSmiley class="dm-emoji-btn-glyph" />
          </button>
          <button
            class="dm-gif-btn"
            data-testid="dm-gif-btn"
            onClick={() => {
              setGifOpen(!dmState.gifOpen);
              setEmojiOpen(false);
            }}
            title={t('dm.gifTooltip')}
          >
            GIF
          </button>
        </div>
        <button class="dm-send-btn" data-testid="dm-send-btn" onClick={send} disabled={!text().trim()}>
          <PhPaperPlaneTilt />
        </button>
        <Show when={dmState.gifOpen}>
          <GifPicker />
        </Show>
        <Show when={dmState.emojiOpen}>
          <EmojiPicker onSelect={insertEmoji} />
        </Show>
      </div>
    </div>
  );
}