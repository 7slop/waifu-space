import type {
  CallSession,
  CallStatus,
  CallType,
  DmConversationSummary,
  DmMessage,
  DmUserLite,
  DmUserProfile,
  MessageType,
  PresenceStatus,
  UserPresence
} from './types';

// ---------------------------------------------------------------------------
// Pure helpers (framework-free, unit-tested)
// ---------------------------------------------------------------------------

const IMAGE_MEDIAA_URL_RE =
  /\.(gif|webp|gifv)(\?.*)?$/i;
const KNOWN_PROVIDER_RE =
  /(tenor\.com|giphy\.com|media\.tenor\.com|media\.giphy\.com|i\.giphy\.media|media\.gif|gph\.is)/i;

/** True when a string looks like a direct image/GIF URL we can embed. */
export function isGifUrl(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (IMAGE_MEDIAA_URL_RE.test(trimmed.split('#')[0])) return true;
  return KNOWN_PROVIDER_RE.test(trimmed);
}

/** Trims/canonicalizes a pasted media URL, or null if not a media URL. */
export function normalizeGifUrl(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length > 2048) return null;
  if (!isGifUrl(trimmed)) return null;
  return trimmed;
}

/** Chooses the message type + payload to send for a raw input string. */
export function classifyOutgoingMessage(
  input: string,
  explicitMediaUrl?: string | null
): { content: string; messageType: MessageType; mediaUrl: string | null } {
  if (explicitMediaUrl) {
    return { content: '', messageType: 'gif', mediaUrl: explicitMediaUrl };
  }
  const candidate = normalizeGifUrl(input);
  if (candidate && (IMAGE_MEDIAA_URL_RE.test(candidate) || candidate.includes(input.trim()))) {
    return { content: '', messageType: 'gif', mediaUrl: candidate };
  }
  return { content: input.trim(), messageType: 'text', mediaUrl: null };
}

/** Renders a server row (any shape) into a typed DM message. */
export function toDmMessage(raw: any): DmMessage {
  return {
    id: String(raw?.id ?? ''),
    conversationId: String(raw?.conversationId ?? raw?.conversation_id ?? ''),
    senderId: String(raw?.senderId ?? raw?.sender_id ?? ''),
    content: String(raw?.content ?? ''),
    messageType: raw?.messageType === 'gif' || raw?.message_type === 'gif' ? 'gif' : 'text',
    mediaUrl: (raw?.mediaUrl ?? raw?.media_url ?? null) || null,
    createdAt: String(raw?.createdAt ?? raw?.created_at ?? new Date().toISOString())
  };
}

/** Merges message lists, dedupes by id and sorts oldest → newest. */
export function mergeMessageLists(lists: Array<DmMessage[] | null | undefined>): DmMessage[] {
  const seen = new Set<string>();
  const out: DmMessage[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const msg of list) {
      if (!msg || !msg.id || seen.has(msg.id)) continue;
      seen.add(msg.id);
      out.push(msg);
    }
  }
  out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return out;
}

/** True when a message belongs to the current user. */
export function isOwnMessage(msg: DmMessage, myUserId: string | null | undefined): boolean {
  return !!myUserId && msg.senderId === myUserId;
}

/** Well-known GIF providers whose URLs should be embedded as-is even for text. */
export function mediaSourceOf(message: DmMessage): string | null {
  if (message.messageType === 'gif' && message.mediaUrl) return message.mediaUrl;
  if (message.messageType === 'text' && (message.mediaUrl || isGifUrl(message.content))) {
    return message.mediaUrl || message.content;
  }
  return null;
}

export function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function formatDayDivider(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((body as any)?.error || `Request failed: ${res.status}`);
    (err as any).status = res.status;
    (err as any).body = body;
    throw err;
  }
  return body as T;
}

export async function listConversations(token: string): Promise<DmConversationSummary[]> {
  const data = await request<{ success: boolean; conversations: DmConversationSummary[] }>(
    '/api/dm/conversations',
    { method: 'GET' },
    token
  );
  return data.conversations ?? [];
}

export async function createConversation(token: string, userId: string): Promise<DmConversationSummary> {
  const data = await request<{ success: boolean; conversation: DmConversationSummary }>(
    '/api/dm/conversations',
    { method: 'POST', body: JSON.stringify({ userId }) },
    token
  );
  return data.conversation;
}

export async function fetchMessages(
  token: string,
  conversationId: string,
  opts: { before?: string; limit?: number } = {}
): Promise<DmMessage[]> {
  const params = new URLSearchParams();
  if (opts.before) params.set('before', opts.before);
  params.set('limit', String(opts.limit ?? 50));
  const data = await request<{ success: boolean; messages: DmMessage[] }>(
    `/api/dm/conversations/${conversationId}/messages?${params}`,
    { method: 'GET' },
    token
  );
  return data.messages ?? [];
}

export async function sendMessageRequest(
  token: string,
  conversationId: string,
  payload: { content: string; messageType: MessageType; mediaUrl?: string | null }
): Promise<DmMessage> {
  const data = await request<{ success: boolean; message: DmMessage }>(
    `/api/dm/conversations/${conversationId}/messages`,
    { method: 'POST', body: JSON.stringify(payload) },
    token
  );
  return data.message;
}

export async function markConversationRead(token: string, conversationId: string): Promise<void> {
  await request<{ success: boolean }>(
    `/api/dm/conversations/${conversationId}/read`,
    { method: 'POST', body: JSON.stringify({}) },
    token
  );
}

export async function fetchUnread(token: string): Promise<number> {
  const data = await request<{ success: boolean; totalUnread: number }>(
    '/api/dm/unread',
    { method: 'GET' },
    token
  );
  return data.totalUnread ?? 0;
}

export async function searchUsers(token: string, query: string): Promise<DmUserLite[]> {
  const data = await request<{ success: boolean; users: DmUserLite[] }>(
    `/api/dm/search?q=${encodeURIComponent(query)}`,
    { method: 'GET' },
    token
  );
  return data.users ?? [];
}

export async function fetchMyPresence(token: string): Promise<UserPresence> {
  const data = await request<{ success: boolean; presence: UserPresence }>(
    '/api/dm/presence',
    { method: 'GET' },
    token
  );
  return data.presence;
}

export async function setMyPresenceRequest(
  token: string,
  status: PresenceStatus,
  customStatus?: string | null
): Promise<UserPresence> {
  const data = await request<{ success: boolean; presence: UserPresence }>(
    '/api/dm/presence',
    { method: 'POST', body: JSON.stringify({ status, customStatus: customStatus ?? null }) },
    token
  );
  return data.presence;
}

export async function fetchPresenceBatch(token: string, userIds: string[]): Promise<Record<string, UserPresence>> {
  const data = await request<{ success: boolean; presence: Record<string, UserPresence> }>(
    `/api/dm/presence/batch?userIds=${encodeURIComponent(userIds.join(','))}`,
    { method: 'GET' },
    token
  );
  return data.presence ?? {};
}

export async function createCallRequest(
  token: string,
  conversationId: string,
  calleeId: string,
  callType: CallType
): Promise<CallSession> {
  const data = await request<{ success: boolean; call: CallSession }>(
    '/api/dm/calls',
    { method: 'POST', body: JSON.stringify({ conversationId, calleeId, callType }) },
    token
  );
  return data.call;
}

export async function updateCallStatusRequest(token: string, callId: string, status: CallStatus): Promise<CallSession> {
  const data = await request<{ success: boolean; call: CallSession }>(
    `/api/dm/calls/${callId}/status`,
    { method: 'POST', body: JSON.stringify({ status }) },
    token
  );
  return data.call;
}

export async function fetchUserProfileRequest(token: string, userId: string): Promise<DmUserProfile> {
  const data = await request<{ success: boolean; profile: DmUserProfile }>(
    `/api/dm/users/${userId}/profile`,
    { method: 'GET' },
    token
  );
  return data.profile;
}

export interface GifItem {
  id: string;
  url: string;
  preview: string;
  width: number;
  height: number;
}

export async function searchGifs(token: string, query: string): Promise<GifItem[]> {
  const data = await request<{ success: boolean; items: GifItem[] }>(
    `/api/dm/gif-search?q=${encodeURIComponent(query)}`,
    { method: 'GET' },
    token
  );
  return data.items ?? [];
}

export async function fetchDmConfig(): Promise<{ supabaseUrl: string; supabaseAnonKey: string; isConfigured: boolean }> {
  const data = await request<{ supabaseUrl: string; supabaseAnonKey: string; isConfigured: boolean }>(
    '/api/dm/config',
    { method: 'GET' }
  );
  return data;
}