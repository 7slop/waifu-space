import { createMemo, type JSX } from 'solid-js';
import {
  PhBook,
  PhBookOpenText,
  PhCode,
  PhMusicNotes,
  PhTranslate,
  PhMoonStars,
  PhBriefcase,
  PhHeart,
  PhStudent,
  PhGameController,
  PhCoins,
  PhClock,
  PhPaintBrush,
  PhBasketball,
  PhHeadphones,
  PhCoffee,
  PhRocket,
  PhPawPrint,
  PhSmiley
} from './icons';

export type ActivityIconId =
  | 'book'
  | 'book-open-text'
  | 'code'
  | 'music-notes'
  | 'translate'
  | 'moon-stars'
  | 'briefcase'
  | 'heart'
  | 'student'
  | 'game-controller'
  | 'coins'
  | 'clock'
  | 'paint-brush'
  | 'basketball'
  | 'headphones'
  | 'coffee'
  | 'rocket'
  | 'paw-print'
  | 'smiley';

export const ACTIVITY_ICON_IDS: ActivityIconId[] = [
  'book',
  'book-open-text',
  'code',
  'music-notes',
  'translate',
  'student',
  'paint-brush',
  'game-controller',
  'basketball',
  'headphones',
  'briefcase',
  'heart',
  'moon-stars',
  'coffee',
  'paw-print',
  'coins',
  'rocket',
  'smiley'
];

type IconProps = { class?: string };

type IconComponent = (props: IconProps) => JSX.Element;

const ACTIVITY_ICON_MAP: Record<string, IconComponent> = {
  'book': PhBook,
  'book-open-text': PhBookOpenText,
  'code': PhCode,
  'music-notes': PhMusicNotes,
  'translate': PhTranslate,
  'moon-stars': PhMoonStars,
  'briefcase': PhBriefcase,
  'heart': PhHeart,
  'student': PhStudent,
  'game-controller': PhGameController,
  'coins': PhCoins,
  'clock': PhClock,
  'paint-brush': PhPaintBrush,
  'basketball': PhBasketball,
  'headphones': PhHeadphones,
  'coffee': PhCoffee,
  'rocket': PhRocket,
  'paw-print': PhPawPrint,
  'smiley': PhSmiley
};

/** Renders the activity icon by id, falling back to a clock glyph. */
export function ActivityIcon(props: { icon?: string; class?: string }) {
  const el = createMemo<JSX.Element>(() => {
    const C = ACTIVITY_ICON_MAP[props.icon ?? ''] ?? PhClock;
    return <C class={props.class} />;
  });
  return el();
}