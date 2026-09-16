// Pure, framework-free WaifuBirds physics & world logic.
// Mirrors the defence-map / minesweeper-logic split so rules stay unit-testable.

export const FLAPPY_WORLD_WIDTH = 400;
export const FLAPPY_WORLD_HEIGHT = 600;
export const GROUND_HEIGHT = 24;

export const BIRD_SIZE = 24;
export const BIRD_RADIUS = BIRD_SIZE / 2;
export const BIRD_X = 80;

export const GRAVITY = 1400;
export const FLAP_VELOCITY = -480;

export const PIPE_SPEED = 180;
export const PIPE_WIDTH = 52;
export const PIPE_GAP = 150;
export const PIPE_SPAWN_INTERVAL = 1400;
const PIPE_ENTRY_MARGIN = 30;

export interface FlappyBirdsPipe {
  x: number;
  gapY: number;
  passed: boolean;
}

export interface FlappyBirdsState {
  birdY: number;
  birdVy: number;
  pipes: FlappyBirdsPipe[];
  score: number;
  dead: boolean;
  elapsed: number;
  nextPipeIn: number;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function randomGapY(rand: () => number = Math.random): number {
  const minGapY = BIRD_RADIUS + PIPE_ENTRY_MARGIN;
  const maxGapY = FLAPPY_WORLD_HEIGHT - GROUND_HEIGHT - PIPE_GAP - BIRD_RADIUS - PIPE_ENTRY_MARGIN;
  return clamp(rand() * (maxGapY - minGapY) + minGapY, minGapY, maxGapY);
}

export function createFlappyState(rand: () => number = Math.random): FlappyBirdsState {
  return {
    birdY: FLAPPY_WORLD_HEIGHT / 2 - BIRD_RADIUS,
    birdVy: 0,
    pipes: [],
    score: 0,
    dead: false,
    elapsed: 0,
    nextPipeIn: rand() * PIPE_SPAWN_INTERVAL * 0.6 + PIPE_SPAWN_INTERVAL * 0.4
  };
}

export function flapBird(state: FlappyBirdsState): FlappyBirdsState {
  if (state.dead) return state;
  return { ...state, birdVy: FLAP_VELOCITY };
}

/**
 * Advances the world by `dtMs` milliseconds.  `rand` is injected so tests can
 * produce deterministic pipe layouts (same pattern as minesweeper-logic).
 */
export function stepFlappy(
  state: FlappyBirdsState,
  dtMs: number,
  rand: () => number = Math.random
): FlappyBirdsState {
  if (state.dead || dtMs <= 0) return state;

  const dt = dtMs / 1000;
  const birdVy = state.birdVy + GRAVITY * dt;
  const birdY = state.birdY + birdVy * dt;

  // Move pipes left, award points for passing
  let score = state.score;
  let pipes = state.pipes.map(p => {
    const x = p.x - PIPE_SPEED * dt;
    const passed = p.passed || (!p.passed && x + PIPE_WIDTH < BIRD_X);
    if (!p.passed && passed) score++;
    return { ...p, x, passed };
  });

  // Spawn pipes
  let nextPipeIn = state.nextPipeIn - dtMs;
  while (nextPipeIn <= 0) {
    pipes.push({ x: FLAPPY_WORLD_WIDTH + 20, gapY: randomGapY(rand), passed: false });
    nextPipeIn += PIPE_SPAWN_INTERVAL;
  }

  // Prune off-screen pipes
  pipes = pipes.filter(p => p.x > -PIPE_WIDTH - 20);

  // Detect collisions
  let dead = false;

  // Ceiling / ground
  if (birdY < -BIRD_RADIUS || birdY + BIRD_SIZE > FLAPPY_WORLD_HEIGHT - GROUND_HEIGHT) {
    dead = true;
  }

  if (!dead) {
    const birdLeft = BIRD_X - BIRD_RADIUS;
    const birdRight = BIRD_X + BIRD_RADIUS;
    const birdTop = birdY;
    const birdBottom = birdY + BIRD_SIZE;

    for (const p of pipes) {
      const pLeft = p.x;
      const pRight = p.x + PIPE_WIDTH;
      if (birdRight > pLeft && birdLeft < pRight) {
        if (birdTop < p.gapY || birdBottom > p.gapY + PIPE_GAP) {
          dead = true;
          break;
        }
      }
    }
  }

  return {
    birdY,
    birdVy,
    pipes,
    score,
    dead,
    elapsed: state.elapsed + dtMs,
    nextPipeIn
  };
}

/** Angle in degrees for the bird sprite based on vertical velocity. */
export function birdRotation(vy: number): number {
  return clamp(vy * 0.07, -30, 70);
}

/** Pixel offset for the gentle idle bob before the game starts. */
export function birdIdleY(elapsedMs: number): number {
  return Math.sin(elapsedMs * 0.004) * 6;
}