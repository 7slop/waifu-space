import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import type {
  CallSession,
  CallSignalPayload,
  CallStoredSignal,
  CallType,
  DmConversationSummary,
  DmMessage,
  DmMessageBroadcast,
  DmReaction,
  DmUserLite,
  GifFavorite,
  MessageType,
  PresenceStatus,
  ReactionBroadcast,
  TypingBroadcast,
  UserPresence
} from './types';
import {
  classifyOutgoingMessage,
  createCallRequest,
  createConversation,
  fetchMessages,
  fetchMyPresence,
  fetchPendingCall,
  fetchPresenceBatch,
  fetchUnread,
  GifItem,
  listConversations,
  markConversationRead,
  mergeMessageLists,
  searchGifs,
  searchUsers,
  sendMessageRequest,
  setMyPresenceRequest,
  fetchCallStatus,
  updateCallStatusRequest,
  updateMessageRequest,
  deleteMessageRequest,
  toggleReactionRequest,
  listGifFavorites,
  addGifFavorite,
  removeGifFavorite,
  gifKeyOfUrl,
  fetchUserProfileRequest,
  heartbeatPresenceRequest,
  sendCallSignalRequest,
  fetchCallSignalsRequest
} from './api';
import { DmRealtime, RealtimePresencePayload } from './realtime';
import { CallManager, CallState, defaultPeerConfiguration, setAudioSdpSurgery } from './call';
import { t } from '../i18n';

// ---------------------------------------------------------------------------
// Client-side DM store
//
// Single reactive source of truth for the DM UI: conversations, messages,
// presence, search and the in-flight call. It talks to the server through the
// RPC-backed routes (./api) and to the world through Supabase Realtime
// (./realtime). The dependency injection (auth supplier + notifier) keeps this
// module fully unit-testable without a browser.
// ---------------------------------------------------------------------------

export interface DmAuth {
  token: string;
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface DmRuntimeDeps {
  getAuth: () => DmAuth | null;
  notify?: (opts: { title: string; body: string }) => void;
  iceServers?: RTCConfiguration['iceServers'];
}

export interface DmCallUi {
  call: CallSession;
  direction: 'incoming' | 'outgoing';
  remoteName: string;
  remoteAvatar?: string | null;
  callState: CallState;
  muted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
  /** Discord-style "deafen": all audio muted (incoming + outgoing). */
  deafened: boolean;
  leftNotice?: string | null;
}

/**
 * A ringing/active call surfaced to the user for accept/decline (or rejoin),
 * hydrated and refreshed from the DB — not from a realtime broadcast.
 */
export interface DmIncomingCall {
  call: CallSession;
  callerName: string;
  callerAvatar?: string | null;
  /** The caller's SDP offer, polled from the DB-backed signal queue. */
  offer?: RTCSessionDescriptionInit | null;
  leftNotice?: string | null;
}

export interface DmStoreState {
  ready: boolean;
  connecting: boolean;
  error: string | null;
  conversations: DmConversationSummary[];
  activeConversationId: string | null;
  loadingMessages: string[];
  hasOlder: Record<string, boolean>;
  messages: Record<string, DmMessage[]>;
  presence: Record<string, UserPresence>;
  realtimePresence: Record<string, RealtimePresencePayload>;
  myPresence: UserPresence | null;
  totalUnread: number;
  incomingCall: DmIncomingCall | null;
  call: DmCallUi | null;
  pendingIce: CallSignalPayload[];
  searchQuery: string;
  searchResults: DmUserLite[];
  gifQuery: string;
  gifResults: GifItem[];
  gifUnavailable: boolean;
  gifOpen: boolean;
  gifTab: 'search' | 'favorites';
  gifFavorites: GifItem[];
  emojiOpen: boolean;
  typing: Record<string, string[]>;
  /** Id of the message the composer is currently replying to, if any. */
  replyingTo: string | null;
}

interface PendingIncomingCall {
  call: CallSession;
  callerName: string;
  callerAvatar?: string | null;
}

interface DmRuntime {
  deps: DmRuntimeDeps;
  realtime: DmRealtime | null;
  call: CallManager | null;
  pendingAccept: PendingIncomingCall | null;
  mutedBeforeDeafen: boolean;
  lastTypingEmit: number;
  /** Whether the last presence write came from the auto monitor. */
  presenceOrigin: 'auto' | 'manual';
  pendingPollTimer: ReturnType<typeof setInterval> | null;
  callStatusPollTimer: ReturnType<typeof setInterval> | null;
  callSignalPollTimer: ReturnType<typeof setInterval> | null;
  /** Per-call poll watermark: highest `createdAt` of signals already applied. */
  signalCursor: Map<string, string>;
  /** Per-call DB `createdAt` of the latest offer we sent (newest-wins glare resolution). */
  lastOfferSent: Map<string, string>;
  peerLeftTimeout: ReturnType<typeof setTimeout> | null;
}

const runtime: DmRuntime = {
  deps: { getAuth: () => null, notify: undefined },
  realtime: null,
  call: null,
  pendingAccept: null,
  mutedBeforeDeafen: false,
  lastTypingEmit: 0,
  presenceOrigin: 'manual',
  pendingPollTimer: null,
  callStatusPollTimer: null,
  callSignalPollTimer: null,
  signalCursor: new Map<string, string>(),
  lastOfferSent: new Map<string, string>(),
  peerLeftTimeout: null
};

/** How often the store re-polls the DB for a pending (ringing/active) call. */
const PENDING_CALL_POLL_MS = 2_500;

/** How often queued call signals are polled while a call is live. */
const CALL_SIGNAL_POLL_MS = 800;

const INITIAL: DmStoreState = {
  ready: false,
  connecting: false,
  error: null,
  conversations: [],
  activeConversationId: null,
  loadingMessages: [],
  hasOlder: {},
  messages: {},
  presence: {},
  realtimePresence: {},
  myPresence: null,
  totalUnread: 0,
  incomingCall: null,
  call: null,
  pendingIce: [],
  searchQuery: '',
  searchResults: [],
  gifQuery: '',
  gifResults: [],
  gifUnavailable: false,
  gifOpen: false,
  gifTab: 'search',
  gifFavorites: [],
  emojiOpen: false,
  typing: {},
  replyingTo: null
};

export const [dmState, setDmState] = createStore<DmStoreState>(JSON.parse(JSON.stringify(INITIAL)));

/** Configures runtime deps (auth + notifier). Call once at app boot. */
export function configureDmRuntime(deps: DmRuntimeDeps): void {
  runtime.deps = { notify: defaultNotify, ...deps };
}

function currentAuth(): DmAuth | null {
  return runtime.deps.getAuth();
}

function notify(title: string, body: string): void {
  runtime.deps.notify?.({ title, body });
}

function defaultNotify({ title, body }: { title: string; body: string }): void {
  void (async () => {
    const { sendNotification } = await import('../notifications');
    const { showToast } = await import('../store');
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      sendNotification(title, body);
    } else {
      showToast(`${title} — ${body}`);
    }
  })();
}

// ---------------------------------------------------------------------------
// Realtime wiring
// ---------------------------------------------------------------------------

function onRealtimeMessage(broadcast: DmMessageBroadcast): void {
  const auth = currentAuth();
  const meta = broadcast.message;
  const convId = broadcast.conversationId;
  const isSystem = meta.messageType === 'system';
  const isMine = !!auth && meta.senderId === auth.id;

  // The broadcast carries only metadata (channels are anonymous); refetch the
  // authoritative message list + unread counters so the UI reflects reality.
  syncConversationAfterEvent(convId);

  if (!isMine && !isSystem) {
    const dnd = dmState.presence[meta.senderId]?.status === 'dnd';
    const sender = broadcast.senderName || dmState.conversations.find(c => c.id === convId)?.otherUser?.username || 'Someone';
    const attachment = meta.messageType === 'gif' ? 'Sent a GIF' : meta.messageType === 'image' ? 'Sent an image' : meta.messageType === 'video' ? 'Sent a video' : 'sent a message';
    if (!dnd) notify(sender, attachment);
  }
}

function onRealtimeTyping(broadcast: TypingBroadcast): void {
  if (broadcast.userId === currentAuth()?.id) return;
  if (dmState.conversations.find(c => c.id === broadcast.conversationId) === undefined) return;
  setDmState('typing', broadcast.conversationId, (prev) => {
    const next = (prev ?? []).filter(id => id !== broadcast.userId);
    next.push(broadcast.userId);
    if (next.length > 5) next.splice(0, next.length - 5);
    return next;
  });
  setTimeout(() => {
    const current = dmState.typing[broadcast.conversationId];
    if (current?.includes(broadcast.userId)) {
      const remaining = current.filter(id => id !== broadcast.userId);
      if (remaining.length === 0) {
        setDmState('typing', broadcast.conversationId, []);
      } else {
        setDmState('typing', broadcast.conversationId, remaining);
      }
    }
  }, 5000);
}

/** Replaces a message's reaction buckets with the authoritative list. */
function applyReactionReactions(msgs: DmMessage[], messageId: string, reactions: DmReaction[]): DmMessage[] {
  return msgs.map(m => (m.id === messageId ? { ...m, reactions } : m));
}

const inFlightConversationSyncs = new Map<string, Promise<void>>();

/**
 * Merges a freshly-fetched authoritative message page into loaded state:
 * matching ids are replaced (so reactions/edits/deletes land), new ids are
 * appended, and messages from older pages we've already scrolled fetch remain.
 */
function mergeAuthoritativeMessages(prev: DmMessage[], authoritative: DmMessage[]): DmMessage[] {
  const byId = new Map(prev.map(m => [m.id, m]));
  for (const m of authoritative) {
    if (m?.id) byId.set(m.id, m);
  }
  return Array.from(byId.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/**
 * Refetches the authoritative conversations + unread counters (and the open
 * message page, when loaded) after a realtime event whose broadcast payload
 * deliberately carries no content. Coalesces bursts: events while a sync is
 * in flight are dropped, the next event picks up the latest state.
 */
function syncConversationAfterEvent(conversationId: string): void {
  if (inFlightConversationSyncs.has(conversationId)) return;
  const run = (async () => {
    const auth = currentAuth();
    if (!auth) return;
    try {
      const [convs, unread] = await Promise.all([
        listConversations(auth.token),
        fetchUnread(auth.token)
      ]);
      setDmState('conversations', convs);
      setDmState('totalUnread', unread);
      if (Array.isArray(dmState.messages[conversationId])) {
        const msgs = await fetchMessages(auth.token, conversationId, { limit: 50 });
        setDmState('messages', conversationId, (prev = []) => mergeAuthoritativeMessages(prev, msgs));
      }
    } catch {
      // Best-effort sync; the DB is the source of truth and the next event or
      // open/refresh action re-syncs.
    }
  })();
  inFlightConversationSyncs.set(conversationId, run.finally(() => inFlightConversationSyncs.delete(conversationId)));
}

/** Waits for all in-flight post-event conversation syncs to settle (tests). */
export async function flushConversationSyncs(): Promise<void> {
  while (inFlightConversationSyncs.size > 0) {
    const pending = Array.from(inFlightConversationSyncs.values());
    await Promise.all(pending);
  }
}

function onRealtimeReaction(broadcast: ReactionBroadcast): void {
  if (broadcast.userId === currentAuth()?.id) return;
  const convId = broadcast.conversationId;
  if (!Array.isArray(dmState.messages[convId])) return;
  // No reaction buckets ride the anonymous channel; refetch to get them.
  syncConversationAfterEvent(convId);
}

/** Optimistically toggles the reacting user in/out of a bucket (pure). */
function optimisticToggleReaction(msgs: DmMessage[], messageId: string, emoji: string, userId: string): DmMessage[] {
  return msgs.map(m => {
    if (m.id !== messageId) return m;
    const list = m.reactions ?? [];
    const bucket = list.find(r => r.emoji === emoji);
    if (bucket && bucket.userIds.includes(userId)) {
      const next = bucket.count <= 1
        ? list.filter(r => r.emoji !== emoji)
        : list.map(r => (r.emoji === emoji ? { ...r, count: r.count - 1, userIds: r.userIds.filter(u => u !== userId) } : r));
      return { ...m, reactions: next };
    }
    const next = bucket
      ? list.map(r => (r.emoji === emoji ? { ...r, count: r.count + 1, userIds: [...r.userIds, userId] } : r))
      : [...list, { emoji, count: 1, userIds: [userId] }];
    return { ...m, reactions: next };
  });
}

function onRealtimePresence(map: Record<string, RealtimePresencePayload>): void {
  setDmState('realtimePresence', map);
}

/**
 * Stores a WebRTC signal (offer/answer/ice) in the DB-backed queue. The peer
 * picks it up via its own authenticated signal poll; nothing call-shaped rides
 * the anonymous realtime channels. Failures are fire-and-forget — transient
 * losses are absorbed by the peer's signal poll retrying against the DB.
 */
function sendSignal(type: CallSignalPayload['type'], callId: string, _conversationId: string, extras: Partial<CallSignalPayload>): void {
  const auth = currentAuth();
  if (!auth || !callId || callId === 'undefined' || callId === 'null') return;
  // Optimistically mark our offer as the newest so an older peer offer that
  // races in before the enqueue response cannot be answered (crossed SDPs).
  if (type === 'offer') runtime.lastOfferSent.set(callId, new Date().toISOString());
  let retried = false;
  const attempt = (): void => {
    void sendCallSignalRequest(auth.token, callId, type, { sdp: extras.sdp, candidate: extras.candidate, reason: extras.reason })
      .then((signal) => {
        // Replace the optimistic mark with the authoritative DB timestamp; if the
        // row failed to persist, drop it so the peer's offer is still honored.
        if (type === 'offer') {
          if (signal?.createdAt) runtime.lastOfferSent.set(callId, signal.createdAt);
          else runtime.lastOfferSent.delete(callId);
        }
        return signal;
      })
      .catch(() => {
        if (type === 'offer') {
          // A lost renegotiation offer silently hides a camera/screen share
          // from the peer — retry once before giving up. The optimistic
          // lastOfferSent mark stays armed across the retry so a peer offer
          // arriving in between is not (wrongly) answered.
          if (retried) {
            runtime.lastOfferSent.delete(callId);
          } else {
            retried = true;
            setTimeout(attempt, CALL_SIGNAL_POLL_MS);
          }
        }
      });
  };
  attempt();
}

const pendingInboundIce = new Map<string, RTCIceCandidateInit[]>();

function drainInboundIce(callId: string, manager: CallManager): void {
  const buffered = pendingInboundIce.get(callId);
  if (buffered && buffered.length) {
    pendingInboundIce.delete(callId);
    for (const c of buffered) {
      void manager.adoptIce(c);
    }
  }
}

function flushPendingIce(conversationId: string, callId: string): void {
  const list = dmState.pendingIce.filter((s) => s.callId === callId);
  if (!list.length) return;
  setDmState('pendingIce', (all) => all.filter((s) => s.callId !== callId));
  for (const s of list) {
    if (s.candidate) sendSignal('ice', callId, conversationId, { candidate: s.candidate });
  }
}

/**
 * Call sessions this client just tore down with a peer-left. Refreshing the
 * pending-call poll right afterwards would surface the SAME session as an
 * incoming ring (its status is still 'active' because neither party ended it)
 * — which is what made users "get kicked out and instantly re-called" while
 * the other peer stays in the call. Suppress re-ringing those sessions until
 * they resolve or the TTL elapses; a fresh call session always has a new id
 * and is never suppressed.
 */
const suppressedPeerLeftCalls = new Map<string, number>();

function suppressPeerLeftCall(callId: string): void {
  if (!callId || callId === 'undefined' || callId === 'null') return;
  suppressedPeerLeftCalls.set(callId, Date.now() + 120_000);
}

function isPeerLeftSuppressed(callId: string): boolean {
  const expires = suppressedPeerLeftCalls.get(callId);
  if (expires === undefined) return false;
  if (expires <= Date.now()) {
    suppressedPeerLeftCalls.delete(callId);
    return false;
  }
  return true;
}

export function handlePeerLeft(callId: string, remoteName?: string): void {
  const call = dmState.call;
  if (!call || call.call.id !== callId) return;
  if (call.leftNotice) return;

  stopCallStatusPolling();
  stopCallSignalPolling();
  const name = remoteName || call.remoteName || 'User';
  setDmState('call', 'leftNotice', t('dm.userLeftVoiceChat', { name }));

  if (runtime.peerLeftTimeout) {
    clearTimeout(runtime.peerLeftTimeout);
  }

  runtime.peerLeftTimeout = setTimeout(() => {
    runtime.peerLeftTimeout = null;
    if (dmState.call?.call.id === callId) {
      runtime.call?.hangUp('ended');
      setDmState('call', null);
      setDmState('incomingCall', null);
      setLocalStreamSignal(null);
      setRemoteStreamSignal(null);
      runtime.call = null;
      runtime.pendingAccept = null;
      runtime.signalCursor.delete(callId);
      runtime.lastOfferSent.delete(callId);
      pendingInboundIce.delete(callId);
      // Do not let the pending-call poll re-ring the very session we just left.
      suppressPeerLeftCall(callId);
      startPendingCallPoll();
    }
  }, 3500);
}

async function handleCallSignal(signal: CallSignalPayload): Promise<void> {
  const auth = currentAuth();
  if (auth && signal.senderId && signal.senderId === auth.id) return;

  const manager = runtime.call;
  const call = dmState.call;

  if (signal.type === 'offer') {
    // Newest-wins glare resolution: if we already have an offer in flight for
    // this call, only an offer NEWER than ours may be answered. Answering an
    // older peer offer while our own is queued produces crossed SDPs where
    // both sides are answering each other's descriptions — no media flows.
    const oursSent = runtime.lastOfferSent.get(signal.callId);
    if (oursSent && signal.createdAt && new Date(signal.createdAt).getTime() <= new Date(oursSent).getTime()) {
      return;
    }
    // Caller's offer for an incoming call the user already accepted.
    if (runtime.pendingAccept && signal.callId === runtime.pendingAccept.call.id && signal.sdp) {
      // Only meaningful while the accepted call is still live: once the call
      // was torn down (peer-left timeout, hang-up, triggered end) the offer is
      // stale and must not resurrect the session or send a late answer.
      if (!call || call.call?.id !== signal.callId) {
        runtime.pendingAccept = null;
        return;
      }
      const pending = runtime.pendingAccept;
      runtime.pendingAccept = null;
      if (manager) {
        const answer = await manager.acceptOffer(pending.call.id, pending.call.callerId, signal.sdp);
        if (answer) sendSignal('answer', pending.call.id, pending.call.conversationId, { sdp: answer });
        drainInboundIce(pending.call.id, manager);
        flushPendingIce(pending.call.conversationId, pending.call.id);
      }
      return;
    }
    // An offer arrived for an in-progress or ringing call (renegotiation).
    if (call && manager && signal.callId === call.call.id && signal.sdp) {
      const remoteId = call.direction === 'outgoing' ? call.call.calleeId : call.call.callerId;
      if (call.direction === 'outgoing' && call.callState === 'ringing' && signal.senderId !== remoteId) {
        return;
      }
      const answer = await manager.acceptOffer(call.call.id, remoteId, signal.sdp);
      if (answer) sendSignal('answer', call.call.id, call.call.conversationId, { sdp: answer });
      if (call.callState === 'ringing' || call.callState === 'active') {
        setDmState('call', 'callState', 'connected');
      }
      drainInboundIce(call.call.id, manager);
      flushPendingIce(call.call.conversationId, call.call.id);
      return;
    }
    return;
  }

  if (!call || signal.callId !== call.call.id) {
    if (signal.type === 'ice' && signal.candidate) {
      const list = pendingInboundIce.get(signal.callId) ?? [];
      list.push(signal.candidate);
      pendingInboundIce.set(signal.callId, list);
    }
    return;
  }

  if (signal.type === 'answer') {
    if (signal.sdp && manager) {
      await manager.adoptAnswer(signal.sdp);
      drainInboundIce(call.call.id, manager);
    }
    flushPendingIce(signal.conversationId, call.call.id);
    if (call.callState === 'ringing' || call.callState === 'active') {
      setDmState('call', 'callState', 'connected');
    }
  } else if (signal.type === 'ice' && signal.candidate) {
    if ((call.callState === 'connected' || call.callState === 'active') && manager) {
      await manager.adoptIce(signal.candidate);
    } else {
      const list = pendingInboundIce.get(signal.callId) ?? [];
      list.push(signal.candidate);
      pendingInboundIce.set(signal.callId, list);
    }
  }
}

/**
 * Fetches the offer + pre-accept ICE the caller queued for an incoming call.
 * Runs once when `refreshPendingCall` surfaces a ringing/active call so the
 * accept flow has the SDP already in hand; also seeds the poll watermark.
 */
async function hydrateIncomingSignals(callId: string, auth: DmAuth): Promise<void> {
  try {
    const signals = await fetchCallSignalsRequest(auth.token, callId);
    let offer: RTCSessionDescriptionInit | null = null;
    for (const s of signals) {
      if (s.senderId === auth.id) continue;
      if (s.signalType === 'offer' && s.payload?.sdp) offer = s.payload.sdp;
      else if (s.signalType === 'ice' && s.payload?.candidate) {
        const list = pendingInboundIce.get(callId) ?? [];
        list.push(s.payload.candidate);
        pendingInboundIce.set(callId, list);
      }
    }
    if (signals.length) {
      const last = signals[signals.length - 1];
      runtime.signalCursor.set(callId, last.createdAt);
    }
    if (offer && dmState.incomingCall?.call?.id === callId) {
      setDmState('incomingCall', (prev) => (prev ? { ...prev, offer } : prev));
    }
  } catch {
    // Non-fatal: acceptIncomingCall falls back to generating its own offer.
  }
}

/** Applies a system message to the local timeline and tells the peer via realtime. */
function applySystemMessage(convId: string, message: DmMessage | null | undefined): void {
  if (!message) return;
  setDmState('messages', convId, (prev = []) => mergeMessageLists([prev, [message]]));
  setDmState('conversations', (convs) => {
    if (!convs.some((c) => c.id === convId)) return convs;
    return convs
      .map((c) => (c.id === convId ? { ...c, lastMessage: message, updatedAt: message.createdAt } : c))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });
  void runtime.realtime?.sendMessage({
    kind: 'dm-message',
    conversationId: convId,
    message,
    senderName: '',
    senderAvatar: undefined
  });
}

function callTypeLabel(type: CallType): string {
  return type === 'screen' ? 'Screen share' : type === 'video' ? 'Video call' : 'Voice call';
}

// ---------------------------------------------------------------------------
// Call manager plumb + UI helpers
// ---------------------------------------------------------------------------

function makeCallManager(): CallManager {
  if (runtime.call) {
    runtime.call.hangUp('ended');
    runtime.call = null;
  }
  const manager = new CallManager({ iceServers: runtime.deps.iceServers });
  runtime.call = manager;
  return manager;
}

const [localStreamSignal, setLocalStreamSignal] = createSignal<MediaStream | null>(null, { equals: false });
const [remoteStreamSignal, setRemoteStreamSignal] = createSignal<MediaStream | null>(null, { equals: false });

function wireCallManager(call: CallSession, manager: CallManager): void {
  manager.deps.onLocalStream = (stream) => {
    setLocalStreamSignal(stream);
  };
  manager.deps.onRemoteStream = (stream) => {
    setRemoteStreamSignal(stream);
  };
  manager.deps.onStateChange = () => {
    setDmState('call', (prev) =>
      prev
        ? {
            ...prev,
            callState: manager.currentState,
            muted: manager.isMuted(),
            videoOff: manager.isVideoOff(),
            screenSharing: manager.isScreenSharing()
          }
        : prev
    );
    if (manager.currentState === 'ended' || manager.currentState === 'idle' || manager.currentState === 'failed') {
      setLocalStreamSignal(null);
      setRemoteStreamSignal(null);
    }
  };
  manager.deps.onIceCandidate = (candidate) => {
    const convId = call.conversationId;
    if (dmState.call?.callState === 'connected') {
      sendSignal('ice', call.id, convId, { candidate });
    } else {
      setDmState('pendingIce', (list) => [...list, { kind: 'call-signal', callId: call.id, conversationId: convId, type: 'ice', candidate }]);
    }
  };
  manager.deps.onRenegotiation = (offer, callId) => {
    if (callId !== call.id) return;
    sendSignal('offer', call.id, call.conversationId, { sdp: offer });
  };
  manager.deps.onPeerDisconnected = () => {
    // Only a call that actually connected has a peer whose drop means they
    // left. Before/while media is linking (ringing/active) a
    // connectionState/iceConnectionState of 'disconnected' or 'failed' is a
    // transient negotiation state that frequently recovers — surfacing it as
    // "left the voice chat" would stop the polls and tear the call down while
    // the peer is still there. The status poll resolves non-connected ends.
    if (dmState.call?.callState === 'connected') {
      handlePeerLeft(call.id, dmState.call?.remoteName);
    }
  };
}

export const callLocalStream = (): MediaStream | null => localStreamSignal() ?? runtime.call?.localMedia ?? null;
export const callRemoteStream = (): MediaStream | null => remoteStreamSignal() ?? runtime.call?.remoteMedia ?? null;

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

/** Boots the DM system: connects realtime, loads conversations + presence. */
export async function initDm(): Promise<boolean> {
  const auth = currentAuth();
  if (!auth) return false;
  setDmState({ connecting: true, error: null });
  try {
    const config = await (await fetch('/api/dm/config')).json();
    if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
      setDmState({ connecting: false, error: 'DM unavailable' });
      return false;
    }

    await runtime.realtime?.disconnect().catch(() => undefined);
    runtime.call?.hangUp('ended');
    runtime.call = null;

    const rt = new DmRealtime(config, {
      onMessage: onRealtimeMessage,
      onTyping: onRealtimeTyping,
      onReaction: onRealtimeReaction,
      onPresenceChange: onRealtimePresence
    });
    runtime.realtime = rt;

    await rt.connect({ id: auth.id, username: auth.username, avatar: auth.avatarUrl });

    const [convs, presence, unread] = await Promise.all([
      listConversations(auth.token),
      fetchMyPresence(auth.token),
      fetchUnread(auth.token)
    ]);
    setDmState({ conversations: convs, myPresence: presence, totalUnread: unread, ready: true, connecting: false });

    // Subscribe to every conversation channel for the whole session so message
    // metadata (and typing/reactions) arrive live no matter which page the user
    // is on (the channel set is small and unsubscribe only happens on
    // disconnect). Call signaling never rides realtime — see realtime.ts.
    for (const c of convs) void rt.subscribeConversation(c.id);

    const participantIds = Array.from(new Set(convs.flatMap(c => (c.otherUser?.id ? [c.otherUser.id] : []))));
    if (participantIds.length) {
      const batch = await fetchPresenceBatch(auth.token, participantIds);
      setDmState('presence', batch);
    }

    await rt.trackPresence({
      userId: auth.id,
      username: auth.username,
      avatar: auth.avatarUrl,
      status: visibleFromStored(presence.status),
      customStatus: presence.customStatus ?? undefined,
      at: Date.now()
    });

    // Load saved GIF favorites so message hover hearts reflect them before
    // the picker has ever been opened.
    void gifLoadFavorites();

    // Poll the DB for pending (ringing/active) calls so a refresh never hides
    // one; once surfaced, offers/answers/ICE are also pulled from the same DB
    // queue by the signal poll loop.
    void refreshPendingCall();
    startPendingCallPoll();
    return true;
  } catch (e) {
    setDmState({ connecting: false, error: e instanceof Error ? e.message : 'Failed to start DM' });
    return false;
  }
}

/** Starts the periodic pending-call poll; a no-op while one is already running. */
export function startPendingCallPoll(): void {
  runtime.pendingPollTimer ??= setInterval(() => void refreshPendingCall(), PENDING_CALL_POLL_MS);
}

/** Stops the periodic pending-call poll; safe to call repeatedly. */
export function stopPendingCallPoll(): void {
  if (runtime.pendingPollTimer) {
    clearInterval(runtime.pendingPollTimer);
    runtime.pendingPollTimer = null;
  }
}

function visibleFromStored(status: PresenceStatus): PresenceStatus {
  return status === 'invisible' || status === 'offline' ? 'offline' : status;
}

export async function refreshConversations(): Promise<DmConversationSummary[]> {
  const auth = currentAuth();
  if (!auth) return [];
  const convs = await listConversations(auth.token);
  setDmState('conversations', convs);
  const participantIds = Array.from(new Set(convs.flatMap(c => (c.otherUser?.id ? [c.otherUser.id] : []))));
  if (participantIds.length) {
    const batch = await fetchPresenceBatch(auth.token, participantIds);
    setDmState('presence', batch);
  }
  return convs;
}

export async function openConversation(otherUserId: string): Promise<void> {
  const auth = currentAuth();
  if (!auth) return;
  try {
    const conv = await createConversation(auth.token, otherUserId);
    await selectConversation(conv.id);
    await refreshConversations();
  } catch {
    setDmState('error', 'Could not open that conversation');
  }
}

export async function selectConversation(conversationId: string): Promise<void> {
  const auth = currentAuth();
  if (!auth) return;
  setDmState('activeConversationId', conversationId);
  if (dmState.messages[conversationId] === undefined) {
    setDmState('loadingMessages', (list) => (list.includes(conversationId) ? list : [...list, conversationId]));
    try {
      const msgs = await fetchMessages(auth.token, conversationId, { limit: 50 });
      setDmState('messages', conversationId, msgs);
      setDmState('hasOlder', conversationId, msgs.length === 50);
    } finally {
      setDmState('loadingMessages', (list) => list.filter(id => id !== conversationId));
    }
  }
  void runtime.realtime?.subscribeConversation(conversationId);
  const conv = dmState.conversations.find(c => c.id === conversationId);
  if (conv && (conv.unreadCount ?? 0) > 0) {
    void markRead(conversationId);
  }
}

async function markRead(conversationId: string): Promise<void> {
  const auth = currentAuth();
  if (!auth) return;
  try {
    await markConversationRead(auth.token, conversationId);
    setDmState('conversations', (convs) => convs.map(c => (c.id === conversationId ? { ...c, unreadCount: 0, lastReadAt: new Date().toISOString() } : c)));
    const unread = await fetchUnread(auth.token);
    setDmState('totalUnread', unread);
  } catch {
    // ignore
  }
}

export async function loadOlder(): Promise<void> {
  const auth = currentAuth();
  const convId = dmState.activeConversationId;
  if (!auth || !convId) return;
  const existing = dmState.messages[convId];
  if (!existing?.length) return;
  setDmState('loadingMessages', (list) => (list.includes(convId) ? list : [...list, convId]));
  try {
    const older = await fetchMessages(auth.token, convId, { before: existing[0].createdAt, limit: 50 });
    if (older.length) {
      setDmState('messages', convId, mergeMessageLists([older, existing]));
    }
    setDmState('hasOlder', convId, older.length === 50);
  } finally {
    setDmState('loadingMessages', (list) => list.filter(id => id !== convId));
  }
}

export async function sendText(text: string, replyToId?: string | null): Promise<DmMessage | null> {
  const auth = currentAuth();
  const convId = dmState.activeConversationId;
  if (!auth || !convId) return null;
  const { content, messageType, mediaUrl } = classifyOutgoingMessage(text);
  if (!content && !mediaUrl) return null;
  const msg = await sendViaApi(convId, { content, messageType, mediaUrl, replyToId });
  if (msg) setDmState('replyingTo', null);
  return msg;
}

export async function sendGif(url: string): Promise<DmMessage | null> {
  const auth = currentAuth();
  const convId = dmState.activeConversationId;
  if (!auth || !convId || !url) return null;
  return sendViaApi(convId, { content: '', messageType: 'gif', mediaUrl: url });
}

async function sendViaApi(convId: string, payload: { content: string; messageType: MessageType; mediaUrl: string | null; replyToId?: string | null }): Promise<DmMessage | null> {
  const auth = currentAuth();
  if (!auth) return null;
  try {
    const msg = await sendMessageRequest(auth.token, convId, payload);
    setDmState('messages', convId, (prev = []) => mergeMessageLists([prev, [msg]]));
    setDmState('conversations', (convs) =>
      convs
        .map(c => (c.id === convId ? { ...c, lastMessage: msg, updatedAt: msg.createdAt, unreadCount: 0 } : c))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    );
    const conv = dmState.conversations.find(c => c.id === convId);
    void runtime.realtime?.sendMessage({ kind: 'dm-message', conversationId: convId, message: msg, senderName: auth.username, senderAvatar: auth.avatarUrl });
    return msg;
  } catch {
    setDmState('error', 'Message failed to send');
    return null;
  }
}

/** Targets the next composed message at an earlier message (reply). */
export function setReplyTarget(messageId: string | null): void {
  setDmState('replyingTo', messageId);
}

/** Edits one of the current user's text messages in place. */
export async function editMessage(messageId: string, content: string): Promise<DmMessage | null> {
  const auth = currentAuth();
  const convId = dmState.activeConversationId;
  const trimmed = content.trim();
  if (!auth || !convId || !trimmed) return null;
  try {
    const msg = await updateMessageRequest(auth.token, convId, messageId, trimmed);
    setDmState('messages', convId, (prev = []) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...msg, reactions: m.reactions ?? msg.reactions }
          : m
      )
    );
    setDmState('conversations', (convs) =>
      convs.map((c) =>
        c.id === convId && c.lastMessage?.id === messageId ? { ...c, lastMessage: { ...c.lastMessage, ...msg } } : c
      )
    );
    return msg;
  } catch {
    setDmState('error', 'Message failed to edit');
    return null;
  }
}

/** Soft-deletes one of the current user's messages (renders as deleted). */
export async function deleteMessage(messageId: string): Promise<boolean> {
  const auth = currentAuth();
  const convId = dmState.activeConversationId;
  if (!auth || !convId) return false;
  try {
    await deleteMessageRequest(auth.token, convId, messageId);
    const deletedAt = new Date().toISOString();
    setDmState('messages', convId, (prev = []) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, deletedAt, content: '', mediaUrl: null, reactions: [] } : m
      )
    );
    setDmState('conversations', (convs) =>
      convs.map((c) =>
        c.id === convId && c.lastMessage?.id === messageId
          ? { ...c, lastMessage: { ...c.lastMessage, deletedAt, content: '', mediaUrl: null } }
          : c
      )
    );
    if (dmState.replyingTo === messageId) setDmState('replyingTo', null);
    return true;
  } catch {
    setDmState('error', 'Message failed to delete');
    return false;
  }
}

export function emitTyping(): void {
  const auth = currentAuth();
  const convId = dmState.activeConversationId;
  if (!auth || !convId) return;
  const now = Date.now();
  if (now - runtime.lastTypingEmit < 1500) return;
  runtime.lastTypingEmit = now;
  void runtime.realtime?.sendTyping({ kind: 'typing', conversationId: convId, userId: auth.id, userName: auth.username, at: now });
}

export async function setOwnPresence(status: PresenceStatus, customStatus?: string | null): Promise<void> {
  const auth = currentAuth();
  if (!auth) return;
  runtime.presenceOrigin = 'manual';
  try {
    const presence = await setMyPresenceRequest(auth.token, status, customStatus);
    setDmState('myPresence', presence);
    void runtime.realtime?.trackPresence({
      userId: auth.id,
      username: auth.username,
      avatar: auth.avatarUrl,
      status: visibleFromStored(status),
      customStatus: customStatus ?? undefined,
      at: Date.now()
    });
  } catch {
    setDmState('error', 'Could not update status');
  }
}

/**
 * Marks an automatic presence update (online->idle / online->offline) coming
 * from the presence auto-monitor so the store knows the current status was not
 * chosen by the user. Writes follow the same path as `setOwnPresence` but the
 * `presenceOrigin` stays 'auto'.
 */
export async function setOwnPresenceAuto(status: PresenceStatus, customStatus?: string | null): Promise<void> {
  const auth = currentAuth();
  if (!auth) return;
  runtime.presenceOrigin = 'auto';
  try {
    const presence = await setMyPresenceRequest(auth.token, status, customStatus);
    setDmState('myPresence', presence);
    void runtime.realtime?.trackPresence({
      userId: auth.id,
      username: auth.username,
      avatar: auth.avatarUrl,
      status: visibleFromStored(status),
      customStatus: customStatus ?? undefined,
      at: Date.now()
    });
  } catch {
    setDmState('error', 'Could not update status');
  }
}

/** Whether the last presence write was automatic (drives the auto monitor's gating). */
export function isAutoPresence(): boolean {
  return runtime.presenceOrigin === 'auto';
}

/**
 * Refreshes the last-seen timestamp on the server. If the stored status has
 * drifted to an auto-written 'offline' (e.g. a failed hide→show handoff) while
 * the page is demonstrably alive, the heartbeat re-raises it to 'online' so the
 * user is not left invisible to peers.
 */
export async function heartbeatPresence(): Promise<void> {
  const auth = currentAuth();
  if (!auth) return;
  try {
    await heartbeatPresenceRequest(auth.token);
    if (dmState.myPresence?.status === 'offline' && runtime.presenceOrigin === 'auto') {
      await setOwnPresenceAuto('online', dmState.myPresence.customStatus ?? null);
    }
  } catch {
    // Heartbeat failures are transient and non-critical.
  }
}

export async function dmSearch(query: string): Promise<DmUserLite[]> {
  const auth = currentAuth();
  const trimmed = query.trim();
  setDmState('searchQuery', query);
  if (!auth || trimmed.length < 2) {
    setDmState('searchResults', []);
    return [];
  }
  try {
    const users = await searchUsers(auth.token, trimmed);
    setDmState('searchResults', users);
    return users;
  } catch {
    setDmState('searchResults', []);
    return [];
  }
}

export function clearSearch(): void {
  setDmState({ searchQuery: '', searchResults: [] });
}

export async function gifSearch(query: string): Promise<GifItem[]> {
  const auth = currentAuth();
  setDmState('gifQuery', query);
  if (!auth) return [];
  try {
    const result = await searchGifs(auth.token, query);
    setDmState('gifResults', result.items);
    setDmState('gifUnavailable', result.source === 'none' && !result.keyConfigured);
    return result.items;
  } catch {
    setDmState('gifResults', []);
    return [];
  }
}

export function setGifOpen(open: boolean): void {
  setDmState('gifOpen', open);
}

export function setEmojiOpen(open: boolean): void {
  setDmState('emojiOpen', open);
}

/** Toggles the active user's emoji reaction on a message (optimistic). */
export async function toggleReaction(messageId: string, emoji: string): Promise<void> {
  const auth = currentAuth();
  const convId = dmState.activeConversationId;
  if (!auth || !convId || !messageId || !emoji) return;
  if (!Array.isArray(dmState.messages[convId])) return;
  const uid = auth.id;
  setDmState('messages', convId, (prev = []) => optimisticToggleReaction(prev, messageId, emoji, uid));
  try {
    const result = await toggleReactionRequest(auth.token, messageId, emoji);
    setDmState('messages', convId, (prev = []) => applyReactionReactions(prev, messageId, result.reactions));
    const broadcast: ReactionBroadcast = {
      kind: 'dm-reaction',
      conversationId: convId,
      messageId,
      emoji,
      action: result.action,
      userId: uid,
      userName: auth.username
    };
    void runtime.realtime?.sendReaction(broadcast);
  } catch {
    setDmState('messages', convId, (prev = []) => optimisticToggleReaction(prev, messageId, emoji, uid));
    setDmState('error', 'Reaction could not be saved');
  }
}

export function setGifTab(tab: 'search' | 'favorites'): void {
  setDmState('gifTab', tab);
  if (tab === 'favorites') void gifLoadFavorites();
}

export function isGifFavorited(id: string): boolean {
  return dmState.gifFavorites.some((f) => f.id === id);
}

function favToItem(f: GifFavorite): GifItem {
  return { id: f.gifId, url: f.url, preview: f.preview || f.url, width: f.width, height: f.height, title: f.title || undefined };
}

export async function gifLoadFavorites(): Promise<GifItem[]> {
  const auth = currentAuth();
  if (!auth) return [];
  try {
    const favorites = await listGifFavorites(auth.token);
    const items = favorites.map(favToItem);
    setDmState('gifFavorites', items);
    return items;
  } catch {
    setDmState('gifFavorites', []);
    return [];
  }
}

/** Toggles a GIF's favorite state by its picker key (provider id). */
export async function gifToggleFavorite(item: GifItem): Promise<boolean> {
  const auth = currentAuth();
  if (!auth) return false;
  const existing = dmState.gifFavorites.some((f) => f.id === item.id);
  try {
    if (existing) {
      await removeGifFavorite(auth.token, item.id);
      setDmState('gifFavorites', (list) => list.filter((f) => f.id !== item.id));
      return false;
    }
    const fav = await addGifFavorite(auth.token, {
      gifId: item.id,
      url: item.url,
      preview: item.preview || item.url,
      width: item.width || 0,
      height: item.height || 0,
      title: item.title || ''
    });
    setDmState('gifFavorites', (list) => [favToItem(fav), ...list.filter((f) => f.id !== item.id)]);
    return true;
  } catch {
    setDmState('error', 'Could not update favorite');
    return existing;
  }
}

/** Toggles favorite state for a media URL (used from rendered chat media). */
export async function gifToggleFavoriteByUrl(url: string, title = ''): Promise<void> {
  if (!url) return;
  const key = gifKeyOfUrl(url);
  await gifToggleFavorite({ id: key, url, preview: url, width: 0, height: 0, title });
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export async function startCall(type: CallType): Promise<boolean> {
  const auth = currentAuth();
  const conv = dmState.conversations.find((c) => c.id === dmState.activeConversationId);
  const otherId = conv?.otherUser?.id;
  if (!auth || !conv || !otherId) return false;
  if (dmState.call) return false;
  try {
    const result = await createCallRequest(auth.token, conv.id, otherId, type);
    if (result.joined) {
      // The server found an already-ringing or already-active call in this
      // conversation involving us. Adopt it instead of starting a fresh
      // ringing flow: do NOT ring the (already busy) callee a second time.
      return joinExistingCall(result.call, conv, auth);
    }
    const call = result.call;
    const manager = makeCallManager();
    const ok = await manager.startLocal({ type, audio: true, video: type === 'video', screen: type === 'screen' });
    if (!ok) {
      await updateCallStatusRequest(auth.token, call.id, 'canceled').catch(() => undefined);
      return false;
    }
    wireCallManager(call, manager);
    setDmState('call', {
      call,
      direction: 'outgoing',
      remoteName: conv.otherUser.username,
      remoteAvatar: conv.otherUser.avatarUrl,
      callState: 'ringing',
      muted: false,
      videoOff: type !== 'video',
      screenSharing: false,
      deafened: false
    });
    if (runtime.realtime) {
      await runtime.realtime.subscribeConversation(conv.id);
    }
    stopPendingCallPoll();
    startCallStatusPolling();
    startCallSignalPolling();
    const offer = await manager.createOffer(call.id, otherId);
    if (offer) {
      sendSignal('offer', call.id, conv.id, { sdp: offer });
    }
    return true;
  } catch (err) {
    const anyErr = err as any;
    if (anyErr?.status === 409) {
      setDmState('error', anyErr?.body?.error || (typeof anyErr?.message === 'string' ? anyErr.message : 'Callee is busy on another call'));
    } else {
      console.error('DEBUG startCall error:', err);
      setDmState('error', 'Call could not be started');
    }
    return false;
  }
}

/**
 * Adopts a call the server told us already exists (busy/ringing/active in the
 * same conversation). The remote side is already busy, so there is NO ringing
 * and no new incoming-call banner; the UI moves straight to the active dock.
 *
 * The handshake is intentionally role-stable: if the caller's SDP offer is
 * already queued we answer it, and if the call is still ringing and we are the
 * callee we wait for the caller's offer rather than creating our own. Only a
 * live/active call (or a ring we originated) makes the joiner produce a fresh
 * offer. This prevents the crossed-SDP glare that left both parties with no
 * audio or video after joining.
 */
async function joinExistingCall(call: CallSession, conv: DmConversationSummary, auth: DmAuth): Promise<boolean> {
  const manager = makeCallManager();
  const ok = await manager.startLocal({ type: call.callType, audio: true, video: call.callType === 'video', screen: call.callType === 'screen' });
  if (!ok) return false;
  wireCallManager(call, manager);
  setDmState('incomingCall', null);
  setDmState('call', {
    call,
    direction: 'outgoing',
    remoteName: conv.otherUser.username,
    remoteAvatar: conv.otherUser.avatarUrl,
    callState: 'active',
    muted: false,
    videoOff: call.callType !== 'video',
    screenSharing: false,
    deafened: false
  });
  void runtime.realtime?.subscribeConversation(call.conversationId);
  stopPendingCallPoll();
  startCallStatusPolling();
  startCallSignalPolling();

  const remoteId = call.calleeId === auth.id ? call.callerId : call.calleeId;

  // If the caller's offer is already queued and unanswered, adopt it. Creating
  // a second offer on top would let BOTH peers answer each other's SDPs —
  // crossed descriptions that never establish, so no audio/video flows.
  if (await adoptQueuedPeerOffer(call, remoteId, auth, manager)) return true;

  // Joining a still-ringing call we did NOT originate: stay on the accept side.
  // The caller's offer is either already handled above or hasn't landed yet —
  // the signal poll answers it the moment it appears. Never reverse roles.
  if (call.status === 'ringing' && call.callerId !== auth.id) {
    runtime.pendingAccept = {
      call,
      callerName: conv.otherUser.username,
      callerAvatar: conv.otherUser.avatarUrl
    };
    return true;
  }

  // Active call (or we originated the ring): the peer expects our offer, so
  // negotiate from the joiner side.
  const offer = await manager.createOffer(call.id, remoteId);
  if (offer) sendSignal('offer', call.id, call.conversationId, { sdp: offer });
  return true;
}

/**
 * Answers the peer's existing queued offer (if any is still unanswered) so a
 * party joining an in-progress call adopts the caller's SDP instead of
 * competing with it. Advances the signal watermark past the fetched rows so
 * the poll loop does not re-apply them. Returns true when an offer was adopted.
 */
async function adoptQueuedPeerOffer(call: CallSession, remoteId: string, auth: DmAuth, manager: CallManager): Promise<boolean> {
  let signals: CallStoredSignal[];
  try {
    signals = await fetchCallSignalsRequest(auth.token, call.id);
  } catch {
    return false;
  }
  if (!Array.isArray(signals) || !signals.length) return false;
  const lastRow = signals[signals.length - 1];
  if (lastRow?.createdAt) runtime.signalCursor.set(call.id, lastRow.createdAt);

  let peerOffer: RTCSessionDescriptionInit | null = null;
  let answeredLatest = true; // pessimistic: assume we already negotiated
  for (const s of signals) {
    if (s.senderId === auth.id) {
      if (s.signalType === 'answer') answeredLatest = true;
      continue;
    }
    if (s.signalType === 'offer' && s.payload?.sdp) {
      peerOffer = s.payload.sdp;
      answeredLatest = false;
    } else if (s.signalType === 'ice' && s.payload?.candidate) {
      const list = pendingInboundIce.get(call.id) ?? [];
      list.push(s.payload.candidate);
      pendingInboundIce.set(call.id, list);
    }
  }
  if (!peerOffer || answeredLatest) return false;

  const answer = await manager.acceptOffer(call.id, remoteId, peerOffer);
  if (answer) sendSignal('answer', call.id, call.conversationId, { sdp: answer });
  drainInboundIce(call.id, manager);
  flushPendingIce(call.conversationId, call.id);
  return true;
}

/**
 * Actively polls the server for status updates on an in-progress or ringing call.
 * Detects when the remote callee accepts (transitioning ringing -> connected),
 * declines, or terminates the call, guaranteeing peer synchronization even if
 * realtime WebRTC signaling packets are delayed or lost.
 */
export async function pollActiveCallStatus(): Promise<void> {
  const auth = currentAuth();
  const current = dmState.call;
  if (!auth || !current) {
    stopCallStatusPolling();
    return;
  }

  const callId = current.call?.id;
  if (!callId || callId === 'undefined' || callId === 'null') {
    return;
  }
  try {
    const latest = await fetchCallStatus(auth.token, callId);
    if (!dmState.call || dmState.call.call?.id !== callId) return;

    if (!latest) return;

    if (latest.status === 'active') {
      // Remote accepted the call. The real 'connected' transition waits for the
      // peer's answer to be adopted (markConnected only fires once SDP is
      // stable), so the dock never claims media is flowing before it can.
      if (runtime.call) {
        runtime.call.markConnected();
        drainInboundIce(callId, runtime.call);
        flushPendingIce(current.call.conversationId, callId);
      }
      setDmState('call', 'call', latest);
    } else if (['declined', 'busy', 'canceled', 'ended', 'missed'].includes(latest.status)) {
      if (dmState.call?.callState === 'connected') {
        handlePeerLeft(callId, current.remoteName);
      } else {
        stopCallStatusPolling();
        runtime.call?.hangUp(latest.status === 'declined' ? 'declined' : 'ended');
        setDmState('call', null);
        setDmState('incomingCall', null);
        setLocalStreamSignal(null);
        setRemoteStreamSignal(null);
        runtime.call = null;
        runtime.pendingAccept = null;
        runtime.signalCursor.delete(callId);
        runtime.lastOfferSent.delete(callId);
        pendingInboundIce.delete(callId);
        startPendingCallPoll();
      }
    }
  } catch {
    // Poll failures are transient; will retry on next tick
  }
}

export function startCallStatusPolling(): void {
  stopCallStatusPolling();
  runtime.callStatusPollTimer = setInterval(() => {
    void pollActiveCallStatus();
  }, 1200);
}

export function stopCallStatusPolling(): void {
  if (runtime.callStatusPollTimer) {
    clearInterval(runtime.callStatusPollTimer);
    runtime.callStatusPollTimer = null;
  }
}

export function startCallSignalPolling(): void {
  stopCallSignalPolling();
  runtime.callSignalPollTimer = setInterval(() => {
    void pollCallSignals();
  }, CALL_SIGNAL_POLL_MS);
}

export function stopCallSignalPolling(): void {
  if (runtime.callSignalPollTimer) {
    clearInterval(runtime.callSignalPollTimer);
    runtime.callSignalPollTimer = null;
  }
}

/**
 * Pulls queued WebRTC signals (offer/answer/ice) for the live call from the
 * DB, applying them to the call manager. Runs on an interval while a call is
 * in progress (started when a call starts or is accepted; stopped when it
 * ends). Services both directions:
 *   - caller: collects the callee's answer + trickle ICE,
 *   - callee: collects renegotiation offers + ICE arriving after accept.
 * `hydrateIncomingSignals` seeds the per-call cursor so the pre-accept burst
 * (fetched when the incoming ring first appeared) is not re-applied here.
 */
export async function pollCallSignals(): Promise<void> {
  const auth = currentAuth();
  const current = dmState.call;
  if (!auth || !current) {
    stopCallSignalPolling();
    return;
  }
  const callId = current.call?.id;
  if (!callId || callId === 'undefined' || callId === 'null') return;

  const cursor = runtime.signalCursor.get(callId);
  let signals;
  try {
    signals = await fetchCallSignalsRequest(auth.token, callId, cursor);
  } catch {
    return; // transient; retried next tick
  }
  if (!Array.isArray(signals) || !signals.length) return;
  if (dmState.call?.call?.id !== callId) return;

  for (const s of signals) {
    const ts = new Date(s.createdAt).getTime();
    const cur = runtime.signalCursor.get(callId);
    if (!cur || ts > new Date(cur).getTime()) runtime.signalCursor.set(callId, s.createdAt);
    if (s.senderId && s.senderId === auth.id) continue;
    await handleCallSignal({
      kind: 'call-signal',
      callId: s.callId || callId,
      conversationId: s.conversationId || current.call.conversationId,
      type: s.signalType,
      senderId: s.senderId,
      sdp: s.payload?.sdp,
      candidate: s.payload?.candidate,
      createdAt: s.createdAt
    });
  }
}

/**
 * DB poll for the newest ringing/active call the current user is a party to,
 * hydrating the incoming-call state (and its offer/ICE from the signal queue)
 * so a refresh never hides an in-progress call. Constantly verifies whether
 * ringing calls have been declined/canceled by the caller so stale incoming
 * banners are cleared. Runs alongside the realtime presence channels — the
 * calls themselves never ride realtime.
 */
export async function refreshPendingCall(): Promise<void> {
  const auth = currentAuth();
  if (!auth) return;
  if (dmState.call) return;

  // If an incoming call offer is currently ringing on screen, verify if it was declined, busy or canceled
  if (dmState.incomingCall) {
    const callId = dmState.incomingCall.call?.id;
    if (!callId || callId === 'undefined' || callId === 'null') return;
    try {
      const status = await fetchCallStatus(auth.token, callId);
      if (!status || status.status !== 'ringing') {
        if (dmState.incomingCall?.call?.id === callId) {
          setDmState('incomingCall', null);
          runtime.pendingAccept = null;
        }
      }
    } catch {
      // Non-fatal
    }
    return;
  }

  try {
    const call = await fetchPendingCall(auth.token);
    if (!call || (call.status !== 'ringing' && call.status !== 'active')) return;
    if (dmState.call || dmState.incomingCall) return;
    // Skip a session this client already tore down with a peer-left: its status
    // is still 'active' until a party updates it, and re-ringing the exact call
    // we just dropped is what makes users "get kicked out and instantly called
    // again" while the other peer stays in the call.
    if (isPeerLeftSuppressed(call.id)) return;
    // A still-ringing call where we are the caller is covered by our own
    // outgoing panel; do not surface incoming call banner for calls we initiated.
    if (call.status === 'ringing' && call.callerId === auth.id) return;

    const conv = dmState.conversations.find((c) => c.id === call.conversationId);
    const peerId = call.callerId === auth.id ? call.calleeId : call.callerId;

    let peerName = conv && conv.otherUser?.id === peerId ? conv.otherUser.username : '';
    let peerAvatar = conv && conv.otherUser?.id === peerId ? conv.otherUser.avatarUrl : null;

    if (!peerName) {
      try {
        const prof = await fetchUserProfileRequest(auth.token, peerId);
        if (prof?.username) peerName = prof.username;
        if (prof?.avatarUrl) peerAvatar = prof.avatarUrl;
      } catch {}
    }

    setDmState('incomingCall', { call, callerName: peerName || 'Unknown User', callerAvatar: peerAvatar });
    if (call.status === 'ringing') {
      notify(`${peerName || 'Someone'} is calling`, callTypeLabel(call.callType));
    }
    // Pull the caller's SDP offer (and any pre-accept ICE) from the DB queue
    // so acceptIncomingCall can connect immediately.
    void hydrateIncomingSignals(call.id, auth);
  } catch {
    // Poll failures are transient; will retry on next tick.
  }
}

export async function acceptIncomingCall(): Promise<boolean> {
  const auth = currentAuth();
  const offer = dmState.incomingCall;
  if (!auth || !offer) return false;
  if (dmState.call) return false;
  const { call, callerName } = offer;
  const conv = dmState.conversations.find((c) => c.id === call.conversationId);
  const remoteAvatar = offer.callerAvatar ?? conv?.otherUser?.avatarUrl ?? null;
  const manager = makeCallManager();
  const ok = await manager.startLocal({ type: call.callType, audio: true, video: call.callType === 'video', screen: call.callType === 'screen' });
  if (!ok) {
    setDmState('incomingCall', null);
    return false;
  }
  wireCallManager(call, manager);
  setDmState({
    incomingCall: null,
    call: {
      call,
      direction: 'incoming',
      remoteName: callerName,
      remoteAvatar,
      // With a hydrated offer the answer handshake immediately follows and
      // flips to 'connected' (via onStateChange). Without one (pendingAccept
      // awaiting the caller's DB-polled offer) the call is only 'active' —
      // accepted, media still linking — so the dock never claims an in-call
      // connection that has not been established yet.
      callState: offer.offer ? 'connected' : 'active',
      muted: false,
      videoOff: call.callType !== 'video',
      screenSharing: false,
      deafened: false
    }
  });
  if (runtime.realtime) {
    await runtime.realtime.subscribeConversation(call.conversationId);
  }
  stopPendingCallPoll();
  startCallStatusPolling();
  startCallSignalPolling();
  // Mark the call as answered on the server so both timelines get the
  // "call started" system message and the call session reflects the state.
  const result = await updateCallStatusRequest(auth.token, call.id, 'active').catch(() => null);
  if (result?.systemMessage) applySystemMessage(call.conversationId, result.systemMessage);
  if (offer.offer) {
    const answer = await manager.acceptOffer(call.id, call.callerId, offer.offer);
    if (answer) sendSignal('answer', call.id, call.conversationId, { sdp: answer });
    drainInboundIce(call.id, manager);
    flushPendingIce(call.conversationId, call.id);
    return true;
  }
  // Offer not yet arrived / hydrated via DB poll: store pendingAccept so the
  // signal poll loop processes the caller's offer when it arrives.  Do NOT
  // generate a fallback offer here — doing so causes both peers to send offers
  // simultaneously (role-reversal race) and fragile SDP collision recovery.
  runtime.pendingAccept = { call, callerName, callerAvatar: offer.callerAvatar };
  return true;
}

export async function declineIncomingCall(): Promise<void> {
  stopCallStatusPolling();
  if (runtime.peerLeftTimeout) {
    clearTimeout(runtime.peerLeftTimeout);
    runtime.peerLeftTimeout = null;
  }
  const auth = currentAuth();
  const offer = dmState.incomingCall;
  setDmState('incomingCall', null);
  runtime.pendingAccept = null;
  if (!auth || !offer) return;
  // No WebRTC signal needed to decline: the caller learns via its status poll
  // (ringing -> declined).
  const result = await updateCallStatusRequest(auth.token, offer.call.id, 'declined').catch(() => null);
  if (result?.systemMessage) applySystemMessage(offer.call.conversationId, result.systemMessage);
}

export async function hangUpCall(): Promise<void> {
  stopCallStatusPolling();
  if (runtime.peerLeftTimeout) {
    clearTimeout(runtime.peerLeftTimeout);
    runtime.peerLeftTimeout = null;
  }
  const auth = currentAuth();
  const call = dmState.call;

  if (!call) {
    // Caller canceled while ringing / user dismissed the incoming panel.
    const offer = dmState.incomingCall;
    setDmState('incomingCall', null);
    runtime.pendingAccept = null;
    if (auth && offer?.call.status === 'ringing') {
      const result = await updateCallStatusRequest(auth.token, offer.call.id, 'declined').catch(() => null);
      if (result?.systemMessage) applySystemMessage(offer.call.conversationId, result.systemMessage);
    }
    return;
  }

  const callId = call.call.id;
  const convId = call.call.conversationId;

  runtime.call?.hangUp('ended');
  stopCallSignalPolling();
  runtime.signalCursor.delete(callId);
  runtime.lastOfferSent.delete(callId);
  pendingInboundIce.delete(callId);
  if (auth) {
    const status = call.callState === 'ringing' ? (call.direction === 'outgoing' ? 'canceled' : 'declined') : 'ended';
    const result = await updateCallStatusRequest(auth.token, callId, status).catch(() => null);
    if (result?.systemMessage) applySystemMessage(convId, result.systemMessage);
  }
  setDmState('call', null);
  setDmState('incomingCall', null);
  setLocalStreamSignal(null);
  setRemoteStreamSignal(null);
  runtime.call = null;
  startPendingCallPoll();
}

export async function markCallBusyAndReject(): Promise<void> {
  stopCallStatusPolling();
  const auth = currentAuth();
  const offer = dmState.incomingCall;
  if (!auth || !offer) return;
  // No WebRTC signal needed: the caller learns via its status poll.
  const result = await updateCallStatusRequest(auth.token, offer.call.id, 'busy').catch(() => null);
  if (result?.systemMessage) applySystemMessage(offer.call.conversationId, result.systemMessage);
  setDmState('incomingCall', null);
  runtime.pendingAccept = null;
}

export function toggleMute(): boolean {
  const manager = runtime.call;
  if (!manager) return false;
  manager.toggleMute();
  setDmState('call', (prev) => (prev ? { ...prev, muted: manager.isMuted() } : prev));
  return manager.isMuted();
}

export function toggleVideo(): boolean {
  const manager = runtime.call;
  if (!manager) return false;
  manager.toggleVideo();
  setDmState('call', (prev) => (prev ? { ...prev, videoOff: manager.isVideoOff() } : prev));
  if (manager.localMedia) {
    setLocalStreamSignal(manager.localMedia);
  }
  return manager.isVideoOff();
}

/** Toggles screen sharing on/off during a connected call. */
export async function toggleScreenShare(): Promise<boolean> {
  const manager = runtime.call;
  if (!manager) return false;
  const sharing = manager.isScreenSharing();
  const ok = sharing ? await manager.disableScreenShare() : await manager.enableScreenShare();
  setDmState('call', (prev) => (prev ? { ...prev, screenSharing: manager.isScreenSharing(), videoOff: manager.isVideoOff() } : prev));
  if (manager.localMedia) {
    setLocalStreamSignal(manager.localMedia);
  }
  return ok;
}

/** Enables a camera feed mid-call when the call started as voice. */
export async function enableCallCamera(): Promise<boolean> {
  const manager = runtime.call;
  if (!manager) return false;
  const ok = await manager.ensureCamera();
  setDmState('call', (prev) => (prev ? { ...prev, videoOff: manager.isVideoOff() } : prev));
  if (manager.localMedia) {
    setLocalStreamSignal(manager.localMedia);
  }
  return ok;
}

/** Camera button: turn the camera off/on (acquiring one if needed). */
export async function cameraButtonPressed(): Promise<void> {
  const manager = runtime.call;
  if (!manager) return;
  const hasCam = typeof (manager as any).hasCameraTrack === 'function'
    ? (manager as any).hasCameraTrack()
    : manager.hasVideoTracks();
  if (hasCam) {
    manager.toggleVideo();
  } else {
    await manager.ensureCamera();
  }
  setDmState('call', (prev) => (prev ? { ...prev, videoOff: manager.isVideoOff(), screenSharing: manager.isScreenSharing() } : prev));
  if (manager.localMedia) {
    setLocalStreamSignal(manager.localMedia);
  }
}

/** Discord-style deafen: silences all audio and force-mutes the mic. */
export function toggleDeafen(): boolean {
  const manager = runtime.call;
  if (!manager) return false;
  const prev = dmState.call?.deafened ?? false;
  if (!prev) {
    runtime.mutedBeforeDeafen = manager.isMuted();
    if (!runtime.mutedBeforeDeafen) manager.toggleMute();
    manager.setRemoteAudioEnabled(false);
    setDmState('call', (c) => (c ? { ...c, deafened: true, muted: true } : c));
  } else {
    manager.setRemoteAudioEnabled(true);
    if (!runtime.mutedBeforeDeafen) manager.toggleMute();
    setDmState('call', (c) => (c ? { ...c, deafened: false, muted: manager.isMuted() } : c));
  }
  return !prev;
}

export function resetDmStore(): void {
  stopCallStatusPolling();
  stopCallSignalPolling();
  runtime.signalCursor = new Map<string, string>();
  runtime.lastOfferSent = new Map<string, string>();
  pendingInboundIce.clear();
  if (runtime.peerLeftTimeout) {
    clearTimeout(runtime.peerLeftTimeout);
    runtime.peerLeftTimeout = null;
  }
  setLocalStreamSignal(null);
  setRemoteStreamSignal(null);
  if (runtime.call) {
    try { runtime.call.hangUp('ended'); } catch {}
    runtime.call = null;
  }
  runtime.pendingAccept = null;
  inFlightConversationSyncs.forEach((sync) => sync.catch(() => undefined));
  inFlightConversationSyncs.clear();
  stopPendingCallPoll();
  setDmState(JSON.parse(JSON.stringify(INITIAL)));
}

export async function disconnectDm(): Promise<void> {
  stopCallStatusPolling();
  stopCallSignalPolling();
  stopPendingCallPoll();
  if (runtime.peerLeftTimeout) {
    clearTimeout(runtime.peerLeftTimeout);
    runtime.peerLeftTimeout = null;
  }
  runtime.call?.hangUp('ended');
  runtime.call = null;
  runtime.pendingAccept = null;
  // Broadcast offline to peers before tearing down the realtime connection
  // so they see the user go offline immediately rather than waiting for the
  // server-side staleness threshold.
  if (isAutoPresence()) {
    await setOwnPresenceAuto('offline', dmState.myPresence?.customStatus ?? null).catch(() => undefined);
  }
  await runtime.realtime?.disconnect().catch(() => undefined);
  runtime.realtime = null;
  resetDmStore();
}

if (typeof window !== 'undefined') {
  const onPageUnload = () => {
    stopCallSignalPolling();
    // An in-memory pendingAccept never survives a reload; drop it so the
    // restored page re-hydrates only from the DB-backed call session.
    runtime.pendingAccept = null;
    const call = dmState.call;
    const auth = currentAuth();
    if (!call || !auth || !runtime.call) return;
    const callId = call.call?.id;
    const convId = call.call?.conversationId;
    if (!callId || callId === 'undefined' || callId === 'null' || !convId) return;

    // Best-effort status beacon so the peer's status poll converges without
    // relying on this page's realtime socket, which is about to die.
    try {
      fetch(`/api/dm/calls/${callId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({ status: call.callState === 'ringing' ? 'canceled' : 'ended' }),
        keepalive: true
      });
    } catch {}
  };

  // Only beacon end/cancel on a real unload (navigation, refresh, tab close).
  // `pagehide` additionally fires when the page enters the back/forward cache
  // or a mobile browser suspends the tab — neither destroys the call, so
  // beaconing 'ended' there made "switching windows" look like a hang-up to
  // the peer.
  window.addEventListener('beforeunload', onPageUnload);

  // A backgrounded tab's timers are throttled and its ICE can blip; park the
  // peer-gone countdown while hidden so a window/app switch never reads as a
  // disconnect, and re-arm it if the transport is still down on return.
  document.addEventListener('visibilitychange', () => {
    runtime.call?.setPaused(document.visibilityState === 'hidden');
  });
}

/**
 * Zero-server ICE self-test: builds two RTCPeerConnections with the app's
 * EXACT default configuration and has them negotiate on this machine, in this
 * browser, right now. No Supabase, no signal routes — pure WebRTC.
 *
 *   - ok:true  → this browser CAN establish a peer transport; a silent call
 *                is therefore an app/signaling problem (watch [dm:api] 503s).
 *   - ok:false → this machine's Chrome cannot do ICE at all, regardless of the
 *                app. That is environmental (blocked UDP, odd sandbox/VM) and
 *                explains BOTH the silent calls and the "user disconnected"
 *                notices (the failed transport trips the 30s peer-gone timer).
 */
export interface DmIceSelfTestResult {
  ok: boolean;
  aCandidates: number;
  bCandidates: number;
  aGatheredTypes: string[];
  bGatheredTypes: string[];
  aIceGathering: RTCIceGatheringState | null;
  bIceGathering: RTCIceGatheringState | null;
  aConnection: RTCPeerConnectionState | null;
  bConnection: RTCPeerConnectionState | null;
  ms: number;
  error?: string;
}

export function runDmIceSelfTest(timeoutMs = 12000): Promise<DmIceSelfTestResult> {
  const ctor = typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null;
  const empty = (): DmIceSelfTestResult => ({
    ok: false,
    aCandidates: 0,
    bCandidates: 0,
    aGatheredTypes: [],
    bGatheredTypes: [],
    aIceGathering: null,
    bIceGathering: null,
    aConnection: null,
    bConnection: null,
    ms: 0
  });
  if (!ctor) return Promise.resolve({ ...empty(), error: 'RTCPeerConnection unavailable in this browser' });

  const pcA = new ctor(defaultPeerConfiguration());
  const pcB = new ctor(defaultPeerConfiguration());
  const aTypes: string[] = [];
  const bTypes: string[] = [];
  let aCount = 0;
  let bCount = 0;

  pcA.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    aCount += 1;
    const type = (ev.candidate as RTCIceCandidate).type;
    if (type) aTypes.push(type);
    void pcB.addIceCandidate(ev.candidate).catch(() => {});
  };
  pcB.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    bCount += 1;
    const type = (ev.candidate as RTCIceCandidate).type;
    if (type) bTypes.push(type);
    void pcA.addIceCandidate(ev.candidate).catch(() => {});
  };

  const snapshot = (ms: number, error?: string): DmIceSelfTestResult => ({
    ok: pcA.connectionState === 'connected' && pcB.connectionState === 'connected',
    aCandidates: aCount,
    bCandidates: bCount,
    aGatheredTypes: aTypes,
    bGatheredTypes: bTypes,
    aIceGathering: pcA.iceGatheringState,
    bIceGathering: pcB.iceGatheringState,
    aConnection: pcA.connectionState,
    bConnection: pcB.connectionState,
    ms,
    error
  });

  return new Promise((resolve) => {
    const started = Date.now();
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      try {
        pcA.close();
        pcB.close();
      } catch {}
    };
    const settleNow = (error?: string) => {
      close();
      resolve(snapshot(Date.now() - started, error));
    };

    void (async () => {
      try {
        const offer = await pcA.createOffer();
        await pcA.setLocalDescription(offer);
        await pcB.setRemoteDescription(offer);
        const answer = await pcB.createAnswer();
        await pcB.setLocalDescription(answer);
        await pcA.setRemoteDescription(answer);
      } catch (err) {
        settleNow(err instanceof Error ? err.message : String(err));
        return;
      }
      const timer = setTimeout(() => settleNow(`timeout after ${timeoutMs}ms`), timeoutMs);
      const check = () => {
        const st = snapshot(Date.now() - started);
        if (st.aConnection === 'connected' && st.bConnection === 'connected') {
          clearTimeout(timer);
          settleNow();
        } else if (st.aConnection === 'failed' || st.bConnection === 'failed') {
          clearTimeout(timer);
          settleNow(`connection failed (A=${st.aConnection}, B=${st.bConnection})`);
        }
      };
      pcA.onconnectionstatechange = check;
      pcB.onconnectionstatechange = check;
      pcA.oniceconnectionstatechange = check;
      pcB.oniceconnectionstatechange = check;
      check();
    })();
  });
}

/**
 * Console debug hook — call `JSON.stringify(__dmDebug(), null, 1)` in the
 * browser console during an active call to dump the connection state for both
 * peers.
 */
export function dmCallDebug(): Record<string, unknown> {
  const call = dmState.call;
  const manager = runtime.call;
  return {
    call: call ? { id: call.call?.id, direction: call.direction, callState: call.callState } : null,
    incomingCall: !!dmState.incomingCall,
    pendingIceCount: dmState.pendingIce.length,
    manager: manager ? manager.debugSnapshot() : null,
    hasLocalStream: !!localStreamSignal() || !!runtime.call?.localMedia,
    hasRemoteStream: !!remoteStreamSignal() || !!runtime.call?.remoteMedia,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null
  };
}

if (typeof window !== 'undefined') {
  (window as any).__dmDebug = Object.assign(dmCallDebug, {
    setSurgery: setAudioSdpSurgery,
    setPaused: (p: boolean) => runtime.call?.setPaused(p),
    selfTest: () => runDmIceSelfTest()
  });
}