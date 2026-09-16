import { describe, it, expect } from 'vitest';
import {
  SWEEPER_PRESETS,
  createBoard,
  revealCell,
  toggleFlag,
  minesRemaining,
  TOTAL_SAFE,
  cellAt,
  indexOf
} from '../../src/lib/minesweeper-logic';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function countMines(board: { cells: Array<{ mine: boolean }> }): number {
  return board.cells.reduce((n, c) => n + (c.mine ? 1 : 0), 0);
}

describe('minesweeper-logic.ts board creation', () => {
  it('creates a correctly sized board with the requested mine count', () => {
    const board = createBoard(SWEEPER_PRESETS.medium, 0, 0, seeded(7));
    expect(board.rows).toBe(12);
    expect(board.cols).toBe(12);
    expect(countMines(board)).toBe(25);
    expect(TOTAL_SAFE(board)).toBe(144 - 25);
  });

  it('keeps the first-click tile and its neighbors mine-free', () => {
    const board = createBoard(SWEEPER_PRESETS.easy, 4, 5, seeded(99));
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const cell = cellAt(board, 4 + dr, 5 + dc);
        if (cell) expect(cell.mine).toBe(false);
      }
    }
  });

  it('clamps mines for boards too small to guard the click', () => {
    const tiny = createBoard({ rows: 2, cols: 2, mines: 3 }, 0, 0, seeded(1));
    // A 2x2 board guards all 4 cells → nothing can be placed.
    expect(countMines(tiny)).toBe(0);
  });
});

describe('minesweeper-logic.ts reveal rules', () => {
  it('flood-fills when a zero-adjacency tile is revealed', () => {
    const b0 = createBoard(SWEEPER_PRESETS.easy, 0, 0, seeded(42));
    const revealed0 = b0.cells.filter(c => c.revealed).length;
    const b1 = revealCell(b0, 0, 0);
    const revealed1 = b1.cells.filter(c => c.revealed).length;
    expect(b1.lost).toBe(false);
    expect(revealed1).toBeGreaterThan(revealed0);
    expect(revealed1).toBeGreaterThan(1);
    // No new boards → no-op reveal returns the same reference.
    expect(revealCell(b1, 0, 0)).toBe(b1);
  });

  it('reveals all non-mine tiles to win', () => {
    const b0 = createBoard(SWEEPER_PRESETS.easy, 0, 0, seeded(11));
    let board = b0;
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const cell = cellAt(board, r, c);
        if (!cell || cell.mine) continue;
        board = revealCell(board, r, c);
      }
    }
    expect(board.won).toBe(true);
    expect(board.lost).toBe(false);
    expect(board.safeRevealed).toBe(TOTAL_SAFE(board));
  });

  it('explodes a mine, records loss and exposes every mine', () => {
    const b0 = createBoard(SWEEPER_PRESETS.easy, 0, 0, seeded(5));
    const mine = b0.cells.find(c => c.mine)!;
    const b1 = revealCell(b0, mine.row, mine.col);
    expect(b1.lost).toBe(true);
    expect(b1.won).toBe(false);
    const hit = cellAt(b1, mine.row, mine.col);
    expect(hit?.exploded).toBe(true);
    expect(b1.cells.filter(c => c.mine && !c.revealed).length).toBe(0);
  });

  it('does not reveal flagged tiles', () => {
    const b0 = createBoard(SWEEPER_PRESETS.easy, 0, 0, seeded(8));
    const flagged = toggleFlag(b0, 3, 3);
    expect(cellAt(flagged, 3, 3)?.flagged).toBe(true);
    const revealed = revealCell(flagged, 3, 3);
    expect(cellAt(revealed, 3, 3)?.revealed).toBe(false);
    expect(revealed.safeRevealed).toBe(0);
  });
});

describe('minesweeper-logic.ts flags', () => {
  it('toggles flags and updates the mines-remaining counter', () => {
    const b0 = createBoard(SWEEPER_PRESETS.easy, 0, 0, seeded(3));
    expect(minesRemaining(b0)).toBe(SWEEPER_PRESETS.easy.mines);
    const f1 = toggleFlag(b0, 1, 1);
    const f2 = toggleFlag(f1, 1, 1);
    expect(cellAt(f1, 1, 1)?.flagged).toBe(true);
    expect(minesRemaining(f1)).toBe(SWEEPER_PRESETS.easy.mines - 1);
    expect(cellAt(f2, 1, 1)?.flagged).toBe(false);
    expect(minesRemaining(f2)).toBe(SWEEPER_PRESETS.easy.mines);
  });

  it('ignores flag toggles on revealed/lost boards', () => {
    const b0 = createBoard(SWEEPER_PRESETS.easy, 0, 0, seeded(2));
    const r = revealCell(b0, 0, 0);
    const same = toggleFlag(r, 0, 0);
    expect(cellAt(same, 0, 0)?.flagged).toBe(false);
    const mine = b0.cells.find(c => c.mine)!;
    const lost = revealCell(b0, mine.row, mine.col);
    expect(cellAt(toggleFlag(lost, mine.row, mine.col), mine.row, mine.col)?.flagged).toBe(false);
  });

  it('indexOf maps row/col coordinates to the flat cell array', () => {
    expect(indexOf(12, 1, 0)).toBe(12);
    expect(indexOf(12, 2, 5)).toBe(29);
  });
});