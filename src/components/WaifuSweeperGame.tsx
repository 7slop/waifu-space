import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import { t } from '../lib/i18n';
import { addCoins, gainBondExp, showToast } from '../lib/store';
import {
  getSweeperCoinsReward,
  getSweeperExpReward,
  type SweeperDifficulty
} from '../lib/economy';
import {
  SWEEPER_PRESETS,
  createBoard,
  revealCell,
  toggleFlag,
  minesRemaining,
  TOTAL_SAFE,
  cellAt,
  type SweeperBoard,
  type SweeperCell
} from '../lib/minesweeper-logic';
import { minigameStats, recordSweeperGame, reloadMinigameStats } from '../lib/minigame-stats';
import { PhBomb, PhTimer, PhTrophy, PhLightning, PhSparkle } from './icons';

const NUMBER_COLORS = [
  '',
  '#4f86f7',
  '#3ecf8e',
  '#ff5c8a',
  '#c084fc',
  '#f97316',
  '#22d3ee',
  '#f43f5e',
  '#e2e8f0'
];

const DIFFICULTY_KEYS: Array<{ id: SweeperDifficulty; label: string }> = [
  { id: 'easy', label: 'easy' },
  { id: 'medium', label: 'medium' },
  { id: 'hard', label: 'hard' }
];

interface Result {
  won: boolean;
  coins: number;
  exp: number;
  tiles: number;
  sec: number;
}

export function WaifuSweeperGame() {
  const [difficulty, setDifficulty] = createSignal<SweeperDifficulty>('medium');
  const [board, setBoard] = createSignal<SweeperBoard | null>(null);
  const [started, setStarted] = createSignal(false);
  const [seconds, setSeconds] = createSignal(0);
  const [result, setResult] = createSignal<Result | null>(null);

  let tickerId: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    reloadMinigameStats();
  });

  onCleanup(() => {
    if (tickerId) clearInterval(tickerId);
  });

  const stopTimer = () => {
    if (tickerId) {
      clearInterval(tickerId);
      tickerId = null;
    }
  };

  const startTimer = () => {
    if (tickerId) return;
    tickerId = setInterval(() => setSeconds(s => s + 1), 1000);
  };

  const pickDifficulty = (d: SweeperDifficulty) => {
    stopTimer();
    setDifficulty(d);
    setBoard(null);
    setStarted(false);
    setSeconds(0);
    setResult(null);
  };

  const finish = (b: SweeperBoard, won: boolean) => {
    stopTimer();
    const sec = seconds();
    const tiles = won ? TOTAL_SAFE(b) : b.safeRevealed;
    if (won) {
      const coins = getSweeperCoinsReward(difficulty(), tiles);
      const exp = getSweeperExpReward(difficulty(), tiles);
      addCoins(coins);
      gainBondExp(exp);
      setResult({ won, coins, exp, tiles, sec });
      showToast(t('sweeper.winToast', { coins, exp }));
    } else {
      setResult({ won, coins: 0, exp: 0, tiles, sec });
    }
    recordSweeperGame({ tilesCleared: won ? TOTAL_SAFE(b) : b.safeRevealed, timeSec: sec, won });
  };

  const onReveal = (row: number, col: number) => {
    if (result()) return;
    let b = board();
    if (!started()) {
      b = createBoard(SWEEPER_PRESETS[difficulty()], row, col);
      setBoard(b);
      setStarted(true);
      startTimer();
    }
    if (!b) return;
    const next = revealCell(b, row, col);
    if (next === b) return;
    setBoard(next);
    if (next.lost || next.won) finish(next, next.won);
  };

  const onFlag = (row: number, col: number) => {
    if (result()) return;
    let b = board();
    if (!b) {
      // Flagging before the first reveal is allowed: bootstrap a guarded board
      // (keep the rest of the current reveal-state semantics untouched).
      b = createBoard(SWEEPER_PRESETS[difficulty()], row, col);
      setBoard(b);
    }
    const next = toggleFlag(b, row, col);
    if (next !== b) setBoard(next);
  };

  const onContextMenu = (e: MouseEvent) => e.preventDefault();

  const newGame = () => {
    stopTimer();
    setBoard(null);
    setStarted(false);
    setSeconds(0);
    setResult(null);
  };

  const preset = () => SWEEPER_PRESETS[difficulty()];
  const gridCols = () => preset().cols;
  const minesLeft = () => (board() ? minesRemaining(board()!) : preset().mines);

  const boardCell = (r: number, c: number): SweeperCell | null =>
    board() ? cellAt(board()!, r, c) : null;

  const renderCell = (r: number, c: number) => {
    const cell = boardCell(r, c);
    if (!cell || !cell.revealed) {
      return (
        <button
          type="button"
          class={`ws-cell ${cell?.flagged ? 'ws-flagged' : ''}`}
          data-testid={`cell-${r}-${c}`}
          aria-label={cell?.flagged ? t('sweeper.flagLabel') : t('sweeper.hiddenLabel')}
          onClick={() => onReveal(r, c)}
          onContextMenu={e => {
            e.preventDefault();
            onFlag(r, c);
          }}
        >
          {cell?.flagged ? '🚩' : ''}
        </button>
      );
    }
    if (cell.mine) {
      return (
        <div
          class={`ws-cell ws-revealed ws-mine ${cell.exploded ? 'ws-exploded' : ''}`}
          data-testid={`cell-${r}-${c}`}
          role="img"
          aria-label={cell.exploded ? t('sweeper.boomLabel') : t('sweeper.mineLabel')}
        >
          <PhBomb />
        </div>
      );
    }
    return (
      <div
        class={`ws-cell ws-revealed ${cell.adjacent === 0 ? 'ws-empty' : `ws-num-${cell.adjacent}`}`}
        data-testid={`cell-${r}-${c}`}
        style={cell.adjacent > 0 ? { color: NUMBER_COLORS[cell.adjacent] } : undefined}
      >
        {cell.adjacent > 0 ? cell.adjacent : ''}
      </div>
    );
  };

  const stats = () => minigameStats();

  return (
    <div class="ws-game" onContextMenu={onContextMenu}>
      {/* Header bar */}
      <div class="ws-header">
        <div class="ws-stat">
          <span class="ws-stat-label"><PhBomb /> {t('sweeper.minesLeft')}</span>
          <span class="ws-stat-value" data-testid="ws-mines">{minesLeft()}</span>
        </div>
        <button
          type="button"
          class="ws-face"
          data-testid="ws-face"
          onClick={newGame}
          aria-label={t('sweeper.newGame')}
        >
          {result()
            ? result()!.won
              ? '😎'
              : '💀'
            : started()
              ? '🙂'
              : '😌'}
        </button>
        <div class="ws-stat">
          <span class="ws-stat-label"><PhTimer /> {t('sweeper.time')}</span>
          <span class="ws-stat-value" data-testid="ws-timer">{seconds()}</span>
        </div>
      </div>

      {/* Difficulty select */}
      <div class="ws-difficulty-row" role="group" aria-label={t('sweeper.difficulty')}>
        <For each={DIFFICULTY_KEYS}>
          {d => (
            <button
              type="button"
              class={`gamemode-chip-btn ${difficulty() === d.id ? 'active' : ''}`}
              data-testid={`difficulty-${d.id}`}
              onClick={() => pickDifficulty(d.id)}
            >
              {t(`sweeper.${d.label}`)}
            </button>
          )}
        </For>
      </div>

      {/* Board */}
      <div class="ws-board-wrap">
        <div class="ws-grid" style={{ '--ws-cols': gridCols() }}>
          <For each={Array.from({ length: preset().rows * preset().cols }, (_, i) => i)}>
            {i => {
              const r = Math.floor(i / gridCols());
              const c = i % gridCols();
              return renderCell(r, c);
            }}
          </For>
        </div>
      </div>

      {/* Result banner */}
      <Show when={result()}>
        <div class={`ws-result ${result()!.won ? 'ws-result-win' : 'ws-result-lose'}`} data-testid="ws-result">
          <div class="ws-result-title">
            {result()!.won ? <PhSparkle /> : <PhBomb />}
            {result()!.won ? t('sweeper.winTitle') : t('sweeper.loseTitle')}
          </div>
          <div class="ws-result-desc">
            {result()!.won
              ? t('sweeper.winDesc', { tiles: result()!.tiles, sec: result()!.sec })
              : t('sweeper.loseDesc', { tiles: result()!.tiles })}
          </div>
          <Show when={result()!.won}>
            <div class="ws-result-reward" data-testid="ws-reward">
              <PhTrophy /> +{result()!.coins} 🪙 · +{result()!.exp} EXP
            </div>
          </Show>
          <button type="button" class="btn-primary" data-testid="ws-play-again" onClick={newGame}>
            <PhLightning /> {t('sweeper.playAgain')}
          </button>
        </div>
      </Show>

      {/* Personal bests */}
      <div class="ws-stats-row">
        <div class="ws-stat-card">
          <span class="ws-stat-card-label">{t('sweeper.wins')}</span>
          <span class="ws-stat-card-value" data-testid="ws-stats-wins">{stats().sweeper.wins}</span>
        </div>
        <div class="ws-stat-card">
          <span class="ws-stat-card-label">{t('sweeper.bestTiles')}</span>
          <span class="ws-stat-card-value" data-testid="ws-stats-tiles">{stats().sweeper.bestTiles}</span>
        </div>
        <div class="ws-stat-card">
          <span class="ws-stat-card-label">{t('sweeper.bestTime')}</span>
          <span class="ws-stat-card-value" data-testid="ws-stats-time">
            {stats().sweeper.bestTimeSec > 0 ? `${stats().sweeper.bestTimeSec}s` : '—'}
          </span>
        </div>
        <div class="ws-stat-card">
          <span class="ws-stat-card-label">{t('sweeper.plays')}</span>
          <span class="ws-stat-card-value" data-testid="ws-stats-plays">{stats().sweeper.gamesPlayed}</span>
        </div>
      </div>

      <p class="ws-hint">{t('sweeper.statHint')}</p>
    </div>
  );
}