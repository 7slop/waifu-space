import { createSignal, Show } from 'solid-js';
import { dmState, startCall } from '../../lib/dm/store';
import { statusForUserId, isVisiblePresence } from '../../lib/dm/presence';
import { t } from '../../lib/i18n';
import { PhMonitorArrowUp, PhPhoneCall, PhVideoCamera } from '../icons';
import { DmAvatar } from './DmAvatar';
import { DmMessageList } from './DmMessageList';
import { DmInputBar } from './DmInputBar';
import { DmUserProfilePanel } from './DmUserProfilePanel';

/**
 * The right-hand chat region: conversation header (identity, live presence and
 * call actions), the message timeline, the composer, and the optional slide-in
 * profile panel for the other participant.
 */
export function DmChatPanel() {
  const [profileOpen, setProfileOpen] = createSignal(false);

  const conv = () => dmState.conversations.find((c) => c.id === dmState.activeConversationId);
  const realtimeMap: Record<string, any> = {};
  for (const [uid, entry] of Object.entries(dmState.realtimePresence)) realtimeMap[uid] = entry.status;
  const status = () => (conv() ? statusForUserId(conv()!.otherUser.id, dmState.presence, realtimeMap) : 'offline');

  return (
    <section class="dm-chat" data-testid="dm-chat">
      <Show when={conv()} fallback={<DmChatEmpty />}>
        <header class="dm-chat-header">
          <button class="dm-chat-identity" data-testid="dm-chat-identity" onClick={() => setProfileOpen((v) => !v)}>
            <DmAvatar
              name={conv()!.otherUser.username || conv()!.otherUser.id}
              avatarUrl={conv()!.otherUser.avatarUrl}
              status={status()}
              size="38px"
            />
            <div class="dm-chat-id-text">
              <span class="dm-chat-name">{conv()!.otherUser.username || conv()!.otherUser.id}</span>
              <Show when={isVisiblePresence(status())}>
                <span class="dm-chat-presence-text">{t(`dm.${status()}`)}</span>
              </Show>
            </div>
          </button>

          <div class="dm-chat-actions">
            <button class="dm-call-btn" data-testid="dm-call-voice" title={t('dm.callVoice')} onClick={() => void startCall('voice')}>
              <PhPhoneCall />
            </button>
            <button class="dm-call-btn" data-testid="dm-call-video" title={t('dm.callVideo')} onClick={() => void startCall('video')}>
              <PhVideoCamera />
            </button>
            <button class="dm-call-btn" data-testid="dm-call-screen" title={t('dm.callScreen')} onClick={() => void startCall('screen')}>
              <PhMonitorArrowUp />
            </button>
          </div>
        </header>

        <DmMessageList />
        <DmInputBar />

        <Show when={profileOpen()}>
          <DmUserProfilePanel userId={conv()!.otherUser.id} onClose={() => setProfileOpen(false)} />
        </Show>
      </Show>
    </section>
  );
}

function DmChatEmpty() {
  return (
    <div class="dm-chat-empty" data-testid="dm-chat-empty">
      <div class="dm-chat-empty-inner">
        <div class="dm-chat-empty-icon">DM</div>
        <h2>{t('dm.emptyTitle')}</h2>
        <p>{t('dm.emptyHint')}</p>
      </div>
    </div>
  );
}