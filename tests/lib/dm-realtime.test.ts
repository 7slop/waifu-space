import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DmRealtimeHandlers } from '../../src/lib/dm/realtime';

const fakeChannels = new Map<string, any>();

function createFakeChannel(name: string) {
  let subscribeCb: ((status: string) => void) | null = null;
  const broadcastHandlers: Array<{ event: string; cb: (p: any) => void }> = [];
  const presenceHandlers: Array<{ event: string; cb: (p: any) => void }> = [];
  const sentPayloads: Array<{ type: string; event: string; payload: any }> = [];

  const chan = {
    name,
    state: 'closed',
    on: vi.fn((type: string, filter: any, callback: any) => {
      if (type === 'broadcast') {
        broadcastHandlers.push({ event: filter.event, cb: callback });
      } else if (type === 'presence') {
        presenceHandlers.push({ event: filter.event, cb: callback });
      }
      return chan;
    }),
    subscribe: vi.fn((cb?: (status: string) => void) => {
      subscribeCb = cb ?? null;
      chan.state = 'joining';
      setTimeout(() => {
        chan.state = 'joined';
        subscribeCb?.('SUBSCRIBED');
      }, 5);
      return chan;
    }),
    send: vi.fn(async (msg: { type: string; event: string; payload: any }) => {
      sentPayloads.push(msg);
      return 'ok';
    }),
    presenceState: vi.fn(() => ({})),
    track: vi.fn(async () => 'ok'),
    untrack: vi.fn(async () => 'ok'),
    _triggerBroadcast: (event: string, payload: any) => {
      for (const h of broadcastHandlers) {
        if (h.event === event) h.cb({ payload });
      }
    },
    _sentPayloads: sentPayloads
  };

  fakeChannels.set(name, chan);
  return chan;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    channel: vi.fn((name: string) => {
      const existing = fakeChannels.get(name);
      if (existing) return existing;
      return createFakeChannel(name);
    }),
    removeChannel: vi.fn(async (ch: any) => {
      fakeChannels.delete(ch.name);
    })
  })
}));

import { DmRealtime } from '../../src/lib/dm/realtime';

describe('DmRealtime instant call delivery and subscription synchronization', () => {
  let handlers: DmRealtimeHandlers;
  let rt: DmRealtime;

  beforeEach(() => {
    fakeChannels.clear();
    handlers = {
      onMessage: vi.fn(),
      onTyping: vi.fn(),
      onReaction: vi.fn(),
      onCallSignal: vi.fn(),
      onIncomingCall: vi.fn(),
      onCallCancel: vi.fn(),
      onPresenceChange: vi.fn()
    };
    rt = new DmRealtime(
      { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key' },
      handlers
    );
  });

  it('subscribes to user personal incoming call channel on connect', async () => {
    await rt.connect({ id: 'user-callee', username: 'Callee' });
    const chan = fakeChannels.get('dm-calls-user-callee');
    expect(chan).toBeDefined();
    expect(chan.subscribe).toHaveBeenCalled();

    // Trigger incoming call broadcast on user channel
    const offerPayload = {
      kind: 'call-offer',
      call: { id: 'call-1', callerId: 'user-caller', calleeId: 'user-callee', conversationId: 'c1', callType: 'voice', status: 'ringing' },
      callerName: 'Caller'
    };
    chan._triggerBroadcast('call-offer', offerPayload);
    expect(handlers.onIncomingCall).toHaveBeenCalledWith(offerPayload);
  });

  it('awaits channel subscription before sending broadcast to prevent dropped messages', async () => {
    await rt.connect({ id: 'user-caller', username: 'Caller' });
    const offerPayload = {
      kind: 'call-offer' as const,
      call: {
        id: 'call-99',
        callerId: 'user-caller',
        calleeId: 'user-callee-2',
        conversationId: 'c-99',
        callType: 'voice' as const,
        status: 'ringing' as const,
        startedAt: '2025-01-01',
        answeredAt: null,
        endedAt: null,
        createdAt: '2025-01-01'
      },
      callerName: 'Caller'
    };

    await rt.sendIncomingCallOffer(offerPayload);

    const userChannel = fakeChannels.get('dm-calls-user-callee-2');
    const convChannel = fakeChannels.get('dm-c-99');

    expect(userChannel).toBeDefined();
    expect(convChannel).toBeDefined();

    // Channel should have been subscribed
    expect(userChannel.subscribe).toHaveBeenCalled();
    expect(convChannel.subscribe).toHaveBeenCalled();

    // Messages must have been sent
    expect(userChannel._sentPayloads).toHaveLength(1);
    expect(userChannel._sentPayloads[0].event).toBe('call-offer');
    expect(userChannel._sentPayloads[0].payload).toEqual(offerPayload);

    expect(convChannel._sentPayloads).toHaveLength(1);
    expect(convChannel._sentPayloads[0].event).toBe('call-offer');
  });

  it('delivers cancel offer across both callee channel and conversation channel', async () => {
    await rt.connect({ id: 'user-caller', username: 'Caller' });
    const cancelPayload = {
      kind: 'call-cancel' as const,
      call: {
        id: 'call-99',
        callerId: 'user-caller',
        calleeId: 'user-callee-2',
        conversationId: 'c-99',
        callType: 'voice' as const,
        status: 'canceled' as const,
        startedAt: '2025-01-01',
        answeredAt: null,
        endedAt: null,
        createdAt: '2025-01-01'
      },
      callerName: 'Caller'
    };

    await rt.sendCallCancel('user-callee-2', cancelPayload);

    const userChannel = fakeChannels.get('dm-calls-user-callee-2');
    const convChannel = fakeChannels.get('dm-c-99');

    expect(userChannel._sentPayloads.some((p: any) => p.event === 'call-cancel')).toBe(true);
    expect(convChannel._sentPayloads.some((p: any) => p.event === 'call-cancel')).toBe(true);
  });

  it('delivers call-signal on user personal channel directly to onCallSignal handler', async () => {
    await rt.connect({ id: 'user-caller', username: 'Caller' });
    const userChannel = fakeChannels.get('dm-calls-user-caller');
    expect(userChannel).toBeDefined();

    const signalPayload = {
      kind: 'call-signal' as const,
      callId: 'call-123',
      conversationId: 'c-1',
      type: 'answer' as const,
      sdp: { type: 'answer' as const, sdp: 'fake-sdp' }
    };

    userChannel._triggerBroadcast('call-signal', signalPayload);
    expect(handlers.onCallSignal).toHaveBeenCalledWith(signalPayload);
  });

  it('broadcasts call-signal to conversation and peer personal channel when targetUserId is specified', async () => {
    await rt.connect({ id: 'user-callee', username: 'Callee' });
    const signalPayload = {
      kind: 'call-signal' as const,
      callId: 'call-123',
      conversationId: 'c-1',
      type: 'answer' as const,
      targetUserId: 'user-caller',
      sdp: { type: 'answer' as const, sdp: 'fake-sdp' }
    };

    await rt.sendCallSignal(signalPayload);

    const convChannel = fakeChannels.get('dm-c-1');
    const userChannel = fakeChannels.get('dm-calls-user-caller');

    expect(convChannel._sentPayloads.some((p: any) => p.event === 'call-signal' && p.payload.type === 'answer')).toBe(true);
    expect(userChannel._sentPayloads.some((p: any) => p.event === 'call-signal' && p.payload.type === 'answer')).toBe(true);
  });

  it('sendMessage strips message content and media from the broadcast', async () => {
    await rt.connect({ id: 'user-sender', username: 'Sender' });
    await rt.sendMessage({
      kind: 'dm-message',
      conversationId: 'c-2',
      message: {
        id: 'm-1',
        conversationId: 'c-2',
        senderId: 'user-sender',
        content: 'secret content',
        messageType: 'gif',
        mediaUrl: 'https://media.tenor.com/secret.gif',
        createdAt: '2025-01-02T00:00:00.000Z',
        reactions: [{ emoji: '👍', count: 1, userIds: ['user-sender'] }]
      },
      senderName: 'Sender'
    });

    const convChannel = fakeChannels.get('dm-c-2');
    expect(convChannel).toBeDefined();
    const payload = convChannel._sentPayloads.find((p: any) => p.event === 'dm-message')?.payload;
    expect(payload).toBeDefined();
    expect(payload.message).toEqual({
      id: 'm-1',
      conversationId: 'c-2',
      senderId: 'user-sender',
      messageType: 'gif',
      createdAt: '2025-01-02T00:00:00.000Z'
    });
    expect(payload.message.content).toBeUndefined();
    expect(payload.message.mediaUrl).toBeUndefined();
    expect(payload.message.reactions).toBeUndefined();
  });

  it('sendReaction drops reaction user-id buckets from the broadcast', async () => {
    await rt.connect({ id: 'user-reactor', username: 'Reactor' });
    await rt.sendReaction({
      kind: 'dm-reaction',
      conversationId: 'c-2',
      messageId: 'm-1',
      emoji: '😂',
      action: 'add',
      userId: 'user-reactor',
      userName: 'Reactor',
      reactions: [{ emoji: '😂', count: 1, userIds: ['user-reactor', 'user-other'] }]
    } as any);

    const convChannel = fakeChannels.get('dm-c-2');
    const payload = convChannel._sentPayloads.find((p: any) => p.event === 'dm-reaction')?.payload;
    expect(payload).toBeDefined();
    expect(payload.messageId).toBe('m-1');
    expect(payload.userId).toBe('user-reactor');
    expect(payload.reactions).toBeUndefined();
  });
});

