import { describe, it, expect } from 'vitest';
import {
  createFlappyState,
  flapBird,
  stepFlappy,
  birdRotation,
  FLAPPY_WORLD_HEIGHT,
  FLAPPY_WORLD_WIDTH,
  BIRD_SIZE,
  BIRD_X,
  PIPE_GAP,
  GROUND_HEIGHT,
  FLAP_VELOCITY,
  GRAVITY
} from '../../src/lib/flappy-logic';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('flappy-logic.ts state creation', () => {
  it('places the bird near the vertical center, unspawned pipes and score 0', () => {
    const s = createFlappyState(seeded(1));
    expect(s.birdY).toBe(FLAPPY_WORLD_HEIGHT / 2 - BIRD_SIZE / 2);
    expect(s.pipes).toEqual([]);
    expect(s.score).toBe(0);
    expect(s.dead).toBe(false);
  });
});

describe('flappy-logic.ts flap', () => {
  it('sets the bird vertical velocity to the flap constant', () => {
    const s0 = createFlappyState();
    const s1 = flapBird(s0);
    expect(s1.birdVy).toBe(FLAP_VELOCITY);
  });

  it('ignores flaps when the bird is already dead', () => {
    const s0 = { ...createFlappyState(), dead: true };
    expect(flapBird(s0)).toBe(s0);
  });
});

describe('flappy-logic.ts stepping', () => {
  it('applies gravity and moves the bird downward when no flap occurs', () => {
    const s0 = createFlappyState();
    const s1 = stepFlappy(s0, 500);
    expect(s1.birdVy).toBeCloseTo(GRAVITY * 0.5, 0);
    expect(s1.birdY).toBeGreaterThan(s0.birdY);
    expect(s1.elapsed).toBe(500);
  });

  it('detects a floor collision and records death', () => {
    const s0 = { ...createFlappyState(), birdY: FLAPPY_WORLD_HEIGHT - GROUND_HEIGHT - BIRD_SIZE + 1, birdVy: 600 };
    const s1 = stepFlappy(s0, 200);
    expect(s1.dead).toBe(true);
  });

  it('detects a ceiling collision', () => {
    const s0 = { ...createFlappyState(), birdY: -10, birdVy: -1000 };
    const s1 = stepFlappy(s0, 50);
    expect(s1.dead).toBe(true);
  });

  it('spawns the first pipe after nextPipeIn elapses', () => {
    const rand = seeded(42);
    const s0 = { ...createFlappyState(rand), nextPipeIn: 100 };
    const s1 = stepFlappy(s0, 100, rand);
    expect(s1.pipes.length).toBe(1);
    expect(s1.pipes[0].x).toBeCloseTo(FLAPPY_WORLD_WIDTH + 20, 0);
    expect(s1.pipes[0].gapY).toBeGreaterThan(0);
  });

  it('awards a point when the bird fully passes a pipe', () => {
    const s0 = {
      ...createFlappyState(),
      birdY: FLAPPY_WORLD_HEIGHT / 2 - BIRD_SIZE / 2,
      pipes: [{ x: 20, gapY: 280, passed: false }], // already behind the bird, gap aligned around the bird
      score: 0
    };
    const s1 = stepFlappy(s0, 16);
    expect(s1.score).toBe(1);
    expect(s1.pipes[0].passed).toBe(true);
    expect(s1.dead).toBe(false);
  });

  it('detects a collision when the bird overlaps a pipe wall', () => {
    const gapY = FLAPPY_WORLD_HEIGHT / 2;
    const s0 = {
      ...createFlappyState(),
      birdY: 0, // bird occupies top of world, well inside the gapY ceiling
      pipes: [{ x: BIRD_X, gapY, passed: false }]
    };
    const s1 = stepFlappy(s0, 16);
    expect(s1.dead).toBe(true);
  });

  it('returns the same reference when dtMs is zero or negative', () => {
    const s0 = createFlappyState();
    expect(stepFlappy(s0, 0)).toBe(s0);
    expect(stepFlappy(s0, -100)).toBe(s0);
  });
});

describe('flappy-logic.ts helpers', () => {
  it('maps vertical velocity to a reasonable rotation angle', () => {
    expect(birdRotation(FLAP_VELOCITY)).toBeLessThan(0);
    expect(birdRotation(600)).toBeGreaterThan(0);
    expect(birdRotation(0)).toBe(0);
  });
});