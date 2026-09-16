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
});
