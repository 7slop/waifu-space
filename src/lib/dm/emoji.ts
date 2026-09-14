// Emoji helpers for the DM subsystem: Twemoji rendering and curated picker
// sets. Kept dependency-free so it can be unit-tested in isolation.

export const TWEMOJI_URL = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72';

/** Matches emoji runs: pictographs (+ ZWJ sequences, variation selectors, skin tones), symbols/dingbats, keycaps, flags. */
export const EMOJI_SEGMENT_RE =
  /(?:\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic}|\uFE0F|\u20E3|[\u{1F3FB}-\u{1F3FF}])*\uFE0F?|\p{Regional_Indicator}{2}|[\u2600-\u27BF]\uFE0F?|[\u0023-\u0039]\uFE0F?\u20E3)/gu;

/**
 * Converts an emoji run to its Twemoji filename: lowercase hex codepoints
 * joined with '-', with the U+FE0F variation selector stripped (e.g.
 * 👍🏽 → `1f44d-1f3fd`, ❤️ → `2764`).
 */
export function twemojiFilename(emoji: string): string {
  return Array.from(emoji.replace(/\uFE0F/g, ''))
    .map((c) => c.codePointAt(0)!.toString(16))
    .join('-');
}

export function twemojiUrl(emoji: string): string {
  return `${TWEMOJI_URL}/${twemojiFilename(emoji)}.png`;
}

/** Splits a text run into plain-text and emoji segments (TWEMOJI-ready). */
export function splitEmojiText(text: string): Array<{ text: string; emoji: boolean }> {
  const segments: Array<{ text: string; emoji: boolean }> = [];
  let last = 0;
  for (const match of text.matchAll(EMOJI_SEGMENT_RE)) {
    const idx = match.index ?? 0;
    if (idx > last) segments.push({ text: text.slice(last, idx), emoji: false });
    segments.push({ text: match[0], emoji: true });
    last = idx + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), emoji: false });
  return segments;
}

/** True when the string is a single complete emoji (used to validate reactions). */
export function isSingleEmoji(value: string): boolean {
  if (!value || value.length > 16) return false;
  const matched = value.match(EMOJI_SEGMENT_RE);
  return matched !== null && matched.length === 1 && matched[0] === value;
}

export interface EmojiCategory {
  id: string;
  labelKey: string;
  items: string[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    labelKey: 'dm.emojiCatSmileys',
    items: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉',
      '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨',
      '🧐', '🤓', '😎', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣',
      '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳',
      '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🥱',
      '😴', '😮', '😯', '😦', '😧', '😐', '😶'
    ]
  },
  {
    id: 'gestures',
    labelKey: 'dm.emojiCatGestures',
    items: [
      '👍', '🙌', '👏', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👋', '✋', '🤚',
      '🖖', '☝️', '👆', '👇', '👉', '👈', '🙏', '🤝', '✊', '👊', '🫶', '💪',
      '🤳', '🦾', '👀', '👅', '🧠', '💯', '✔️', '💥', '🔥', '✨', '🎉', '🏆'
    ]
  },
  {
    id: 'hearts',
    labelKey: 'dm.emojiCatHearts',
    items: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '❤️‍🔥',
      '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💋', '💌', '😻'
    ]
  },
  {
    id: 'symbols',
    labelKey: 'dm.emojiCatSymbols',
    items: [
      '✅', '❌', '❎', '❗', '❕', '⚠️', '🚫', '🔞', '💢', '🔒', '🔓', '🔑',
      '🔔', '🔕', '📌', '📍', '📎', '✂️', '💬', '💭', '👾', '🛸', '🌍', '🌈',
      '☀️', '🌙', '⚡', '❄️', '☄️', '💧', '🌊', '🍕', '🍔', '🧋', '☕', '🍵',
      '🎧', '🎮', '🎤', '🚀', '🎁', '🐱', '🐶', '🦊'
    ]
  },
  {
    id: 'custom',
    labelKey: 'dm.emojiCatCustom',
    items: [
      '✨', '⭐', '🌟', '💫', '🌙', '☀', '🔥', '❄', '🌈', '🌊', '🍀', '🌸',
      '💮', '🎀', '🏆', '🥇', '🎯', '💎', '👑', '💰', '🔮', '🗝️', '🛡️', '⚔️',
      '📖', '⏳', '⌛', '🕯️', '🪄', '🧊', '🌹', '🦋', '🕊️', '✨', '🎈', '🎊'
    ]
  }
];

/** Convenience quick-set shown in the message reaction "+" picker. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '😢', '🎉', '👏'];