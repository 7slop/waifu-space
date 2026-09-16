import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@solidjs/testing-library';
import { WaifuBirdsGame } from '../../src/components/WaifuBirdsGame';
import { setLanguage } from '../../src/lib/i18n';

describe('WaifuBirdsGame', () => {
  beforeEach(() => {
    localStorage.clear();
    setLanguage('en');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders the idle start screen with no live score', () => {
    render(() => <WaifuBirdsGame />);
    expect(screen.getByTestId('wfb-game')).toBeInTheDocument();
    expect(screen.getByTestId('wfb-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('wfb-bird')).toBeInTheDocument();
    expect(screen.queryByTestId('wfb-score')).not.toBeInTheDocument();
  });

  it('starts the game on pointer down and shows the score', () => {
    render(() => <WaifuBirdsGame />);
    const game = screen.getByTestId('wfb-game');
    fireEvent.pointerDown(game);
    expect(screen.queryByTestId('wfb-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('wfb-score')).toHaveTextContent('0');
    expect(screen.getByTestId('wfb-game')).toHaveAttribute('tabindex', '0');
  });

  it('starts the game from the keyboard with Space', () => {
    render(() => <WaifuBirdsGame />);
    const game = screen.getByTestId('wfb-game');
    fireEvent.keyDown(game, { code: 'Space' });
    expect(screen.queryByTestId('wfb-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('wfb-score')).toHaveTextContent('0');
  });

  it('ends the run after enough time and offers a restart', () => {
    vi.useFakeTimers();
    render(() => <WaifuBirdsGame />);
    fireEvent.pointerDown(screen.getByTestId('wfb-game'));

    // Let gravity pull the bird into the ground (world is 600px tall; the
    // bird takes well under 2s to fall). This drives the whole rAF loop.
    vi.advanceTimersByTime(2000);

    expect(screen.getByTestId('wfb-result')).toBeInTheDocument();
    expect(screen.getByTestId('wfb-final-score')).toBeInTheDocument();

    // Restart clears the result and starts a fresh run.
    fireEvent.click(screen.getByTestId('wfb-play-again'));
    expect(screen.queryByTestId('wfb-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('wfb-score')).toHaveTextContent('0');
  });

  it('records a played round in the persistent stats', () => {
    vi.useFakeTimers();
    render(() => <WaifuBirdsGame />);
    fireEvent.pointerDown(screen.getByTestId('wfb-game'));
    vi.advanceTimersByTime(2000);

    const saved = JSON.parse(localStorage.getItem('waifu_space_minigame_stats_v1_guest') || '{}');
    expect(saved.birds.plays).toBe(1);
  });
});