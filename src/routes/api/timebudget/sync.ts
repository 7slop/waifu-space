import { json } from '@solidjs/router';
import { verifySessionToken, getSessionTokenFromRequest } from '../../../lib/server/auth';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/server/supabase';
import { checkRateLimit } from '../../../lib/server/rate-limit';
import { BUDGET_CRYPT_VERSION } from '../../../lib/cloudcrypt';

// ---------------------------------------------------------------------------
// Private cloud sync (time budget + calendar, encrypted).
//
// The client encrypts its private state (time budget AND calendar events) with
// AES-256-GCM before upload. This endpoint NEVER parses or decrypts the payload
// - it only stores/returns the opaque { salt, iv, ciphertext } blob. Even with
// full database access an admin can only see the ciphertext; the plaintext
// goals and calendar events are unrecoverable without the password.
// Any client-submitted validation beyond size/type checks would be both
// pointless and a liability: the blob is deliberately opaque.
// ---------------------------------------------------------------------------

const MAX_BLOB_BYTES = 2 * 1024 * 1024;

function isBase64Like(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_BLOB_BYTES) return false;
  return /^[A-Za-z0-9+/=\s]+$/.test(value);
}

function validIsoDate(value: unknown): boolean {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function parseBlob(raw: unknown): { v: number; salt: string; iv: string; ciphertext: string; updatedAt: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  if (b.v !== BUDGET_CRYPT_VERSION) return null;
  if (!isBase64Like(b.salt) || !isBase64Like(b.iv) || !isBase64Like(b.ciphertext)) return null;
  if (!validIsoDate(b.updatedAt)) return null;
  return { v: b.v as number, salt: b.salt, iv: b.iv, ciphertext: b.ciphertext, updatedAt: b.updatedAt as string };
}

// Store the encrypted blob (opaque to the server).
export async function POST(event: { request: Request }) {
  const token = getSessionTokenFromRequest(event.request);
  const session = verifySessionToken(token);

  if (!session) {
    return json({ success: false, error: 'Unauthorized session' }, { status: 401 });
  }

  const rateCheck = checkRateLimit(`budget_sync_${session.userId}`, 60, 60_000);
  if (!rateCheck.allowed) {
    return json(
      { success: false, error: 'Too many sync requests. Please wait a moment and try again.' },
      { status: 429 }
    );
  }

  try {
    const body = await event.request.json();
    const blob = parseBlob(body?.blob);
    if (!blob) {
      return json({ success: false, error: 'Invalid encrypted payload.' }, { status: 400 });
    }

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseServerClient()!;
      const { error } = await supabase.from('time_budget_sync').upsert(
        {
          user_id: session.userId,
          blob_version: blob.v,
          kdf_salt: blob.salt,
          iv: blob.iv,
          ciphertext: blob.ciphertext,
          updated_at: blob.updatedAt
        },
        { onConflict: 'user_id' }
      );
      if (error) {
        return json({ success: false, error: error.message || 'Sync failed.' }, { status: 500 });
      }
    }

    return json({ success: true, syncedAt: new Date().toISOString() });
  } catch (err: any) {
    return json({ success: false, error: err.message || 'Sync failed.' }, { status: 500 });
  }
}

// Return the stored encrypted blob (still opaque; the client decrypts it).
export async function GET(event: { request: Request }) {
  const token = getSessionTokenFromRequest(event.request);
  const session = verifySessionToken(token);

  if (!session) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return json({ success: true, blob: null });
  }

  try {
    const supabase = getSupabaseServerClient()!;
    const { data, error } = await supabase
      .from('time_budget_sync')
      .select('blob_version, kdf_salt, iv, ciphertext, updated_at')
      .eq('user_id', session.userId)
      .maybeSingle();

    if (error) {
      return json({ success: false, error: error.message || 'Failed to load sync data.' }, { status: 500 });
    }

    if (!data) {
      return json({ success: true, blob: null });
    }

    return json({
      success: true,
      blob: {
        v: data.blob_version,
        salt: data.kdf_salt,
        iv: data.iv,
        ciphertext: data.ciphertext,
        updatedAt: data.updated_at
      }
    });
  } catch (err: any) {
    return json({ success: false, error: err.message || 'Failed to load sync data.' }, { status: 500 });
  }
}