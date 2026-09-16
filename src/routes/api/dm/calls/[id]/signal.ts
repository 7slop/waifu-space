import { json } from '@solidjs/router';
import { resolveDmContext, badRequestResponse } from '../../../../../lib/server/dm-context';
import type { CallSignalType, CallStoredSignal } from '../../../../../lib/dm/types';

const VALID_SIGNAL_TYPES: CallSignalType[] = ['offer', 'answer', 'ice'];

/** Shapes a `store_call_signal` RPC row into a typed signal. */
function toStoredSignal(raw: any): CallStoredSignal {
  return {
    id: String(raw?.id ?? ''),
    callId: String(raw?.callId ?? ''),
    conversationId: String(raw?.conversationId ?? ''),
    senderId: String(raw?.senderId ?? ''),
    signalType: (raw?.signalType ?? 'ice') as CallSignalType,
    payload: (raw?.payload && typeof raw.payload === 'object' ? raw.payload : {}) as CallStoredSignal['payload'],
    createdAt: String(raw?.createdAt ?? new Date().toISOString())
  };
}

export async function POST(event: { request: Request; params: Record<string, string> }) {
  const ctx = resolveDmContext(event.request);
  if (ctx instanceof Response) return ctx;

  const callId = event.params.id;
  if (!callId || callId === 'undefined' || callId === 'null') return badRequestResponse('call id is required');

  let body: any;
  try {
    body = await event.request.json();
  } catch {
    return badRequestResponse('Invalid JSON body');
  }

  const signalType = body?.signalType as CallSignalType | undefined;
  if (!signalType || !VALID_SIGNAL_TYPES.includes(signalType)) {
    return badRequestResponse('Invalid signal type');
  }
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};

  const { data, error } = await ctx.supabase.rpc('store_call_signal', {
    p_user_id: ctx.session.userId,
    p_call_id: callId,
    p_signal_type: signalType,
    p_payload: payload
  });

  if (error) {
    if (error.message.includes('not a participant')) {
      return json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (error.message.includes('invalid signal type')) {
      return badRequestResponse('Invalid signal type');
    }
    return json({ success: false, error: error.message }, { status: 500 });
  }

  return json({ success: true, signal: toStoredSignal(data as any) }, { status: 201 });
}

export async function GET(event: { request: Request; params: Record<string, string> }) {
  const ctx = resolveDmContext(event.request);
  if (ctx instanceof Response) return ctx;

  const callId = event.params.id;
  if (!callId || callId === 'undefined' || callId === 'null') return badRequestResponse('call id is required');

  const url = new URL(event.request.url);
  const after = url.searchParams.get('after') || null;

  const { data, error } = await ctx.supabase.rpc('get_call_signals', {
    p_user_id: ctx.session.userId,
    p_call_id: callId,
    p_after_created_at: after
  });

  if (error) {
    if (error.message.includes('not a participant')) {
      return json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    return json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = Array.isArray(data) ? data.map(toStoredSignal) : [];
  return json({ success: true, signals: rows });
}