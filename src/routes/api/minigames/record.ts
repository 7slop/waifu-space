import { json } from '@solidjs/router';
import { verifySessionToken } from '../../../lib/server/auth';
import { checkRateLimit } from '../../../lib/server/rate-limit';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/server/supabase';

// Server-side caps so a client can never mint impossible bests on the
// leaderboard. WaifuSweeper hard preset is 16x16 with 45 mines → 211 safe
// tiles max. WaifuBirds is survive-based; anything past 200 pipes is absurd.
const SWEEPER_MAX_TILES = 16 * 16 - 45;
const SWEEPER_MAX_TIME_SEC = 3600;
const BIRDS_MAX_SCORE = 200;

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < min) return min;
  return Math.min(max, n);
}

/**
 * Records a finished casual-minigame run into the player's leaderboard stats.
 * Only the best value is kept (never lowered). Rewards stay client-side,
 * matching the casual-games design; this route only updates displayed stats.
 */
export async function POST(event: { request: Request }) {
  const authHeader = event.request.headers.get('authorization');
  const session = verifySessionToken(authHeader?.replace(/^Bearer\s+/i, ''));

  if (!session) {
    return json({ verified: false, error: 'Unauthorized: You must be signed in to record minigame scores.' }, { status: 401 });
  }

  const rateLimitKey = `mg_${session.userId}`;
  const limit = checkRateLimit(rateLimitKey, 30, 60_000);
  if (!limit.allowed) {
    return json({ verified: false, error: 'Too many score submissions. Slow down.' }, { status: 429 });
  }

  try {
    const body = (await event.request.json()) as {
      game?: string;
      tilesCleared?: number;
      timeSec?: number;
      score?: number;
      won?: boolean;
    };

    const game = body.game;
    if (game !== 'sweeper' && game !== 'birds') {
      return json({ verified: false, error: 'Unknown game. Expected "sweeper" or "birds".' }, { status: 400 });
    }

    let tiles = 0;
    let timeSec = 0;
    let score = 0;
    const won = body.won === true;

    if (game === 'sweeper') {
      tiles = clampInt(body.tilesCleared, 0, SWEEPER_MAX_TILES);
      timeSec = clampInt(body.timeSec, 0, SWEEPER_MAX_TIME_SEC);
    } else {
      score = clampInt(body.score, 0, BIRDS_MAX_SCORE);
    }

    if (!isSupabaseConfigured()) {
      return json({ verified: true, recorded: false });
    }

    const supabase = getSupabaseServerClient()!;
    const { data: progress } = await supabase
      .from('user_progress')
      .select('sweeper_best_tiles, sweeper_best_time_sec, sweeper_wins, birds_best_score, birds_wins, updated_at')
      .eq('user_id', session.userId)
      .single();

    const prevTiles = Number(progress?.sweeper_best_tiles || 0);
    const prevTime = Number(progress?.sweeper_best_time_sec || 0);
    const prevSweeperWins = Number(progress?.sweeper_wins || 0);
    const prevBirds = Number(progress?.birds_best_score || 0);
    const prevBirdsWins = Number(progress?.birds_wins || 0);

    const patch: Record<string, number | string> = {};
    if (game === 'sweeper') {
      if (tiles > prevTiles) {
        patch.sweeper_best_tiles = tiles;
        if (won) patch.sweeper_best_time_sec = timeSec;
      } else if (won && tiles === prevTiles && prevTiles > 0 && timeSec > 0 && (prevTime === 0 || timeSec < prevTime)) {
        patch.sweeper_best_time_sec = timeSec;
      }
      if (won) patch.sweeper_wins = prevSweeperWins + 1;
    } else {
      if (score > prevBirds) patch.birds_best_score = score;
      if (won) patch.birds_wins = prevBirdsWins + 1;
    }

    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      await supabase.from('user_progress').update(patch).eq('user_id', session.userId);
      await supabase.from('action_logs').insert({
        user_id: session.userId,
        action_type: 'minigame_score',
        details: { game, tiles_cleared: tiles, time_sec: timeSec, score, won }
      });
    }

    return json({ verified: true, recorded: true, patch });
  } catch (err: any) {
    return json({ verified: false, error: err.message || 'Error recording minigame score' }, { status: 500 });
  }
}