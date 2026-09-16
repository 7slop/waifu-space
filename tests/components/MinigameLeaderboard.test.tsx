import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@solidjs/testing-library';
import { MinigameLeaderboard } from '../../src/components/MinigameLeaderboard';
import { setLanguage } from '../../src/lib/i18n';
import { state, setState } from '../../src/lib/store';

function fakeEntries() {
  return [
    { rank: 1, username: 'SakuraEmpress', avatarUrl: '', value: 168, timeSec: 96, wins: 14 },
    { rank: 2, username: 'SenpaiHero', avatarUrl: '', value: 120, timeSec: 150, wins: 2 }
  ];
}

describe('MinigameLeaderboard', () => {
  beforeEach(() => {
    localStorage.clear();
    setLanguage('en');
    setState('user', null as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders fetched entries once the request resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true, game: 'sweeper', entries: fakeEntries() })
      }))
    );

    render(() => <MinigameLeaderboard game="sweeper" refreshKey={0} />);

    await waitFor(() => expect(screen.getByTestId('mlb-row-1')).toBeInTheDocument());
    expect(screen.getByTestId('mlb-value-1')).toHaveTextContent('168');
    expect(screen.getByTestId('mlb-value-2')).toHaveTextContent('120');
    expect(screen.getByTestId('mlb-sub-1')).toHaveTextContent('96s');
  });

  it('highlights the current user row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true, game: 'birds', entries: fakeEntries() })
      }))
    );

    setState('user', { id: 'u1', username: 'SenpaiHero', token: 'ws_test' } as never);

    render(() => <MinigameLeaderboard game="birds" refreshKey={0} />);

    await waitFor(() => expect(screen.getByTestId('mlb-row-2')).toHaveClass('self'));
    expect(screen.getByTestId('mlb-row-1')).not.toHaveClass('self');
  });

  it('shows a friendly empty state when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));

    render(() => <MinigameLeaderboard game="sweeper" refreshKey={0} />);

    await waitFor(() => expect(screen.getByTestId('mlb-empty')).toBeInTheDocument());
  });

  it('re-fetches when the refresh key bumps', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return { ok: true, json: async () => ({ success: true, game: 'sweeper', entries: fakeEntries() }) };
      })
    );

    const { unmount } = render(() => <MinigameLeaderboard game="sweeper" refreshKey={0} />);
    await waitFor(() => expect(calls.filter(u => u.includes('/api/minigames/leaderboard'))).toHaveLength(1));

    unmount();
    render(() => <MinigameLeaderboard game="sweeper" refreshKey={1} />);
    await waitFor(() => expect(calls.filter(u => u.includes('/api/minigames/leaderboard'))).toHaveLength(2));
  });
});