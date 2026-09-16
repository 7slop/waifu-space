// Shared types for the Discord-clone DM, presence & calling system.
// Used by both the server API routes (src/routes/api/dm/*) and the client
// library (src/lib/dm/*).

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';

export type MessageType = 'text' | 'gif' | 'image' | 'video' | 'system';

export type CallType = 'voice' | 'video' | 'screen';

export type CallStatus = 'ringing' | 'active' | 'ended' | 'declined' | 'missed' | 'canceled' | 'busy';

export interface DmUserLite {
  id: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  presenceStatus?: PresenceStatus;
  customStatus?: string;
}

/** A single emoji reaction bucket on a message (mirrors the DB aggregation). */
export interface DmReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface DmMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: MessageType;
  mediaUrl?: string | null;
  createdAt: string;
  /** Set when the sender edited the message; renders an "(edited)" marker. */
  editedAt?: string | null;
  /** Set when the sender deleted the message; renders "(deleted message)". */
  deletedAt?: string | null;
  /** Id of the message this one replies to, if any. */
  replyToId?: string | null;
  /** Per-emoji reaction buckets, empty when unreacted. */
  reactions?: DmReaction[];
}

export interface DmConversationSummary {
  id: string;
  type: 'dm';
  createdAt: string;
  updatedAt: string;
  lastReadAt?: string | null;
  unreadCount?: number;
  lastMessage?: DmMessage | null;
  otherUser: DmUserLite;
}

export interface UserPresence {
  userId: string;
  status: PresenceStatus;
  customStatus?: string | null;
  lastSeenAt: string;
}

export interface CallSession {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  callType: CallType;
  status: CallStatus;
  startedAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
}

export interface DmUserProfile {
  id: string;
  username: string;
  avatarUrl: string;
  bio: string;
  createdAt: string;
  stats: {
    coins: number;
    bondLevel: number;
    defenseHighWave: number;
    totalVictories: number;
    goblinsDefeated: number;
  };
  waifu: {
    name: string;
    personality: string;
    appearance: {
      outfit: string;
      accessory: string;
      hairstyle: string;
      avatarFrame: string;
      hairColor: string;
      eyeColor: string;
      skinTone: string;
      avatarMode: 'svg' | 'custom';
    };
  };
}

/** A saved favorite GIF (mirrors the `gif_favorites` table row). */
export interface GifFavorite {
  id: string;
  gifId: string;
  url: string;
  preview: string;
  width: number;
  height: number;
  title: string;
  provider: string;
  createdAt: string;
}

/** Metadata snapshot of a message, broadcast over Supabase Realtime.
 *
 * It intentionally does NOT carry message content, media URLs or reactions:
 * the realtime channels are anonymous (no RLS), so anything sensitive would
 * be readable by any subscriber. Recipients react to the event by refetching
 * the authoritative message list from the authenticated API.
 */
export interface DmMessageBroadcastMeta {
  id: string;
  conversationId: string;
  senderId: string;
  messageType: MessageType;
  createdAt: string;
}

/**
 * Payload broadcast over Supabase Realtime when a new message lands. The
 * embedded `message` is deliberately a metadata-only snapshot — never content.
 */
export interface DmMessageBroadcast {
  kind: 'dm-message';
  conversationId: string;
  message: DmMessageBroadcastMeta;
  senderName: string;
  senderAvatar?: string;
}

/**
 * WebRTC signal types that ride the DB-backed call-signal queue. Hang-ups,
 * declines and busy rejections are delivered through the call session status
 * (update_call_session) + the status-poll loop, NOT through signals.
 */
export type CallSignalType = 'offer' | 'answer' | 'ice';

/**
 * Payload broadcast over Supabase Realtime when a call is offered.
 *
 * Note: call offers no longer ride realtime — the caller stores an `offer`
 * signal in the DB queue (see `CallStoredSignal`) and the callee's
 * refreshPendingCall poll hydrates it from there. This type is kept only to
 * describe the legacy/inbound shape used by tests and older UI code paths.
 */
export interface CallOfferBroadcast {
  kind: 'call-offer';
  call: CallSession;
  callerName: string;
  callerAvatar?: string | null;
  offer?: RTCSessionDescriptionInit;
  leftNotice?: string | null;
}

export interface CallSignalPayload {
  kind: 'call-signal';
  callId: string;
  conversationId: string;
  type: CallSignalType;
  targetUserId?: string;
  senderId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  reason?: string;
  /** DB createdAt of the queued row this payload was decoded from (newest-wins glare resolution). */
  createdAt?: string;
}

/** A queued WebRTC signal row from `public.call_signals` (via the API). */
export interface CallStoredSignal {
  id: string;
  callId: string;
  conversationId: string;
  senderId: string;
  signalType: CallSignalType;
  payload: {
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
    reason?: string;
  };
  createdAt: string;
}

export interface TypingBroadcast {
  kind: 'typing';
  conversationId: string;
  userId: string;
  userName: string;
  at: number;
}

/**
 * Payload broadcast over Supabase Realtime when someone toggles a reaction.
 * No reaction buckets (user ids) or message content rides the anonymous
 * channel; recipients refetch the message via the authenticated API.
 */
export interface ReactionBroadcast {
  kind: 'dm-reaction';
  conversationId: string;
  messageId: string;
  emoji: string;
  action: 'add' | 'remove';
  userId: string;
  userName: string;
}

/** Result of the react toggle RPC. */
export interface ReactionToggleResult {
  action: 'add' | 'remove';
  emoji: string;
  reactions: DmReaction[];
}