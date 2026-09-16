import { createEffect, createSignal, onCleanup, Show, For } from 'solid-js';
import { t } from '../lib/i18n';
import { state } from '../lib/store';
import { PhTrophy, PhMedal, PhClock } from './icons';

export interface MinigameLeaderboardEntry {
  rank: number;
  username: string;
  avatarUrl: string;
  value: number;
  timeSec: number;
  wins: number;
}

interface Props {
  game: 'sweeper' | 'birds';
  /** Bump this to re-fetch (e.g. after the player finishes a run). */
  refreshKey: number;
}

export function MinigameLeaderboard(props: Props) {
  const [entries, setEntries] = createSignal<MinigameLeaderboardEntry[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [failed, setFailed] = createSignal(false);

  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/minigames/leaderboard?game=${props.game}`);
      if (res.ok) {
        const data = await res.json();
        if (!disposed) setEntries(Array.isArray(data?.entries) ? data.entries : []);
      } else if (!disposed) {
        setFailed(true);
      }
    } catch {
      if (!disposed) setFailed(true);
    } finally {
      if (!disposed) setLoading(false);
    }
  };

  createEffect(() => {
    void props.game;
    void props.refreshKey;
    load();
  });

  const selfName = () => state.user?.username || '';

  return (
    <div class="mlb-panel" data-testid="mlb-panel">
      <div class="mlb-header">
        <span><PhTrophy /></span>
        <span>{t(props.game === 'sweeper' ? 'sweeper.leaderboardTitle' : 'birds.leaderboardTitle')}</span>
      </div>

      <Show when={!loading() && !failed() && entries().length > 0}>
        <div class="mlb-list">
          <For each={entries()}>
            {e => (
              <div
                class={`mlb-row ${e.username === selfName() ? 'self' : ''}`}
                data-testid={`mlb-row-${e.rank}`}
              >
                <span class={`mlb-rank mlb-rank-${e.rank}`} data-testid={`mlb-rank-${e.rank}`}>
                  {e.rank <= 3 ? <PhMedal /> : `#${e.rank}`}
                </span>
                <span class="mlb-name" title={e.username}>
                  {e.username}
                </span>
                <span class="mlb-metric">
                  <strong data-testid={`mlb-value-${e.rank}`}>{e.value}</strong>
                  <Show when={props.game === 'sweeper' && e.timeSec > 0}>
                    <span class="mlb-sub" data-testid={`mlb-sub-${e.rank}`}>
                    <PhClock /> {e.timeSec}s
                  </span>
                  </Show>
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={loading()}>
        <div class="mlb-state" data-testid="mlb-loading">
          {t('rpg.gamemodes.loading')}
        </div>
      </Show>

      <Show when={!loading() && failed()}>
        <div class="mlb-state" data-testid="mlb-empty">
          {t('minigames.leaderboardEmpty')}
        </div>
      </Show>
    </div>
  );
}