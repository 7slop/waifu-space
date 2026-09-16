import { json } from '@solidjs/router';
import { resolveDmContext, badRequestResponse, isUuidLike } from '../../../lib/server/dm-context';
import type { CallSession, CallType } from '../../../lib/dm/types';

const VALID_TYPES: CallType[] = ['voice', 'video', 'screen'];

export async function POST(event: { request: Request }) {
  const ctx = resolveDmContext(event.request);
  if (ctx instanceof Response) return ctx;

  let body: any;
  try {
    body = await event.request.json();
  } catch {
    return badRequestResponse('Invalid JSON body');
  }

  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : null;
  const calleeId = typeof body?.calleeId === 'string' ? body.calleeId : null;
  const callType: CallType = VALID_TYPES.includes(body?.callType) ? body.callType : 'voice';

  if (!isUuidLike(conversationId) || !isUuidLike(calleeId)) {
    return badRequestResponse('conversationId and calleeId are required');
  }

  const { data, error } = await ctx.supabase.rpc('create_call_session', {
    p_user_id: ctx.session.userId,
    p_conversation_id: conversationId,
    p_callee_id: calleeId,
    p_call_type: callType
  });

  if (error) {
    if (error.message.includes('cannot call yourself')) {
      return badRequestResponse('Cannot call yourself');
    }
    if (error.message.includes('both users must be part')) {
      return badRequestResponse('Both users must be part of the conversation');
    }
    return json({ success: false, error: error.message }, { status: 500 });
  }

  // create_call_session returns { joined: boolean, call: { ... } } from the RPC.
  const payload = (data as any) ?? {};
  const joined = !!payload.joined;
  const c = payload.call ?? payload;
  const call: CallSession = {
    id: c.id,
    conversationId: c.conversationId,
    callerId: c.callerId,
    calleeId: c.calleeId,
    callType: c.callType,
    status: c.status,
    startedAt: c.startedAt,
    answeredAt: c.answeredAt ?? null,
    endedAt: c.endedAt ?? null,
    createdAt: c.createdAt
  };

  if (!call.id) {
    return json({ success: false, error: 'create_call_session returned no call' }, { status: 500 });
  }

  return json({ success: true, joined, call }, { status: 201 });
}