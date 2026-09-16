import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@solidjs/testing-library';
import { WaifuSweeperGame } from '../../src/components/WaifuSweeperGame';
import { setLanguage } from '../../src/lib/i18n';

// Drives createBoard's mine placement deterministically. Math.random returns a
// strictly increasing fraction, so mines land on a predictable run of indices.
function mockRng() {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => ((i++) % 100000) / 100000);
}

describe('WaifuSweeperGame', () => {
  beforeEach(() => {
    localStorage.clear();
    setLanguage('en');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders the board, header stats and difficulty chips', () => {
    render(() => <WaifuSweeperGame />);
    expect(screen.getByTestId('cell-0-0')).toBeInTheDocument();
    expect(screen.getByTestId('cell-11-11')).toBeInTheDocument();
    expect(screen.getByTestId('difficulty-easy')).toBeInTheDocument();
    expect(screen.getByTestId('difficulty-medium')).toBeInTheDocument();
    expect(screen.getByTestId('difficulty-hard')).toBeInTheDocument();
    // Medium preset = 12x12 with 25 mines.
    expect(screen.getByTestId('ws-mines')).toHaveTextContent('25');
    expect(screen.getByTestId('ws-timer')).toHaveTextContent('0');
  });

  it('flags a cell on right-click and counts it against mines', () => {
    render(() => <WaifuSweeperGame />);
    const cell = screen.getByTestId('cell-3-3');
    fireEvent.contextMenu(cell);
    expect(screen.getByTestId('ws-mines')).toHaveTextContent('24');
  });

it('first click never explodes and enters play mode', () => {
    mockRng();
    render(() => <WaifuSweeperGame />);
    fireEvent.click(screen.getByTestId('cell-0-0'));
    expect(screen.queryByTestId('ws-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('ws-face').textContent).toBe('🙂');
    // The guarded click exposes tiles but drops no mines from the counter.
    expect(screen.getByTestId('ws-mines')).toHaveTextContent('25');
    // Flood-fill must visibly reveal the clicked tile and its guarded neighbours.
    expect(screen.getByTestId('cell-0-0')).toHaveClass('ws-revealed');
    expect(screen.getByTestId('cell-0-1')).toHaveClass('ws-revealed');
    expect(screen.getByTestId('cell-1-0')).toHaveClass('ws-revealed');
    expect(screen.getByTestId('cell-1-1')).toHaveClass('ws-revealed');
  });

  it('detonates when a mine is clicked and lets the player restart', () => {
    mockRng();
    render(() => <WaifuSweeperGame />);
    // Safe first click at (0,0).
    fireEvent.click(screen.getByTestId('cell-0-0'));

    // With the monotonic RNG, mines occupy flat indices 2..11 and 14..28,
    // which includes flat index 24 → (row 2, col 0) on a 12x12 board.
    fireEvent.click(screen.getByTestId('cell-2-0'));

    expect(screen.getByTestId('ws-result')).toBeInTheDocument();
    expect(screen.getByTestId('ws-face').textContent).toBe('💀');
    expect(screen.queryByTestId('ws-reward')).not.toBeInTheDocument();

    // Restart clears the result and resets the mine counter.
    fireEvent.click(screen.getByTestId('ws-play-again'));
    expect(screen.queryByTestId('ws-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('ws-mines')).toHaveTextContent('25');
  });

  it('switching difficulty resets the board', () => {
    mockRng();
    render(() => <WaifuSweeperGame />);
    fireEvent.click(screen.getByTestId('cell-0-0'));
    fireEvent.click(screen.getByTestId('difficulty-hard'));
    expect(screen.getByTestId('ws-mines')).toHaveTextContent('45');
    expect(screen.getByTestId('ws-timer')).toHaveTextContent('0');
  });
});
