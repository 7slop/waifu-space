// Shared types for the Discord-clone DM, presence & calling system.
// Used by both the server API routes (src/routes/api/dm/*) and the client
// library (src/lib/dm/*).

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';

export type MessageType = 'text' | 'gif';

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

export interface DmMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: MessageType;
  mediaUrl?: string | null;
  createdAt: string;
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

/** Payload broadcast over Supabase Realtime when a new message lands. */
export interface DmMessageBroadcast {
  kind: 'dm-message';
  conversationId: string;
  message: DmMessage;
  senderName: string;
  senderAvatar?: string;
}

/** Payload broadcast over Supabase Realtime when a call is offered. */
export interface CallOfferBroadcast {
  kind: 'call-offer';
  call: CallSession;
  callerName: string;
}

export interface CallSignalPayload {
  kind: 'call-signal';
  callId: string;
  type: 'offer' | 'answer' | 'ice';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface TypingBroadcast {
  kind: 'typing';
  conversationId: string;
  userId: string;
  userName: string;
  at: number;
}