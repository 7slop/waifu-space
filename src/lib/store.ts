import { createStore, produce } from 'solid-js/store';
import { createSignal } from 'solid-js';
import { CalendarEventItem, CalendarOccurrenceOverride } from './ical';
import {
  getPersonality,
  getRandomGreeting,
  getRandomComplimentResponse,
  getRandomTaskCompleteResponse,
  getRandomThanksResponse,
  getRandomHelpResponse,
  getRandomDefaultResponse,
  getRandomJoke,
  PersonalityArchetype
} from './personality';
import { callLLM } from './llm';
import { parseIntent, hasIntent, DialogIntent, matchesKeywordOrPhrase } from './intents';
import { validateCalendarEventInput, sanitizeSettings, clampNumber } from './validation';
import { sanitizeRawState, sanitizeEvent, sanitizeOccurrenceOverride, sanitizeTimeBudget } from './validate';
import {
  deriveBudgetKey,
  deriveBudgetSalt,
  decryptBudgetState,
  encryptBudgetState,
  generateBudgetSalt,
  isEncryptedBudgetBlob,
  exportBudgetKey,
  importBudgetKey
} from './cloudcrypt';
import type { EncryptedBudgetBlob } from './cloudcrypt';
import {
  sanitizeCountry,
  sanitizeHolidayEntry,
  sanitizeCountryCode,
  buildHolidayEvents,
  CountryInfo,
  HolidayEntry
} from './countries';
import { getLootboxCost, rollLootRarity, DUPLICATE_COMPENSATION, getDefenseCoinsReward, getDefenseExpReward } from './economy';
import { t, getMilestoneRewardLabel } from './i18n';
import { AVATAR_FRAME_CATALOG } from './avatar-frames';
import {
  TimeBudgetActivity,
  TimeBudgetState,
  TimeLogEntry,
  ActivityZone,
  getCurrentBudgetWeek,
  getWeekProgress,
  getActivityZone,
  clampMinutes,
  clampHours,
  MAX_ACTIVITIES,
  getDefaultTimeBudgetState
} from './timebudget';
import type { TimeBudgetSettings } from './timebudget';

export const STORAGE_KEY = 'waifu_space_data_v1';

const ACTIVE_USER_KEY = 'waifu_space_active_user_v1';
const GUEST_ID_PREFIX = 'guest_';

// ---- Cloud push serialization --------------------------------------------
// Every cloud push is chained onto a single promise queue so two pushes can
// never run (or interleave) at the same time - this was a real source of data
// loss bugs: a debounce trigger and a pagehide flush racing could reorder
// payloads server-side and clobber newer progress with an older snapshot.
// Each queued push also reads the live state when it RUNS (not when it was
// scheduled), so the last scheduled push always transmits the freshest state.
let pushQueue: Promise<boolean> = Promise.resolve(true);
let pushActive = false;

function isRegisteredAccount(user: UserAccount | null | undefined): boolean {
  return !!user && !!user.id;
}

function scopedStorageKey(userId: string | null | undefined): string {
  if (!userId) return STORAGE_KEY;
  return `${STORAGE_KEY}_acct_${userId}`;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'waifu';
  text: string;
  timestamp: string;
  emotion?: string;
}

export interface RpgCosmeticItem {
  id: string;
  name: string;
  category: 'outfit' | 'accessory' | 'hairstyle' | 'avatar_frame';
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mystical';
  description: string;
  icon: string;
}

export const COSMETIC_CATALOG: RpgCosmeticItem[] = [
  // Outfits
  { id: 'seifuku', name: 'Sailor Seifuku', category: 'outfit', rarity: 'common', description: 'Classic Japanese school uniform with navy sailor collar.', icon: '🏫' },
  { id: 'casual', name: 'Cozy Hoodie', category: 'outfit', rarity: 'common', description: 'Soft oversized pastel hoodie for relaxing at home.', icon: '🛋️' },
  { id: 'maid', name: 'Maid Uniform', category: 'outfit', rarity: 'rare', description: 'Elegant frilled black-and-white café maid outfit.', icon: '☕' },
  { id: 'kimono', name: 'Summer Kimono', category: 'outfit', rarity: 'rare', description: 'Traditional indigo yukata with gold obi and sakura blossoms.', icon: '👘' },
  { id: 'gothic', name: 'Gothic Lolita', category: 'outfit', rarity: 'epic', description: 'Dark Victorian gothic dress adorned with crimson ribbons.', icon: '🥀' },
  { id: 'miko', name: 'Shrine Maiden (Miko)', category: 'outfit', rarity: 'epic', description: 'Sacred red hakama and white robe blessed by shrine spirits.', icon: '⛩️' },
  { id: 'magical', name: 'Magical Girl', category: 'outfit', rarity: 'legendary', description: 'Sparkling cosmic dress imbued with pure starlight.', icon: '✨' },
  { id: 'armor', name: 'Guardian Knight Armor', category: 'outfit', rarity: 'legendary', description: 'Polished silver breastplate & pauldrons forged for battle.', icon: '🛡️' },
  { id: 'celestial_dress', name: 'Celestial Gown', category: 'outfit', rarity: 'mystical', description: 'Transcendent flowing gown forged from living stardust.', icon: '🌌' },

  // Accessories
  { id: 'none', name: 'None', category: 'accessory', rarity: 'common', description: 'No accessory equipped.', icon: '✖️' },
  { id: 'ribbon', name: 'Red Ribbon', category: 'accessory', rarity: 'common', description: 'Cute silk bow tied gracefully into her hair.', icon: '🎀' },
  { id: 'glasses', name: 'Stylish Glasses', category: 'accessory', rarity: 'common', description: 'Chic frames that give an intellectual charm.', icon: '👓' },
  { id: 'maid_headband', name: 'Maid Headband', category: 'accessory', rarity: 'rare', description: 'Crisp white lace maid headdress.', icon: '🤍' },
  { id: 'flower_pin', name: 'Sakura Hairpin', category: 'accessory', rarity: 'rare', description: 'Delicate cherry blossom petal pin with soft morning dew.', icon: '🌸' },
  { id: 'headphones', name: 'Cyber Headphones', category: 'accessory', rarity: 'rare', description: 'Glowing cyan headphones tuned to lo-fi beats.', icon: '🎧' },
  { id: 'cat_ears', name: 'Fluffy Cat Ears', category: 'accessory', rarity: 'epic', description: 'Twitching soft feline ears with tiny golden bells.', icon: '🐱' },
  { id: 'bunny_ears', name: 'Bunny Ears', category: 'accessory', rarity: 'epic', description: 'Playful velvet rabbit ears that bounce when she moves.', icon: '🐰' },
  { id: 'succubus_horns', name: 'Shadow Horns', category: 'accessory', rarity: 'epic', description: 'Curved obsidian horns radiating soft ethereal twilight.', icon: '😈' },
  { id: 'kitsune_mask', name: 'Kitsune Mask', category: 'accessory', rarity: 'legendary', description: 'Mystical fox spirit festival mask worn on the side of her hair.', icon: '🦊' },
  { id: 'halo', name: 'Angel Halo', category: 'accessory', rarity: 'legendary', description: 'Gleaming celestial halo floating serenely above her crown.', icon: '😇' },
  { id: 'phoenix_pin', name: 'Phoenix Plume', category: 'accessory', rarity: 'legendary', description: 'Blazing golden feather hairpin with warm immortal embers.', icon: '🪶' },
  { id: 'kitsune_aurora', name: 'Aurora Spirit Mask', category: 'accessory', rarity: 'mystical', description: 'Sacred celestial kitsune mask infused with shifting aurora borealis light.', icon: '🦊✨' },
  { id: 'starlight_crown', name: 'Crown of Cosmos', category: 'accessory', rarity: 'mystical', description: 'Transcendent diadem forged from pure crystallized cosmic nebula.', icon: '👑✨' },

  // Hairstyles
  { id: 'twintails', name: 'Classic Twintails', category: 'hairstyle', rarity: 'common', description: 'Bouncy twin ponytails tied high on both sides.', icon: '👧' },
  { id: 'long', name: 'Long Straight', category: 'hairstyle', rarity: 'common', description: 'Flowing silky hair reaching down past her shoulders.', icon: '💇‍♀️' },
  { id: 'short_bob', name: 'Short Bob', category: 'hairstyle', rarity: 'rare', description: 'Cute, sporty chin-length bob cut.', icon: '💁‍♀️' },
  { id: 'ponytail', name: 'High Ponytail', category: 'hairstyle', rarity: 'rare', description: 'Energetic ponytail fastened with a ribbon.', icon: '👱‍♀️' },
  { id: 'wavy', name: 'Wavy Curls', category: 'hairstyle', rarity: 'epic', description: 'Romantic flowing waves with gentle volume.', icon: '👩‍🦱' },
  { id: 'space_bun', name: 'Space Buns', category: 'hairstyle', rarity: 'legendary', description: 'Adorable twin buns with holographic shimmer ribbons.', icon: '🪐' },
  { id: 'celestial_wave', name: 'Celestial Waves', category: 'hairstyle', rarity: 'mystical', description: 'Infinity-length cosmic hair woven from nebula and starlight.', icon: '🌌' },

  // Avatar Frames (displayed around the avatar everywhere, incl. public profiles)
  ...AVATAR_FRAME_CATALOG.map(f => ({
    id: f.id,
    name: f.name,
    category: 'avatar_frame' as const,
    rarity: f.rarity,
    description: f.description,
    icon: f.icon
  }))
];

export interface AffectionMilestone {
  level: number;
  title: string;
  rewardType: 'coins' | 'cosmetic' | 'title';
  rewardValue: string | number;
  rewardLabel: string;
  description: string;
  icon: string;
}

export const AFFECTION_MILESTONES: AffectionMilestone[] = [
  { level: 2, title: 'Acquaintance', rewardType: 'coins', rewardValue: 75, rewardLabel: '75 Coins', description: 'Akari begins to look forward to your presence.', icon: '🪙' },
  { level: 3, title: 'Friend', rewardType: 'cosmetic', rewardValue: 'flower_pin', rewardLabel: 'Sakura Hairpin', description: 'Unlocks the delicate Sakura hair ornament.', icon: '🌸' },
  { level: 5, title: 'Close Friend', rewardType: 'cosmetic', rewardValue: 'maid', rewardLabel: 'Maid Uniform', description: 'Unlocks the frilly Maid Outfit in your Wardrobe.', icon: '☕' },
  { level: 7, title: 'Trusted Confidant', rewardType: 'coins', rewardValue: 200, rewardLabel: '200 Coins', description: 'Akari trusts you with her deepest thoughts.', icon: '🪙' },
  { level: 8, title: 'Sweetheart', rewardType: 'cosmetic', rewardValue: 'kimono', rewardLabel: 'Summer Kimono', description: 'Unlocks the traditional festival Kimono dress.', icon: '👘' },
  { level: 10, title: 'Soulmate', rewardType: 'cosmetic', rewardValue: 'bunny_ears', rewardLabel: 'Bunny Ears', description: 'Unlocks the playful Bunny Ears accessory.', icon: '🐰' },
  { level: 12, title: 'Inseparable', rewardType: 'coins', rewardValue: 500, rewardLabel: '500 Coins', description: 'A massive treasury gift for staying by her side.', icon: '💰' },
  { level: 15, title: 'Eternal Devotion', rewardType: 'cosmetic', rewardValue: 'magical', rewardLabel: 'Magical Girl Outfit', description: 'Unlocks the legendary Magical Girl cosmic dress!', icon: '✨' },
  { level: 18, title: 'Beloved Sovereign', rewardType: 'cosmetic', rewardValue: 'frame_royal', rewardLabel: 'Royal Azure Frame', description: 'Unlocks the legendary Royal Azure avatar frame!', icon: '👑' },
  { level: 20, title: 'Celestial Bond', rewardType: 'cosmetic', rewardValue: 'halo', rewardLabel: 'Angel Halo', description: 'Unlocks the divine glowing Angel Halo.', icon: '😇' },
  { level: 25, title: 'Infernal Devotion', rewardType: 'cosmetic', rewardValue: 'frame_demon', rewardLabel: 'Infernal Flame Frame', description: 'Unlocks the crimson blaze of the Infernal avatar frame!', icon: '🔥' },
  { level: 30, title: 'Eternal Bond of Stars', rewardType: 'cosmetic', rewardValue: 'frame_galaxy', rewardLabel: 'Nebula Ethereal Frame', description: 'Unlocks the transcendent Nebula Ethereal avatar frame!', icon: '🌌' }
];

export interface RpgState {
  coins: number;
  unlockedOutfits: string[];
  unlockedAccessories: string[];
  unlockedHairstyles: string[];
  unlockedAvatarFrames: string[];
  showcaseItems: string[]; // up to 6 featured item IDs
  claimedAffectionMilestones: number[];
  defenseHighWave: number;
  defenseStats: {
    totalVictories: number;
    goblinsDefeated: number;
  };
}

export interface UserAccount {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  bio?: string;
  token?: string;
}

export interface AppState {
  activeTab: 'main' | 'calendar' | 'rpg' | 'settings';
  user: UserAccount | null;
  waifu: {
    name: string;
    personality: string;
    appearance: {
      hairstyle: string;
      hairColor: string;
      eyeColor: string;
      skinTone: string;
      outfit: string;
      accessory: string;
      customAvatarUrl: string;
      avatarMode: 'svg' | 'custom';
      avatarFrame: string;
    };
    mood: string;
    bondLevel: number;
    bondExp: number;
  };
  rpg: RpgState;
  calendar: {
    view: 'month' | 'week' | 'day';
    selectedDate: string;
    events: CalendarEventItem[];
    occurrenceOverrides: CalendarOccurrenceOverride[];
    filterEvents: boolean;
    filterTasks: boolean;
    filterBirthdays: boolean;
    searchQuery: string;
  };
  settings: {
    language: 'en' | 'ja';
    wallpaperId: string;
    wallpaperType: 'stock' | 'custom';
    customWallpaperUrl: string;
    wallpaperBlur: number;
    wallpaperDim: number;
    sakuraParticles: boolean;
    theme: string;
    themeMode: 'auto' | 'dark' | 'light';
    customAccent: string;
    soundEffects: boolean;
    ttsEnabled: boolean;
    ttsVoice: string;
    ttsPitch: number;
    ttsRate: number;
    llmProvider: string;
    llmApiKey: string;
    llmModel: string;
    countryHolidays: string[];
    showCulturalHolidays: boolean;
  };
  chat: {
    messages: ChatMessage[];
    suggestions: string[];
    isTyping: boolean;
  };
  timebudget: TimeBudgetState;
}

// New accounts (and logged-out guests) start with a completely empty calendar.
// There are no pre-seeded/demo events — everything on the calendar is something
// the player creates themselves.
export const DEFAULT_EVENTS: CalendarEventItem[] = [];

export const DEFAULT_RPG: RpgState = {
  coins: 0,
  // Fresh players start with only the minimal starters: the default worn
  // outfit, accessory and hairstyle. Everything else must be earned.
  unlockedOutfits: ['seifuku'],
  unlockedAccessories: ['ribbon'],
  unlockedHairstyles: ['twintails'],
  unlockedAvatarFrames: [],
  showcaseItems: [],
  claimedAffectionMilestones: [],
  defenseHighWave: 0,
  defenseStats: {
    totalVictories: 0,
    goblinsDefeated: 0
  }
};

export const DEFAULT_STATE: AppState = {
  activeTab: 'main',
  user: null,
  waifu: {
    name: 'Akari',
    personality: 'tsundere',
    appearance: {
      hairstyle: 'twintails',
      hairColor: '#ff7597',
      eyeColor: '#4f86f7',
      skinTone: '#fff1eb',
      outfit: 'seifuku',
      accessory: 'ribbon',
      customAvatarUrl: '',
      avatarMode: 'svg',
      avatarFrame: 'none'
    },
    mood: 'neutral',
    bondLevel: 1,
    bondExp: 0
  },
  rpg: DEFAULT_RPG,
  calendar: {
    view: 'week',
    selectedDate: new Date().toISOString(),
    events: DEFAULT_EVENTS,
    occurrenceOverrides: [],
    filterEvents: true,
    filterTasks: true,
    filterBirthdays: true,
    searchQuery: ''
  },
  settings: {
    language: 'en',
    wallpaperId: 'sakura-shrine',
    wallpaperType: 'stock',
    customWallpaperUrl: '',
    wallpaperBlur: 2,
    wallpaperDim: 45,
    sakuraParticles: true,
    theme: 'catppuccin',
    themeMode: 'auto',
    customAccent: '',
    soundEffects: true,
    ttsEnabled: false,
    ttsVoice: '',
    ttsPitch: 1.2,
    ttsRate: 1.0,
    llmProvider: 'none',
    llmApiKey: '',
    llmModel: 'gemini-1.5-flash',
    countryHolidays: [],
    showCulturalHolidays: false
  },
  chat: {
    messages: [
      {
        id: 'msg-init',
        sender: 'waifu',
        text: "H-Hey! I'm Akari, your companion. Nice to meet you, senpai! Start chatting, add some plans to the calendar, or play a minigame — I'll be right here!",
        timestamp: new Date().toISOString(),
        emotion: 'happy'
      }
    ],
    suggestions: [
      "Review today's schedule",
      "You look cute today",
      "Poke",
      "Tell me a joke"
    ],
    isTyping: false
  },
  timebudget: getDefaultTimeBudgetState()
};

// Global reactive store
export const [state, setState] = createStore<AppState>(JSON.parse(JSON.stringify(DEFAULT_STATE)));

// Global signals
export const [isTalking, setIsTalking] = createSignal(false);
export const [avatarBounced, setAvatarBounced] = createSignal(false);
export const [speechBubble, setSpeechBubble] = createSignal<string>('...');
export const [speechBubbleVisible, setSpeechBubbleVisible] = createSignal(false);
let bubbleTimeout: any = null;

// Toast signal
export const [toastMessage, setToastMessage] = createSignal('');
export const [toastVisible, setToastVisible] = createSignal(false);
let toastTimeout: any = null;

export function showToast(message: string) {
  setToastMessage(message);
  setToastVisible(true);
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    setToastVisible(false);
  }, 3500);
}

// LocalStorage helpers
export function saveState() {
  if (typeof window === 'undefined') return;
  try {
    // Security: Game state (coins, inventory, defense records, bond level/exp)
    // is NOT persisted to localStorage. The database is the single source of truth.
    const clientPersistedState = {
      user: state.user,
      settings: state.settings,
      calendar: state.calendar,
      chat: state.chat,
      timebudget: state.timebudget,
      waifu: {
        name: state.waifu.name,
        personality: state.waifu.personality,
        appearance: state.waifu.appearance,
        mood: state.waifu.mood
      }
    };
    localStorage.setItem(scopedStorageKey(state.user?.id), JSON.stringify(clientPersistedState));
    if (isRegisteredAccount(state.user)) {
      localStorage.setItem(ACTIVE_USER_KEY, state.user!.id);
    } else {
      localStorage.removeItem(ACTIVE_USER_KEY);
    }
  } catch (e) {
    console.error('Failed to save state to localStorage', e);
  }
  scheduleCloudSync();
  scheduleBudgetCloudSync();
}

// ---------------------------------------------------------------------------
// Cloud sync (Supabase via /api/sync/progress)
// ---------------------------------------------------------------------------

let cloudSyncTimer: any = null;

const PENDING_SYNC_KEY = 'waifu_space_pending_sync_v1';

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export const [cloudSyncStatus, setCloudSyncStatus] = createSignal<CloudSyncStatus>('idle');

// Becomes true only once the account's cloud snapshot has been pulled at least
// once. Until then we never push the showcase list, because on a fresh device
// the local showcase is still just the empty default and pushing it would wipe
// the showcase the user has saved in the cloud.
let cloudSnapshotLoaded = false;

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function buildSyncSnapshot(): {
  waifu?: unknown;
  settings?: unknown;
  showcaseItems?: unknown;
  rpg?: unknown;
} {
  // Until the account's cloud snapshot has been pulled at least once, the local
  // state is only the empty/default guest template. Pushing it would clobber the
  // user's REAL saved waifu, settings and showcase (e.g. a returning user
  // opening the app on a fresh device). So the first push carries no resources
  // at all - the server leaves everything untouched and the pull that runs right
  // after boot sets cloudSnapshotLoaded, unlocking full syncs.
  //
  // NOTE: the calendar (and time budget) are NOT part of this plaintext
  // snapshot - they sync exclusively through the end-to-end encrypted privacy
  // blob (/api/timebudget/sync).
  if (!cloudSnapshotLoaded) {
    return {};
  }
  return {
    waifu: {
      name: state.waifu.name,
      personality: state.waifu.personality,
      appearance: state.waifu.appearance
    },
    settings: state.settings,
    showcaseItems: state.rpg.showcaseItems,
    rpg: {
      claimedAffectionMilestones: state.rpg?.claimedAffectionMilestones || []
    }
  };
}

function readPendingSync(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    // A queued snapshot belongs to whatever account produced it. Never let an
    // offline snapshot bleed into a different account's cloud state.
    const ownerId: unknown = (parsed as any).userId;
    const currentId = state.user?.id ?? null;
    if (ownerId !== currentId) {
      clearPendingSync();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function queuePendingSync() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify({ userId: state.user?.id ?? null, payload: buildSyncSnapshot(), updatedAt: Date.now() }));
  } catch (e) {
    console.error('Failed to queue pending cloud sync', e);
  }
}

function clearPendingSync() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PENDING_SYNC_KEY);
  } catch {
    // ignore
  }
}

/**
 * If a sync snapshot was queued locally (offline / failed push), trigger a push
 * with the freshest state. The queued payload is only consulted for its account
 * ownership - the actual snapshot is rebuilt from live state so nothing queued
 * is ever silently lost or replayed for the wrong user.
 */
export async function syncProgressFromPending(): Promise<boolean> {
  const pending = readPendingSync();
  if (!pending) return false;
  const pendingUser = pending.userId;
  if (typeof pendingUser === 'string') {
    if (!state.user || state.user.id !== pendingUser) {
      // The queued snapshot belongs to a different account - it must not be
      // pushed onto whoever is logged in now.
      clearPendingSync();
      return false;
    }
  } else if (state.user?.id) {
    clearPendingSync();
    return false;
  }
  return pushProgressToCloud();
}

// Cross-tab coordination: when any tab sharing this account saves data to
// local storage, other open tabs flush so their freshest state still reaches
// the cloud. 'storage' fires only in OTHER tabs, so this never loops back onto
// the writer. PENDING_SYNC_KEY churn (written on failure, removed on success)
// is deliberately ignored to avoid tabs re-triggering each other.
function syncProgressFromStorageEvent(e: StorageEvent) {
  if (!state.user?.token) return;
  if (e.key === PENDING_SYNC_KEY) return;
  if (!e.newValue) return;
  const key = e.key;
  if (!key) return;
  let eventUserId: string | null = null;
  if (key === STORAGE_KEY) {
    eventUserId = null;
  } else if (key.startsWith(`${STORAGE_KEY}_acct_`)) {
    eventUserId = key.slice(`${STORAGE_KEY}_acct_`.length);
  } else {
    return;
  }
  if (eventUserId !== (state.user?.id ?? null)) return;
  // Offline tabs queue (not push) on failure; this is enough to make sure the
  // freshest snapshot is retried once the connection returns.
  clearTimeout(cloudSyncTimer);
  void pushProgressToCloud();
}

export function queuePushProgressFromStorage() {
  if (typeof window === 'undefined') return;
  clearTimeout(cloudSyncTimer);
  void pushProgressToCloud();
}

export function scheduleCloudSync() {
  if (typeof window === 'undefined') return;
  if (!state.user?.token) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    void pushProgressToCloud();
  }, 2500);
}

/**
 * Pushes progress to the cloud. Best-effort: on a network failure or while the
 * browser is offline, the latest snapshot is queued locally and retried when
 * the connection comes back, so no progress is silently lost.
 */
export function pushProgressToCloud(): Promise<boolean> {
  const token = state.user?.token;
  if (!token) return Promise.resolve(false);

  if (!isOnline()) {
    setCloudSyncStatus('offline');
    queuePendingSync();
    return Promise.resolve(false);
  }

  setCloudSyncStatus('syncing');

  const attempt = async () => {
    try {
      // buildSyncSnapshot() runs when the push actually executes, so the last
      // push in a burst always carries the newest state.
      const res = await fetch('/api/sync/progress', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildSyncSnapshot())
      });
      if (res.status === 401) {
        // Intentional 401 on unauthorized / expired session: clear session and stop syncing
        setUserAccount(null);
        setCloudSyncStatus('error');
        clearPendingSync();
        return false;
      }
      if (!res.ok) {
        setCloudSyncStatus('error');
        queuePendingSync();
        return false;
      }
      clearPendingSync();
      setCloudSyncStatus('synced');
      return true;
    } catch {
      setCloudSyncStatus(isOnline() ? 'error' : 'offline');
      queuePendingSync();
      return false;
    }
  };

  pushActive = true;
  const commit = pushQueue.then(attempt);
  // Whatever happens, the next push waits for this one before it starts.
  pushQueue = commit.then(
    () => {
      pushActive = false;
      return true;
    },
    () => {
      pushActive = false;
      return true;
    }
  );
  return commit;
}

export function isPushActive(): boolean {
  return pushActive;
}

// Flush any pending debounced sync when the page is being unloaded, so a
// reload right after earning coins doesn't leave the last save behind.
if (typeof window !== 'undefined') {
  const flushPendingSync = () => {
    if (!state.user?.token) return;
    clearTimeout(cloudSyncTimer);
    void pushProgressToCloud();
    if (isBudgetUnlocked()) {
      if (budgetSyncTimer) clearTimeout(budgetSyncTimer);
      void pushBudgetToCloud();
    }
  };
  window.addEventListener('pagehide', flushPendingSync);
  window.addEventListener('beforeunload', flushPendingSync);

  // When the connection (re-)appears after being offline, pick up wherever we
  // left off: retry a pull that was never completed, then flush any queued sync.
  const retryCloudSync = () => {
    if (!state.user?.token) return;
    clearTimeout(cloudSyncTimer);
    if (!cloudSnapshotLoaded) {
      // The very first pull never succeeded (e.g. app was opened offline). Until
      // it does, pushes intentionally carry no state - so retry the pull now.
      void loadCloudProgress();
      return;
    }
    if (!readPendingSync()) return;
    void syncProgressFromPending();
  };
  window.addEventListener('online', retryCloudSync);
  window.addEventListener('load', retryCloudSync);

  // Retry any queued encrypted time-budget push once the connection is back.
  const retryBudgetCloudSync = () => {
    if (!state.user?.token || budgetSyncIsLocked()) return;
    if (!readPendingBudget()) return;
    void syncBudgetFromPending();
  };
  window.addEventListener('online', retryBudgetCloudSync);

  // Another tab saved to local storage for this account - make sure our
  // freshest state still reaches the cloud.
  window.addEventListener('storage', syncProgressFromStorageEvent);
}

// ---------------------------------------------------------------------------
// Private cloud sync (time budget + calendar, end-to-end encrypted)
// ---------------------------------------------------------------------------
// The time budget AND the calendar are the only user data encrypted before
// upload. The payload { timebudget, calendar } is AES-256-GCM encrypted in the
// browser with a key derived from the account password (PBKDF2). The server
// only stores the opaque { salt, iv, ciphertext } blob and can never read the
// tracking goals or calendar events. The derived key is cached on the device
// (per account) so a tab booting from a stored session token unlocks the cloud
// copy automatically - without needing to re-enter the password.

let budgetSyncTimer: ReturnType<typeof setTimeout> | null = null;
const PENDING_BUDGET_KEY = 'waifu_space_pending_budget_v1';
const BUDGET_KEY_STORAGE_PREFIX = 'waifu_space_budget_key_v1';

export type BudgetCloudStatus = 'idle' | 'syncing' | 'synced' | 'locked' | 'offline' | 'error';

export const [budgetCloudStatus, setBudgetCloudStatus] = createSignal<BudgetCloudStatus>('idle');
export const [budgetKeyReady, setBudgetKeyReady] = createSignal(false);

let budgetKey: CryptoKey | null = null;
let budgetSalt = ''; // salt of the key currently in memory (stamped onto new blobs)
let budgetBlobSynced = false; // true once a cloud snapshot has been safely read/decrypted
let budgetPushBlocked = false; // decrypt failed -> never overwrite the cloud copy
let budgetCloudSnapshotLoaded = false;

function budgetSyncIsLocked(): boolean {
  return !budgetKey || budgetPushBlocked;
}

export function isBudgetUnlocked(): boolean {
  return budgetKey !== null && !budgetPushBlocked;
}

function budgetKeyStorageKey(userId: string | null | undefined): string {
  return `${BUDGET_KEY_STORAGE_PREFIX}_${userId ?? 'guest'}`;
}

/**
 * Persists the derived AES key (+ its salt) for this account so a later boot
 * from a stored session token can unlock the cloud copy automatically without
 * prompting for the password again. The key stays on this device in
 * localStorage; only ciphertext is ever exported to the cloud.
 */
async function persistBudgetKey(): Promise<boolean> {
  if (!budgetKey || !budgetSalt) return false;
  if (typeof window === 'undefined') return false;
  try {
    const raw = await exportBudgetKey(budgetKey);
    localStorage.setItem(
      budgetKeyStorageKey(state.user?.id),
      JSON.stringify({ v: 1, raw, salt: budgetSalt })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Drops the in-memory key AND the persisted (possibly drifted) one for this
 * account. Used when an auto-restored key fails to decrypt the cloud blob, so
 * it can never wedge this device in 'locked' on later sessions; the next
 * explicit password login re-derives cleanly against the blob's own salt.
 */
async function invalidateStoredBudgetKey(): Promise<void> {
  budgetKey = null;
  budgetSalt = '';
  budgetBlobSynced = false;
  budgetPushBlocked = false;
  if (typeof window !== 'undefined' && state.user?.id) {
    try {
      localStorage.removeItem(budgetKeyStorageKey(state.user.id));
    } catch {
      // ignore
    }
  }
}

/**
 * Re-imports the persisted key for the currently signed-in account from
 * localStorage. Returns true when a key was restored, so the cloud copy can be
 * decrypted without the password (e.g. sessions restored from a stored token).
 */
async function restoreStoredBudgetKey(): Promise<boolean> {
  if (budgetKey) return true;
  const userId = state.user?.id;
  if (!userId || typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(budgetKeyStorageKey(userId));
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || typeof parsed.raw !== 'string' || typeof parsed.salt !== 'string') return false;
    budgetKey = await importBudgetKey(parsed.raw);
    budgetSalt = parsed.salt;
    budgetPushBlocked = false;
    budgetCloudSnapshotLoaded = false;
    setBudgetKeyReady(true);
    return true;
  } catch {
    return false;
  }
}

async function fetchBudgetBlob(token: string): Promise<EncryptedBudgetBlob | null> {
  try {
    const res = await fetch('/api/timebudget/sync', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) {
      setUserAccount(null);
      setBudgetCloudStatus('error');
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.success) return null;
    return isEncryptedBudgetBlob(data.blob) ? data.blob : null;
  } catch {
    return null;
  }
}

/**
 * Applies a decrypted privacy payload ({ timebudget, calendar }) onto local
 * state. The cloud copy is authoritative once a blob exists, because a blob is
 * only created by a successful push - mirroring the old calendar_synced_at
 * semantics for the encrypted channel.
 */
function applyCloudPrivacyState(plain: unknown): void {
  const data =
    plain && typeof plain === 'object' && !Array.isArray(plain)
      ? (plain as Record<string, unknown>)
      : {};

  const tb = sanitizeTimeBudget(data.timebudget ?? {});
  // Guard against the empty-clobber case: an older bug could push an empty
  // snapshot as the first blob. Never hollow out a device that has real data -
  // it will repair the cloud copy on the next push instead.
  if (tb.activities.length > 0 || state.timebudget.activities.length === 0) {
    setState('timebudget', tb);
  }

  const cal = data.calendar;
  if (cal && typeof cal === 'object' && !Array.isArray(cal)) {
    const c = cal as Record<string, unknown>;
    if (Array.isArray(c.events)) {
      const sanitized = (c.events as unknown[])
        .map(sanitizeEvent)
        .filter((e): e is CalendarEventItem => e !== null);
      if (sanitized.length > 0 || state.calendar.events.length === 0) {
        setState('calendar', 'events', sanitized);
      }
    }
    if (Array.isArray(c.occurrenceOverrides)) {
      const sanitizedOverrides = (c.occurrenceOverrides as unknown[])
        .map(sanitizeOccurrenceOverride)
        .filter((o): o is CalendarOccurrenceOverride => o !== null && o.parentId !== '');
      if (sanitizedOverrides.length > 0 || state.calendar.occurrenceOverrides.length === 0) {
        setState('calendar', 'occurrenceOverrides', sanitizedOverrides);
      }
    }
  }

  saveState();
}

/**
 * Derives the privacy-blob encryption key from the account password on this
 * device and caches it (persisted to localStorage so later sessions unlock
 * automatically). Must be called while signed in. Returns true on success.
 *
 * - If a cloud blob exists, the password is ALWAYS re-derived with the blob's
 *   own stored salt and used to decrypt it. This heals a key that was cached
 *   on this device under a drifted salt (e.g. another device created the first
 *   blob) and is the only way to clear a previous push-block. A wrong password
 *   fails loudly and never touches the cloud copy.
 * - If no blob exists yet, the salt is derived deterministically from the
 *   (account, password) pair so a second device logged in with the same
 *   password derives the SAME key and can read the blob the first device
 *   pushes - no per-device salt drift.
 */
export async function unlockBudgetKey(password: string): Promise<boolean> {
  if (!password || !state.user?.token) return false;
  if (!isOnline()) {
    setBudgetCloudStatus('offline');
    return false;
  }

  try {
    const blob = await fetchBudgetBlob(state.user.token);
    if (blob) {
      const key = await deriveBudgetKey(password, blob.salt);
      const plain = await decryptBudgetState(blob, key);
      if (plain === null) {
        // Wrong password or tampered blob. Never overwrite the cloud copy.
        budgetPushBlocked = true;
        setBudgetCloudStatus('locked');
        return false;
      }
      budgetKey = key;
      budgetSalt = blob.salt;
      budgetBlobSynced = true;
      budgetPushBlocked = false;
      budgetCloudSnapshotLoaded = true;
      setBudgetKeyReady(true);
      await persistBudgetKey();
      applyCloudPrivacyState(plain);
      setBudgetCloudStatus('synced');
      return true;
    }

    // No cloud copy yet. Keep a key that is already valid in this tab; a
    // restored/derived key is interchangeable with the deterministic one.
    if (budgetKey) return true;

    // Deterministic per-(account, password) salt (see deriveBudgetSalt).
    const salt = state.user.id ? await deriveBudgetSalt(state.user.id, password) : generateBudgetSalt();
    budgetKey = await deriveBudgetKey(password, salt);
    budgetSalt = salt;
    budgetBlobSynced = false;
    budgetPushBlocked = false;
    setBudgetKeyReady(true);
    await persistBudgetKey();
    setBudgetCloudStatus('idle');
    return true;
  } catch {
    setBudgetCloudStatus(isOnline() ? 'error' : 'offline');
    budgetSalt = '';
    return false;
  }
}

/**
 * Drops the in-memory key. Called on logout/account switch. The persisted copy
 * in localStorage is intentionally kept so the next login on this device still
 * unlocks the cloud copy automatically.
 */
export function forgetBudgetKey(): void {
  budgetKey = null;
  budgetSalt = '';
  budgetBlobSynced = false;
  budgetPushBlocked = false;
  budgetCloudSnapshotLoaded = false;
  setBudgetKeyReady(false);
  setBudgetCloudStatus('idle');
}

/**
 * Pulls the encrypted time budget + calendar from the cloud. The key is
 * restored automatically from the persisted copy for this account, so a
 * session booting from a stored token can decrypt it without a password.
 */
export async function loadBudgetFromCloud(token?: string): Promise<void> {
  const authToken = token || state.user?.token;
  if (!authToken) return;

  if (!isOnline()) {
    setBudgetCloudStatus('offline');
    return;
  }

  // Sessions restored from a stored token have no password on hand: unlock
  // automatically from the persisted key for this account.
  const restored = await restoreStoredBudgetKey();

  const blob = await fetchBudgetBlob(authToken);
  if (!blob) {
    // No cloud copy yet. Deliberately do NOT seed a push here: a plain boot
    // carries no new data, and auto-pushing the (usually empty) local snapshot
    // during a first load is what used to let a second device clobber the real
    // blob. Genuine changes push themselves via saveState() ->
    // scheduleBudgetCloudSync().
    budgetBlobSynced = false;
    return;
  }

  if (budgetSyncIsLocked()) {
    // Cloud copy exists but this tab has no key yet (e.g. a brand-new device
    // that never had the password entered). Stay locked; local data is never
    // clobbered by the unreadable cloud copy.
    budgetBlobSynced = false;
    setBudgetCloudStatus('locked');
    return;
  }

  const plain = await decryptBudgetState(blob, budgetKey!);
  if (plain === null) {
    if (restored) {
      // The restored persisted key no longer matches the cloud blob (e.g. it
      // was derived under a drifted pre-fix salt, or the password was changed
      // on another device). It is useless on this path and would wedge this
      // device in 'locked' on every auto-login. Drop it so the next explicit
      // password login re-derives against the blob's own salt instead.
      await invalidateStoredBudgetKey();
    }
    // Blob cannot be decrypted with the current key. Never clobber the cloud
    // copy with local state.
    budgetPushBlocked = true;
    setBudgetCloudStatus('locked');
    return;
  }

  budgetSalt = blob.salt;
  budgetBlobSynced = true;
  budgetPushBlocked = false;
  budgetCloudSnapshotLoaded = true;
  applyCloudPrivacyState(plain);
  // The cloud blob's salt is authoritative; re-persist the current key under
  // it so future bootstraps derive/restore against the right salt.
  await persistBudgetKey();
  setBudgetCloudStatus('synced');
}

function readPendingBudget(): { userId?: unknown } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PENDING_BUDGET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (parsed.userId !== (state.user?.id ?? null)) {
      clearPendingBudget();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function queuePendingBudget() {
  if (typeof window === 'undefined') return;
  if (!state.user?.id) return;
  try {
    localStorage.setItem(PENDING_BUDGET_KEY, JSON.stringify({ userId: state.user.id, updatedAt: Date.now() }));
  } catch (e) {
    console.error('Failed to queue pending time budget sync', e);
  }
}

function clearPendingBudget() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PENDING_BUDGET_KEY);
  } catch {
    // ignore
  }
}

/** Retries the freshest encrypted budget push after an offline/failed attempt. */
export async function syncBudgetFromPending(): Promise<boolean> {
  const pending = readPendingBudget();
  if (!pending) return false;
  if (typeof pending.userId === 'string') {
    if (!state.user || state.user.id !== pending.userId) {
      clearPendingBudget();
      return false;
    }
  } else {
    clearPendingBudget();
    return false;
  }
  return pushBudgetToCloud();
}

export function scheduleBudgetCloudSync() {
  if (typeof window === 'undefined') return;
  if (!state.user?.token) return;
  if (budgetSyncIsLocked()) return;
  if (budgetSyncTimer) clearTimeout(budgetSyncTimer);
  budgetSyncTimer = setTimeout(() => {
    void pushBudgetToCloud();
  }, 2500);
}

/**
 * Encrypts the current time budget + calendar and pushes it to the cloud.
 * Best-effort: on offline/failure the attempt is queued locally and retried
 * when the connection returns. Never runs while the budget is locked, so a
 * local default (or another account's data) can never overwrite the cloud copy.
 */
export function pushBudgetToCloud(): Promise<boolean> {
  const token = state.user?.token;
  if (!token) return Promise.resolve(false);

  if (budgetSyncIsLocked()) {
    setBudgetCloudStatus('locked');
    return Promise.resolve(false);
  }
  if (!budgetSalt) budgetSalt = generateBudgetSalt();

  if (!isOnline()) {
    setBudgetCloudStatus('offline');
    queuePendingBudget();
    return Promise.resolve(false);
  }

  setBudgetCloudStatus('syncing');

  const attempt = async (): Promise<boolean> => {
    try {
      const blob = await encryptBudgetState(
        {
          timebudget: state.timebudget,
          calendar: {
            events: state.calendar.events,
            occurrenceOverrides: state.calendar.occurrenceOverrides
          }
        },
        budgetKey!,
        budgetSalt,
        new Date().toISOString()
      );
      const res = await fetch('/api/timebudget/sync', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ blob })
      });
      if (res.status === 401) {
        setUserAccount(null);
        setBudgetCloudStatus('error');
        return false;
      }
      if (!res.ok) {
        setBudgetCloudStatus('error');
        queuePendingBudget();
        return false;
      }
      budgetBlobSynced = true;
      budgetPushBlocked = false;
      clearPendingBudget();
      setBudgetCloudStatus('synced');
      return true;
    } catch {
      setBudgetCloudStatus(isOnline() ? 'error' : 'offline');
      queuePendingBudget();
      return false;
    }
  };

  pushActive = true;
  const commit = pushQueue.then(attempt);
  // Whatever happens, the next push waits for this one before it starts.
  pushQueue = commit.then(
    () => {
      pushActive = false;
      return true;
    },
    () => {
      pushActive = false;
      return true;
    }
  );
  return commit;
}

/**
 * Pulls the logged-in user's saved progress from Supabase and merges it into
 * local state. Cloud data wins for RPG/waifu save fields, except that a richer
 * local save is never clobbered by the default 200-coin registration snapshot.
 */
export async function loadCloudProgress(token?: string, scope?: 'all' | 'profile' | 'rpg'): Promise<void> {
  const authToken = token || state.user?.token;
  if (!authToken) return;

  // The encrypted time budget is pulled independently of the main profile
  // snapshot (and can be locked without a password-derived key in memory).
  void loadBudgetFromCloud(authToken);

  if (!isOnline()) {
    // Offline fallback: keep the local save authoritative until a pull succeeds.
    setCloudSyncStatus('offline');
    return;
  }

  try {
    const url = scope ? `/api/sync/progress?scope=${scope}` : '/api/sync/progress';
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (res.status === 401) {
      setUserAccount(null);
      setCloudSyncStatus('error');
      return;
    }
    if (!res.ok) {
      setCloudSyncStatus('error');
      return;
    }

    const data = await res.json();
    if (!data.success) {
      setCloudSyncStatus('error');
      return;
    }

    setCloudSyncStatus('synced');

    // The pull succeeded, so from now on the local showcase is trustworthy and
    // may be pushed back to the cloud.
    cloudSnapshotLoaded = true;

    // The calendar (events + occurrence overrides) is NOT part of this
    // plaintext endpoint - it is merged from the end-to-end encrypted privacy
    // blob pulled by loadBudgetFromCloud() above.

    const p = data.progress;
    if (!p) {
      if (!scope || scope === 'all') {
        // Nothing saved in the cloud yet -> upload the current local state.
        scheduleCloudSync();
      }
      return;
    }

    const inventory: Array<{ item_id: string; category: string }> = Array.isArray(data.inventory) ? data.inventory : [];
    const showcaseItems: string[] = Array.isArray(data.showcaseItems) ? data.showcaseItems : [];

    // Never lose currency: the cloud can hold a stale snapshot (e.g. an older
    // session), so the merge always keeps the larger balance on both sides.
    const coins = Math.max(state.rpg.coins, typeof p.coins === 'number' ? p.coins : 0);

    setState(
      produce(s => {
        s.rpg.coins = coins;
        if (typeof p.bond_level === 'number' && p.bond_level > s.waifu.bondLevel) s.waifu.bondLevel = p.bond_level;
        if (typeof p.bond_exp === 'number') s.waifu.bondExp = Math.max(p.bond_exp, s.waifu.bondExp);
        if (p.waifu_name) s.waifu.name = p.waifu_name;
        if (p.waifu_personality) s.waifu.personality = p.waifu_personality;
        if (p.worn_outfit) s.waifu.appearance.outfit = p.worn_outfit;
        if (p.worn_accessory) s.waifu.appearance.accessory = p.worn_accessory;
        if (p.worn_hairstyle) s.waifu.appearance.hairstyle = p.worn_hairstyle;
        if (p.worn_avatar_frame) s.waifu.appearance.avatarFrame = p.worn_avatar_frame;
        if (p.appearance_data && typeof p.appearance_data === 'object') {
          Object.assign(s.waifu.appearance, p.appearance_data);
        }
        if (p.settings_data && typeof p.settings_data === 'object') {
          const cleaned = sanitizeSettings(p.settings_data);
          Object.assign(s.settings, cleaned);
          if (cleaned.language) s.settings.language = cleaned.language;
        }
        if (Array.isArray(p.claimed_milestones) && p.claimed_milestones.length > 0) {
          s.rpg.claimedAffectionMilestones = Array.from(new Set([...(s.rpg.claimedAffectionMilestones || []), ...p.claimed_milestones]));
        }
        if (typeof p.defense_high_wave === 'number') {
          s.rpg.defenseHighWave = Math.max(s.rpg.defenseHighWave || 0, p.defense_high_wave);
        }
        s.rpg.defenseStats.totalVictories = Math.max(s.rpg.defenseStats.totalVictories || 0, p.defense_victories || 0);
        s.rpg.defenseStats.goblinsDefeated = Math.max(s.rpg.defenseStats.goblinsDefeated || 0, p.goblins_defeated || 0);

        const unlockedOutfits = new Set(s.rpg.unlockedOutfits);
        const unlockedAccessories = new Set(s.rpg.unlockedAccessories);
        const unlockedHairstyles = new Set(s.rpg.unlockedHairstyles);
        const unlockedAvatarFrames = new Set(s.rpg.unlockedAvatarFrames);
        for (const item of inventory) {
          if (item.category === 'outfit') unlockedOutfits.add(item.item_id);
          else if (item.category === 'accessory') unlockedAccessories.add(item.item_id);
          else if (item.category === 'hairstyle') unlockedHairstyles.add(item.item_id);
          else if (item.category === 'avatar_frame') unlockedAvatarFrames.add(item.item_id);
        }
        s.rpg.unlockedOutfits = [...unlockedOutfits];
        s.rpg.unlockedAccessories = [...unlockedAccessories];
        s.rpg.unlockedHairstyles = [...unlockedHairstyles];
        s.rpg.unlockedAvatarFrames = [...unlockedAvatarFrames];
        // The server showcase is authoritative - including the empty list, so a
        // showcase cleared on another device is cleared everywhere. (The
        // cloudSnapshotLoaded guard above makes sure a fresh login never pushes
        // the empty default before this pull runs.)
        s.rpg.showcaseItems = showcaseItems;
      })
    );
    saveState();
  } catch {
    setCloudSyncStatus(isOnline() ? 'error' : 'offline');
  }
}

function unionStrings(a: string[] | undefined, b: string[] | undefined): string[] {
  return Array.from(new Set([...(a || []), ...(b || [])]));
}

/**
 * Sanitizes and applies a parsed localStorage payload onto the reactive store.
 * Used both by boot-time `loadState` and when restoring a specific account's
 * save after an account switch.
 */
function applyStoredState(parsed: unknown) {
  if (!parsed || typeof parsed !== 'object') return;
  const rawHadEvents = (parsed as any).calendar !== null && typeof (parsed as any).calendar === 'object' && Array.isArray((parsed as any).calendar.events);
  const rawHadMessages = (parsed as any).chat !== null && typeof (parsed as any).chat === 'object' && Array.isArray((parsed as any).chat.messages);

  // Schema validation & sanitization of possibly-corrupt, legacy, or
  // future-shaped data before it ever reaches the reactive store.
  const { data, issues } = sanitizeRawState(parsed);
  if (issues.length > 0) console.warn('State hydration issues:', issues);

  setState(
    produce(s => {
      Object.assign(s, {
        ...DEFAULT_STATE,
        ...data,
        user: data.user,
        waifu: {
          ...DEFAULT_STATE.waifu,
          ...(data.waifu || {}),
          appearance: { ...DEFAULT_STATE.waifu.appearance, ...(data.waifu?.appearance || {}) }
        },
        rpg: {
          ...DEFAULT_RPG,
          ...(data.rpg || {}),
          unlockedOutfits: unionStrings(DEFAULT_RPG.unlockedOutfits, data.rpg?.unlockedOutfits),
          unlockedAccessories: unionStrings(DEFAULT_RPG.unlockedAccessories, data.rpg?.unlockedAccessories),
          unlockedHairstyles: unionStrings(DEFAULT_RPG.unlockedHairstyles, data.rpg?.unlockedHairstyles),
          unlockedAvatarFrames: unionStrings(DEFAULT_RPG.unlockedAvatarFrames, data.rpg?.unlockedAvatarFrames)
        },
        calendar: {
          ...DEFAULT_STATE.calendar,
          ...(data.calendar || {}),
          events: rawHadEvents ? data.calendar?.events || [] : DEFAULT_STATE.calendar.events,
          occurrenceOverrides: Array.isArray(data.calendar?.occurrenceOverrides)
            ? data.calendar.occurrenceOverrides
            : DEFAULT_STATE.calendar.occurrenceOverrides
        },
        settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) },
        chat: {
          ...DEFAULT_STATE.chat,
          ...(data.chat || {}),
          messages: rawHadMessages ? data.chat?.messages || [] : DEFAULT_STATE.chat.messages
        }
      });
    })
  );
}

export function loadState() {
  if (typeof window === 'undefined') return;
  try {
    // Restore the last active account's own bucket when a session is persisted,
    // falling back to the shared guest/demo bucket otherwise.
    const activeId = localStorage.getItem(ACTIVE_USER_KEY);
    const saved =
      (activeId && localStorage.getItem(scopedStorageKey(activeId))) ||
      localStorage.getItem(STORAGE_KEY);
    if (saved) {
      applyStoredState(JSON.parse(saved));
    }
  } catch (e) {
    console.warn('Failed to load state from localStorage', e);
  }
}

// Bond progression
export function getBondExpNeeded(level: number): number {
  return Math.max(1, Math.floor(level)) * 60;
}

const INTERACTION_COOLDOWNS_MS: Record<string, number> = {
  poke: 3 * 60 * 1000,
  headpat: 5 * 60 * 1000,
  chat: 60 * 1000
};

const INTERACTION_REWARDS: Record<string, { bondExp: number; coins: number }> = {
  poke: { bondExp: 4, coins: 2 },
  headpat: { bondExp: 6, coins: 3 },
  chat: { bondExp: 2, coins: 1 }
};

const COOLDOWN_STORAGE_KEY = 'waifu_space_cooldowns_v1';

function readCooldowns(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(COOLDOWN_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function getCooldownRemainingMs(action: string): number {
  const until = readCooldowns()[action] || 0;
  return Math.max(0, until - Date.now());
}

export function formatCooldown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds > 0 ? seconds + 's' : ''}`.trim() : `${seconds}s`;
}

export function tryClaimInteraction(action: string): boolean {
  const remaining = getCooldownRemainingMs(action);
  return !(remaining > 0);
}

function setInteractionCooldown(action: string) {
  if (typeof window === 'undefined') return;
  const windowMs = INTERACTION_COOLDOWNS_MS[action];
  if (!windowMs) return;
  const cd = readCooldowns();
  cd[action] = Date.now() + windowMs;
  try {
    localStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(cd));
  } catch {
    // ignore
  }
}

export function gainBondExp(amount: number) {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  setState(
    produce(s => {
      let exp = Math.max(0, s.waifu.bondExp || 0) + safeAmount;
      let level = Math.max(1, s.waifu.bondLevel || 1);
      const needed = getBondExpNeeded(level);
      if (exp >= needed) {
        exp -= needed;
        level += 1;
        const bonusCoins = level * 20;
        s.rpg.coins = Math.max(0, (s.rpg.coins || 0) + bonusCoins);
        showToast(`🌸 Bond Level Up! ${s.waifu.name} reached Lv. ${level}! (+${bonusCoins} 🪙)`);
      }
      s.waifu.bondExp = exp;
      s.waifu.bondLevel = level;
    })
  );
  saveState();
}

// Speech synthesis
export function speakText(text: string) {
  if (typeof window === 'undefined') return;
  const synth = window.speechSynthesis;
  if (!synth || !state.settings.ttsEnabled) return;

  try {
    synth.cancel();
    const cleanText = text
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/[*_~`#]/g, '')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.pitch = state.settings.ttsPitch ?? 1.25;
    utterance.rate = state.settings.ttsRate ?? 1.0;

    const voices = synth.getVoices();
    if (state.settings.ttsVoice) {
      const match = voices.find(v => v.name === state.settings.ttsVoice || v.voiceURI === state.settings.ttsVoice);
      if (match) utterance.voice = match;
    } else {
      const female = voices.find(v =>
        v.name.includes('Natural') ||
        v.name.includes('Female') ||
        v.name.includes('Ayumi') ||
        v.name.includes('Haruka') ||
        v.name.includes('Zira') ||
        v.name.includes('Jenny')
      );
      if (female) utterance.voice = female;
    }

    utterance.onstart = () => setIsTalking(true);
    utterance.onend = () => setIsTalking(false);
    utterance.onerror = () => setIsTalking(false);

    synth.speak(utterance);
  } catch (e) {
    console.warn('TTS error:', e);
    setIsTalking(false);
  }
}

// Dialogue trigger
export function triggerWaifuResponse(text: string, mood: string, suggestions?: string[]) {
  setState('waifu', 'mood', mood);
  const newMsg: ChatMessage = {
    id: 'msg-' + Date.now(),
    sender: 'waifu',
    text,
    timestamp: new Date().toISOString(),
    emotion: mood
  };
  setState('chat', 'messages', msgs => [...msgs, newMsg]);
  if (suggestions && suggestions.length > 0) {
    setState('chat', 'suggestions', suggestions);
  }

  // Speech bubble
  setSpeechBubble(text);
  setSpeechBubbleVisible(true);
  clearTimeout(bubbleTimeout);
  bubbleTimeout = setTimeout(() => {
    setSpeechBubbleVisible(false);
  }, 6000);

  // Audio speech
  speakText(text);
  saveState();
}

// User poke action
export function pokeAvatar() {
  setAvatarBounced(true);
  setTimeout(() => setAvatarBounced(false), 450);

  const persona = getPersonality(state.waifu.personality);
  const pokes = persona.poke;
  const item = pokes[Math.floor(Math.random() * pokes.length)];

  if (tryClaimInteraction('poke')) {
    setInteractionCooldown('poke');
    gainBondExp(INTERACTION_REWARDS.poke.bondExp);
    addCoins(INTERACTION_REWARDS.poke.coins);
  } else {
    const remaining = formatCooldown(getCooldownRemainingMs('poke'));
    showToast(`🌸 ${state.waifu.name} is still flustered from that! Try again in ${remaining}.`);
  }

  triggerWaifuResponse(item.text, item.mood);
}

// Headpat action (affection reward with its own cooldown)
export function headpatWaifu() {
  const persona = getPersonality(state.waifu.personality);
  const pats = persona.poke;
  const pat = pats[Math.floor(Math.random() * pats.length)];

  if (tryClaimInteraction('headpat')) {
    setInteractionCooldown('headpat');
    gainBondExp(INTERACTION_REWARDS.headpat.bondExp);
    addCoins(INTERACTION_REWARDS.headpat.coins);
  } else {
    const remaining = formatCooldown(getCooldownRemainingMs('headpat'));
    showToast(`🌸 ${state.waifu.name} is already happy from that! Try again in ${remaining}.`);
  }

  triggerWaifuResponse(pat.text, pat.mood);
}

// Economy & RPG Operations
export function addCoins(amount: number) {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  setState('rpg', 'coins', c => {
    const base = Number.isFinite(c) ? Math.max(0, c) : 0;
    return clampNumber(base + safeAmount, 0, 99999999);
  });
  saveState();
}

export function spendCoins(amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const balance = Number.isFinite(state.rpg.coins) ? Math.max(0, Math.floor(state.rpg.coins)) : 0;
  if (balance < Math.floor(amount)) return false;
  setState('rpg', 'coins', clampNumber(balance - Math.floor(amount), 0, 99999999));
  saveState();
  return true;
}

export function unlockCosmetic(category: 'outfits' | 'accessories' | 'hairstyles' | 'avatar_frames', id: string) {
  const key = category === 'outfits' ? 'unlockedOutfits' : category === 'accessories' ? 'unlockedAccessories' : category === 'hairstyles' ? 'unlockedHairstyles' : 'unlockedAvatarFrames';
  if (!state.rpg[key].includes(id)) {
    setState('rpg', key, list => [...list, id]);
    saveState();
  }
}

export function getUnlockedCosmeticsCount(): number {
  const outfits = state.rpg?.unlockedOutfits?.length || 0;
  const accessories = state.rpg?.unlockedAccessories?.length || 0;
  const hairstyles = state.rpg?.unlockedHairstyles?.length || 0;
  const avatarFrames = state.rpg?.unlockedAvatarFrames?.length || 0;
  return outfits + accessories + hairstyles + avatarFrames;
}

export function isCosmeticUnlocked(categoryOrId: string, id?: string): boolean {
  if (!id) {
    const targetId = categoryOrId;
    if (targetId === 'none') return true;
    const cat = COSMETIC_CATALOG.find(c => c.id === targetId)?.category;
    if (cat === 'outfit') return (state.rpg?.unlockedOutfits || []).includes(targetId);
    if (cat === 'accessory') return (state.rpg?.unlockedAccessories || []).includes(targetId);
    if (cat === 'hairstyle') return (state.rpg?.unlockedHairstyles || []).includes(targetId);
    if (cat === 'avatar_frame') return (state.rpg?.unlockedAvatarFrames || []).includes(targetId);
    return (
      (state.rpg?.unlockedOutfits || []).includes(targetId) ||
      (state.rpg?.unlockedAccessories || []).includes(targetId) ||
      (state.rpg?.unlockedHairstyles || []).includes(targetId) ||
      (state.rpg?.unlockedAvatarFrames || []).includes(targetId)
    );
  }

  if (id === 'none') return true;
  const key = categoryOrId === 'outfits' || categoryOrId === 'outfit'
    ? 'unlockedOutfits'
    : categoryOrId === 'accessories' || categoryOrId === 'accessory'
    ? 'unlockedAccessories'
    : categoryOrId === 'hairstyles' || categoryOrId === 'hairstyle'
    ? 'unlockedHairstyles'
    : 'unlockedAvatarFrames';
  return (state.rpg?.[key] || []).includes(id);
}

export function claimAffectionReward(level: number): boolean {
  const milestone = AFFECTION_MILESTONES.find(m => m.level === level);
  if (!milestone) return false;
  if (state.waifu.bondLevel < level) return false;
  if ((state.rpg?.claimedAffectionMilestones || []).includes(level)) return false;

  setState('rpg', 'claimedAffectionMilestones', list => [...(list || []), level]);

  if (milestone.rewardType === 'coins' && typeof milestone.rewardValue === 'number') {
    addCoins(milestone.rewardValue);
    const label = getMilestoneRewardLabel(milestone.level, milestone.rewardLabel);
    showToast(`🎁 ${t('rpg.toasts.claimedReward', { label, level })}`);
  } else if (milestone.rewardType === 'cosmetic' && typeof milestone.rewardValue === 'string') {
    const item = COSMETIC_CATALOG.find(c => c.id === milestone.rewardValue);
    if (item) {
      if (item.category === 'outfit') unlockCosmetic('outfits', item.id);
      else if (item.category === 'accessory') unlockCosmetic('accessories', item.id);
      else if (item.category === 'hairstyle') unlockCosmetic('hairstyles', item.id);
      else if (item.category === 'avatar_frame') unlockCosmetic('avatar_frames', item.id);
    }
    const label = getMilestoneRewardLabel(milestone.level, milestone.rewardLabel);
    showToast(`🎁 ${t('rpg.toasts.unlockedReward', { label, level })}`);
  }

  saveState();
  return true;
}

export interface LootboxResult {
  item: RpgCosmeticItem;
  isDuplicate: boolean;
  duplicateCoins: number;
  duplicateExp: number;
}

export function toggleShowcaseItem(itemId: string): boolean {
  if (!isCosmeticUnlocked(itemId)) return false;
  const current = state.rpg?.showcaseItems || [];
  if (current.includes(itemId)) {
    setState('rpg', 'showcaseItems', list => (list || []).filter(id => id !== itemId));
    saveState();
    return true;
  }

  if (current.length >= 6) {
    showToast('Showcase case is full (max 6 items)!');
    return false;
  }

  setState('rpg', 'showcaseItems', list => [...(list || []), itemId]);
  saveState();
  return true;
}

/**
 * Wipes all per-account progress (waifu bond, RPG economy/inventory, calendar,
 * chat history) back to the fresh-player defaults. Used when registering a brand
 * new account and when switching accounts, so leftover state from a previous
 * session/account can never leak into the next player's save.
 */
function resetStateInMemory() {
  const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE)) as AppState;
  fresh.calendar.events = [];
  setState(fresh);
  // The fresh state mirrors a brand-new account/guest, so nothing that depends
  // on a pulled cloud snapshot may be pushed until the next successful pull.
  cloudSnapshotLoaded = false;
}

export function resetAccountProgress() {
  resetStateInMemory();
  saveState();
}

export function setUserAccount(user: UserAccount | null) {
  const prevId = state.user?.id;
  const nextId = user?.id;
  const prevRegistered = isRegisteredAccount(state.user);
  const nextRegistered = isRegisteredAccount(user);

  if (prevRegistered || nextRegistered) {
    if (prevId !== nextId) {
      // Persist the outgoing account's state under its own bucket first, then
      // wipe the in-memory state so no data leaks into the next account.
      saveState();
      if (prevRegistered) {
        localStorage.removeItem(ACTIVE_USER_KEY);
      }
      forgetBudgetKey();
      resetStateInMemory();
    } else if (!nextRegistered) {
      forgetBudgetKey();
    }
    setState('user', user);

    // Restore this account's own local save (if this browser has one) so a
    // re-login works even before the cloud pull completes.
    if (nextRegistered && nextId) {
      const saved = localStorage.getItem(scopedStorageKey(nextId));
      if (saved) applyStoredState(JSON.parse(saved));
      // Keep the freshly-issued session/account from the auth response.
      setState('user', user);
      // Auto-unlock the encrypted cloud backup with this account's persisted
      // key (no password needed on this device).
      void restoreStoredBudgetKey();
    }

    saveState();
    return;
  }

  // Both sides are guests/logged-out: no account isolation in play.
  setState('user', user);
  saveState();
}

/**
 * Validated settings updater: any incoming values are sanitized/clamped before
 * being persisted, so malformed UI input can never corrupt saved settings.
 */
export function updateSettings(partial: Record<string, unknown>) {
  const cleaned = sanitizeSettings(partial);
  setState('settings', prev => ({ ...prev, ...cleaned }));
  saveState();
}

// ---------------------------------------------------------------------------
// Country holidays (read-only, rendered as all-day events inside the views)
// ---------------------------------------------------------------------------

const holidayCache = new Map<string, HolidayEntry[]>();
const HOLIDAY_CACHE_MAX = 300;
let countryCatalogCache: CountryInfo[] | null = null;

/** Read-only all-day events derived from the selected countries' holidays. */
export const [holidayEvents, setHolidayEvents] = createSignal<CalendarEventItem[]>([]);
export const [holidayLoading, setHolidayLoading] = createSignal(false);
export const [holidayError, setHolidayError] = createSignal(false);

/**
 * Fetches (with an in-memory cache) the public holidays of one country for one
 * year through the local /api/holidays proxy. It never throws: any failure
 * yields [] so the calendar stays usable, even offline.
 */
export async function fetchHolidaysForCountry(countryCode: string, year: number): Promise<HolidayEntry[]> {
  const code = sanitizeCountryCode(countryCode);
  if (!code || !Number.isInteger(year) || year < 1900 || year > 2100) return [];
  const key = `${code}:${year}`;
  const cached = holidayCache.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(`/api/holidays?action=events&country=${encodeURIComponent(code)}&year=${year}`);
    if (!res.ok) return [];
    const data = await res.json();
    const entries = (Array.isArray(data?.holidays) ? data.holidays : [])
      .map(sanitizeHolidayEntry)
      .filter((e: HolidayEntry | null): e is HolidayEntry => e !== null);
    if (holidayCache.size >= HOLIDAY_CACHE_MAX) holidayCache.clear();
    holidayCache.set(key, entries);
    return entries;
  } catch {
    return [];
  }
}

/** Cached list of all countries the holiday service knows about. */
export async function fetchCountryCatalog(): Promise<CountryInfo[]> {
  if (countryCatalogCache) return countryCatalogCache;
  try {
    const res = await fetch('/api/holidays?action=countries');
    if (!res.ok) return [];
    const data = await res.json();
    const raw: unknown = data?.countries;
    const countries = Array.isArray(raw)
      ? (raw as unknown[])
          .map(sanitizeCountry)
          .filter((c: CountryInfo | null): c is CountryInfo => c !== null)
      : [];
    countryCatalogCache = countries;
    return countries;
  } catch {
    return [];
  }
}

/**
 * Rebuilds the reactive `holidayEvents` list for the selected countries across
 * the given years. The planner runs this from an effect on selection and
 * navigation; the in-memory cache absorbs repeat fetches.
 */
export async function refreshHolidayEvents(years: number[]): Promise<void> {
  const codes = (state.settings.countryHolidays || []).slice();
  if (codes.length === 0) {
    setHolidayEvents([]);
    setHolidayError(false);
    return;
  }
  setHolidayLoading(true);
  setHolidayError(false);
  try {
    const lists = await Promise.all(codes.flatMap(code => years.map(year => fetchHolidaysForCountry(code, year))));
    setHolidayEvents(buildHolidayEvents((lists as HolidayEntry[][]).flat()));
  } catch {
    setHolidayError(true);
  } finally {
    setHolidayLoading(false);
  }
}

/** Replaces the selected country-holiday list (sanitized + de-duplicated + capped). */
export function setCountryHolidays(codes: string[]): void {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(codes) ? codes : []) {
    const code = sanitizeCountryCode(raw);
    if (code && !seen.has(code)) {
      seen.add(code);
      cleaned.push(code);
    }
    if (cleaned.length >= 20) break;
  }
  setState('settings', 'countryHolidays', cleaned);
  saveState();
}

/** Enables/disables the optional worldwide cultural holidays (Halloween, ...). */
export function setCulturalHolidaysEnabled(enabled: boolean): void {
  setState('settings', 'showCulturalHolidays', !!enabled);
  saveState();
}

/** Test helper: drops all cached holiday/catalog data. */
export function clearHolidayCache(): void {
  holidayCache.clear();
  countryCatalogCache = null;
}

export function openLootbox(boxType: 'standard' | 'royal'): LootboxResult | null {
  const cost = getLootboxCost(boxType);
  if (!spendCoins(cost)) {
    showToast('Not enough coins to open this chest!');
    return null;
  }

  const targetRarity = rollLootRarity(boxType);

  let candidates = COSMETIC_CATALOG.filter(c => c.id !== 'none' && c.rarity === targetRarity);
  if (candidates.length === 0) candidates = COSMETIC_CATALOG.filter(c => c.id !== 'none');

  const picked = candidates[Math.floor(Math.random() * candidates.length)];

  const categoryKey = picked.category === 'outfit' ? 'unlockedOutfits' : picked.category === 'accessory' ? 'unlockedAccessories' : picked.category === 'hairstyle' ? 'unlockedHairstyles' : 'unlockedAvatarFrames';
  const isDuplicate = (state.rpg?.[categoryKey] || []).includes(picked.id);

  let duplicateCoins = 0;
  let duplicateExp = 0;

  if (isDuplicate) {
    const comp = DUPLICATE_COMPENSATION[picked.rarity];
    duplicateCoins = comp.coins;
    duplicateExp = comp.exp;

    addCoins(duplicateCoins);
    gainBondExp(duplicateExp);
  } else {
    unlockCosmetic(picked.category === 'outfit' ? 'outfits' : picked.category === 'accessory' ? 'accessories' : picked.category === 'hairstyle' ? 'hairstyles' : 'avatar_frames', picked.id);
  }

  saveState();
  return {
    item: picked,
    isDuplicate,
    duplicateCoins,
    duplicateExp
  };
}

export function recordDefenseWaveVictory(wave: number, coinsWon?: number, expWon?: number, goblinsKilled = 10) {
  const safeWave = Math.max(1, Math.min(200, Math.floor(wave || 1)));
  const safeGoblins = Math.max(0, Math.min(100000, Math.floor(goblinsKilled || 0)));
  const coinsReward = coinsWon !== undefined ? Math.max(0, Math.floor(coinsWon)) : getDefenseCoinsReward(safeWave);
  const expReward = expWon !== undefined ? Math.max(0, Math.floor(expWon)) : getDefenseExpReward(safeWave);

  addCoins(coinsReward);
  gainBondExp(expReward);

  setState('rpg', produce(r => {
    if (!r) return;
    if (safeWave > (r.defenseHighWave || 0)) r.defenseHighWave = safeWave;
    if (!r.defenseStats) {
      r.defenseStats = { totalVictories: 0, goblinsDefeated: 0 };
    }
    r.defenseStats.totalVictories = (r.defenseStats.totalVictories || 0) + 1;
    r.defenseStats.goblinsDefeated = (r.defenseStats.goblinsDefeated || 0) + safeGoblins;
  }));

  saveState();
  showToast(`⚔️ Wave ${wave} Cleared! (+${coinsReward} 🪙, +${expReward} EXP)`);
}

// Calendar date & recurrence helpers
export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function isEventOnDate(ev: CalendarEventItem, targetDate: Date): boolean {
  const s = new Date(ev.start);
  const targetDayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
  const eventDayStart = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();

  if (targetDayStart < eventDayStart) {
    return false;
  }

  if (!ev.recurrence || ev.recurrence === 'none') {
    return isSameDay(s, targetDate);
  }

  if (ev.recurrence === 'daily') {
    return true;
  }

  if (ev.recurrence === 'weekly') {
    return targetDate.getDay() === s.getDay();
  }

  if (ev.recurrence === 'weekdays') {
    const day = targetDate.getDay();
    return day >= 1 && day <= 5;
  }

  if (ev.recurrence === 'monthly') {
    return targetDate.getDate() === s.getDate();
  }

  return isSameDay(s, targetDate);
}

export function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getOccurrenceForDate(ev: CalendarEventItem, targetDate: Date): CalendarEventItem {
  const dateKey = dateKeyOf(targetDate);
  if (isSameDay(new Date(ev.start), targetDate)) {
    return { ...ev, parentId: ev.parentId || ev.id, dateKey };
  }
  const s = new Date(ev.start);
  const e = new Date(ev.end || ev.start);
  const durationMs = Math.max(0, e.getTime() - s.getTime());

  const occStart = new Date(targetDate);
  occStart.setHours(s.getHours(), s.getMinutes(), s.getSeconds(), s.getMilliseconds());
  const occEnd = new Date(occStart.getTime() + durationMs);

  return {
    ...ev,
    parentId: ev.parentId || ev.id,
    dateKey,
    start: occStart.toISOString(),
    end: occEnd.toISOString()
  };
}

function occurrenceOverrideFor(parentId: string, dateKey: string): CalendarOccurrenceOverride | undefined {
  return state.calendar.occurrenceOverrides.find(o => o.parentId === parentId && o.dateKey === dateKey);
}

function applyOccurrenceOverride(occ: CalendarEventItem, ovr: CalendarOccurrenceOverride): CalendarEventItem {
  return {
    ...occ,
    parentId: occ.parentId || ovr.parentId,
    dateKey: occ.dateKey || ovr.dateKey,
    title: ovr.title !== undefined ? ovr.title : occ.title,
    start: ovr.start !== undefined ? ovr.start : occ.start,
    end: ovr.end !== undefined ? ovr.end : occ.end,
    allDay: ovr.allDay !== undefined ? ovr.allDay : occ.allDay,
    color: ovr.color !== undefined ? ovr.color : occ.color,
    location: ovr.location !== undefined ? ovr.location : occ.location,
    description: ovr.description !== undefined ? ovr.description : occ.description,
    completed: ovr.completed !== undefined ? ovr.completed : occ.completed,
    _rewarded: ovr.rewarded !== undefined ? ovr.rewarded : occ._rewarded
  };
}

export function getEventsForDate(
  events: CalendarEventItem[],
  targetDate: Date,
  overrides: CalendarOccurrenceOverride[] = state.calendar.occurrenceOverrides
): CalendarEventItem[] {
  const targetKey = dateKeyOf(targetDate);
  const res: CalendarEventItem[] = [];

  for (const ev of events) {
    if (!isEventOnDate(ev, targetDate)) continue;
    const ovr = occurrenceOverrideFor(ev.id, targetKey);
    if (ovr?.deleted) continue;
    res.push(ovr ? applyOccurrenceOverride(getOccurrenceForDate(ev, targetDate), ovr) : getOccurrenceForDate(ev, targetDate));
  }

  // Moved occurrences: an override carrying an explicit start that lands on
  // this day for a series that does not itself recur on this day.
  for (const ovr of overrides) {
    if (ovr.deleted || !ovr.start) continue;
    if (dateKeyOf(new Date(ovr.start)) !== targetKey) continue;
    const base = events.find(e => e.id === ovr.parentId);
    if (!base || !base.recurrence || base.recurrence === 'none') continue;
    if (isEventOnDate(base, targetDate)) continue;
    res.push(applyOccurrenceOverride(getOccurrenceForDate(base, targetDate), ovr));
  }

  return res;
}

export function upsertOccurrenceOverride(parentId: string, dateKey: string, fields: Partial<CalendarOccurrenceOverride>) {
  const baseEvent = state.calendar.events.find(e => e.id === parentId);
  // Only recurring events have per-occurrence overrides.
  if (!baseEvent || !baseEvent.recurrence || baseEvent.recurrence === 'none') return;

  const existing = occurrenceOverrideFor(parentId, dateKey);
  const record: CalendarOccurrenceOverride = {
    ...(existing ||
      ({
        id: `occ-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        parentId,
        dateKey
      } as CalendarOccurrenceOverride)),
    ...fields
  };
  record.updatedAt = new Date().toISOString();

  const idx = state.calendar.occurrenceOverrides.findIndex(o => o.parentId === parentId && o.dateKey === dateKey);
  if (idx >= 0) {
    setState('calendar', 'occurrenceOverrides', overrides => overrides.map((o, i) => (i === idx ? record : o)));
  } else {
    setState('calendar', 'occurrenceOverrides', overrides => [...overrides, record]);
  }
  saveState();
}

// Calendar event operations
export function addCalendarEvent(event: Partial<CalendarEventItem>): CalendarEventItem | null {
  // Defensive validation: malformed payloads are rejected before they reach the store.
  const validation = validateCalendarEventInput(event);
  if (!validation.ok) {
    console.warn('addCalendarEvent rejected input:', validation.issues);
    showToast(validation.issues[0].message);
    return null;
  }

  const start = event.start || new Date().toISOString();
  let end = event.end || new Date(Date.now() + 3600000).toISOString();
  if (new Date(end).getTime() < new Date(start).getTime()) {
    end = new Date(new Date(start).getTime() + 3600000).toISOString();
  }

  const newEvent: CalendarEventItem = {
    id: event.id || ('evt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)),
    title: (event.title || '').trim() || 'New Event',
    start,
    end,
    allDay: event.allDay ?? false,
    type: event.type || 'event',
    completed: false,
    color: event.color || '#ff6584',
    description: event.description || '',
    location: event.location || '',
    recurrence: event.recurrence || 'none'
  };

  setState('calendar', 'events', events => [newEvent, ...events]);
  gainBondExp(8);
  addCoins(10);
  saveState();
  return newEvent;
}

export function updateCalendarEvent(id: string, updates: Partial<CalendarEventItem>, dateKey?: string): boolean {
  const existing = state.calendar.events.find(ev => ev.id === id);
  if (!existing) return false;

  if (dateKey && existing.recurrence && existing.recurrence !== 'none') {
    const occ = getOccurrenceForDate(existing, new Date(`${dateKey}T00:00:00`));
    const merged: CalendarEventItem = { ...occ, ...updates };
    const validation = validateCalendarEventInput(merged);
    if (!validation.ok) {
      console.warn('updateCalendarEvent rejected occurrence update:', validation.issues);
      showToast(validation.issues[0].message);
      return false;
    }
    const delta: Partial<CalendarOccurrenceOverride> = {};
    if ('title' in updates) delta.title = updates.title;
    if ('start' in updates) delta.start = updates.start;
    if ('end' in updates) delta.end = updates.end;
    if ('allDay' in updates) delta.allDay = updates.allDay;
    if ('color' in updates) delta.color = updates.color;
    if ('location' in updates) delta.location = updates.location;
    if ('description' in updates) delta.description = updates.description;
    if ('completed' in updates) delta.completed = updates.completed;
    if ('_rewarded' in updates) delta.rewarded = updates._rewarded;

    // If a single-occurrence edit moves the start to a different calendar day,
    // the override must follow the new date. Keep the old occurrence deleted so
    // the event cannot appear on BOTH days (a stale dateKey previously caused
    // a duplicated occurrence stuck on the original date).
    const newDateKey = delta.start ? dateKeyOf(new Date(delta.start)) : dateKey;
    if (newDateKey !== dateKey) {
      upsertOccurrenceOverride(id, dateKey, { deleted: true });
      upsertOccurrenceOverride(id, newDateKey, delta);
    } else {
      upsertOccurrenceOverride(id, dateKey, delta);
    }
    return true;
  }

  const merged: Partial<CalendarEventItem> = { ...existing, ...updates };
  const validation = validateCalendarEventInput(merged);
  if (!validation.ok) {
    console.warn('updateCalendarEvent rejected update:', validation.issues);
    showToast(validation.issues[0].message);
    return false;
  }

  setState('calendar', 'events', events =>
    events.map(ev => (ev.id === id ? { ...ev, ...updates } : ev))
  );
  saveState();
  return true;
}

export function deleteCalendarEvent(id: string, dateKey?: string) {
  const existing = state.calendar.events.find(ev => ev.id === id);
  if (dateKey && existing?.recurrence && existing.recurrence !== 'none') {
    upsertOccurrenceOverride(id, dateKey, { deleted: true });
    return;
  }
  setState('calendar', 'events', events => events.filter(ev => ev.id !== id));
  setState('calendar', 'occurrenceOverrides', overrides => overrides.filter(o => o.parentId !== id));
  saveState();
}

/**
 * Moves a single occurrence of a repeating event to a new start time. The old
 * occurrence is marked deleted and a fresh override carries the new absolute
 * start/end so only that one instance is affected.
 */
export function moveCalendarEvent(id: string, oldDateKey: string, start: string, end: string): boolean {
  const base = state.calendar.events.find(e => e.id === id);
  if (!base || !base.recurrence || base.recurrence === 'none') return false;
  const newDateKey = dateKeyOf(new Date(start));
  if (newDateKey === oldDateKey) {
    upsertOccurrenceOverride(id, oldDateKey, { start, end });
    return true;
  }
  upsertOccurrenceOverride(id, oldDateKey, { deleted: true });
  upsertOccurrenceOverride(id, newDateKey, { start, end });
  return true;
}

export function toggleTask(id: string, dateKey?: string) {
  const base = state.calendar.events.find(e => e.id === id);
  if (!base) return;
  const isRecurring = !!base.recurrence && base.recurrence !== 'none';

  if (isRecurring && dateKey) {
    const ovr = occurrenceOverrideFor(id, dateKey);
    const occ = getOccurrenceForDate(base, new Date(`${dateKey}T00:00:00`));
    const wasCompleted = ovr?.completed ?? occ.completed;
    const isNowCompleted = !wasCompleted;
    const firstCompletion = isNowCompleted && !(ovr?.rewarded ?? occ._rewarded ?? false);

    upsertOccurrenceOverride(id, dateKey, {
      completed: isNowCompleted,
      rewarded: ovr?.rewarded ?? occ._rewarded ?? firstCompletion
    });

    if (firstCompletion) {
      gainBondExp(12);
      addCoins(15);
      const persona = getPersonality(state.waifu.personality);
      const praises = persona.taskComplete;
      const praise = praises[Math.floor(Math.random() * praises.length)];
      triggerWaifuResponse(praise.text, praise.mood);
    }
    return;
  }

  const isNowCompleted = !base.completed;
  updateCalendarEvent(id, { completed: isNowCompleted });

  if (isNowCompleted) {
    if (!base._rewarded) {
      updateCalendarEvent(id, { _rewarded: true });
      gainBondExp(12);
      addCoins(15);
    }
    const persona = getPersonality(state.waifu.personality);
    const praises = persona.taskComplete;
    const praise = praises[Math.floor(Math.random() * praises.length)];
    triggerWaifuResponse(praise.text, praise.mood);
  }
}

// Chat user message processing
export async function sendUserMessage(rawText: string) {
  const text = rawText.trim();
  if (!text) return;

  const userMsg: ChatMessage = {
    id: 'msg-' + Date.now(),
    sender: 'user',
    text,
    timestamp: new Date().toISOString()
  };
  setState('chat', 'messages', msgs => [...msgs, userMsg]);
  if (tryClaimInteraction('chat')) {
    setInteractionCooldown('chat');
    gainBondExp(INTERACTION_REWARDS.chat.bondExp);
    addCoins(INTERACTION_REWARDS.chat.coins);
  }
  saveState();

  setState('chat', 'isTyping', true);

  try {
    const personaId = state.waifu.personality;
    const persona = getPersonality(personaId);

    // 1. Intent detection (schedule)
    if (hasIntent(parseIntent(text), 'schedule')) {
      const today = new Date();
      const todayEvents = state.calendar.events.filter(e => isSameDay(new Date(e.start), today));
      const evCount = todayEvents.filter(e => e.type === 'event').length;
      const tkCount = todayEvents.filter(e => e.type === 'task' && !e.completed).length;

      const review = persona.scheduleReview(evCount, tkCount);
      setState('chat', 'isTyping', false);
      triggerWaifuResponse(review.text, review.mood, [
        "I finished a task!",
        "Cheer me on!",
        "What should I do next?",
        "You look cute today"
      ]);
      return;
    }

    // 2. LLM if configured
    if (state.settings.llmProvider !== 'none' && state.settings.llmApiKey) {
      const llmResult = await callLLM(text, state as any);
      if (llmResult) {
        setState('chat', 'isTyping', false);
        const mood = inferMoodFromText(llmResult, personaId);
        triggerWaifuResponse(llmResult, mood, [
          "Review today's schedule",
          "I finished a task!",
          "You look cute today",
          "Tell me a joke"
        ]);
        return;
      }
    }

    // 3. Fallback offline dialogue engine
    await new Promise(r => setTimeout(r, 400));
    const reply = generateOfflineReply(text, personaId, persona);
    setState('chat', 'isTyping', false);
    triggerWaifuResponse(reply.text, reply.mood, reply.suggestions);
  } catch (err) {
    console.error('Dialogue error:', err);
    setState('chat', 'isTyping', false);
  }
}

function inferMoodFromText(text: string, personaId: string): string {
  if (matchesKeywordOrPhrase(text, ['baka', 'hmph', 'idiot', 'dummy'])) return 'pout';
  if (matchesKeywordOrPhrase(text, ['love', 'darling', 'mine', 'forever', 'marry me'])) {
    return personaId === 'yandere' ? 'yandere' : 'blush';
  }
  if (matchesKeywordOrPhrase(text, ['blush', 'shy', 'embarrass', 'embarrassed'])) return 'blush';
  if (matchesKeywordOrPhrase(text, ['yay', 'happy', 'awesome', 'congrat', 'congrats', 'celebrate'])) return 'happy';
  if (matchesKeywordOrPhrase(text, ['what', 'whoa', 'really', 'seriously', 'no way'])) return 'surprised';
  return 'neutral';
}

function generateOfflineReply(text: string, personaId: string, persona: PersonalityArchetype) {
  const match = parseIntent(text);
  const intent = match.intent;
  const strong = (target: DialogIntent) => hasIntent(match, target);

  // Compliments
  if (strong('compliment')) {
    const reaction = getRandomComplimentResponse(personaId);
    return { text: reaction.text, mood: reaction.mood, suggestions: ["You're blushing!", "It's true though", "Review schedule", "Headpat"] };
  }

  // Task done
  if (strong('taskComplete')) {
    const reaction = getRandomTaskCompleteResponse(personaId);
    return { text: reaction.text, mood: reaction.mood, suggestions: ["Give me praise!", "What's next on calendar?", "Headpat", `Thanks ${state.waifu.name || 'Akari'}!`] };
  }

  // Greetings (time-of-day aware)
  if (strong('greeting')) {
    const greeting = getRandomGreeting(personaId);
    return { text: greeting.text, mood: greeting.mood, suggestions: ["What's my schedule today?", "You look cute!", "Poke", "Just wanted to say hi"] };
  }

  // Joke
  if (strong('joke')) {
    return {
      text: getRandomJoke(),
      mood: 'happy',
      suggestions: ["Haha that was good!", "Tell another!", "Review schedule", "You're cute"]
    };
  }

  // Thanks
  if (strong('thanks')) {
    const reaction = getRandomThanksResponse(personaId);
    return { text: reaction.text, mood: reaction.mood, suggestions: ["Review today's schedule", "You're the best!", "Poke", "Tell me a joke"] };
  }

  // Help
  if (strong('help')) {
    const reaction = getRandomHelpResponse(personaId);
    return {
      text: reaction.text,
      mood: reaction.mood,
      suggestions: ["What's on my calendar today?", "Tell me a joke", "You look cute today", "Thanks!"]
    };
  }

  // Fallback: recognized but low-confidence / unmatched input.
  if (intent !== 'default' && match.confidence > 0) {
    // Recognized signal but too weak to commit — acknowledge it generically.
    const fallbacks: Record<string, string> = {
      tsundere: "Hmph! I heard you, dummy. I just need you to be a bit clearer, okay?",
      kuudere: "Input received. Confidence insufficient for a precise response. Please restate your request.",
      yandere: "Hehe, tell me again, darling? I want to hear every single word twice~",
      deredere: "Hehe, I caught a little of that! Could you say it again for me? ✨",
      dandere: "U-Um, I'm not sure I understood... would you mind saying that once more...?"
    };
    return {
      text: fallbacks[personaId] || fallbacks.tsundere,
      mood: persona.defaultMood,
      suggestions: ["Review today's schedule", "How are you doing?", "You look cute today", "Tell me a joke"]
    };
  }

  // Default conversational reply
  const defaultReaction = getRandomDefaultResponse(personaId);
  return {
    text: defaultReaction.text,
    mood: defaultReaction.mood,
    suggestions: [
      "Review today's schedule",
      "How are you doing?",
      "You look cute today",
      "Tell me a joke"
    ]
  };
}

export function clearChatHistory() {
  setState('chat', 'messages', []);
  saveState();
}

const [leaderboardModalOpen, setLeaderboardModalOpen] = createSignal(false);
export const isLeaderboardOpen = leaderboardModalOpen;
export const openLeaderboard = () => setLeaderboardModalOpen(true);
export const closeLeaderboard = () => setLeaderboardModalOpen(false);

// ---------------------------------------------------------------------------
// Weekly Time Budget (habits/tasks with min / target / danger hour budgets)
// ---------------------------------------------------------------------------

function syntheticActivityId(): string {
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Rolls logged minutes over whenever the configured reset boundary passes.
 * The full session history is preserved as an archive; only the weekly
 * counter is zeroed. Returns true when at least one activity was reset.
 */
export function ensureWeeklyReset(): boolean {
  const settings = state.timebudget.settings;
  const key = getCurrentBudgetWeek(new Date(), settings.resetDay, settings.resetHour);
  const activities = state.timebudget.activities;
  const needsReset = activities.some(a => a.lastResetWeek !== key);
  if (!needsReset) return false;
  setState('timebudget', 'activities', acts =>
    acts.map(a => (a.lastResetWeek === key ? a : { ...a, lastResetWeek: key, currentMinutes: 0 }))
  );
  saveState();
  return true;
}

function milestoneMessageFor(zone: ActivityZone, name: string, minutes: number): string | null {
  switch (zone) {
    case 'progress':
      return `🚩 ${name}: baseline met (${Math.round(minutes / 60)}h) — keep going!`;
    case 'target':
      return `🎯 ${name} hit its weekly target! Great job, senpai!`;
    case 'danger':
      return `⚠️ ${name} entered overdrive — consider taking a break soon.`;
    default:
      return null;
  }
}

function fireMilestoneNotification(message: string, zone: ActivityZone) {
  showToast(message);
  if (zone === 'danger') {
    triggerWaifuResponse(message, 'pout');
  } else if (zone === 'target') {
    triggerWaifuResponse(message, 'happy');
  }
  if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted' && state.timebudget.settings.notifications) {
    try {
      const n = new Notification('WaifuSpace · Time Budget', { body: message, icon: '/favicon.svg' });
      n.onclick = () => {
        if (typeof window !== 'undefined') window.focus();
      };
    } catch {
      // System notification denied/unavailable — toasts still cover it.
    }
  }
}

/** Logs `minutes` of progress to an activity and fires milestone notifications. */
export function logTime(activityId: string, minutes: number, note?: string): boolean {
  const amount = clampMinutes(minutes);
  if (amount <= 0) return false;
  ensureWeeklyReset();
  const activity = state.timebudget.activities.find(a => a.id === activityId);
  if (!activity) return false;

  const before = getActivityZone(activity);
  const next = clampMinutes(activity.currentMinutes) + amount;
  const entry: TimeLogEntry = {
    timestamp: new Date().toISOString(),
    minutes: amount,
    ...(note && note.trim() ? { note: note.trim().slice(0, 500) } : {})
  };

  setState('timebudget', 'activities', a => a.id === activityId, 'currentMinutes', next);
  setState('timebudget', 'activities', a => a.id === activityId, 'history', h => [entry, ...(h || [])]);
  saveState();

  const after = getActivityZone({ ...activity, currentMinutes: next });
  const msg = milestoneMessageFor(after, activity.name, next);
  if (msg && after !== before && state.timebudget.settings.notifications) {
    fireMilestoneNotification(msg, after);
  }
  return true;
}

/** Removes the most recent logged session and restores the counter. */
export function undoLastLog(activityId: string): boolean {
  ensureWeeklyReset();
  const activity = state.timebudget.activities.find(a => a.id === activityId);
  if (!activity) return false;
  const last = (activity.history || [])[0];
  if (!last) return false;

  setState('timebudget', 'activities', a => a.id === activityId, 'history', h => (h || []).slice(1));
  setState('timebudget', 'activities', a => a.id === activityId, 'currentMinutes', c =>
    clampMinutes(c) - Math.min(clampMinutes(c), last.minutes)
  );
  saveState();
  return true;
}

export interface TimeBudgetActivityInput {
  name: string;
  minHours: number;
  targetHours: number;
  dangerHours: number | null;
  priority?: number;
  icon?: string;
  color?: string;
}

const VALID_ICON_RE = /^[a-z0-9-]{1,40}$/;

function cleanIcon(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const icon = raw.trim().toLowerCase();
  return VALID_ICON_RE.test(icon) ? icon : undefined;
}

/** Creates a new weekly-budget activity with a clean weekly counter. */
export function addTimeBudgetActivity(input: TimeBudgetActivityInput): TimeBudgetActivity | null {
  const name = (input.name || '').trim().slice(0, 60);
  if (!name) return null;
  if (state.timebudget.activities.length >= MAX_ACTIVITIES) {
    showToast(`Activity limit reached (${MAX_ACTIVITIES}).`);
    return null;
  }
  const settings = state.timebudget.settings;
  const activity: TimeBudgetActivity = {
    id: syntheticActivityId(),
    name,
    minHours: clampHours(input.minHours, 0),
    targetHours: Math.max(clampHours(input.targetHours, 1), clampHours(input.minHours, 0), 1),
    dangerHours: input.dangerHours !== null && input.dangerHours !== undefined && input.dangerHours > 0
      ? Math.max(clampHours(input.dangerHours), Math.max(clampHours(input.targetHours, 1), clampHours(input.minHours, 0)))
      : null,
    currentMinutes: 0,
    history: [],
    lastResetWeek: getCurrentBudgetWeek(new Date(), settings.resetDay, settings.resetHour),
    priority: Number.isFinite(input.priority) ? Math.max(1, Math.min(10, Math.floor(input.priority ?? 5))) : 5,
    ...(typeof input.icon === 'string' && VALID_ICON_RE.test(input.icon) ? { icon: input.icon } : {}),
    ...(typeof input.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(input.color) ? { color: input.color } : {})
  };
  setState('timebudget', 'activities', acts => [...acts, activity]);
  saveState();
  return activity;
}

export function updateTimeBudgetActivity(id: string, patch: Partial<TimeBudgetActivityInput>): boolean {
  const existing = state.timebudget.activities.find(a => a.id === id);
  if (!existing) return false;

  const next: Partial<TimeBudgetActivity> = {};
  if (patch.name !== undefined) {
    const name = (patch.name || '').trim().slice(0, 60);
    if (!name) return false;
    next.name = name;
  }
  if (patch.minHours !== undefined) next.minHours = clampHours(patch.minHours, existing.minHours);
  if (patch.targetHours !== undefined) next.targetHours = Math.max(clampHours(patch.targetHours, existing.targetHours), next.minHours ?? existing.minHours, 1);
  if (patch.dangerHours !== undefined) {
    next.dangerHours =
      patch.dangerHours === null || patch.dangerHours === undefined || patch.dangerHours <= 0
        ? null
        : Math.max(clampHours(patch.dangerHours), next.targetHours ?? existing.targetHours);
  }
  if (patch.priority !== undefined) next.priority = Math.max(1, Math.min(10, Math.floor(patch.priority)));
  if (patch.icon !== undefined) next.icon = cleanIcon(patch.icon);
  if (patch.color !== undefined) {
    next.color = typeof patch.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(patch.color) ? patch.color : undefined;
  }

  setState('timebudget', 'activities', acts => acts.map(a => (a.id === id ? { ...a, ...next } : a)));
  saveState();
  return true;
}

/** Moves one activity so it sits right before another in the display order. */
export function reorderTimeBudgetActivities(sourceId: string, targetId: string): boolean {
  const acts = state.timebudget.activities;
  const from = acts.findIndex(a => a.id === sourceId);
  const to = acts.findIndex(a => a.id === targetId);
  if (from === -1 || to === -1 || from === to) return false;
  const next = [...acts];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  setState('timebudget', 'activities', next);
  saveState();
  return true;
}

export function deleteTimeBudgetActivity(id: string): void {
  setState('timebudget', 'activities', acts => acts.filter(a => a.id !== id));
  saveState();
}

export function setTimeBudgetSettings(patch: Partial<TimeBudgetSettings>): void {
  setState('timebudget', 'settings', prev => ({
    ...prev,
    ...patch
  }));
  saveState();
  ensureWeeklyReset();
}

/**
 * Mid-week catch-up reminder for high-priority habits that are significantly
 * behind schedule. Fires at most once per activity per week while the page is
 * open; the interval drives it from the planner.
 */
const remindedThisWeek = new Set<string>();
export function clearCatchUpReminderMemory(): void {
  remindedThisWeek.clear();
}

export function checkCatchUpReminders(): boolean {
  if (!state.timebudget.settings.catchUpReminders) return false;
  if (typeof window === 'undefined') return false;
  const settings = state.timebudget.settings;
  const progress = getWeekProgress(new Date(), settings.resetDay, settings.resetHour);
  if (progress < 0.5) return false; // only mid-week onwards
  const week = getCurrentBudgetWeek(new Date(), settings.resetDay, settings.resetHour);
  let fired = false;
  for (const a of state.timebudget.activities) {
    if (a.priority > 3) continue; // only high-priority habits
    const expectedByNow = a.minHours * 60 * progress;
    if (a.currentMinutes >= expectedByNow * 0.5) continue; // >= half of expected
    const key = `${week}:${a.id}`;
    if (remindedThisWeek.has(key)) continue;
    remindedThisWeek.add(key);
    showToast(`⏰ ${a.name} is behind schedule this week (${Math.round(a.currentMinutes / 60)}h / expected ${Math.ceil(expectedByNow / 60)}h). Catch up soon!`);
    fired = true;
  }
  return fired;
}

/** Requests the browser notification permission (used on first visit). */
export function requestNotificationPermission(): void {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (window.Notification.permission === 'default') {
    void window.Notification.requestPermission().catch(() => {});
  }
}

export { getActivityZone, getCurrentBudgetWeek, getWeekProgress };
export type { TimeBudgetActivity, TimeBudgetSettings, TimeLogEntry, ActivityZone };

