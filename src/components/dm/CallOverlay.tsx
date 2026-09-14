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
  toggleDeafen,
  toggleMute,
  toggleScreenShare
} from '../../lib/dm/store';
import { state } from '../../lib/store';
import { t } from '../../lib/i18n';
import {
  PhHeadphones,
  PhMicrophone,
  PhMicrophoneSlash,
  PhPhoneCall,
  PhPhoneDisconnect,
  PhPhoneIncoming,
  PhSpeakerX,
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

/** Corner badge over a call avatar (mic muted, headphones deafened, ...). */
function AvatarBadge(props: { show: boolean; kind: 'muted' | 'deafened' }) {
  return (
    <>
      <Show when={props.show && props.kind === 'muted'}>
        <span class="dm-call-avatar-badge muted" data-testid="dm-call-muted-badge" aria-hidden="true">
          <PhMicrophoneSlash />
        </span>
      </Show>
      <Show when={props.show && props.kind === 'deafened'}>
        <span class="dm-call-avatar-badge deafened" data-testid="dm-call-deafened-badge" aria-hidden="true">
          <PhSpeakerX />
        </span>
      </Show>
    </>
  );
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
        <div class="dm-call-avatar-slot mine">
          <DmAvatar name={me().name} avatarUrl={me().avatar} size="44px" class="dm-call-avatar mine" />
        </div>
        <div class="dm-call-avatar-slot remote">
          <span class="dm-call-ring" aria-hidden="true" />
          <DmAvatar
            name={incoming().callerName || peer().name}
            avatarUrl={callerIsPeer() ? peer().avatar : undefined}
            size="44px"
            class="dm-call-avatar remote"
          />
        </div>
      </div>
      <div class="dm-call-info">
        <span class="dm-call-name">{incoming().callerName}</span>
        <span class="dm-call-sub">{isVideo() ? t('dm.callVideoLabel') : t('dm.callVoiceLabel')}{' · '}{t('dm.callingLabel')}</span>
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
  const connected = () => call().callState === 'connected';
  // Camera/screen toggles are allowed while ringing too (Discord-style
  // "start preparing"): the local preview fills the stage before answering.
  const videoActive = () => !call().videoOff && (connected() || ringing());
  const screen = createMemo<MediaStream | null>(() => (connected() ? callRemoteStream() : null));
  const local = createMemo<MediaStream | null>(() => callLocalStream());
  const peer = () => peerInfo();
  const me = () => ({ name: state.user?.username ?? 'You', avatar: state.user?.avatarUrl ?? null });

  // When the local user shares their screen the shared feed (local stream)
  // fills the big stage, so the remote camera becomes a square PiP. Before
  // the call is connected the stage always shows the local preview.
  const sharing = () => call().screenSharing;
  const mainStream = () => (sharing() || !connected() ? local() : screen());
  const pipStream = () => (sharing() && connected() ? screen() : local());

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
        <div class={`dm-call-avatars${videoActive() ? ' squared' : ''}`} data-testid="dm-call-avatars">
          <div class="dm-call-avatar-slot mine">
            <DmAvatar name={me().name} avatarUrl={me().avatar} size="44px" class="dm-call-avatar mine" />
            <AvatarBadge show={call().muted} kind="muted" />
            <AvatarBadge show={call().deafened} kind="deafened" />
          </div>
          <div class="dm-call-avatar-slot remote">
            <Show when={ringing()}>
              <span class="dm-call-ring" aria-hidden="true" />
            </Show>
            <DmAvatar name={call().remoteName || peer().name} avatarUrl={peer().avatar} size="44px" class="dm-call-avatar remote" />
          </div>
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
            class={`dm-call-action ctrl deafen${call().deafened ? ' active' : ''}`}
            data-testid="dm-call-deafen"
            title={call().deafened ? t('dm.undeafenTooltip') : t('dm.deafenTooltip')}
            onClick={toggleDeafen}
          >
            <PhHeadphones />
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