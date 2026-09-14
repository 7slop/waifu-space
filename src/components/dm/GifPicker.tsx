import { createSignal, For, Show } from 'solid-js';
import { dmState, gifSearch, sendGif, setGifOpen } from '../../lib/dm/store';
import { t } from '../../lib/i18n';

/**
 * Popover GIF picker: searches the configured GIF provider (debounced) and
 * lets the user send a GIF inline, or paste a direct GIF/image URL.
 */
export function GifPicker() {
  const [query, setQuery] = createSignal('');
  const [paste, setPaste] = createSignal('');
  let debounce: ReturnType<typeof setTimeout> | undefined;

  const runSearch = (value: string) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => void gifSearch(value), 400);
  };

  const choose = (url: string) => {
    void sendGif(url);
    setGifOpen(false);
  };

  const sendPaste = () => {
    const url = paste().trim();
    if (!url) return;
    void sendGif(url);
    setPaste('');
    setGifOpen(false);
  };

  return (
    <div class="dm-gif-picker" data-testid="dm-gif-picker">
      <div class="dm-gif-search-row">
        <input
          class="dm-gif-search-input"
          data-testid="dm-gif-search-input"
          value={query()}
          placeholder={t('dm.gifSearchPlaceholder')}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            runSearch(e.currentTarget.value);
          }}
        />
        <input
          class="dm-gif-paste-input"
          data-testid="dm-gif-paste-input"
          value={paste()}
          placeholder={t('dm.gifPastePlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendPaste();
          }}
        />
      </div>

      <div class="dm-gif-grid">
        <For each={dmState.gifResults}>
          {(item) => (
            <button
              class="dm-gif-item"
              data-testid={`dm-gif-item-${item.id}`}
              onClick={() => choose(item.url)}
              title={item.url}
            >
              <img src={item.preview} alt="" loading="lazy" />
            </button>
          )}
        </For>
      </div>
      <Show when={dmState.gifResults.length === 0}>
        <div class="dm-gif-empty">{t('dm.gifSearchEmpty')}</div>
      </Show>
    </div>
  );
}