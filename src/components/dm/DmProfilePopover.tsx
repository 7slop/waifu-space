import { createEffect, createResource, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { state } from '../../lib/store';
import { dmState } from '../../lib/dm/store';
import { fetchUserProfileRequest, formatJoinDate } from '../../lib/dm/api';
import { statusColor, statusForUserId } from '../../lib/dm/presence';
import { t } from '../../lib/i18n';
import { PhX } from '../icons';
import { DmAvatar } from './DmAvatar';
import type { DmUserProfile } from '../../lib/dm/types';

const POPOVER_WIDTH = 264;
const POPOVER_EST_HEIGHT = 330;

/**
 * Compact, Discord-like profile popup anchored near the element that was
 * clicked. Shows avatar, name, presence + custom status, registration date
 * and the user's description/bio. Flips above/below the anchor and clamps to
 * the viewport, matching the requested "popup near the click" behaviour.
 */
export function DmProfilePopover(props: { userId: string; anchor: () => DOMRect | null; onClose: () => void }) {
  const [pos, setPos] = createSignal<{ top: number; left: number; openUp: boolean }>({ top: 80, left: 20, openUp: false });

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

  const own = () => state.user?.id === props.userId;
  const presence = () => {
    const realtime = dmState.realtimePresence[props.userId]?.status;
    return statusForUserId(props.userId, dmState.presence, { [props.userId]: realtime });
  };
  const customStatus = () => dmState.presence[props.userId]?.customStatus ?? dmState.realtimePresence[props.userId]?.customStatus;

  const recompute = () => {
    const rect = props.anchor();
    if (!rect) return;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const openUp = rect.top > VIEWPORT_OFFSET + POPOVER_EST_HEIGHT || viewH - rect.bottom < POPOVER_EST_HEIGHT;
    const left = Math.max(8, Math.min(rect.left, viewW - POPOVER_WIDTH - 8));
    const top = openUp
      ? Math.max(8, rect.top - POPOVER_EST_HEIGHT - 8)
      : Math.min(rect.bottom + 8, viewH - POPOVER_EST_HEIGHT - 8);
    setPos({ top, left, openUp });
  };

  onMount(() => {
    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
  });

  onCleanup(() => {
    window.removeEventListener('resize', recompute);
    window.removeEventListener('scroll', recompute, true);
  });

  return (
    <>
      <div class="dm-popover-scrim" data-testid="dm-profile-scrim" onClick={props.onClose} />
      <section
        class="dm-profile-popover"
        data-testid="dm-profile-popover"
        role="dialog"
        aria-label={t('dm.profile')}
        style={{ top: `${pos().top}px`, left: `${pos().left}px` }}
      >
        <button class="dm-profile-close dm-popover-close" data-testid="dm-profile-close" onClick={props.onClose} aria-label={t('common.close')}>
          <PhX />
        </button>

        <DmAvatar
          name={profile()?.username ?? dmState.conversations.find((c) => c.otherUser.id === props.userId)?.otherUser?.username ?? '?'}
          avatarUrl={profile()?.avatarUrl}
          status={presence()}
          size="80px"
        />

        <h3 class="dm-profile-name" data-testid="dm-profile-name">
          {profile()?.username ?? dmState.conversations.find((c) => c.otherUser.id === props.userId)?.otherUser?.username ?? '…'}
          <Show when={own()}>
            <span class="dm-msg-you"> ({t('chat.you')})</span>
          </Show>
        </h3>
        <span class="dm-popover-status" data-testid="dm-popover-status">
          <span class="dm-status-dot" style={{ background: statusColor(presence()) }} />
          {t(`dm.${presence()}`)}
        </span>
        <Show when={customStatus()}>
          <span class="dm-popover-custom-status" data-testid="dm-popover-custom-status">~ {customStatus()}</span>
        </Show>

        <Show when={profile()?.createdAt}>
          <div class="dm-profile-section dm-popover-section">
            <span class="dm-profile-section-label">{t('dm.memberSince')}</span>
            <span class="dm-profile-section-value" data-testid="dm-popover-joined">{formatJoinDate(profile()!.createdAt)}</span>
          </div>
        </Show>

        <Show when={profile()?.bio}>
          <div class="dm-profile-section dm-popover-section">
            <span class="dm-profile-section-label">{t('dm.bio')}</span>
            <p class="dm-profile-bio" data-testid="dm-popover-bio">{profile()!.bio}</p>
          </div>
        </Show>
      </section>
    </>
  );
}

const VIEWPORT_OFFSET = 16;