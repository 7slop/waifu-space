import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DmRealtimeHandlers } from '../../src/lib/dm/realtime';

const rt = vi.hoisted(() => ({
  instances: [] as any[],
  handlers: null as unknown as DmRealtimeHandlers
}));

const callRegistry = vi.hoisted(() => ({ instances: [] as any[] }));

vi.mock('../../src/lib/dm/realtime', () => ({
  DmRealtime: class {
    instance: any;
    constructor(config: unknown, handlers: DmRealtimeHandlers) {
      rt.handlers = handlers;
      this.instance = this;
      rt.instances.push(this);
    }
    connect = vi.fn(async () => undefined);
    trackPresence = vi.fn(async () => undefined);
    subscribeConversation = vi.fn(async () => undefined);
    sendMessage = vi.fn(async () => undefined);
    sendTyping = vi.fn(async () => undefined);
    sendReaction = vi.fn(async () => undefined);
    disconnect = vi.fn(async () => undefined);
    getPresence = () => ({});
  }
}));

vi.mock('../../src/lib/dm/call', () => ({
  CallManager: class {
    deps: any = {};
    currentState = 'ringing';
    localMedia: MediaStream | null = null;
    remoteMedia: MediaStream | null = null;
    private muted = false;
    private videoOff = false;
    private screenSharing = false;
    constructor(deps: any) {
      this.deps = deps ?? {};
      callRegistry.instances.push(this);
    }
    async startLocal(): Promise<boolean> {
      return true;
    }
    async createOffer(): Promise<{ type: string; sdp: string }> {
      return { type: 'offer', sdp: 'offer-sdp' };
    }
    async acceptOffer(): Promise<{ type: string; sdp: string }> {
      this.currentState = 'connected';
      this.deps.onStateChange?.();
      return { type: 'answer', sdp: 'answer-sdp' };
    }
    async adoptAnswer(): Promise<void> {
      this.currentState = 'connected';
      this.deps.onStateChange?.();
    }
    markConnected(): void {
      this.currentState = 'connected';
      this.deps.onStateChange?.();
    }
    adoptIce = vi.fn(async (_cand: any) => {});
    toggleMute(): boolean {
      this.muted = true;
      this.deps.onStateChange?.();
      return true;
    }
    toggleVideo(): boolean {
      this.videoOff = !this.videoOff;
      this.deps.onStateChange?.();
      return true;
    }
    isMuted(): boolean {
      return this.muted;
    }
    isVideoOff(): boolean {
      return this.videoOff;
    }
    async ensureCamera(): Promise<boolean> {
      return true;
    }
    hasVideoTracks(): boolean {
      return true;
    }
    async enableScreenShare(): Promise<boolean> {
      this.screenSharing = true;
      return true;
    }
    async disableScreenShare(): Promise<boolean> {
      this.screenSharing = false;
      return true;
    }
    isScreenSharing(): boolean {
      return this.screenSharing;
    }
    isConnected(): boolean {
      return this.currentState === 'connected';
    }
    hangUp(): void {
      this.currentState = 'ended';
      this.deps.onStateChange?.();
    }
    setPaused = vi.fn((_paused: boolean) => {});
  }
}));

import {
  configureDmRuntime,
  dmState,
  setDmState,
  initDm,
  selectConversation,
  sendText,
  sendGif,
  setOwnPresence,
  dmSearch,
  resetDmStore,
  startCall,
  flushConversationSyncs,
  acceptIncomingCall,
  declineIncomingCall,
  hangUpCall,
  toggleMute,
  toggleVideo,
  toggleReaction,
  refreshPendingCall,
  pollActiveCallStatus,
  pollCallSignals,
  handlePeerLeft
} from '../../src/lib/dm/store';

const AUTH = { token: 't1', id: 'u-me', username: 'alice', avatarUrl: 'https://x/a.png' };

const JSON_RESP = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch(routes: Record<string, (url: string, init: RequestInit) => Response>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    for (const [pattern, handler] of Object.entries(routes)) {
      if (url.includes(pattern)) return handler(url, init ?? {});
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function makeConv(id: string, other: string) {
  return {
    id,
    type: 'dm' as const,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    lastReadAt: null,
    unreadCount: 0,
    lastMessage: null,
    otherUser: { id: other, username: other === 'u-bob' ? 'bob' : 'carol' }
  };
}

beforeEach(() => {
  rt.instances.length = 0;
  rt.handlers = null as unknown as DmRealtimeHandlers;
  callRegistry.instances.length = 0;
  resetDmStore();
  configureDmRuntime({ getAuth: () => ({ ...AUTH }), notify: () => undefined });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dm store boot + conversations', () => {
  it('initDm loads config, conversations, presence and unread, then tracks presence', async () => {
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'https://p.supabase.co', supabaseAnonKey: 'anon', isConfigured: true }),
      '/api/dm/conversations': () =>
        JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob'), makeConv('c2', 'u-carol')] }),
      '/api/dm/presence': (url, _init) =>
        url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'online', lastSeenAt: '2025-01-01T00:00:00.000Z' } }),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 2 })
    });

    const ok = await initDm();
    expect(ok).toBe(true);
    expect(dmState.ready).toBe(true);
    expect(dmState.conversations).toHaveLength(2);
    expect(dmState.totalUnread).toBe(2);
    expect(dmState.myPresence?.status).toBe('online');
    expect(rt.instances[0].connect).toHaveBeenCalledWith({ id: 'u-me', username: 'alice', avatar: 'https://x/a.png' });
    expect(rt.instances[0].trackPresence).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-me', status: 'online' }));
    // Every conversation channel is subscribed at boot so messages + call
    // signals arrive live regardless of which page/conversation is open.
    expect(rt.instances[0].subscribeConversation).toHaveBeenCalledWith('c1');
    expect(rt.instances[0].subscribeConversation).toHaveBeenCalledWith('c2');
  });

  it('selectConversation loads messages and subscribes to the realtime channel', async () => {
const msgs = [
      { id: 'm1', conversationId: 'c1', senderId: 'u-bob', content: 'hey', messageType: 'text', createdAt: '2025-01-01T00:00:00.000Z' }
    ];
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': () => JSON_RESP({ success: true, messages: msgs }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 })
    });
    await initDm();
    await selectConversation('c1');
    expect(dmState.activeConversationId).toBe('c1');
    expect(dmState.messages.c1).toHaveLength(1);
    expect(rt.instances[0].subscribeConversation).toHaveBeenCalledWith('c1');
    expect(dmState.hasOlder.c1).toBe(false);
  });

  it('sendText posts and optimistically-moves the conversation to the front', async () => {
const sent: any = [];
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': (url, init) => {
        if (init.method === 'POST') {
          const body = JSON.parse(String(init.body));
          sent.push({ url, body });
          return JSON_RESP({ success: true, message: { id: 'm-new', conversationId: 'c1', senderId: 'u-me', content: body.content, messageType: body.messageType, mediaUrl: body.mediaUrl, createdAt: '2025-01-03T00:00:00.000Z' } }, 201);
        }
        return JSON_RESP({ success: true, messages: [] });
      },
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob'), makeConv('c2', 'u-carol')] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 })
    });
    await initDm();
    await selectConversation('c1');
    const msg = await sendText('hello bob');
    expect(msg?.content).toBe('hello bob');
    expect(dmState.messages.c1).toHaveLength(1);
    expect(dmState.conversations[0].id).toBe('c1');
    expect(dmState.conversations[0].unreadCount).toBe(0);
    expect(rt.instances[0].sendMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'c1' }));
    expect(sent[0].body).toMatchObject({ content: 'hello bob', messageType: 'text' });
  });

it('sendGif posts a gif message', async () => {
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': (url, init) =>
        init.method === 'POST'
          ? JSON_RESP({ success: true, message: { id: 'm-g', conversationId: 'c1', senderId: 'u-me', content: '', messageType: 'gif', mediaUrl: 'https://media.tenor.com/a.gif', createdAt: '2025-01-03T00:00:00.000Z' } }, 201)
          : JSON_RESP({ success: true, messages: [] }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 })
    });
    await initDm();
    await selectConversation('c1');
    const msg = await sendGif('https://media.tenor.com/a.gif');
    expect(msg?.messageType).toBe('gif');
    expect(dmState.messages.c1[0].mediaUrl).toBe('https://media.tenor.com/a.gif');
  });

  it('sendText to an offline user is delivered locally without being gated or dropped', async () => {
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': (url, init) =>
        init.method === 'POST'
          ? JSON_RESP({ success: true, message: { id: 'm-off', conversationId: 'c1', senderId: 'u-me', content: 'you there?', messageType: 'text', mediaUrl: null, createdAt: '2025-01-03T00:00:00.000Z' } }, 201)
          : JSON_RESP({ success: true, messages: [] }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/presence': (url) =>
        url.includes('/batch')
          ? JSON_RESP({ success: true, presence: { 'u-bob': { userId: 'u-bob', status: 'offline', lastSeenAt: '2025-01-01T00:00:00.000Z' } } })
          : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'online', lastSeenAt: '2025-01-01T00:00:00.000Z' } }),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 })
    });
    await initDm();
    expect(dmState.presence['u-bob']?.status).toBe('offline');
    await selectConversation('c1');
    const msg = await sendText('you there?');
    expect(msg?.content).toBe('you there?');
    // No silent loss: the message lands in the local timeline and bumps the conversation.
    expect(dmState.messages.c1?.some(m => m.id === 'm-off')).toBe(true);
    expect(dmState.conversations.find(c => c.id === 'c1')?.lastMessage?.content).toBe('you there?');
    expect(dmState.conversations.find(c => c.id === 'c1')?.unreadCount).toBe(0); // sender view; recipient unread is server-derived
  });
});

describe('dm store presence + search', () => {
  it('setOwnPresence updates local + realtime', async () => {
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [] }),
      '/api/dm/presence': (url, init) => {
        if (url.includes('/batch')) return JSON_RESP({ success: true, presence: {} });
        if (init?.method === 'POST') return JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'dnd', customStatus: 'coding', lastSeenAt: '2025-01-01T00:00:00.000Z' } });
        return JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline', lastSeenAt: '2025-01-01T00:00:00.000Z' } });
      },
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 })
    });
    await initDm();
    await setOwnPresence('dnd', 'coding');
    expect(dmState.myPresence?.customStatus).toBe('coding');
    expect(rt.instances[0].trackPresence).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'dnd', customStatus: 'coding' }));
  });

  it('dmSearch returns empty below 2 chars and calls the API otherwise', async () => {
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 }),
      '/api/dm/search': () => JSON_RESP({ success: true, users: [{ id: 'u-bob', username: 'bob', presenceStatus: 'online' }] })
    });
    await initDm();
    expect(await dmSearch('a')).toEqual([]);
    expect(dmState.searchResults).toEqual([]);
    const users = await dmSearch('bob');
    expect(users).toHaveLength(1);
    expect(dmState.searchResults[0].username).toBe('bob');
  });
});

describe('dm store realtime handlers', () => {
async function boot() {
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': () => JSON_RESP({ success: true, messages: [] }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 })
    });
    await initDm();
    return rt.instances[0];
  }

  it('incoming realtime message triggers an API sync and notifies', async () => {
    const notifySpy = vi.fn();
    configureDmRuntime({ getAuth: () => ({ ...AUTH }), notify: notifySpy });
    await boot();
    await selectConversation('c1');
    stubFetch({
      '/api/dm/conversations/c1/messages': () =>
        JSON_RESP({
          success: true,
          messages: [{ id: 'm-live', conversationId: 'c1', senderId: 'u-bob', content: 'ping', messageType: 'text', createdAt: '2025-01-04T00:00:00.000Z' }]
        }),
      '/api/dm/conversations': () =>
        JSON_RESP({
          success: true,
          conversations: [{ ...makeConv('c1', 'u-bob'), unreadCount: 1, lastMessage: { id: 'm-live', conversationId: 'c1', senderId: 'u-bob', content: 'ping', messageType: 'text', createdAt: '2025-01-04T00:00:00.000Z' } }]
        }),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 1 })
    });
    rt.handlers.onMessage({
      kind: 'dm-message',
      conversationId: 'c1',
      senderName: 'bob',
      message: { id: 'm-live', conversationId: 'c1', senderId: 'u-bob', messageType: 'text', createdAt: '2025-01-04T00:00:00.000Z' }
    });
    await flushConversationSyncs();
    expect(dmState.messages.c1?.some(m => m.content === 'ping')).toBe(true);
    expect(dmState.totalUnread).toBe(1);
    expect(dmState.conversations.find(c => c.id === 'c1')?.lastMessage?.content).toBe('ping');
    expect(notifySpy).toHaveBeenCalledWith({ title: 'bob', body: 'sent a message' });
  });

  it('typing broadcasts track per-conversation user activity', async () => {
    await boot();
    rt.handlers.onTyping({ kind: 'typing', conversationId: 'c1', userId: 'u-bob', userName: 'bob', at: Date.now() });
    expect(dmState.typing.c1).toContain('u-bob');
  });

  it('presence changes hydrate the realtime map', async () => {
    await boot();
    rt.handlers.onPresenceChange({ 'u-bob': { userId: 'u-bob', username: 'bob', status: 'online', at: Date.now() } });
    expect(dmState.realtimePresence['u-bob'].status).toBe('online');
  });

  it('incoming call offer is surfaced and notifies', async () => {
    const notifySpy = vi.fn();
    configureDmRuntime({ getAuth: () => ({ ...AUTH }), notify: notifySpy });
    await boot();
    const call = {
      id: 'call-1', conversationId: 'c1', callerId: 'u-bob', calleeId: 'u-me', callType: 'video' as const,
      status: 'ringing' as const, startedAt: '', answeredAt: null, endedAt: null, createdAt: ''
    };
    stubFetch({
      '/api/dm/calls/pending': () => JSON_RESP({ success: true, call }),
      '/api/dm/calls/call-1/signal': () => JSON_RESP({ success: true, signals: [] })
    });
    await refreshPendingCall();
    expect(dmState.incomingCall?.call.id).toBe('call-1');
    expect(notifySpy).toHaveBeenCalledWith({ title: 'bob is calling', body: 'Video call' });
  });
});

describe('dm store calls', () => {
  // Captures POST/GET bodies sent to the DB-backed signal queue route.
  const signalPosts: { url: string; method: string | undefined; body: any }[] = [];

  async function boot() {
    stubFetch({
      '/signal': (url, init) => {
        signalPosts.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null });
        return JSON_RESP({ success: true, signals: [], signal: null });
      },
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': () => JSON_RESP({ success: true, messages: [] }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 }),
      '/api/dm/calls/call-2/status': () =>
        JSON_RESP({
          success: true,
          call: { id: 'call-2', conversationId: 'c1', callerId: 'u-me', calleeId: 'u-bob', callType: 'voice', status: 'ended', startedAt: '', answeredAt: null, endedAt: null, createdAt: '' },
          systemMessage: { id: 'sys-1', conversationId: 'c1', senderId: 'u-me', content: '{"kind":"call-ended","callType":"voice"}', messageType: 'system', mediaUrl: 'call-ended:call-2', createdAt: '2025-01-04T00:00:00.000Z' }
        }),
      '/api/dm/calls': () =>
        JSON_RESP(
          {
            success: true,
            call: { id: 'call-2', conversationId: 'c1', callerId: 'u-me', calleeId: 'u-bob', callType: 'voice', status: 'ringing', startedAt: '', answeredAt: null, endedAt: null, createdAt: '' }
          },
          201
        )
    });
    signalPosts.length = 0;
    await initDm();
    return rt.instances[0];
  }

  it('startCall creates the call, acquires media, and queues an offer signal', async () => {
    const rtInst = await boot();
    await selectConversation('c1');
    const ok = await startCall('voice');
    expect(ok).toBe(true);
    expect(dmState.call?.direction).toBe('outgoing');
    expect(dmState.call?.call.callType).toBe('voice');
    const offerPost = signalPosts.find((p) => p.url.includes('call-2') && p.body?.signalType === 'offer');
    expect(offerPost).toBeTruthy();
    expect(offerPost!.body.payload.sdp).toEqual({ type: 'offer', sdp: 'offer-sdp' });
  });

  it('acceptIncomingCall answers and queues an answer signal', async () => {
    const rtInst = await boot();
    const call = {
      id: 'call-9', conversationId: 'c1', callerId: 'u-bob', calleeId: 'u-me', callType: 'video' as const,
      status: 'ringing' as const, startedAt: '', answeredAt: null, endedAt: null, createdAt: ''
    };
    // The incoming call surfaces via the DB pending poll (not a realtime offer)
    // and its offer is hydrated from the DB signal queue.
    stubFetch({
      '/api/dm/calls/pending': () => JSON_RESP({ success: true, call }),
      '/api/dm/calls/call-9/signal': (url, init) => {
        if (init?.method === 'POST') {
          signalPosts.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
          return JSON_RESP({ success: true, signal: null }, 201);
        }
        return JSON_RESP({
          success: true,
          signals: [{
            id: 'sig-offer-9', callId: 'call-9', conversationId: 'c1', senderId: 'u-bob', signalType: 'offer',
            payload: { sdp: { type: 'offer', sdp: 'offer-sdp' } }, createdAt: '2025-01-01T00:00:00.000Z'
          }]
        });
      }
    });
    await refreshPendingCall();
    // Let the offer hydration complete so accept uses the caller's SDP.
    await new Promise((r) => setTimeout(r, 0));
    await acceptIncomingCall();
    expect(dmState.incomingCall).toBeNull();
    expect(dmState.call?.direction).toBe('incoming');
    expect(dmState.call?.callState).toBe('connected');
    const answerPost = signalPosts.find((p) => p.url.includes('call-9') && p.body?.signalType === 'answer');
    expect(answerPost).toBeTruthy();
    expect(answerPost!.body.payload.sdp).toEqual({ type: 'answer', sdp: 'answer-sdp' });
    expect(rtInst.subscribeConversation).toHaveBeenCalledWith('c1');
  });

  it('hangUpCall cancels an outgoing ringing call', async () => {
    await boot();
    await selectConversation('c1');
    await startCall('voice');
    const prior = signalPosts.length;
    await hangUpCall();
    expect(dmState.call).toBeNull();
    // Hangs-up/declines never enqueue WebRTC signals anymore — the peer learns
    // via the status poll. Only the offer remains queued from startCall.
    expect(signalPosts.slice(prior).filter((p) => p.body?.signalType === 'decline' || p.body?.signalType === 'hangup')).toHaveLength(0);
    expect(signalPosts.filter((p) => p.body?.signalType === 'offer')).toHaveLength(1);
  });

  it('canceled ringing calls apply a call-ended system message to the timeline', async () => {
    const rtInst = await boot();
    await selectConversation('c1');
    await startCall('voice');
    expect(dmState.call?.callState).toBe('ringing');
    // The server now reports a canceled (still-ringing, never answered) call as
    // "call-ended" so the timeline shows a system message instead of nothing.
    stubFetch({
      '/api/dm/calls/call-2/status': () => JSON_RESP({
        success: true,
        call: { id: 'call-2', conversationId: 'c1', callerId: 'u-me', calleeId: 'u-bob', callType: 'voice', status: 'canceled', startedAt: '2025-01-02T00:00:00.000Z', answeredAt: null, endedAt: null, createdAt: '2025-01-02T00:00:00.000Z' },
        systemMessage: { id: 'sys-cancel', conversationId: 'c1', senderId: 'u-me', content: '{"kind":"call-ended","callType":"voice"}', messageType: 'system', mediaUrl: 'call-ended:call-2', createdAt: '2025-01-02T00:00:02.000Z' }
      })
    });
    await hangUpCall();
    const msgs = dmState.messages.c1 ?? [];
    const sys = msgs.find((m) => m.messageType === 'system');
    expect(sys?.mediaUrl).toBe('call-ended:call-2');
    expect(sys?.content).toBe('{"kind":"call-ended","callType":"voice"}');
    // The broadcast still reaches the peer over the conversation channel.
    expect(rtInst.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'c1', message: expect.objectContaining({ messageType: 'system', mediaUrl: 'call-ended:call-2' }) }));
  });

  it('an echoed-back offer does not flip an outgoing ringing call to connected', async () => {
    await boot();
    await selectConversation('c1');
    await startCall('voice');
    expect(dmState.call?.callState).toBe('ringing');
    // Our own offer is stored in the DB queue too; the signal poll must skip
    // self-sent signals so the caller never treats its own offer as a
    // renegotiation (which would call acceptOffer and set state to
    // 'connected' before the callee has answered).
    stubFetch({
      '/signal': () =>
        JSON_RESP({
          success: true,
          signals: [{
            id: 's-echo', callId: 'call-2', conversationId: 'c1', senderId: 'u-me', signalType: 'offer',
            payload: { sdp: { type: 'offer', sdp: 'offer-sdp' } }, createdAt: '2025-01-01T00:00:00.000Z'
          }]
        })
    });
    await pollCallSignals();
    expect(dmState.call?.callState).toBe('ringing');
    const answerPost = signalPosts.find((p) => p.body?.signalType === 'answer');
    expect(answerPost).toBeUndefined();
  });

  it('declines and cleans up an incoming call', async () => {
    await boot();
    const call = {
      id: 'call-7', conversationId: 'c1', callerId: 'u-bob', calleeId: 'u-me', callType: 'voice' as const,
      status: 'ringing' as const, startedAt: '', answeredAt: null, endedAt: null, createdAt: ''
    };
    stubFetch({
      '/api/dm/calls/pending': () => JSON_RESP({ success: true, call }),
      '/api/dm/calls/call-7/signal': () => JSON_RESP({ success: true, signals: [] })
    });
    await refreshPendingCall();
    expect(dmState.incomingCall?.call.id).toBe('call-7');
    // hangUpCall with no active call but an incoming call set acts as decline
    await hangUpCall();
    expect(dmState.incomingCall).toBeNull();
    expect(dmState.call).toBeNull();
  });

  it('toggleMute reflects in the call UI state', async () => {
    await boot();
    await selectConversation('c1');
    await startCall('voice');
    toggleMute();
    expect(dmState.call?.muted).toBe(true);
    toggleVideo();
    expect(dmState.call?.videoOff).toBe(true);
  });

  it('hangUpCall applies a call-ended system message to the timeline and broadcasts it', async () => {
    const rtInst = await boot();
    await selectConversation('c1');
    await startCall('voice');
    await hangUpCall();
    expect(dmState.call).toBeNull();
    const msgs = dmState.messages.c1 ?? [];
    const sys = msgs.find((m) => m.messageType === 'system');
    expect(sys?.content).toBe('{"kind":"call-ended","callType":"voice"}');
    expect(rtInst.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'c1', message: expect.objectContaining({ messageType: 'system' }) }));
  });

  it('incoming realtime system messages are applied without a notification', async () => {
    const notifySpy = vi.fn();
    configureDmRuntime({ getAuth: () => ({ ...AUTH }), notify: notifySpy });
    await boot();
    await selectConversation('c1');
    stubFetch({
      '/api/dm/conversations/c1/messages': () =>
        JSON_RESP({
          success: true,
          messages: [{ id: 'sys-x', conversationId: 'c1', senderId: 'u-bob', content: '{"kind":"call-missed","callType":"voice"}', messageType: 'system', createdAt: '2025-01-05T00:00:00.000Z' }]
        }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 })
    });
    rt.handlers.onMessage({
      kind: 'dm-message',
      conversationId: 'c1',
      senderName: 'bob',
      message: { id: 'sys-x', conversationId: 'c1', senderId: 'u-bob', messageType: 'system', createdAt: '2025-01-05T00:00:00.000Z' }
    });
    await flushConversationSyncs();
    expect(dmState.messages.c1?.some((m) => m.id === 'sys-x')).toBe(true);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('startCall joins an already-busy call instead of ringing the callee again', async () => {
    stubFetch({
      '/signal': (url, init) => {
        signalPosts.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null });
        return JSON_RESP({ success: true, signals: [], signal: null });
      },
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': () => JSON_RESP({ success: true, messages: [] }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 }),
      '/api/dm/calls': () =>
        JSON_RESP(
          {
            success: true,
            joined: true,
            call: { id: 'call-existing', conversationId: 'c1', callerId: 'u-me', calleeId: 'u-bob', callType: 'voice', status: 'active', startedAt: '', answeredAt: null, endedAt: null, createdAt: '' }
          },
          201
        )
    });
    await initDm();
    await selectConversation('c1');
    const ok = await startCall('voice');
    expect(ok).toBe(true);
    // Adopts the existing call in the active dock without a fresh ringing flow.
    expect(dmState.call?.call.id).toBe('call-existing');
    expect(dmState.call?.direction).toBe('outgoing');
    expect(dmState.call?.callState).toBe('active');
    // The already-busy callee must NOT be re-rung, but a renegotiation offer is
    // queued in the DB-backed signal store so media can link up.
    expect(signalPosts.find((p) => p.body?.signalType === 'offer' && p.url.includes('call-existing'))).toBeTruthy();
  });

  it('startCall joining a ringing call adopts the caller offer instead of creating a second one', async () => {
    const signalPosts: { url: string; method: string | undefined; body: any }[] = [];
    const callerOffer = {
      id: 'sig-join-offer', callId: 'call-join-1', conversationId: 'c1', senderId: 'u-bob', signalType: 'offer',
      payload: { sdp: { type: 'offer', sdp: 'caller-offer-sdp' } }, createdAt: '2025-01-01T00:00:00.000Z'
    };
    stubFetch({
      '/signal': (url, init) => {
        if (init?.method === 'GET') return JSON_RESP({ success: true, signals: [callerOffer], signal: null });
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        signalPosts.push({ url: String(url), method: init?.method, body });
        return JSON_RESP({ success: true, signals: [], signal: { ...callerOffer, id: 'stored', senderId: 'u-me', signalType: body.signalType, payload: body.payload, createdAt: '2025-01-01T00:00:01.000Z' } });
      },
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': () => JSON_RESP({ success: true, messages: [] }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 }),
      '/api/dm/calls': () =>
        JSON_RESP(
          {
            success: true,
            joined: true,
            call: { id: 'call-join-1', conversationId: 'c1', callerId: 'u-bob', calleeId: 'u-me', callType: 'voice', status: 'ringing', startedAt: '', answeredAt: null, endedAt: null, createdAt: '' }
          },
          201
        )
    });
    await initDm();
    await selectConversation('c1');
    const ok = await startCall('voice');
    expect(ok).toBe(true);
    expect(dmState.call?.call.id).toBe('call-join-1');
    // The joining callee adopts the caller's queued SDP. Emitting a competing
    // offer here produced crossed descriptions (no audio/video on either side).
    expect(signalPosts.filter((p) => p.body?.signalType === 'offer')).toHaveLength(0);
    const answerPost = signalPosts.find((p) => p.url.includes('call-join-1/signal') && p.body?.signalType === 'answer');
    expect(answerPost).toBeTruthy();
    expect(answerPost!.body.payload.sdp).toEqual({ type: 'answer', sdp: 'answer-sdp' });
    expect(dmState.call?.callState).toBe('connected');
  });

  it('pollCallSignals ignores a peer offer older than our own in-flight offer (newest wins)', async () => {
    const signalPosts: { url: string; method: string | undefined; body: any }[] = [];
    const incoming: any[] = [];
    stubFetch({
      '/signal': (url, init) => {
        if (init?.method === 'GET') return JSON_RESP({ success: true, signals: incoming.splice(0), signal: null });
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        signalPosts.push({ url: String(url), method: init?.method, body });
        return JSON_RESP({ success: true, signals: [], signal: { id: 'stored', callId: 'call-2', conversationId: 'c1', senderId: 'u-me', signalType: body.signalType, payload: body.payload, createdAt: '2025-01-01T00:00:05.000Z' } });
      },
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': () => JSON_RESP({ success: true, messages: [] }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 }),
      '/api/dm/calls': () =>
        JSON_RESP(
          {
            success: true,
            call: { id: 'call-2', conversationId: 'c1', callerId: 'u-me', calleeId: 'u-bob', callType: 'voice', status: 'ringing', startedAt: '', answeredAt: null, endedAt: null, createdAt: '' }
          },
          201
        )
    });
    await initDm();
    await selectConversation('c1');
    await startCall('voice');
    // Our offer is queued at 00:00:05; the peer's stale offer predates it.
    incoming.length = 0;
    incoming.push({
      id: 'sig-old', callId: 'call-2', conversationId: 'c1', senderId: 'u-bob', signalType: 'offer',
      payload: { sdp: { type: 'offer', sdp: 'older-offer-sdp' } }, createdAt: '2025-01-01T00:00:01.000Z'
    });
    await pollCallSignals();
    // Answering the older offer would cross the SDPs; it must be skipped so the
    // peer answers OUR newer offer instead.
    expect(signalPosts.filter((p) => p.body?.signalType === 'answer')).toHaveLength(0);
  });

  it('startCall sends callerAvatar and propagates peer info', async () => {
    await boot();
    await selectConversation('c1');
    const ok = await startCall('voice');
    expect(ok).toBe(true);
    expect(dmState.call?.remoteName).toBe('bob');
    expect(signalPosts.find((p) => p.body?.signalType === 'offer' && p.url.includes('call-2'))).toBeTruthy();
  });

  it('incoming call buffers ICE candidates before accept and adopts them upon accept', async () => {
    await boot();
    const call = {
      id: 'call-ice-1', conversationId: 'c1', callerId: 'u-bob', calleeId: 'u-me', callType: 'voice' as const,
      status: 'ringing' as const, startedAt: '', answeredAt: null, endedAt: null, createdAt: ''
    };
    // Offer + pre-accept ICE are pulled from the DB queue when the pending poll
    // surfaces the call.
    stubFetch({
      '/api/dm/calls/pending': () => JSON_RESP({ success: true, call }),
      '/api/dm/calls/call-ice-1/signal': () =>
        JSON_RESP({
          success: true,
          signals: [
            {
              id: 'sig-o', callId: 'call-ice-1', conversationId: 'c1', senderId: 'u-bob', signalType: 'offer',
              payload: { sdp: { type: 'offer', sdp: 'offer-sdp' } }, createdAt: '2025-01-01T00:00:00.000Z'
            },
            {
              id: 'sig-i', callId: 'call-ice-1', conversationId: 'c1', senderId: 'u-bob', signalType: 'ice',
              payload: { candidate: { candidate: 'candidate:1 1 UDP 12345 1.2.3.4 5678 typ host' } }, createdAt: '2025-01-01T00:00:01.000Z'
            }
          ]
        })
    });
    await refreshPendingCall();
    expect(dmState.incomingCall?.call.id).toBe('call-ice-1');
    // Wait for offer + ICE hydration from the queue to finish.
    await new Promise((r) => setTimeout(r, 0));
    await acceptIncomingCall();
    const manager = callRegistry.instances[callRegistry.instances.length - 1];
    expect(manager.adoptIce).toHaveBeenCalledWith(
      expect.objectContaining({ candidate: expect.stringContaining('1.2.3.4') })
    );
    expect(dmState.call?.remoteName).toBe('bob');
  });

  it('declineIncomingCall marks the call declined on the server without enqueueing WebRTC signals', async () => {
    await boot();
    const call = {
      id: 'call-dec-1', conversationId: 'c1', callerId: 'u-bob', calleeId: 'u-me', callType: 'voice' as const,
      status: 'ringing' as const, startedAt: '', answeredAt: null, endedAt: null, createdAt: ''
    };
    stubFetch({
      '/api/dm/calls/pending': () => JSON_RESP({ success: true, call }),
      '/api/dm/calls/call-dec-1/signal': () => JSON_RESP({ success: true, signals: [] })
    });
    await refreshPendingCall();
    expect(dmState.incomingCall).not.toBeNull();
    const prior = signalPosts.length;
    await declineIncomingCall();
    expect(dmState.incomingCall).toBeNull();
    // Decline is delivered via the call session status, never a signal row.
    expect(signalPosts.slice(prior).filter((p) => p.url.includes('call-dec-1') && p.body?.signalType === 'decline')).toHaveLength(0);
  });

  it('receiving an ended status displays left the voice chat notice and cancels call after timeout', async () => {
    vi.useFakeTimers();
    try {
      await boot();
      await selectConversation('c1');
      await startCall('voice');
      // Once connected, if the peer ends the call the status poll must surface
      // the "left the voice chat" notice (the old hangup realtime signal path).
      setDmState('call', 'callState', 'connected');
      expect(dmState.call).not.toBeNull();
      stubFetch({
        '/signal': () => JSON_RESP({ success: true, signals: [] }),
        '/api/dm/calls/call-2/status': () =>
          JSON_RESP({
            success: true,
            call: { id: 'call-2', conversationId: 'c1', callerId: 'u-me', calleeId: 'u-bob', callType: 'voice', status: 'ended', startedAt: '', answeredAt: null, endedAt: null, createdAt: '' }
          })
      });
      await pollActiveCallStatus();
      expect(dmState.call?.leftNotice).toContain('left the voice chat');
      vi.advanceTimersByTime(3500);
      expect(dmState.call).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('refreshPendingCall hydrates a missed incoming (ringing) call', async () => {
    let polled = 0;
    const pendingCall = {
      id: 'call-pend-1', conversationId: 'c1', callerId: 'u-bob', calleeId: 'u-me', callType: 'voice' as const,
      status: 'ringing' as const, startedAt: '', answeredAt: null, endedAt: null, createdAt: ''
    };
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': () => JSON_RESP({ success: true, messages: [] }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 }),
      '/api/dm/calls/pending': () => {
        polled += 1;
        return polled === 1 ? JSON_RESP({ success: true, call: null }) : JSON_RESP({ success: true, call: pendingCall });
      }
    });
    await initDm();
    // The boot-time poll found nothing yet.
    expect(dmState.incomingCall).toBeNull();
    await refreshPendingCall();
    expect(dmState.incomingCall?.call.id).toBe('call-pend-1');
    expect(dmState.incomingCall?.callerName).toBe('bob');
  });

  it('refreshPendingCall hydrates an active call after a refresh (rejoin affordance)', async () => {
    const pendingCall = {
      id: 'call-pend-2', conversationId: 'c1', callerId: 'u-me', calleeId: 'u-bob', callType: 'voice' as const,
      status: 'active' as const, startedAt: '', answeredAt: null, endedAt: null, createdAt: ''
    };
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': () => JSON_RESP({ success: true, messages: [] }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 }),
      '/api/dm/calls/pending': () => JSON_RESP({ success: true, call: pendingCall })
    });
    await initDm();
    await refreshPendingCall();
    expect(dmState.incomingCall?.call.id).toBe('call-pend-2');
  });

  it('refreshPendingCall never clobbers a call the user is already managing', async () => {
    let polled = 0;
    const pendingCall = {
      id: 'call-pend-3', conversationId: 'c1', callerId: 'u-bob', calleeId: 'u-me', callType: 'voice' as const,
      status: 'ringing' as const, startedAt: '', answeredAt: null, endedAt: null, createdAt: ''
    };
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': () => JSON_RESP({ success: true, messages: [] }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 }),
      '/api/dm/calls/pending': () => {
        polled += 1;
        return polled === 1 ? JSON_RESP({ success: true, call: null }) : JSON_RESP({ success: true, call: pendingCall });
      }
    });
    await initDm();
    // Surfacing an incoming call through the DB poll (not a realtime offer).
    await refreshPendingCall();
    expect(dmState.incomingCall?.call.id).toBe('call-pend-3');
    // The poll's verify pass must not replace the call already on screen.
    await refreshPendingCall();
    expect(dmState.incomingCall?.call.id).toBe('call-pend-3');
  });

  it('refreshPendingCall does not surface a ringing call where the user is the caller', async () => {
    const pendingCall = {
      id: 'call-pend-4', conversationId: 'c1', callerId: 'u-me', calleeId: 'u-bob', callType: 'voice' as const,
      status: 'ringing' as const, startedAt: '', answeredAt: null, endedAt: null, createdAt: ''
    };
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': () => JSON_RESP({ success: true, messages: [] }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'offline' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 }),
      '/api/dm/calls/pending': () => JSON_RESP({ success: true, call: pendingCall })
    });
    await initDm();
    await refreshPendingCall();
    expect(dmState.incomingCall).toBeNull();
  });

  it('callee accepting without prior offer sends offer to caller, and caller accepts it to connect', async () => {
    await boot();
    // 1. Caller starts the call
    await selectConversation('c1');
    await startCall('voice');
    expect(dmState.call?.callState).toBe('ringing');

    // 2. Caller polls the DB queue and finds the callee's offer (e.g. if the
    //    callee joined before the caller's offer reached them).
    stubFetch({
      '/signal': (url, init) => {
        if (init?.method === 'POST') {
          signalPosts.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
          return JSON_RESP({ success: true, signal: null }, 201);
        }
        return JSON_RESP({
          success: true,
          signals: [{
            id: 'sig-callee-offer', callId: 'call-2', conversationId: 'c1', senderId: 'u-bob', signalType: 'offer',
            payload: { sdp: { type: 'offer', sdp: 'callee-offer-sdp' } }, createdAt: '2025-01-01T00:00:00.000Z'
          }]
        });
      }
    });
    await pollCallSignals();

    // Caller should accept callee's offer, transition to connected, and queue an answer back
    expect(dmState.call?.callState).toBe('connected');
    expect(signalPosts.find((p) => p.url.includes('call-2') && p.body?.signalType === 'answer')).toBeTruthy();
  });

  it('ignores signals sent by self or from a non-participant', async () => {
    await boot();
    await selectConversation('c1');
    await startCall('voice');
    expect(dmState.call?.callState).toBe('ringing');

    // Signal sent by self (echo of our own stored offer)
    stubFetch({
      '/signal': () =>
        JSON_RESP({
          success: true,
          signals: [{
            id: 's-self', callId: 'call-2', conversationId: 'c1', senderId: 'u-me', signalType: 'answer',
            payload: { sdp: { type: 'answer', sdp: 'my-own-answer' } }, createdAt: '2025-01-01T00:00:00.000Z'
          }]
        })
    });
    await pollCallSignals();
    expect(dmState.call?.callState).toBe('ringing');

    // Offer that claims to come from someone who is not the remote party of
    // this outgoing call is not treated as a renegotiation.
    stubFetch({
      '/signal': () =>
        JSON_RESP({
          success: true,
          signals: [{
            id: 's-stranger', callId: 'call-2', conversationId: 'c1', senderId: 'u-intruder', signalType: 'offer',
            payload: { sdp: { type: 'offer', sdp: 'intruder-offer' } }, createdAt: '2025-01-01T00:00:00.000Z'
          }]
        })
    });
    await pollCallSignals();
    expect(dmState.call?.callState).toBe('ringing');
    expect(signalPosts.filter((p) => p.body?.signalType === 'answer')).toHaveLength(0);
  });
});

describe('dm store reactions', () => {
  async function boot() {
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'x', supabaseAnonKey: 'k', isConfigured: true }),
      '/api/dm/conversations/c1/messages': () => JSON_RESP({ success: true, messages: [] }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/presence': (url) => (url.includes('/batch') ? JSON_RESP({ success: true, presence: {} }) : JSON_RESP({ success: true, presence: { userId: 'u-me', status: 'online' } })),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 })
    });
    await initDm();
    return rt.instances[0];
  }

  it('toggleReaction adds a reaction, applies authoritative state and broadcasts', async () => {
    const rtInst = await boot();
    setDmState('activeConversationId', 'c1');
    setDmState('messages', 'c1', [{ id: 'm1', conversationId: 'c1', senderId: 'u-bob', content: 'hi', messageType: 'text', createdAt: '2025-01-01T00:00:00.000Z' }]);
    stubFetch({
      '/api/dm/reactions': () =>
        JSON_RESP({ success: true, messageId: 'm1', emoji: '👍', action: 'add', reactions: [{ emoji: '👍', count: 1, userIds: ['u-me'] }] })
    });
    await toggleReaction('m1', '👍');
    expect(dmState.messages.c1?.[0]?.reactions).toEqual([{ emoji: '👍', count: 1, userIds: ['u-me'] }]);
    expect(rtInst.sendReaction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'dm-reaction', messageId: 'm1', emoji: '👍', action: 'add' }));
  });

  it('incoming reaction broadcasts refetch authoritative reaction buckets', async () => {
    await boot();
    setDmState('messages', 'c1', [
      { id: 'm1', conversationId: 'c1', senderId: 'u-me', content: 'mine', messageType: 'text', createdAt: '2025-01-01T00:00:00.000Z' }
    ]);
    stubFetch({
      '/api/dm/conversations/c1/messages': () =>
        JSON_RESP({
          success: true,
          messages: [
            { id: 'm1', conversationId: 'c1', senderId: 'u-me', content: 'mine', messageType: 'text', createdAt: '2025-01-01T00:00:00.000Z', reactions: [{ emoji: '😂', count: 1, userIds: ['u-bob'] }] }
          ]
        }),
      '/api/dm/conversations': () => JSON_RESP({ success: true, conversations: [makeConv('c1', 'u-bob')] }),
      '/api/dm/unread': () => JSON_RESP({ success: true, totalUnread: 0 })
    });
    rt.handlers.onReaction({
      kind: 'dm-reaction',
      conversationId: 'c1',
      messageId: 'm1',
      emoji: '😂',
      action: 'add',
      userId: 'u-bob',
      userName: 'bob'
    });
    await flushConversationSyncs();
    expect(dmState.messages.c1?.[0]?.reactions).toEqual([{ emoji: '😂', count: 1, userIds: ['u-bob'] }]);
  });
});

describe('dm store call status polling and callee acceptance sync', () => {
  beforeEach(() => {
    resetDmStore();
    configureDmRuntime({ getAuth: () => AUTH });
  });

  afterEach(() => {
    resetDmStore();
  });

  async function boot() {
    stubFetch({
      '/api/dm/config': () => JSON_RESP({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' }),
      '/api/dm/conversations': () => JSON_RESP({ conversations: [] }),
      '/api/dm/presence': () => JSON_RESP({ presence: {} }),
      '/api/dm/unread': () => JSON_RESP({ unread: {} }),
      '/api/dm/calls/pending': () => JSON_RESP({ call: null })
    });
    await initDm();
    return rt.instances[rt.instances.length - 1];
  }

  it('keeps a caller ringing until SDP settles even when the callee accepts (no premature connected)', async () => {
    setDmState('activeConversationId', 'c1');
    setDmState('conversations', [makeConv('c1', 'u-bob')]);

    stubFetch({
      '/api/dm/calls/call-active-1/status': () =>
        JSON_RESP({
          success: true,
          call: {
            id: 'call-active-1',
            conversationId: 'c1',
            callerId: 'u-me',
            calleeId: 'u-bob',
            callType: 'voice',
            status: 'active',
            startedAt: '2025-01-01',
            answeredAt: '2025-01-01',
            endedAt: null,
            createdAt: '2025-01-01'
          }
        })
    });

    // Caller initiates call (currently in ringing state)
    setDmState('call', {
      call: {
        id: 'call-active-1',
        conversationId: 'c1',
        callerId: 'u-me',
        calleeId: 'u-bob',
        callType: 'voice',
        status: 'ringing',
        startedAt: '2025-01-01',
        answeredAt: null,
        endedAt: null,
        createdAt: '2025-01-01'
      },
      direction: 'outgoing',
      remoteName: 'Bob',
      callState: 'ringing',
      muted: false,
      videoOff: true,
      screenSharing: false,
      deafened: false
    });

    expect(dmState.call?.callState).toBe('ringing');

    // Poller runs
    await pollActiveCallStatus();

    // The answer has not been adopted yet (no settled SDP / no manager wired),
    // so the dock must NOT claim media is flowing: the real 'connected'
    // transition belongs to adoptAnswer once signaling goes stable.
    expect(dmState.call?.callState).toBe('ringing');
    expect(dmState.call?.call.status).toBe('active');
  });

  it('detects when callee declines call and cleans up caller ringing session', async () => {
    setDmState('activeConversationId', 'c1');
    setDmState('conversations', [makeConv('c1', 'u-bob')]);

    stubFetch({
      '/api/dm/calls/call-declined-1/status': () =>
        JSON_RESP({
          success: true,
          call: {
            id: 'call-declined-1',
            conversationId: 'c1',
            callerId: 'u-me',
            calleeId: 'u-bob',
            callType: 'voice',
            status: 'declined',
            startedAt: '2025-01-01',
            answeredAt: null,
            endedAt: '2025-01-01',
            createdAt: '2025-01-01'
          }
        })
    });

    setDmState('call', {
      call: {
        id: 'call-declined-1',
        conversationId: 'c1',
        callerId: 'u-me',
        calleeId: 'u-bob',
        callType: 'voice',
        status: 'ringing',
        startedAt: '2025-01-01',
        answeredAt: null,
        endedAt: null,
        createdAt: '2025-01-01'
      },
      direction: 'outgoing',
      remoteName: 'Bob',
      callState: 'ringing',
      muted: false,
      videoOff: true,
      screenSharing: false,
      deafened: false
    });

    expect(dmState.call).not.toBeNull();

    // Poller runs
    await pollActiveCallStatus();

    // Caller session must be cleaned up because the call was declined
    expect(dmState.call).toBeNull();
  });

  it('refreshPendingCall clears ringing incoming call if caller canceled or declined on the server', async () => {
    setDmState('activeConversationId', 'c1');
    setDmState('conversations', [makeConv('c1', 'u-bob')]);

    setDmState('incomingCall', {
      call: {
        id: 'call-canceled-1',
        conversationId: 'c1',
        callerId: 'u-bob',
        calleeId: 'u-me',
        callType: 'voice',
        status: 'ringing',
        startedAt: '2025-01-01',
        answeredAt: null,
        endedAt: null,
        createdAt: '2025-01-01'
      },
      callerName: 'Bob'
    });

    expect(dmState.incomingCall).not.toBeNull();

    // Server says call has been canceled
    stubFetch({
      '/api/dm/calls/call-canceled-1/status': () =>
        JSON_RESP({
          success: true,
          call: {
            id: 'call-canceled-1',
            conversationId: 'c1',
            callerId: 'u-bob',
            calleeId: 'u-me',
            callType: 'voice',
            status: 'canceled',
            startedAt: '2025-01-01',
            answeredAt: null,
            endedAt: '2025-01-01',
            createdAt: '2025-01-01'
          }
        })
    });

    await refreshPendingCall();

    // Incoming banner must be cleared immediately
    expect(dmState.incomingCall).toBeNull();
  });

  it('startCall guards against concurrent calls if call or incomingCall is already present', async () => {
    setDmState('activeConversationId', 'c1');
    setDmState('conversations', [makeConv('c1', 'u-bob')]);

    // Already in call
    setDmState('call', {
      call: {
        id: 'c-busy',
        conversationId: 'c1',
        callerId: 'u-me',
        calleeId: 'u-bob',
        callType: 'voice',
        status: 'active',
        startedAt: '',
        answeredAt: '',
        endedAt: null,
        createdAt: ''
      },
      direction: 'outgoing',
      remoteName: 'Bob',
      callState: 'connected',
      muted: false,
      videoOff: true,
      screenSharing: false,
      deafened: false
    });

    const result = await startCall('voice');
    expect(result).toBe(false);
  });

  it('outgoing call transitions to connected when callee answer signal is polled from the DB queue', async () => {
    await boot();
    setDmState('activeConversationId', 'c1');
    setDmState('conversations', [makeConv('c1', 'u-bob')]);

    setDmState('call', {
      call: {
        id: 'call-answer-1',
        conversationId: 'c1',
        callerId: 'u-me',
        calleeId: 'u-bob',
        callType: 'voice',
        status: 'ringing',
        startedAt: '',
        answeredAt: null,
        endedAt: null,
        createdAt: ''
      },
      direction: 'outgoing',
      remoteName: 'Bob',
      callState: 'ringing',
      muted: false,
      videoOff: true,
      screenSharing: false,
      deafened: false
    });

    expect(dmState.call?.callState).toBe('ringing');

    // Callee's answer is queued in the DB; the signal poll picks it up.
    stubFetch({
      '/signal': () =>
        JSON_RESP({
          success: true,
          signals: [{
            id: 'sig-answer', callId: 'call-answer-1', conversationId: 'c1', senderId: 'u-bob', signalType: 'answer',
            payload: { sdp: { type: 'answer', sdp: 'remote-answer-sdp' } }, createdAt: '2025-01-01T00:00:00.000Z'
          }]
        })
    });
    await pollCallSignals();

    expect(dmState.call?.callState).toBe('connected');
  });

  it('callee accepting incoming call queues an answer signal', async () => {
    const signalPosts: { url: string; method: string | undefined; body: any }[] = [];
    await boot();
    setDmState('activeConversationId', 'c1');
    setDmState('conversations', [makeConv('c1', 'u-bob')]);

    stubFetch({
      '/signal': (url, init) => {
        if (init?.method === 'POST' && String(url).includes('call-accept-1/signal')) {
          signalPosts.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
        }
        return JSON_RESP({ success: true, signals: [], signal: null });
      },
      '/api/dm/calls/call-accept-1/status': () =>
        JSON_RESP({
          success: true,
          call: {
            id: 'call-accept-1',
            conversationId: 'c1',
            callerId: 'u-bob',
            calleeId: 'u-me',
            callType: 'voice',
            status: 'active',
            startedAt: '',
            answeredAt: '2025-01-01',
            endedAt: null,
            createdAt: ''
          }
        })
    });

    setDmState('incomingCall', {
      call: {
        id: 'call-accept-1',
        conversationId: 'c1',
        callerId: 'u-bob',
        calleeId: 'u-me',
        callType: 'voice',
        status: 'ringing',
        startedAt: '',
        answeredAt: null,
        endedAt: null,
        createdAt: ''
      },
      callerName: 'Bob',
      offer: { type: 'offer', sdp: 'fake-offer' }
    });

    const accepted = await acceptIncomingCall();
    expect(accepted).toBe(true);

    const answerPost = signalPosts.find((p) => p.body?.signalType === 'answer');
    expect(answerPost).toBeTruthy();
    expect(answerPost!.url).toContain('call-accept-1/signal');
    expect(answerPost!.body.payload.sdp).toEqual({ type: 'answer', sdp: 'answer-sdp' });
  });

  it('acceptIncomingCall without a hydrated offer waits for the caller offer instead of reversing roles', async () => {
    const signalPosts: { url: string; method: string | undefined; body: any }[] = [];
    await boot();
    setDmState('activeConversationId', 'c1');
    setDmState('conversations', [makeConv('c1', 'u-bob')]);

    stubFetch({
      '/signal': (url, init) => {
        if (init?.method === 'POST' && String(url).includes('call-wait-1/signal')) {
          signalPosts.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
        }
        return JSON_RESP({ success: true, signals: [], signal: null });
      },
      '/api/dm/calls/call-wait-1/status': () =>
        JSON_RESP({
          success: true,
          call: {
            id: 'call-wait-1',
            conversationId: 'c1',
            callerId: 'u-bob',
            calleeId: 'u-me',
            callType: 'voice',
            status: 'active',
            startedAt: '',
            answeredAt: '2025-01-01',
            endedAt: null,
            createdAt: ''
          }
        })
    });

    // Incoming call surfaces with NO SDP offer hydrated yet.
    setDmState('incomingCall', {
      call: {
        id: 'call-wait-1',
        conversationId: 'c1',
        callerId: 'u-bob',
        calleeId: 'u-me',
        callType: 'voice',
        status: 'ringing',
        startedAt: '',
        answeredAt: null,
        endedAt: null,
        createdAt: ''
      },
      callerName: 'Bob',
      offer: null
    });

    const accepted = await acceptIncomingCall();
    expect(accepted).toBe(true);
    // The callee must NOT generate its own offer (no role reversal) so the
    // caller is never offered two different SDPs.
    expect(signalPosts.filter((p) => p.body?.signalType === 'offer')).toHaveLength(0);
    expect(dmState.call?.call.id).toBe('call-wait-1');
    // No offer applied yet -> media is still linking, never falsely 'connected'.
    expect(dmState.call?.callState).toBe('active');

    // The caller's offer arrives over the DB signal poll afterwards...
    stubFetch({
      '/signal': (url, init) => {
        if (init?.method === 'POST' && String(url).includes('call-wait-1/signal')) {
          signalPosts.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
        }
        return JSON_RESP({
          success: true,
          signals: [{
            id: 'sig-wait-offer', callId: 'call-wait-1', conversationId: 'c1', senderId: 'u-bob', signalType: 'offer',
            payload: { sdp: { type: 'offer', sdp: 'caller-offer-sdp' } }, createdAt: '2025-01-01T00:00:00.000Z'
          }]
        });
      }
    });
    await pollCallSignals();

    // ...the pending accept applies it and answers back.
    const answerPost = signalPosts.find((p) => p.url.includes('call-wait-1/signal') && p.body?.signalType === 'answer');
    expect(answerPost).toBeTruthy();
    expect(answerPost!.body.payload.sdp).toEqual({ type: 'answer', sdp: 'answer-sdp' });
  });

  it('accepted call with no offer yet tears down on prompt end without a stale answer or peer-left notice', async () => {
    const signalPosts: { url: string; method: string | undefined; body: any }[] = [];
    await boot();
    setDmState('activeConversationId', 'c1');
    setDmState('conversations', [makeConv('c1', 'u-bob')]);

    stubFetch({
      '/signal': (url, init) => {
        if (init?.method === 'POST' && String(url).includes('call-wait2/signal')) {
          signalPosts.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
        }
        return JSON_RESP({ success: true, signals: [], signal: null });
      },
      '/api/dm/calls/call-wait2/status': () =>
        JSON_RESP({
          success: true,
          call: {
            id: 'call-wait2', conversationId: 'c1', callerId: 'u-bob', calleeId: 'u-me',
            callType: 'voice', status: 'active', startedAt: '', answeredAt: '2025-01-01', endedAt: null, createdAt: ''
          }
        })
    });

    setDmState('incomingCall', {
      call: {
        id: 'call-wait2', conversationId: 'c1', callerId: 'u-bob', calleeId: 'u-me',
        callType: 'voice', status: 'ringing', startedAt: '', answeredAt: null, endedAt: null, createdAt: ''
      },
      callerName: 'Bob',
      offer: null
    });

    const accepted = await acceptIncomingCall();
    expect(accepted).toBe(true);
    // Media is still linking: the dock must read as 'active', not a full
    // 'connected' in-call session the UI would show a video stage for.
    expect(dmState.call?.callState).toBe('active');

    // Caller cancels before ever sending the offer. A call that never
    // connected is torn down immediately (no "left the voice chat" notice).
    stubFetch({
      '/api/dm/calls/call-wait2/status': () =>
        JSON_RESP({
          success: true,
          call: {
            id: 'call-wait2', conversationId: 'c1', callerId: 'u-bob', calleeId: 'u-me',
            callType: 'voice', status: 'canceled', startedAt: '', answeredAt: '2025-01-01', endedAt: '2025-01-01', createdAt: ''
          }
        })
    });
    await pollActiveCallStatus();
    expect(dmState.call).toBeNull();
    expect(dmState.incomingCall).toBeNull();
    expect(dmState.call?.leftNotice).toBeUndefined();

    // A late offer for the dead call must not resurrect it or produce an answer.
    const answerCount = signalPosts.filter((p) => p.body?.signalType === 'answer').length;
    stubFetch({
      '/signal': () =>
        JSON_RESP({
          success: true,
          signals: [{
            id: 'sig-stale2', callId: 'call-wait2', conversationId: 'c1', senderId: 'u-bob', signalType: 'offer',
            payload: { sdp: { type: 'offer', sdp: 'stale-sdp' } }, createdAt: '2025-01-01T00:00:00.001Z'
          }]
        })
    });
    await pollCallSignals();
    expect(dmState.call).toBeNull();
    expect(signalPosts.filter((p) => p.body?.signalType === 'answer')).toHaveLength(answerCount);
  });

  it('onPeerDisconnected ignores transient drops before the call is connected', async () => {
    await boot();
    setDmState('activeConversationId', 'c1');
    setDmState('conversations', [makeConv('c1', 'u-bob')]);

    const call = {
      id: 'call-peer-2', conversationId: 'c1', callerId: 'u-me', calleeId: 'u-bob', callType: 'voice' as const,
      status: 'ringing' as const, startedAt: '', answeredAt: null, endedAt: null, createdAt: ''
    };
    stubFetch({
      '/api/dm/calls': () => JSON_RESP({ success: true, call }, 201),
      '/api/dm/calls/call-peer-2/status': () => JSON_RESP({ success: true, call }),
      '/signal': () => JSON_RESP({ success: true, signals: [], signal: null })
    });
    const ok = await startCall('voice');
    expect(ok).toBe(true);
    expect(dmState.call?.callState).toBe('ringing');

    const manager = callRegistry.instances[callRegistry.instances.length - 1];
    // Media never linked yet: a transport blip must not fabricate a peer-left.
    manager.deps.onPeerDisconnected?.();
    expect(dmState.call).not.toBeNull();
    expect(dmState.call?.leftNotice).toBeUndefined();

    // Once genuinely connected, a drop means the peer actually left.
    await manager.adoptAnswer();
    expect(dmState.call?.callState).toBe('connected');
    manager.deps.onPeerDisconnected?.();
    expect(dmState.call?.leftNotice).not.toBeUndefined();
  });

  it('handlePeerLeft sets leftNotice and automatically cancels call after timeout', () => {
    vi.useFakeTimers();
    try {
      setDmState('call', {
        call: {
          id: 'call-leave-1',
          conversationId: 'c1',
          callerId: 'u-bob',
          calleeId: 'u-me',
          callType: 'voice',
          status: 'active',
          startedAt: '',
          answeredAt: '',
          endedAt: null,
          createdAt: ''
        },
        direction: 'incoming',
        remoteName: 'Bob',
        callState: 'connected',
        muted: false,
        videoOff: true,
        screenSharing: false,
        deafened: false
      });

      handlePeerLeft('call-leave-1', 'Bob');

      expect(dmState.call?.leftNotice).toContain('Bob');
      expect(dmState.call?.leftNotice).toContain('left the voice chat');
      expect(dmState.call).not.toBeNull();

      // Advancing timer past 3.5s timeout cancels the call
      vi.advanceTimersByTime(3500);
      expect(dmState.call).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hangUpCall immediately cancels call and clears peer left timeout without waiting', async () => {
    vi.useFakeTimers();
    try {
      setDmState('call', {
        call: {
          id: 'call-leave-2',
          conversationId: 'c1',
          callerId: 'u-bob',
          calleeId: 'u-me',
          callType: 'voice',
          status: 'active',
          startedAt: '',
          answeredAt: '',
          endedAt: null,
          createdAt: ''
        },
        direction: 'incoming',
        remoteName: 'Bob',
        callState: 'connected',
        muted: false,
        videoOff: true,
        screenSharing: false,
        deafened: false
      });

      handlePeerLeft('call-leave-2', 'Bob');
      expect(dmState.call?.leftNotice).toBeDefined();

      // User manually hangs up
      await hangUpCall();
      expect(dmState.call).toBeNull();

      // Ensure timer does not error after manual hang up
      vi.advanceTimersByTime(3500);
      expect(dmState.call).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-ring a session just torn down with a peer-left (same id, still server-active)', async () => {
    vi.useFakeTimers();
    try {
      setDmState('call', {
        call: {
          id: 'call-leave-3',
          conversationId: 'c1',
          callerId: 'u-bob',
          calleeId: 'u-me',
          callType: 'voice',
          status: 'active',
          startedAt: '',
          answeredAt: '',
          endedAt: null,
          createdAt: ''
        },
        direction: 'incoming',
        remoteName: 'Bob',
        callState: 'connected',
        muted: false,
        videoOff: true,
        screenSharing: false,
        deafened: false
      });

      // The pending-call poll would find the SAME session still 'active'
      // (neither party ended it) right after this client tore it down.
      stubFetch({
        '/api/dm/calls/pending': () =>
          JSON_RESP({
            success: true,
            call: {
              id: 'call-leave-3',
              conversationId: 'c1',
              callerId: 'u-bob',
              calleeId: 'u-me',
              callType: 'voice',
              status: 'active',
              startedAt: '',
              answeredAt: '',
              endedAt: null,
              createdAt: ''
            }
          })
      });

      handlePeerLeft('call-leave-3', 'Bob');
      // Teardown timeout elapses -> the session gets marked as peer-left.
      vi.advanceTimersByTime(3500);
      expect(dmState.call).toBeNull();

      await refreshPendingCall();
      // No incoming ring for the very call we just dropped: the user was
      // "kicked out" of a call, not being called by someone.
      expect(dmState.incomingCall).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a fresh session id is never suppressed by a previous peer-left', async () => {
    vi.useFakeTimers();
    try {
      setDmState('call', {
        call: {
          id: 'session-a', conversationId: 'c1', callerId: 'u-bob', calleeId: 'u-me',
          callType: 'voice', status: 'active', startedAt: '', answeredAt: '', endedAt: null, createdAt: ''
        },
        direction: 'incoming',
        remoteName: 'Bob',
        callState: 'connected',
        muted: false,
        videoOff: true,
        screenSharing: false,
        deafened: false
      });

      stubFetch({
        '/api/dm/calls/pending': () =>
          JSON_RESP({
            success: true,
            call: {
              id: 'session-b', conversationId: 'c1', callerId: 'u-bob', calleeId: 'u-me',
              callType: 'voice', status: 'ringing', startedAt: '', answeredAt: null, endedAt: null, createdAt: ''
            }
          })
      });

      handlePeerLeft('session-a', 'Bob');
      // Teardown suppresses only session-a; a brand-new call carries a new id.
      vi.advanceTimersByTime(3500);
      expect(dmState.call).toBeNull();

      await refreshPendingCall();
      expect(dmState.incomingCall?.call.id).toBe('session-b');
    } finally {
      vi.useRealTimers();
    }
  });
});