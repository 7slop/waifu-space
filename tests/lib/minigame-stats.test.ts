import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  minigameStats,
  recordSweeperGame,
  recordBirdsGame,
  reloadMinigameStats,
  resetMinigameStats,
  emptyMinigameStats
} from '../../src/lib/minigame-stats';

describe('Minigame stats (minigame-stats.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMinigameStats();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts empty', () => {
    expect(minigameStats()).toEqual(emptyMinigameStats());
  });

  it('records a won sweeper game and updates best tiles/time', () => {
    recordSweeperGame({ tilesCleared: 40, timeSec: 60, won: true });
    expect(minigameStats().sweeper.gamesPlayed).toBe(1);
    expect(minigameStats().sweeper.wins).toBe(1);
    expect(minigameStats().sweeper.bestTiles).toBe(40);
    expect(minigameStats().sweeper.bestTimeSec).toBe(60);
  });

  it('keeps the fastest win as best time', () => {
    recordSweeperGame({ tilesCleared: 40, timeSec: 90, won: true });
    recordSweeperGame({ tilesCleared: 50, timeSec: 45, won: true });
    recordSweeperGame({ tilesCleared: 60, timeSec: 200, won: true });
    recordSweeperGame({ tilesCleared: 20, timeSec: 30, won: false });

    expect(minigameStats().sweeper.gamesPlayed).toBe(4);
    expect(minigameStats().sweeper.wins).toBe(3);
    expect(minigameStats().sweeper.bestTiles).toBe(60);
    expect(minigameStats().sweeper.bestTimeSec).toBe(45);
  });

  it('ignores time from lost games for best time', () => {
    recordSweeperGame({ tilesCleared: 5, timeSec: 3, won: false });
    expect(minigameStats().sweeper.bestTimeSec).toBe(0);
    recordSweeperGame({ tilesCleared: 40, timeSec: 60, won: true });
    expect(minigameStats().sweeper.bestTimeSec).toBe(60);
  });

  it('records bird rounds and tracks high score + totals', () => {
    recordBirdsGame({ score: 4 });
    recordBirdsGame({ score: 12 });
    expect(minigameStats().birds.plays).toBe(2);
    expect(minigameStats().birds.highScore).toBe(12);
    expect(minigameStats().birds.totalScore).toBe(16);
  });

  it('roundtrips through localStorage', () => {
    recordSweeperGame({ tilesCleared: 40, timeSec: 60, won: true });
    recordBirdsGame({ score: 9 });
    const persisted = JSON.parse(localStorage.getItem('waifu_space_minigame_stats_v1_guest') || '{}');
    expect(persisted.sweeper.bestTiles).toBe(40);
    expect(persisted.birds.highScore).toBe(9);

    recordBirdsGame({ score: 15 });
    reloadMinigameStats();
    expect(minigameStats().birds.highScore).toBe(15);
    expect(minigameStats().birds.plays).toBe(2);
  });

  it('sanitizes corrupt persisted payloads back to empty', () => {
    localStorage.setItem('waifu_space_minigame_stats_v1_guest', '{broken json');
    reloadMinigameStats();
    expect(minigameStats()).toEqual(emptyMinigameStats());

    localStorage.setItem('waifu_space_minigame_stats_v1_guest', JSON.stringify({ sweeper: { wins: 'oops', bestTiles: -5, gamesPlayed: 12 }, birds: 'nope' }));
    reloadMinigameStats();
    expect(minigameStats().sweeper.gamesPlayed).toBe(12);
    expect(minigameStats().sweeper.wins).toBe(0);
    expect(minigameStats().sweeper.bestTiles).toBe(0);
    expect(minigameStats().birds.highScore).toBe(0);
  });
});