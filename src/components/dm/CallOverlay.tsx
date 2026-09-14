import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import {
  acceptIncomingCall,
  callLocalStream,
  callRemoteStream,
  cameraButtonPressed,
  declineIncomingCall,
  dmState,
  hangUpCall,
  markCallBusyAndReject,
  toggleMute,
  toggleScreenShare
} from '../../lib/dm/store';
import { state } from '../../lib/store';
import { t } from '../../lib/i18n';
import {
  PhMicrophone,
  PhMicrophoneSlash,
  PhPhoneCall,
  PhPhoneDisconnect,
  PhPhoneIncoming,
  PhVideoCamera,
  PhVideoCameraFill,
  PhVideoCameraSlash,
  PhMonitorArrowUp
} from '../icons';
import { DmAvatar } from './DmAvatar';

/** Binds a MediaStream onto a <video> element as soon as one is available. */
function DmVideoView(props: { stream: () => MediaStream | null; muted?: boolean; class?: string }) {
  let ref: HTMLVideoElement | undefined;
  createEffect(() => {
    const video = ref;
    if (video) {
      const stream = props.stream();
      video.srcObject = stream as any;
      if (stream) void video.play?.().catch(() => {});
    }
  });
  return <video class={props.class} ref={ref} autoplay playsinline muted={props.muted} />;
}

/** Resolves the other participant's avatar from the conversation list. */
function peerInfo() {
  const conv = dmState.conversations.find((c) => c.id === dmState.activeConversationId);
  return { name: conv?.otherUser?.username ?? '', avatar: conv?.otherUser?.avatarUrl ?? null };
}

/**
 * Top-docked call bar rendered at the top of the chat column. It does NOT
 * cover the whole page: messages stay visible below. Shows an incoming-call
 * bar with accept/decline, an outgoing "ringing" bar with cancel, and an
 * active call bar with mute, camera, screen-share and hang-up controls plus
 * a video stage that appears while video is active. While ringing, both
 * participants' avatars are shown with a pulsing ring around the callee.
 */
export function CallOverlay() {
  const call = () => dmState.call;
  const incoming = () => dmState.incomingCall;

  return (
    <>
      <Show when={incoming() && !call()}>
        <IncomingCallBar />
      </Show>
      <Show when={call()}>
        <ActiveCallBar />
      </Show>
    </>
  );
}

function IncomingCallBar() {
  const incoming = () => dmState.incomingCall!;
  const isVideo = () => incoming().call.callType !== 'voice';
  const peer = () => peerInfo();
  const me = () => ({ name: state.user?.username ?? 'You', avatar: state.user?.avatarUrl ?? null });
  const callerId = () => incoming().call.callerId;
  const callerIsPeer = () =>
    dmState.conversations.find((c) => c.id === incoming().call.conversationId)?.otherUser?.id === callerId();

  return (
    <div class="dm-call-dock dm-call-incoming" data-testid="dm-incoming-call">
      <div class="dm-call-avatars ringing" data-testid="dm-call-avatars">
        <DmAvatar name={me().name} avatarUrl={me().avatar} size="44px" class="dm-call-avatar mine" />
        <span class="dm-call-ring" aria-hidden="true" />
        <DmAvatar
          name={incoming().callerName || peer().name}
          avatarUrl={callerIsPeer() ? peer().avatar : undefined}
          size="44px"
          class="dm-call-avatar remote"
        />
      </div>
      <div class="dm-call-info">
        <span class="dm-call-name">{incoming().callerName}</span>
        <span class="dm-call-sub">
          {isVideo() ? t('dm.callVideoLabel') : t('dm.callVoiceLabel')}
          {' · '}{t('dm.callingLabel')}
        </span>
      </div>
      <div class="dm-call-actions">
        <button class="dm-call-action decline" data-testid="dm-call-decline" title={t('dm.decline')} onClick={() => void declineIncomingCall()}>
          <PhPhoneDisconnect />
        </button>
        <button class="dm-call-action accept" data-testid="dm-call-accept" title={t('dm.accept')} onClick={() => void acceptIncomingCall()}>
          <PhPhoneCall />
        </button>
        <button class="dm-call-action busy" data-testid="dm-call-busy" title={t('dm.busy')} onClick={() => void markCallBusyAndReject()}>
          <PhPhoneCall />
        </button>
      </div>
    </div>
  );
}

function ActiveCallBar() {
  const call = () => dmState.call!;
  const ringing = () => call().callState === 'ringing';
  const videoActive = () => call().callState === 'connected' && !call().videoOff;
  const screen = createMemo<MediaStream | null>(() => (dmState.call?.callState === 'connected' ? callRemoteStream() : null));
  const local = createMemo<MediaStream | null>(() => callLocalStream());
  const peer = () => peerInfo();
  const me = () => ({ name: state.user?.username ?? 'You', avatar: state.user?.avatarUrl ?? null });

  // When the local user shares their screen the shared feed (local stream)
  // fills the big stage, so the remote camera becomes a square PiP.
  const sharing = () => call().screenSharing;
  const mainStream = () => (sharing() ? local() : screen());
  const pipStream = () => (sharing() ? screen() : local());

  // Drag handle at the bottom resizes the dock height (clamped 96px..60vh).
  const [dockH, setDockH] = createSignal<number | null>(null);
  let dockRef: HTMLDivElement | undefined;
  let dragging = false;
  let startY = 0;
  let startH = 0;

  const onResizeDown = (e: PointerEvent) => {
    dragging = true;
    startY = e.clientY;
    startH = dockH() ?? dockRef?.offsetHeight ?? 96;
    const target = e.currentTarget as HTMLElement | null;
    try { target?.setPointerCapture?.(e.pointerId); } catch { /* jsdom/webkit */ }
    target?.classList.add('dragging');
  };
  const onResizeMove = (e: PointerEvent) => {
    if (!dragging) return;
    const delta = e.clientY - startY;
    setDockH(Math.min(window.innerHeight * 0.6, Math.max(96, startH + delta)));
  };
  const onResizeUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    (e.currentTarget as HTMLElement | null)?.classList.remove('dragging');
  };

  return (
    <div
      ref={dockRef}
      class={`dm-call-dock dm-call-active${videoActive() ? ' has-video' : ''}${dockH() ? ' resized' : ''}`}
      data-testid="dm-active-call"
      style={dockH() ? { height: `${dockH()}px` } : undefined}
    >
      <div class="dm-call-bar">
        <div class="dm-call-avatars" data-testid="dm-call-avatars">
          <DmAvatar name={me().name} avatarUrl={me().avatar} size="44px" class="dm-call-avatar mine" />
          <Show when={ringing()}>
            <span class="dm-call-ring" aria-hidden="true" />
          </Show>
          <DmAvatar name={call().remoteName || peer().name} avatarUrl={peer().avatar} size="44px" class="dm-call-avatar remote" />
        </div>

        <div class="dm-call-info">
          <span class="dm-call-name">{call().remoteName || peer().name}</span>
          <span class="dm-call-sub">
            {ringing()
              ? t(call().direction === 'incoming' ? 'dm.incomingCall' : 'dm.outgoingCall', { name: call().remoteName || peer().name })
              : call().screenSharing ? t('dm.sharingScreenLabel') : t('dm.inCallLabel')}
          </span>
        </div>

        <div class="dm-call-controls">
          <button
            class={`dm-call-action ctrl${call().muted ? ' active' : ''}`}
            data-testid="dm-call-mute"
            title={call().muted ? t('dm.unmutedTooltip') : t('dm.mutedTooltip')}
            onClick={toggleMute}
          >
            {call().muted ? <PhMicrophoneSlash /> : <PhMicrophone />}
          </button>
          <button
            class={`dm-call-action ctrl${call().videoOff && !call().screenSharing ? ' active' : ''}`}
            data-testid="dm-call-video-toggle"
            title={call().videoOff ? t('dm.startVideo') : t('dm.stopVideo')}
            onClick={() => void cameraButtonPressed()}
          >
            {call().screenSharing
              ? <PhVideoCameraFill />
              : call().videoOff ? <PhVideoCameraSlash /> : <PhVideoCamera />}
          </button>
          <button
            class={`dm-call-action ctrl${call().screenSharing ? ' active' : ''}`}
            data-testid="dm-call-screen-toggle"
            title={call().screenSharing ? t('dm.stopScreenShareTooltip') : t('dm.startScreenShareTooltip')}
            onClick={() => void toggleScreenShare()}
          >
            <PhMonitorArrowUp />
          </button>
          <button class="dm-call-action hangup" data-testid="dm-call-hangup" title={t('dm.hangUp')} onClick={() => void hangUpCall()}>
            <PhPhoneDisconnect />
          </button>
        </div>
      </div>

      <Show when={videoActive()}>
        <div class="dm-call-video-row">
          <div class="dm-call-video-stage">
            <DmVideoView stream={mainStream} class="dm-call-remote-video" />
            <DmVideoView
              stream={pipStream}
              muted={!sharing()}
              class={sharing() ? 'dm-call-pip-video screen' : 'dm-call-pip-video'}
            />
          </div>
        </div>
      </Show>

      <span
        class="dm-call-resize-handle"
        data-testid="dm-call-resize"
        aria-hidden="true"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
      />
    </div>
  );
}