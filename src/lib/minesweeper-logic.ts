import type { SweeperDifficulty } from './economy';

// Pure, framework-free WaifuSweeper board logic. The component renders a
// `SweeperBoard` and delegates every state transition to these helpers so the
// rules stay unit-testable (mirrors the defense-map / defense-balance split).

export interface SweeperCell {
  row: number;
  col: number;
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
  exploded: boolean;
}

export interface SweeperBoard {
  rows: number;
  cols: number;
  mineCount: number;
  cells: SweeperCell[];
  safeRevealed: number;
  lost: boolean;
  won: boolean;
}

export interface SweeperPreset {
  rows: number;
  cols: number;
  mines: number;
}

export const SWEEPER_PRESETS: Record<SweeperDifficulty, SweeperPreset> = {
  easy: { rows: 8, cols: 8, mines: 10 },
  medium: { rows: 12, cols: 12, mines: 25 },
  hard: { rows: 16, cols: 16, mines: 45 }
};

export function indexOf(cols: number, row: number, col: number): number {
  return row * cols + col;
}

export function cellAt(board: SweeperBoard, row: number, col: number): SweeperCell | null {
  if (row < 0 || row >= board.rows || col < 0 || col >= board.cols) return null;
  return board.cells[indexOf(board.cols, row, col)];
}

export function neighbors(board: SweeperBoard, row: number, col: number): SweeperCell[] {
  const out: SweeperCell[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const c = cellAt(board, row + dr, col + dc);
      if (c) out.push(c);
    }
  }
  return out;
}

function countAdjacentMines(cells: SweeperCell[], cols: number, rows: number, row: number, col: number): number {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      if (cells[indexOf(cols, r, c)].mine) count++;
    }
  }
  return count;
}

/**
 * Builds a fresh board. The first clicked tile (and its 8 neighbors) is kept
 * mine-free so the very first move can never explode.
 */
export function createBoard(
  preset: SweeperPreset,
  guardRow: number,
  guardCol: number,
  rand: () => number = Math.random
): SweeperBoard {
  const { rows, cols, mines } = preset;
  const guardIdx = new Set<number>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = guardRow + dr;
      const c = guardCol + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) guardIdx.add(indexOf(cols, r, c));
    }
  }

  const cells: SweeperCell[] = Array.from({ length: rows * cols }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return { row, col, mine: false, adjacent: 0, revealed: false, flagged: false, exploded: false };
  });

  const placeable = cells.length - guardIdx.size;
  let placed = 0;
  const target = Math.min(mines, placeable);
  while (placed < target) {
    const i = Math.floor(rand() * cells.length);
    if (cells[i].mine || guardIdx.has(i)) continue;
    cells[i].mine = true;
    placed++;
  }

  for (const cell of cells) {
    cell.adjacent = cell.mine ? 0 : countAdjacentMines(cells, cols, rows, cell.row, cell.col);
  }

  return { rows, cols, mineCount: target, cells, safeRevealed: 0, lost: false, won: false };
}

export const TOTAL_SAFE = (b: SweeperBoard): number => b.rows * b.cols - b.mineCount;

function clone(board: SweeperBoard): SweeperBoard {
  return { ...board, cells: board.cells.map(c => ({ ...c })) };
}

/** Reveals a tile (with flood-fill on zero regions). Returns a new board. */
export function revealCell(board: SweeperBoard, row: number, col: number): SweeperBoard {
  const cell = cellAt(board, row, col);
  if (!cell || cell.revealed || cell.flagged || board.lost || board.won) return board;

  const next = clone(board);

  if (next.cells[indexOf(next.cols, row, col)].mine) {
    const hit = next.cells[indexOf(next.cols, row, col)];
    hit.revealed = true;
    hit.exploded = true;
    next.lost = true;
    for (const c of next.cells) if (c.mine && !c.revealed) c.revealed = true;
    return next;
  }

  const queue: Array<{ r: number; c: number }> = [{ r: row, c: col }];
  let newlyRevealed = 0;
  while (queue.length) {
    const { r, c } = queue.pop()!;
    const cur = cellAt(next, r, c);
    if (!cur || cur.revealed || cur.flagged) continue;
    cur.revealed = true;
    if (!cur.mine) newlyRevealed++;
    if (cur.adjacent === 0) {
      for (const n of neighbors(next, r, c)) {
        if (!n.revealed && !n.flagged && !n.mine) queue.push({ r: n.row, c: n.col });
      }
    }
  }

  next.safeRevealed = next.safeRevealed + newlyRevealed;
  next.won = !next.lost && next.safeRevealed >= TOTAL_SAFE(next);
  return next;
}

/** Toggles a flag on a hidden tile. Returns a new board. */
export function toggleFlag(board: SweeperBoard, row: number, col: number): SweeperBoard {
  const cell = cellAt(board, row, col);
  if (!cell || cell.revealed || board.lost || board.won) return board;
  const next = clone(board);
  const target = next.cells[indexOf(next.cols, row, col)];
  target.flagged = !target.flagged;
  return next;
}

/** Flags remaining = mineCount - flagged count (clamped at 0). */
export function minesRemaining(board: SweeperBoard): number {
  const flagged = board.cells.reduce((n, c) => n + (c.flagged ? 1 : 0), 0);
  return Math.max(0, board.mineCount - flagged);
}

/** Reveals a solved board so the player can see where every mine was. */
export function revealBoard(board: SweeperBoard): SweeperBoard {
  const next = clone(board);
  for (const c of next.cells) if (c.mine) c.revealed = true;
  next.won = true;
  return next;
}