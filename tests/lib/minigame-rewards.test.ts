import { describe, it, expect } from 'vitest';
import {
  getSweeperCoinsReward,
  getSweeperExpReward,
  getBirdsCoinsReward,
  getBirdsExpReward
} from '../../src/lib/economy';

describe('WaifuSweeper rewards (economy.ts)', () => {
  it('scales reward with tiles cleared and difficulty', () => {
    expect(getSweeperCoinsReward('easy', 10)).toBe(15 + 10 * 1);
    expect(getSweeperCoinsReward('medium', 10)).toBe(30 + 10 * 1);
    expect(getSweeperCoinsReward('hard', 10)).toBe(50 + 10 * 2);

    expect(getSweeperExpReward('easy', 10)).toBe(18 + 10 * 1);
    expect(getSweeperExpReward('medium', 10)).toBe(30 + 10 * 2);
    expect(getSweeperExpReward('hard', 10)).toBe(45 + 10 * 3);
  });

  it('clamps negative / non-finite tile counts to zero', () => {
    expect(getSweeperCoinsReward('medium', -5)).toBe(30);
    expect(getSweeperCoinsReward('medium', Number.NaN)).toBe(30);
    expect(getSweeperCoinsReward('medium', 2.9)).toBe(30 + 2);
  });
});

describe('WaifuBirds rewards (economy.ts)', () => {
  it('awards a base plus per-point bonus capped at the ceiling', () => {
    expect(getBirdsCoinsReward(0)).toBe(5);
    expect(getBirdsCoinsReward(10)).toBe(5 + 20);
    expect(getBirdsCoinsReward(500)).toBe(500);

    expect(getBirdsExpReward(0)).toBe(8);
    expect(getBirdsExpReward(10)).toBe(8 + 30);
    expect(getBirdsExpReward(500)).toBe(600);
  });
});