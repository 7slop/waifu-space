import { createSignal } from 'solid-js';
import { state } from './store';

// Best-score / play-counter persistence for the casual minigames
// (WaifuSweeper + WaifuBirds). Kept out of the main store on purpose:
// the main store's `rpg` slice is silver-bullet synced through the server
// anti-cheat pipeline, while these are client-side arcade stats that don't
// need server authority.

export interface SweeperStats {
  wins: number;
  gamesPlayed: number;
  bestTiles: number;
  bestTimeSec: number;
}

export interface BirdsStats {
  plays: number;
  highScore: number;
  totalScore: number;
}

export interface MinigameStats {
  sweeper: SweeperStats;
  birds: BirdsStats;
}

const STORAGE_KEY_PREFIX = 'waifu_space_minigame_stats_v1_acct_';
const GUEST_KEY = 'waifu_space_minigame_stats_v1_guest';

export function emptyMinigameStats(): MinigameStats {
  return {
    sweeper: { wins: 0, gamesPlayed: 0, bestTiles: 0, bestTimeSec: 0 },
    birds: { plays: 0, highScore: 0, totalScore: 0 }
  };
}

function statsKey(): string {
  const id = state?.user?.id;
  return id ? `${STORAGE_KEY_PREFIX}${id}` : GUEST_KEY;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toNonNeg(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function sanitize(raw: unknown): MinigameStats {
  if (!isRecord(raw)) return emptyMinigameStats();
  const sweeper = isRecord(raw.sweeper) ? raw.sweeper : {};
  const birds = isRecord(raw.birds) ? raw.birds : {};
  return {
    sweeper: {
      wins: toNonNeg(sweeper.wins),
      gamesPlayed: toNonNeg(sweeper.gamesPlayed),
      bestTiles: toNonNeg(sweeper.bestTiles),
      bestTimeSec: toNonNeg(sweeper.bestTimeSec)
    },
    birds: {
      plays: toNonNeg(birds.plays),
      highScore: toNonNeg(birds.highScore),
      totalScore: toNonNeg(birds.totalScore)
    }
  };
}

function loadFromKey(key: string): MinigameStats {
  if (typeof window === 'undefined') return emptyMinigameStats();
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? sanitize(JSON.parse(raw)) : emptyMinigameStats();
  } catch {
    return emptyMinigameStats();
  }
}

function persist(value: MinigameStats) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(statsKey(), JSON.stringify(value));
  } catch {
    // ignore quota / private-mode errors
  }
}

export const [minigameStats, setMinigameStats] = createSignal<MinigameStats>(emptyMinigameStats());

// Keeps the in-memory snapshot pointed at the *current* account scope.
// Called from the game components' onMount and from every record* helper so
// account switches or a freshly hydrated store never read stale stats.
function ensureLoaded() {
  setMinigameStats(loadFromKey(statsKey()));
}

export function reloadMinigameStats(): MinigameStats {
  const next = loadFromKey(statsKey());
  setMinigameStats(next);
  return next;
}

/**
 * Records a finished WaifuSweeper round. `tilesCleared` counts every safe tile
 * revealed (so a perfect run = all non-mine tiles), `timeSec` is the round
 * duration in seconds.
 */
export function recordSweeperGame(opts: { tilesCleared: number; timeSec: number; won: boolean }): SweeperStats {
  ensureLoaded();
  const cur = minigameStats();
  const tiles = Math.max(0, Math.floor(opts.tilesCleared || 0));
  const timeSec = Math.max(0, Math.floor(opts.timeSec || 0));
  const won = Boolean(opts.won);
  const next: MinigameStats = {
    sweeper: {
      wins: cur.sweeper.wins + (won ? 1 : 0),
      gamesPlayed: cur.sweeper.gamesPlayed + 1,
      bestTiles: Math.max(cur.sweeper.bestTiles, tiles),
      bestTimeSec:
        won && (cur.sweeper.bestTimeSec === 0 || timeSec < cur.sweeper.bestTimeSec)
          ? timeSec
          : cur.sweeper.bestTimeSec
    },
    birds: cur.birds
  };
  setMinigameStats(next);
  persist(next);
  return next.sweeper;
}

/** Records a finished WaifuBirds round (dead or quit). */
export function recordBirdsGame(opts: { score: number }): BirdsStats {
  ensureLoaded();
  const cur = minigameStats();
  const score = Math.max(0, Math.floor(opts.score || 0));
  const next: MinigameStats = {
    sweeper: cur.sweeper,
    birds: {
      plays: cur.birds.plays + 1,
      highScore: Math.max(cur.birds.highScore, score),
      totalScore: cur.birds.totalScore + score
    }
  };
  setMinigameStats(next);
  persist(next);
  return next.birds;
}

/** Clears the current account's minigame stats (used by "Reset" in settings). */
export function resetMinigameStats(): MinigameStats {
  const next = emptyMinigameStats();
  setMinigameStats(next);
  persist(next);
  return next;
}