import { Show } from 'solid-js';
import { createResource } from 'solid-js';
import { state } from '../../lib/store';
import { dmState, openConversation } from '../../lib/dm/store';
import { fetchUserProfileRequest } from '../../lib/dm/api';
import { t } from '../../lib/i18n';
import { PhX, PhPaperPlaneTilt } from '../icons';
import { DmAvatar } from './DmAvatar';
import type { DmUserProfile } from '../../lib/dm/types';

/**
 * Slide-in right panel showing a participant's public profile: avatar,
 * bio, companion info and RPG stats. Fetched from the server when opened
 * (cached in the store's `dmState` reload cycle is out of scope; the panel
 * refetches each time it mounts).
 */
export function DmUserProfilePanel(props: { userId: string; onClose: () => void }) {
  const [profile] = createResource<DmUserProfile | null, string>(
    props.userId,
    async (id) => {
      const token = state.user?.token;
      if (!token || !id) return null;
      try {
        return await fetchUserProfileRequest(token, id);
      } catch {
        return null;
      }
    }
  );

  const presence = () => dmState.presence[props.userId];

  const message = () => {
    void openConversation(props.userId);
    props.onClose();
  };

  return (
    <>
      <div class="dm-profile-scrim" data-testid="dm-profile-scrim" onClick={props.onClose} />
      <aside class="dm-profile-panel" data-testid="dm-profile-panel" role="dialog" aria-label={t('dm.profile')}>
        <header class="dm-profile-header">
          <span class="dm-profile-title">{t('dm.profile')}</span>
          <button class="dm-profile-close" data-testid="dm-profile-close" onClick={props.onClose} aria-label={t('common.close')}>
            <PhX />
          </button>
        </header>

        <div class="dm-profile-body">
          <DmAvatar
            name={profile()?.username ?? '?'}
            avatarUrl={profile()?.avatarUrl}
            status={presence()?.status ?? null}
            size="90px"
            class="dm-profile-avatar"
          />
          <h3 class="dm-profile-name" data-testid="dm-profile-name">{profile()?.username ?? dmState.conversations.find((c) => c.otherUser.id === props.userId)?.otherUser?.username ?? '…'}</h3>

          <Show when={profile()?.bio}>
            <p class="dm-profile-bio" data-testid="dm-profile-bio">{profile()!.bio}</p>
          </Show>

          <Show when={profile()?.waifu}>
            <div class="dm-profile-section">
              <span class="dm-profile-section-label">{t('dm.waifu')}</span>
              <span class="dm-profile-section-value">{profile()!.waifu.name}</span>
            </div>
          </Show>

          <Show when={profile()?.stats}>
            <div class="dm-profile-section">
              <span class="dm-profile-section-label">{t('dm.stats')}</span>
              <div class="dm-profile-stats">
                <span class="dm-profile-stat"><b>{profile()!.stats.coins}</b>{t('dm.coins')}</span>
                <span class="dm-profile-stat"><b>{profile()!.stats.bondLevel}</b>{t('dm.bondLevel')}</span>
                <span class="dm-profile-stat"><b>{profile()!.stats.defenseHighWave}</b>{t('dm.defenseHighWave')}</span>
                <span class="dm-profile-stat"><b>{profile()!.stats.totalVictories}</b>{t('dm.totalVictories')}</span>
                <span class="dm-profile-stat"><b>{profile()!.stats.goblinsDefeated}</b>{t('dm.goblinsDefeated')}</span>
              </div>
            </div>
          </Show>

          <button class="dm-profile-message-btn" data-testid="dm-profile-message" onClick={message}>
            <PhPaperPlaneTilt /> {t('dm.newConversation')}
          </button>
        </div>
      </aside>
    </>
  );
}