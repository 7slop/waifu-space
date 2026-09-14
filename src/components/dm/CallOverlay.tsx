import { createEffect, createMemo, Show } from 'solid-js';
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
 * Top-docked call bar rendered at the top of the chat column. It does NOT
 * cover the whole page: messages stay visible below. Shows an incoming-call
 * bar with accept/decline, an outgoing "ringing" bar with cancel, and an
 * active call bar with mute, camera, screen-share and hang-up controls plus
 * a video stage that appears while video is active.
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

  return (
    <div class="dm-call-dock dm-call-incoming" data-testid="dm-incoming-call">
      <div class="dm-call-info">
        {isVideo() ? <PhVideoCamera class="dm-call-icon" /> : <PhPhoneDisconnect class="dm-call-icon" />}
        <span class="dm-call-name">{incoming().callerName}</span>
        <span class="dm-call-sub">
          {t(incoming().call.callType === 'screen' ? 'dm.callScreenLabel' : incoming().call.callType === 'video' ? 'dm.callVideoLabel' : 'dm.callVoiceLabel')}
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

  return (
    <div class={`dm-call-dock dm-call-active${screen() ? ' has-video' : ''}`} data-testid="dm-active-call">
      <div class="dm-call-bar">
        <div class="dm-call-info">
          {ringing()
            ? call().direction === 'incoming' ? <PhPhoneIncoming class="dm-call-icon" /> : <PhPhoneCall class="dm-call-icon" />
            : call().screenSharing ? <PhMonitorArrowUp class="dm-call-icon" /> : <PhPhoneCall class="dm-call-icon" />}
          <span class="dm-call-name">{call().remoteName}</span>
          <span class="dm-call-sub">
            {ringing()
              ? t(call().direction === 'incoming' ? 'dm.incomingCall' : 'dm.outgoingCall', { name: call().remoteName })
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
            <DmVideoView stream={() => screen()} class="dm-call-remote-video" />
            <DmVideoView stream={() => local()} muted class="dm-call-local-video" />
          </div>
        </div>
      </Show>
    </div>
  );
}