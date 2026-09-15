import { createSignal, For, onCleanup, onMount } from 'solid-js';
import { EMOJI_CATEGORIES } from '../../lib/dm/emoji';
import { setEmojiOpen } from '../../lib/dm/store';
import { t } from '../../lib/i18n';
import { EmojiGlyph } from './DmEmojiText';

/**
 * Popover emoji picker: category tabs + a grid of Twemoji buttons. Unlike the
 * GIF picker it inserts the chosen emoji (via `onSelect`) instead of sending
 * a message; it closes on outside click.
 */
export function EmojiPicker(props: { onSelect: (emoji: string) => void; onRequestClose?: () => void }) {
  const [cat, setCat] = createSignal<string>(EMOJI_CATEGORIES[0].id);

  const active = () => EMOJI_CATEGORIES.find((c) => c.id === cat()) ?? EMOJI_CATEGORIES[0];

  const closeOnClickAway = (e: PointerEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.closest('.dm-emoji-picker') || el.closest('.dm-emoji-btn') || el.closest('.dm-reaction-add') || el.closest('.dm-reaction-add-anchor'))) return;
    props.onRequestClose?.();
    setEmojiOpen(false);
  };

  onMount(() => document.addEventListener('pointerdown', closeOnClickAway));
  onCleanup(() => document.removeEventListener('pointerdown', closeOnClickAway));

  return (
    <div class="dm-emoji-picker" data-testid="dm-emoji-picker">
      <div class="dm-emoji-cats">
        <For each={EMOJI_CATEGORIES}>
          {(c) => (
            <button
              class={`dm-emoji-cat${cat() === c.id ? ' active' : ''}`}
              data-testid={`dm-emoji-cat-${c.id}`}
              onClick={() => setCat(c.id)}
            >
              {t(c.labelKey)}
            </button>
          )}
        </For>
      </div>
      <div class="dm-emoji-grid" data-testid="dm-emoji-grid">
        <For each={active().items}>
          {(emoji, i) => (
            <button
              class="dm-emoji-item"
              data-testid={`dm-emoji-item-${i()}`}
              aria-label={emoji}
              onClick={() => props.onSelect(emoji)}
            >
              <EmojiGlyph emoji={emoji} />
            </button>
          )}
        </For>
      </div>
    </div>
  );
}