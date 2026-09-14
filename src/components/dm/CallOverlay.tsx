import { createEffect, createMemo, Show } from 'solid-js';
import {
  acceptIncomingCall,
  callLocalStream,
  callRemoteStream,
  declineIncomingCall,
  dmState,
  hangUpCall,
  markCallBusyAndReject,
  toggleMute,
  toggleVideo
} from '../../lib/dm/store';
import { t } from '../../lib/i18n';
import {
  PhMicrophone,
  PhMicrophoneSlash,
  PhPhoneCall,
  PhPhoneDisconnect,
  PhPhoneIncoming,
  PhVideoCamera,
  PhVideoCameraSlash,
  PhMonitorArrowUp
} from '../icons';

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

/**
 * Floating call UI overlaying the DM page: an incoming-call banner with
 * accept/decline, an outgoing "ringing" panel with cancel, and the active call
 * screen with remote + local video, mute and camera toggles.
 */
export function CallOverlay() {
  const call = () => dmState.call;
  const incoming = () => dmState.incomingCall;

  const isVideo = () => {
    const c = call();
    return c && (c.call.callType === 'video' || c.call.callType === 'screen');
  };

  return (
    <>
      <Show when={incoming() && !call()}>
        <IncomingCallBanner />
      </Show>
      <Show when={call()}>
        <ActiveCallPanel />
      </Show>
    </>
  );
}

function IncomingCallBanner() {
  const incoming = () => dmState.incomingCall!;
  const isVideo = () => incoming().call.callType !== 'voice';

  return (
    <div class="dm-call-overlay" data-testid="dm-incoming-call">
      <div class="dm-call-card dm-call-incoming">
        <div class="dm-call-title">
          {isVideo() ? <PhVideoCamera class="dm-call-icon" /> : <PhPhoneDisconnect class="dm-call-icon" />}
          <span>{t('dm.incomingCall')}</span>
        </div>
        <div class="dm-call-name">{incoming().callerName}</div>
        <div class="dm-call-sub">
          {t(incoming().call.callType === 'screen' ? 'dm.callScreenLabel' : incoming().call.callType === 'video' ? 'dm.callVideoLabel' : 'dm.callVoiceLabel')}
          {' · '}{t('dm.callingLabel')}
        </div>
        <div class="dm-call-actions">
          <button class="dm-call-action decline" data-testid="dm-call-decline" title={t('dm.decline')} onClick={() => void declineIncomingCall()}>
            <PhPhoneDisconnect />
          </button>
          <button class="dm-call-action accept" data-testid="dm-call-accept" title={t('dm.accept')} onClick={() => void acceptIncomingCall()}>
            <PhPhoneCall />
          </button>
          <button class="dm-call-action busy" data-testid="dm-call-busy" title={t('dm.busy')} onClick={() => void markCallBusyAndReject()}>
            <PhMonitorArrowUp />
          </button>
        </div>
      </div>
    </div>
  );
}

function ActiveCallPanel() {
  const call = () => dmState.call!;
  const ringing = () => call().callState === 'ringing';
  const video = () => call().call.callType === 'video' || call().call.callType === 'screen';
  const remote = createMemo<MediaStream | null>(() => (dmState.call?.callState === 'connected' ? callRemoteStream() : null));
  const local = createMemo<MediaStream | null>(() => callLocalStream());

  return (
    <div class="dm-call-overlay" data-testid="dm-active-call">
      <div class={`dm-call-card dm-call-active${video() ? ' video' : ''}`}>
        <Show when={ringing()} fallback={<VideoStage remote={remote()} local={local()} video={video()} name={call().remoteName} />}>
          <div class="dm-call-ringing">
            <div class="dm-call-title">
              {call().direction === 'incoming' ? <PhPhoneIncoming /> : <PhPhoneCall />}
              <span>{t(call().direction === 'incoming' ? 'dm.incomingCall' : 'dm.outgoingCall', { name: call().remoteName })}</span>
            </div>
            <div class="dm-call-sub"> {call().callState}</div>
          </div>
        </Show>
        <div class="dm-call-controls">
          <button
            class={`dm-call-action ctrl${call().muted ? ' active' : ''}`}
            data-testid="dm-call-mute"
            title={call().muted ? t('dm.unmutedTooltip') : t('dm.mutedTooltip')}
            onClick={toggleMute}
          >
            {call().muted ? <PhMicrophoneSlash /> : <PhMicrophone />}
          </button>
          <Show when={video()}>
            <button
              class={`dm-call-action ctrl${call().videoOff ? ' active' : ''}`}
              data-testid="dm-call-video-toggle"
              title={call().videoOff ? t('dm.startVideo') : t('dm.stopVideo')}
              onClick={toggleVideo}
            >
              {call().videoOff ? <PhVideoCameraSlash /> : <PhVideoCamera />}
            </button>
          </Show>
          <button class="dm-call-action hangup" data-testid="dm-call-hangup" title={t('dm.hangUp')} onClick={() => void hangUpCall()}>
            <PhPhoneDisconnect />
          </button>
        </div>
      </div>
    </div>
  );
}

function VideoStage(props: { remote: MediaStream | null; local: MediaStream | null; video: boolean; name: string }) {
  return (
    <Show
      when={props.video}
      fallback={
        <div class="dm-call-avatar-stage">
          <div class="dm-call-big-avatar">{props.name.slice(0, 2).toUpperCase()}</div>
          <div class="dm-call-voice-label">{t('dm.outgoingCall', { name: props.name })}</div>
        </div>
      }
    >
      <div class="dm-call-video-stage">
        <DmVideoView stream={() => props.remote} class="dm-call-remote-video" />
        <DmVideoView stream={() => props.local} muted class="dm-call-local-video" />
      </div>
    </Show>
  );
}