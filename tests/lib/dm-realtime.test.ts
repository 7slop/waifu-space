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

describe('DmRealtime metadata delivery and subscription synchronization', () => {
  let handlers: DmRealtimeHandlers;
  let rt: DmRealtime;

  beforeEach(() => {
    fakeChannels.clear();
    handlers = {
      onMessage: vi.fn(),
      onTyping: vi.fn(),
      onReaction: vi.fn(),
      onPresenceChange: vi.fn()
    };
    rt = new DmRealtime(
      { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key' },
      handlers
    );
  });

  it('only joins the shared presence channel — never a per-user call channel', async () => {
    await rt.connect({ id: 'user-callee', username: 'Callee' });
    // Call signaling is DB-backed (authenticated REST queue), so no
    // `dm-calls-*` personal channel may exist; nothing call-shaped rides
    // these anonymous realtime channels.
    expect(fakeChannels.get('dm-calls-user-callee')).toBeUndefined();
    expect(fakeChannels.get('waifu-space-dm-presence')).toBeDefined();
  });

  it('awaits conversation channel subscription before sending a broadcast', async () => {
    await rt.connect({ id: 'user-sender', username: 'Sender' });
    await rt.sendMessage({
      kind: 'dm-message',
      conversationId: 'c-1',
      message: {
        id: 'm-1',
        conversationId: 'c-1',
        senderId: 'user-sender',
        messageType: 'text',
        createdAt: '2025-01-02T00:00:00.000Z'
      },
      senderName: 'Sender'
    });

    const convChannel = fakeChannels.get('dm-c-1');
    expect(convChannel).toBeDefined();
    expect(convChannel.subscribe).toHaveBeenCalled();
    expect(convChannel._sentPayloads.some((p: any) => p.event === 'dm-message')).toBe(true);
  });

  it('does not create a call channel when sending call metadata over the conversation channel', async () => {
    await rt.connect({ id: 'user-sender', username: 'Sender' });
    await rt.subscribeConversation('c-99');
    const convChannel = fakeChannels.get('dm-c-99');
    expect(convChannel).toBeDefined();
    // No personal channel for call signaling.
    expect(fakeChannels.get('dm-calls-user-sender')).toBeUndefined();
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