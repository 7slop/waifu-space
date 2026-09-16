import { createSignal, createMemo, onMount, onCleanup, Show, For } from 'solid-js';
import { t } from '../lib/i18n';
import { addCoins, gainBondExp, showToast, state } from '../lib/store';
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
import { MinigameLeaderboard } from './MinigameLeaderboard';
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
  const [lbRefreshKey, setLbRefreshKey] = createSignal(0);
  const [flagMode, setFlagMode] = createSignal(false);

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
    recordRun(b, won, sec);
  };

  const recordRun = (b: SweeperBoard, won: boolean, sec: number) => {
    const tiles = won ? TOTAL_SAFE(b) : b.safeRevealed;
    const bumped = () => setLbRefreshKey(k => k + 1);
    const token = state.user?.token;
    if (!token) {
      bumped();
      return;
    }
    fetch('/api/minigames/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ game: 'sweeper', tilesCleared: tiles, timeSec: sec, won })
    })
      .catch(() => undefined)
      .finally(bumped);
  };

  const onReveal = (row: number, col: number) => {
    if (result()) return;
    let b = board();
    if (!b) {
      // First reveal defines the mine layout (guarded around this tile).
      b = createBoard(SWEEPER_PRESETS[difficulty()], row, col);
      setBoard(b);
    }
    if (!started()) {
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

  // Each grid entry is a fresh object identity per board change, so <For>
  // re-renders every cell whenever the board signal updates (the per-item
  // callback would otherwise only track the item itself, never `board()`).
  const gridCells = createMemo(() => {
    const b = board();
    const cols = gridCols();
    return Array.from({ length: preset().rows * preset().cols }, (_, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      return { key: i, r, c, cell: b ? cellAt(b, r, c) : null };
    });
  });

  const renderCell = ({ r, c, cell }: { r: number; c: number; cell: SweeperCell | null }) => {
    if (!cell || !cell.revealed) {
      return (
        <button
          type="button"
          class={`ws-cell ${cell?.flagged ? 'ws-flagged' : ''}`}
          data-testid={`cell-${r}-${c}`}
          aria-label={cell?.flagged ? t('sweeper.flagLabel') : t('sweeper.hiddenLabel')}
          onClick={() => (flagMode() ? onFlag(r, c) : onReveal(r, c))}
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
        <button
          type="button"
          class={`ws-face ${flagMode() ? 'ws-face-active' : ''}`}
          data-testid="ws-flag-toggle"
          onClick={() => setFlagMode(m => !m)}
          aria-pressed={flagMode()}
          aria-label={t('sweeper.flagMode')}
          title={t('sweeper.flagMode')}
        >
          🚩
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
          <For each={gridCells()}>{renderCell}</For>
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

      <MinigameLeaderboard game="sweeper" refreshKey={lbRefreshKey()} />
    </div>
  );
}