import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import { t } from '../lib/i18n';
import { addCoins, gainBondExp, showToast, state } from '../lib/store';
import { getBirdsCoinsReward, getBirdsExpReward } from '../lib/economy';
import {
  createFlappyState,
  flapBird,
  stepFlappy,
  birdRotation,
  FLAPPY_WORLD_HEIGHT,
  FLAPPY_WORLD_WIDTH,
  BIRD_SIZE,
  BIRD_RADIUS,
  BIRD_X,
  PIPE_GAP,
  GROUND_HEIGHT,
  type FlappyBirdsState
} from '../lib/flappy-logic';
import { minigameStats, recordBirdsGame, reloadMinigameStats } from '../lib/minigame-stats';
import { MinigameLeaderboard } from './MinigameLeaderboard';
import { PhBird, PhLightning, PhCoins, PhHeart, PhTrophy } from './icons';

const MAX_FRAME_DT = 50;

interface BirdResult {
  score: number;
  coins: number;
  exp: number;
}

export function WaifuBirdsGame() {
  const [gameState, setGameState] = createSignal<FlappyBirdsState>(createFlappyState());
  const [started, setStarted] = createSignal(false);
  const [result, setResult] = createSignal<BirdResult | null>(null);
  const [lbRefreshKey, setLbRefreshKey] = createSignal(0);

  let gameRef: HTMLDivElement | undefined;
  let rafId = 0;
  let lastTime = 0;

  onMount(() => {
    reloadMinigameStats();
    gameRef?.focus();
  });

  onCleanup(() => {
    if (rafId) cancelAnimationFrame(rafId);
  });

  const finishRun = (s: FlappyBirdsState) => {
    const coins = getBirdsCoinsReward(s.score);
    const exp = getBirdsExpReward(s.score);
    addCoins(coins);
    gainBondExp(exp);
    recordBirdsGame({ score: s.score });
    recordRun(s.score);
    setResult({ score: s.score, coins, exp });
    showToast(t('birds.finishToast', { score: s.score, coins, exp }));
  };

  const recordRun = (score: number) => {
    const bumped = () => setLbRefreshKey(k => k + 1);
    const token = state.user?.token;
    if (!token) {
      bumped();
      return;
    }
    fetch('/api/minigames/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ game: 'birds', score, won: false })
    })
      .catch(() => undefined)
      .finally(bumped);
  };

  const loop = (time: number) => {
    if (!lastTime) lastTime = time;
    const dt = Math.min(time - lastTime, MAX_FRAME_DT);
    lastTime = time;
    const next = stepFlappy(gameState(), dt);
    setGameState(next);
    if (next.dead) {
      finishRun(next);
    } else {
      rafId = requestAnimationFrame(loop);
    }
  };

  const startGame = () => {
    if (rafId) cancelAnimationFrame(rafId);
    lastTime = 0;
    setResult(null);
    setGameState(createFlappyState());
    setStarted(true);
    rafId = requestAnimationFrame(loop);
  };

  const handlePointerDown = (e: PointerEvent) => {
    e.preventDefault();
    if (!started()) {
      startGame();
      setGameState(s => flapBird(s));
    } else if (!gameState().dead) {
      setGameState(s => flapBird(s));
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      handlePointerDown(e as unknown as PointerEvent);
    }
  };

  const birdStyle = () => {
    const startedNow = started();
    const birdY = startedNow
      ? gameState().birdY
      : FLAPPY_WORLD_HEIGHT / 2 - BIRD_RADIUS;
    const angle = startedNow ? birdRotation(gameState().birdVy) : 0;
    return {
      top: `${birdY}px`,
      left: `${BIRD_X}px`,
      transform: `rotate(${angle}deg)`
    };
  };

  const stats = () => minigameStats();

  return (
    <div
      class="wfb-game"
      ref={gameRef}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onContextMenu={e => e.preventDefault()}
      data-testid="wfb-game"
    >
      <div
        class="wfb-stage"
        style={{ height: `${FLAPPY_WORLD_HEIGHT}px`, width: `${FLAPPY_WORLD_WIDTH}px` }}
      >
        <div class="wfb-scene">
          {/* Bird */}
          <div
            class={`wfb-bird ${started() && gameState().dead ? 'wfb-bird-dead' : ''}`}
            style={birdStyle()}
            data-testid="wfb-bird"
          >
            <PhBird />
          </div>

          {/* Pipes (torii gates) */}
          <For each={gameState().pipes}>
            {pipe => (
              <div class="wfb-pipe-col" style={{ left: `${pipe.x}px` }}>
                <div class="wfb-pipe wfb-pipe-top" style={{ height: `${pipe.gapY}px` }} />
                <div
                  class="wfb-pipe wfb-pipe-bottom"
                  style={{
                    top: `${pipe.gapY + PIPE_GAP}px`,
                    height: `${Math.max(0, FLAPPY_WORLD_HEIGHT - GROUND_HEIGHT - pipe.gapY - PIPE_GAP)}px`
                  }}
                />
              </div>
            )}
          </For>

          <div class="wfb-ground" />

          <Show when={started()}>
            <div class="wfb-score" data-testid="wfb-score">{gameState().score}</div>
          </Show>
        </div>

        {/* Idle overlay */}
        <Show when={!started()}>
          <div class="wfb-overlay" data-testid="wfb-overlay">
            <div class="wfb-overlay-title"><span class="wfb-flying-icon"><PhBird /></span> {t('birds.title')}</div>
            <div class="wfb-overlay-sub">{t('birds.tapToStart')}</div>
            <Show when={stats().birds.highScore > 0}>
              <div class="wfb-best-badge" data-testid="wfb-best-idle">
                <PhTrophy /> {t('birds.bestLabel')}: {stats().birds.highScore}
              </div>
            </Show>
          </div>
        </Show>

        {/* Result overlay */}
        <Show when={result() && started()}>
          <div class="wfb-result" data-testid="wfb-result">
            <div class="wfb-result-title">{t('birds.gameOverTitle')}</div>
            <div class="wfb-result-score">
              <span class="wfb-score-value" data-testid="wfb-final-score">{result()!.score}</span>
              <span class="wfb-score-hint">{t('birds.scoreLabel')}</span>
            </div>
            <div class="wfb-result-reward" data-testid="wfb-reward">
              <PhCoins /> +{result()!.coins} · +{result()!.exp} EXP
            </div>
            <div class="wfb-best-badge" data-testid="wfb-best-result">
              <PhTrophy /> {t('birds.bestLabel')}: {stats().birds.highScore}
            </div>
            <button
              type="button"
              class="btn-primary"
              data-testid="wfb-play-again"
              onClick={e => {
                e.stopPropagation();
                startGame();
              }}
            >
              <PhLightning /> {t('birds.playAgain')}
            </button>
          </div>
        </Show>
      </div>

      <div class="wfb-footnote"><PhHeart /> {t('birds.footnote')}</div>

      <MinigameLeaderboard game="birds" refreshKey={lbRefreshKey()} />
    </div>
  );
}