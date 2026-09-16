import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type {
  DmMessageBroadcast,
  PresenceStatus,
  ReactionBroadcast,
  TypingBroadcast
} from './types';
import { isVisiblePresence } from './presence';

// ---------------------------------------------------------------------------
// Realtime manager
//
// Layered on top of Supabase Realtime broadcast + presence channels. These
// channels are open to anonymous clients (no RLS), which is exactly what we
// need because the app authenticates with its own HMAC sessions, not Supabase
// JWTs. The database (via RPCs) remains the source of truth; realtime only
// delivers the "edge" events so the UI can update instantly.
//
// Because the channels are anonymous, they must NEVER carry sensitive data:
// `sendMessage` strips every message down to a metadata-only snapshot and
// `sendReaction` drops the reaction buckets before broadcasting. Recipients
// of those events refetch the authoritative payload over the authenticated
// REST API (see syncConversationAfterEvent in the store).
//
// Call signaling does NOT ride realtime at all. SDP offers/answers and ICE
// candidates are stored in the `call_signals` table through authenticated
// REST routes and polled by each participant while a call is live, so nothing
// WebRTC-shaped ever crosses an anonymous channel.
//
// Channel layout:
//   - presence        : shared channel, every visible user tracks one entry.
//   - dm-<convId>     : one per conversation, joined while it is open (message
//                       metadata + typing + reactions only).
// ---------------------------------------------------------------------------

export interface RealtimePresencePayload {
  userId: string;
  username: string;
  avatar?: string;
  status: PresenceStatus;
  customStatus?: string;
  at: number;
}

export interface DmRealtimeHandlers {
  onMessage(broadcast: DmMessageBroadcast): void;
  onTyping(broadcast: TypingBroadcast): void;
  onReaction(broadcast: ReactionBroadcast): void;
  onPresenceChange(presence: Record<string, RealtimePresencePayload>): void;
}

export interface DmRealtimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const PRESENCE_CHANNEL = 'waifu-space-dm-presence';

// The typed RealtimeChannel.on() has no presence-specific overload that this
// TS version matches reliably, so presence listeners are attached through a
// small structural facade that resolves to the real overloads downstream.
type PresenceBindable = {
  on(
    event: 'presence',
    filter: { event: 'sync' | 'join' | 'leave' },
    callback: (ctx: any, presence: any) => void
  ): RealtimeChannel;
};

export class DmRealtime {
  private client: SupabaseClient | null = null;
  private presenceChannel: RealtimeChannel | null = null;
  private convChannels = new Map<string, RealtimeChannel>();
  private handlers: DmRealtimeHandlers;
  private config: DmRealtimeConfig;
  private connected = false;
  private myUserId: string | null = null;
  private myPresence: RealtimePresencePayload | null = null;
  private presenceMap: Record<string, RealtimePresencePayload> = {};
  private channelReadyPromises = new Map<string, Promise<RealtimeChannel>>();

  constructor(config: DmRealtimeConfig, handlers: DmRealtimeHandlers) {
    this.config = config;
    this.handlers = handlers;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  getPresence(): Record<string, RealtimePresencePayload> {
    return { ...this.presenceMap };
  }

  private makeClient(): SupabaseClient {
    return createClient(this.config.supabaseUrl, this.config.supabaseAnonKey);
  }

  private handlePresenceState(): void {
    if (!this.presenceChannel) return;
    const next: Record<string, RealtimePresencePayload> = {};
    const state = this.presenceChannel.presenceState() as Record<string, Array<{ payload: RealtimePresencePayload }>>;
    for (const key of Object.keys(state)) {
      for (const entry of state[key] ?? []) {
        const payload = entry?.payload;
        if (payload?.userId) next[payload.userId] = payload;
      }
    }
    this.presenceMap = next;
    this.handlers.onPresenceChange(this.getPresence());
  }

  private async handlePresenceBroadcast(channel: RealtimeChannel, payload: RealtimePresencePayload): Promise<void> {
    if (!payload?.userId) return;
    const { userId } = payload;
    const state = (channel.presenceState() as Record<string, Array<{ payload: RealtimePresencePayload }>>)[userId] ?? [];
    // A user is present only while they have an active tracked presence.
    const current = state.map(e => e?.payload).find(p => p?.userId === userId);
    return this.applyPresenceEntry(userId, current ?? null);
  }

  private async applyPresenceEntry(userId: string, payload: RealtimePresencePayload | null): Promise<void> {
    if (payload && isVisiblePresence(payload.status)) {
      this.presenceMap[userId] = payload;
    } else {
      delete this.presenceMap[userId];
    }
    this.handlers.onPresenceChange(this.getPresence());
  }

  /** Connects the shared presence channel. */
  async connect(user: { id: string; username: string; avatar?: string }): Promise<void> {
    this.myUserId = user.id;
    this.client = this.makeClient();

    this.presenceChannel = this.client.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: user.id } }
    });

    const presence = this.presenceChannel as unknown as PresenceBindable;
    presence.on('presence', { event: 'sync' }, () => this.handlePresenceState());
    presence.on('presence', { event: 'join' }, (_ctx, presencePayload) => {
      const payload = presencePayload as RealtimePresencePayload | undefined;
      if (payload?.userId) {
        void this.handlePresenceBroadcast(this.presenceChannel!, payload);
      }
    });
    presence.on('presence', { event: 'leave' }, (_ctx, presencePayload) => {
      const payload = presencePayload as RealtimePresencePayload | undefined;
      if (payload?.userId) {
        // A user may still be live on another socket/tab sharing the presence
        // key: only drop them once no tracked presence rows remain.
        const state = (this.presenceChannel?.presenceState() as Record<string, Array<{ payload: RealtimePresencePayload }>>) ?? {};
        const remaining = (state[payload.userId] ?? []).some((e) => e?.payload?.userId === payload.userId);
        if (!remaining) {
          void this.applyPresenceEntry(payload.userId, null);
        }
      }
    });
    this.presenceChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.connected = true;
          this.presenceMap = {};
          this.handlePresenceState();
          if (this.myPresence && isVisiblePresence(this.myPresence.status)) {
            await this.trackPresence(this.myPresence);
          }
        }
      });
  }

  /** Tracks the current user on the shared presence channel (visible statuses only). */
  async trackPresence(payload: RealtimePresencePayload): Promise<void> {
    this.myPresence = payload;
    if (!this.presenceChannel) return;
    try {
      if (isVisiblePresence(payload.status)) {
        await this.presenceChannel.track(payload);
      } else {
        await this.presenceChannel.untrack();
      }
    } catch {
      // Realtime is best-effort; presence updates also round-trip through the DB.
    }
  }

  private isChannelJoined(chan: RealtimeChannel): boolean {
    return (chan as any).state === 'joined';
  }

  /**
   * Retrieves or creates a conversation channel, ensuring it reaches the
   * SUBSCRIBED state before returning so that broadcasts are pushed
   * immediately over WebSocket instead of failing or falling back to REST.
   */
  private async getOrCreateSubscribedChannel(conversationId: string): Promise<RealtimeChannel | null> {
    const client = this.client;
    if (!client) return null;

    let chan = this.convChannels.get(conversationId);
    let isNew = false;

    if (!chan) {
      chan = client.channel(`dm-${conversationId}`);
      chan
        .on('broadcast', { event: 'dm-message' }, ({ payload }) => this.handlers.onMessage(payload as DmMessageBroadcast))
        .on('broadcast', { event: 'typing' }, ({ payload }) => this.handlers.onTyping(payload as TypingBroadcast))
        .on('broadcast', { event: 'dm-reaction' }, ({ payload }) => this.handlers.onReaction(payload as ReactionBroadcast));
      this.convChannels.set(conversationId, chan);
      isNew = true;
    }

    if (!isNew && this.isChannelJoined(chan)) {
      return chan;
    }

    let readyPromise = this.channelReadyPromises.get(`dm-${conversationId}`);
    if (!readyPromise) {
      readyPromise = new Promise<RealtimeChannel>((resolve) => {
        let settled = false;
        const done = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            // Delete the entry so a failed settle (CHANNEL_ERROR / TIMED_OUT /
            // CLOSED / the 1.5 s fallback) causes the next call to retry the
            // subscribe rather than reuse a dead channel that silently drops
            // broadcasts forever.
            this.channelReadyPromises.delete(`dm-${conversationId}`);
            resolve(chan);
          }
        };
        const timeoutId = setTimeout(done, 1500); // 1.5s fallback to prevent blocking
        chan.subscribe((status) => {
          if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            done();
          }
        });
      });
      this.channelReadyPromises.set(`dm-${conversationId}`, readyPromise);
    }

    return readyPromise;
  }

  /** Joins a conversation channel to receive message/typing/reaction events. */
  async subscribeConversation(conversationId: string): Promise<void> {
    if (!this.client || !this.myUserId) return;
    await this.getOrCreateSubscribedChannel(conversationId);
  }

  async unsubscribeConversation(conversationId: string): Promise<void> {
    const chan = this.convChannels.get(conversationId);
    if (!chan) return;
    this.convChannels.delete(conversationId);
    this.channelReadyPromises.delete(`dm-${conversationId}`);
    if (this.client) await this.client.removeChannel(chan);
  }

  async sendMessage(broadcast: DmMessageBroadcast): Promise<void> {
    // Strip to a metadata-only snapshot: the conversation channels are open to
    // anonymous subscribers, so message content/media must never cross them.
    const message = {
      id: broadcast.message.id,
      conversationId: broadcast.message.conversationId,
      senderId: broadcast.message.senderId,
      messageType: broadcast.message.messageType,
      createdAt: broadcast.message.createdAt
    };
    await this.broadcast(`dm-${broadcast.conversationId}`, 'dm-message', { ...broadcast, message });
  }

  async sendTyping(payload: TypingBroadcast): Promise<void> {
    await this.broadcast(`dm-${payload.conversationId}`, 'typing', payload);
  }

  async sendReaction(payload: ReactionBroadcast): Promise<void> {
    const { reactions: _dropped, ...safe } = payload as ReactionBroadcast & { reactions?: unknown };
    await this.broadcast(`dm-${payload.conversationId}`, 'dm-reaction', safe);
  }

  private async broadcast(channelName: string, event: string, payload: unknown): Promise<void> {
    if (!this.client) return;
    try {
      const chan = await this.getOrCreateSubscribedChannel(channelName.slice(3));
      if (chan) {
        await chan.send({ type: 'broadcast', event, payload });
      }
    } catch {
      // Realtime is best-effort for the "edge" notifications; DB is source of truth.
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.myUserId = null;
    this.myPresence = null;
    const client = this.client;
    const channels = [
      this.presenceChannel,
      ...Array.from(this.convChannels.values())
    ].filter(Boolean) as RealtimeChannel[];
    this.convChannels.clear();
    this.channelReadyPromises.clear();
    this.presenceMap = {};
    this.presenceChannel = null;
    this.client = null;
    if (client) {
      for (const ch of channels) {
        try {
          await client.removeChannel(ch);
        } catch {
          // ignore
        }
      }
    }
  }
}