// Shared economy constants used by both the client store and the server routes.
// Kept here to avoid duplication and ensure lootbox rates / compensation / defense
// rewards are identical everywhere.

export type LootRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mystical';

// ─── Lootbox prices & drop rates ─────────────────────────────────────────────

export const LOOTBOX_COSTS: Record<'standard' | 'royal', number> = {
  standard: 120,
  royal: 300
};

export function getLootboxCost(boxType: 'standard' | 'royal'): number {
  return LOOTBOX_COSTS[boxType];
}

// Each tier's threshold is an exclusive upper bound (rand < threshold → rarity).
// Standard: Common 46%, Rare 33%, Epic 15%, Legendary 5%, Mystical 1%
// Royal:    Rare 45%, Epic 35%, Legendary 16%, Mystical 4%
const STANDARD_TIERS: Array<{ rarity: LootRarity; threshold: number }> = [
  { rarity: 'common', threshold: 46 },
  { rarity: 'rare', threshold: 79 },
  { rarity: 'epic', threshold: 94 },
  { rarity: 'legendary', threshold: 99 },
  { rarity: 'mystical', threshold: 100 }
];

const ROYAL_TIERS: Array<{ rarity: LootRarity; threshold: number }> = [
  { rarity: 'rare', threshold: 45 },
  { rarity: 'epic', threshold: 80 },
  { rarity: 'legendary', threshold: 96 },
  { rarity: 'mystical', threshold: 100 }
];

export function rollLootRarity(
  boxType: 'standard' | 'royal',
  rand = Math.random() * 100
): LootRarity {
  const v = Number.isFinite(rand) ? Math.max(0, Math.min(100, rand)) : 100;
  const tiers = boxType === 'royal' ? ROYAL_TIERS : STANDARD_TIERS;
  for (const tier of tiers) {
    if (v < tier.threshold) return tier.rarity;
  }
  return 'mystical';
}

// ─── Duplicate compensation ───────────────────────────────────────────────────

export const DUPLICATE_COMPENSATION: Record<LootRarity, { coins: number; exp: number }> = {
  common: { coins: 25, exp: 12 },
  rare: { coins: 50, exp: 25 },
  epic: { coins: 100, exp: 50 },
  legendary: { coins: 170, exp: 85 },
  mystical: { coins: 260, exp: 130 }
};

// ─── WaifuSweeper rewards ─────────────────────────────────────────────────────
// Casual reward curve (no server validation): base + per-tile, harder boards
// pay more. Capped so flooding a giant board can't mint coins.

export type SweeperDifficulty = 'easy' | 'medium' | 'hard';

export const SWEEPER_REWARDS: Record<
  SweeperDifficulty,
  { coinsBase: number; coinsPerTile: number; expBase: number; expPerTile: number }
> = {
  easy: { coinsBase: 15, coinsPerTile: 1, expBase: 18, expPerTile: 1 },
  medium: { coinsBase: 30, coinsPerTile: 1, expBase: 30, expPerTile: 2 },
  hard: { coinsBase: 50, coinsPerTile: 2, expBase: 45, expPerTile: 3 }
};

export function getSweeperCoinsReward(difficulty: SweeperDifficulty, tilesCleared: number): number {
  const r = SWEEPER_REWARDS[difficulty] ?? SWEEPER_REWARDS.medium;
  return r.coinsBase + Math.max(0, Math.floor(tilesCleared || 0)) * r.coinsPerTile;
}

export function getSweeperExpReward(difficulty: SweeperDifficulty, tilesCleared: number): number {
  const r = SWEEPER_REWARDS[difficulty] ?? SWEEPER_REWARDS.medium;
  return r.expBase + Math.max(0, Math.floor(tilesCleared || 0)) * r.expPerTile;
}

// ─── WaifuBirds rewards ───────────────────────────────────────────────────────

export function getBirdsCoinsReward(score: number): number {
  const s = Math.max(0, Math.floor(score || 0));
  return Math.min(5 + s * 2, 500);
}

export function getBirdsExpReward(score: number): number {
  const s = Math.max(0, Math.floor(score || 0));
  return Math.min(8 + s * 3, 600);
}

// ─── Waifu Defense rewards ────────────────────────────────────────────────────

export const DEFENSE_REWARDS = {
  coinsBase: 15,
  coinsPerWave: 8,
  expBase: 20,
  expPerWave: 10
} as const;

export function getDefenseCoinsReward(wave: number): number {
  return DEFENSE_REWARDS.coinsBase + wave * DEFENSE_REWARDS.coinsPerWave;
}

export function getDefenseExpReward(wave: number): number {
  return DEFENSE_REWARDS.expBase + wave * DEFENSE_REWARDS.expPerWave;
}

export function getBondExpNeeded(level: number): number {
  return Math.max(1, Math.floor(level || 1)) * 60;
}

/**
 * Adds bond XP and rolls any level-ups using the standard growth formula
 * (level * 60 per level). Mirrors the client's gainBondExp logic so the server
 * can keep bond_ref/level authoritative without rendering a waifu.
 */
export function computeBondProgression(
  currentExp: number,
  currentLevel: number,
  amount: number
): { bondExp: number; bondLevel: number } {
  let exp = Math.max(0, Math.floor(currentExp || 0)) + Math.max(0, Math.floor(amount));
  let level = Math.max(1, Math.floor(currentLevel || 1));
  let needed = getBondExpNeeded(level);
  while (exp >= needed) {
    exp -= needed;
    level += 1;
    needed = getBondExpNeeded(level);
  }
  return { bondExp: exp, bondLevel: level };
}

// ─── Global guards ────────────────────────────────────────────────────────────

export const MAX_COINS = 100_000_000;
