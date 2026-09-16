import { json } from '@solidjs/router';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/server/supabase';

type GameId = 'sweeper' | 'birds';

const DEMO_ENTRIES: Record<GameId, Array<{ username: string; value: number; timeSec: number; wins: number }>> = {
  sweeper: [
    { username: 'SakuraEmpress', value: 168, timeSec: 96, wins: 14 },
    { username: 'ShadowBlade99', value: 152, timeSec: 118, wins: 9 },
    { username: 'AkariDevotee', value: 141, timeSec: 140, wins: 7 },
    { username: 'LunaMage', value: 122, timeSec: 187, wins: 5 },
    { username: 'OtakuSupreme', value: 108, timeSec: 233, wins: 3 }
  ],
  birds: [
    { username: 'SakuraEmpress', value: 28, timeSec: 0, wins: 0 },
    { username: 'ShadowBlade99', value: 22, timeSec: 0, wins: 0 },
    { username: 'AkariDevotee', value: 18, timeSec: 0, wins: 0 },
    { username: 'LunaMage', value: 14, timeSec: 0, wins: 0 },
    { username: 'OtakuSupreme', value: 9, timeSec: 0, wins: 0 }
  ]
};

/**
 * Top-20 board for a casual minigame. Sourced from the leaderboard view when
 * Supabase is configured (public read, RLS-covered), otherwise a demo board.
 */
export async function GET(event: { request: Request }) {
  const url = new URL(event.request.url);
  const game: GameId = url.searchParams.get('game') === 'birds' ? 'birds' : 'sweeper';

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient()!;
    const col = game === 'sweeper' ? 'sweeper_best_tiles' : 'birds_best_score';

    const { data } = await supabase
      .from('leaderboard_view')
      .select('username, avatar_url, sweeper_best_tiles, sweeper_best_time_sec, sweeper_wins, birds_best_score, birds_wins')
      .order(col, { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      const entries = (data as any[])
        .map((d, i) => ({
          rank: i + 1,
          username: d.username,
          avatarUrl: d.avatar_url || '',
          value: Number(game === 'sweeper' ? d.sweeper_best_tiles : d.birds_best_score || 0),
          timeSec: game === 'sweeper' ? Number(d.sweeper_best_time_sec || 0) : 0,
          wins: Number(game === 'sweeper' ? d.sweeper_wins || 0 : d.birds_wins || 0)
        }))
        .filter(e => e.value > 0);

      if (entries.length > 0) {
        return json({ success: true, game, entries });
      }
    }
  }

  const entries = DEMO_ENTRIES[game].map((e, i) => ({
    rank: i + 1,
    username: e.username,
    avatarUrl: '',
    value: e.value,
    timeSec: e.timeSec,
    wins: e.wins
  }));

  return json({ success: true, game, entries });
}