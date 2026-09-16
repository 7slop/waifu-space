import type { CallType } from './types';

// ---------------------------------------------------------------------------
// WebRTC call manager
//
// Owns the RTCPeerConnection, the local media stream (mic / camera / screen)
// and the remote MediaStream. Uses dependency injection for the browser media
// APIs so it can be unit-tested in a non-browser environment.
//
// Signaling flow (relayed through the authenticated DB-backed signal queue in
// `call_signals`, polled by `pollCallSignals` — never over realtime):
//   caller.startLocal() -> createOffer(peerId) -> { offer } queued
//   callee.acceptOffer(peerId, offer)           -> { answer } queued
//   both: adoptIce(candidate)                   -> { ice } queued
// The ICE candidates are gathered by the underlying peer connection and are
// handed to the caller through `onIceCandidate` callbacks.
// ---------------------------------------------------------------------------

export type CallState =
  | 'idle'
  | 'acquiring'
  | 'ringing' // caller waiting for answer
  | 'connected'
  | 'active' // adopted an already-ongoing call (join), media still being linked
  | 'ended'
  | 'failed';

export interface CallOptions {
  type: CallType;
  audio: boolean;
  video: boolean;
  screen: boolean;
}

export interface CallManagerDeps {
  createPeer?: () => RTCPeerConnection;
  getUserMedia?: typeof navigator.mediaDevices.getUserMedia;
  getDisplayMedia?: typeof navigator.mediaDevices.getDisplayMedia;
  iceServers?: RTCConfiguration['iceServers'];
  onLocalStream?: (stream: MediaStream, options: CallOptions) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onStateChange?: (state: CallState) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit, callId: string) => void;
  /** Emitted when a mid-call track change needs a fresh SDP offer. */
  onRenegotiation?: (offer: RTCSessionDescriptionInit, callId: string) => void;
  /** Emitted when the remote peer disconnects or the WebRTC connection drops. */
  onPeerDisconnected?: () => void;
}

export class CallManager {
  deps: CallManagerDeps;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private options: CallOptions | null = null;
  private state: CallState = 'idle';
  private callId: string | null = null;
  private peerId: string | null = null;
  private creatingAnswer = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private videoSender: RTCRtpSender | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  private screenStream: MediaStream | null = null;
  private screenActive = false;
  private cameraTrack: MediaStreamTrack | null = null;
  private renegotiating = false;
  /** Set when a track change could not be signaled yet (ringing / unstable /
   *  already renegotiating); flushed once the call is connected and stable. */
  private needsRenegotiation = false;

  constructor(deps: CallManagerDeps = {}) {
    this.deps = deps;
  }

  get currentState(): CallState {
    return this.state;
  }

  get localMedia(): MediaStream | null {
    return this.localStream;
  }

  get remoteMedia(): MediaStream | null {
    return this.remoteStream;
  }

  private setState(next: CallState): void {
    if (next === this.state) return;
    this.state = next;
    this.deps.onStateChange?.(next);
  }

  private setPeer(peerId: string): void {
    this.peerId = peerId;
    if (this.pc) return;
    const createPeer = this.deps.createPeer ?? (() => new RTCPeerConnection(defaultPeerConfiguration(this.deps.iceServers)));
    this.pc = createPeer();
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate && this.callId) this.deps.onIceCandidate?.(ev.candidate.toJSON(), this.callId);
    };
    this.pc.onconnectionstatechange = () => {
      const st = this.pc?.connectionState;
      if (st === 'disconnected' || st === 'failed') {
        this.deps.onPeerDisconnected?.();
      }
    };
    this.pc.oniceconnectionstatechange = () => {
      const st = this.pc?.iceConnectionState;
      if (st === 'disconnected' || st === 'failed') {
        this.deps.onPeerDisconnected?.();
      }
    };
    this.pc.ontrack = (ev) => {
      const stream = ev.streams && ev.streams[0] ? ev.streams[0] : (this.remoteStream ?? new MediaStream());
      if (!this.remoteStream) this.remoteStream = stream;
      if (!this.remoteStream.getTracks().includes(ev.track)) {
        this.remoteStream.addTrack(ev.track);
      }
      if (ev.track.kind === 'audio') {
        ev.track.enabled = true;
      }
      ev.track.onended = () => {
        if (this.remoteStream) {
          try { (this.remoteStream as any).removeTrack?.(ev.track); } catch {}
          this.deps.onRemoteStream?.(this.remoteStream);
        }
      };
      this.deps.onRemoteStream?.(this.remoteStream);
    };
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        const sender = this.pc.addTrack(track, this.localStream);
        if (track.kind === 'video') this.videoSender = sender;
        if (track.kind === 'audio') applyAudioSenderOptimizations(sender);
      }
    }
  }

  private renegotiate(): void {
    if (!this.pc || !this.callId) return;
    if (this.state !== 'connected' || this.renegotiating || this.pc.signalingState !== 'stable') {
      // The connection is not ready to accept a new description (ringing,
      // mid-renegotiation, or a negotiation in flight): remember the request
      // and flush it once the call becomes stable instead of dropping it.
      this.needsRenegotiation = true;
      return;
    }
    this.needsRenegotiation = false;
    this.renegotiating = true;
    void (async () => {
      try {
        const offer = await this.pc!.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        const optimized = { type: offer.type, sdp: optimizeAudioSdp(offer.sdp ?? '') };
        await this.pc!.setLocalDescription(optimized);
        const desc: RTCSessionDescriptionInit = {
          type: (this.pc!.localDescription as any)?.type ?? optimized.type,
          sdp: this.pc!.localDescription?.sdp ?? optimized.sdp
        };
        this.deps.onRenegotiation?.(desc, this.callId!);
      } catch {
        // renegotiation is best-effort
      } finally {
        this.renegotiating = false;
        this.flushPendingRenegotiation();
      }
    })();
  }

  /** Sends a queued renegotiation offer once the call is stable/connected. */
  private flushPendingRenegotiation(): void {
    if (this.needsRenegotiation) this.renegotiate();
  }

  private async applyVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    if (!this.pc) return;
    try {
      if (this.videoSender) {
        await this.videoSender.replaceTrack(track);
      } else if (track) {
        this.videoSender = this.pc.addTrack(track, this.localStream ?? new MediaStream());
      }
      this.renegotiate();
    } catch {
      // ignore track wiring errors
    }
  }

  private async withLocalMedia(options: CallOptions): Promise<MediaStream | null> {
    const getUserMedia = this.deps.getUserMedia ?? ((constraints: MediaStreamConstraints) => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        return Promise.reject(new Error('media unsupported'));
      }
      return navigator.mediaDevices.getUserMedia(constraints);
    });
    const getDisplayMedia = this.deps.getDisplayMedia ?? (() => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
        return Promise.reject(new Error('screen sharing unsupported'));
      }
      return navigator.mediaDevices.getDisplayMedia({ video: true });
    });
    const streams: MediaStream[] = [];
    try {
      if (options.screen) {
        streams.push(await getDisplayMedia());
        if (options.audio) {
          // Display media only captures the screen (plus optionally shared tab
          // audio). A screen call must still carry the caller's voice, so grab
          // the microphone and merge it in. Failing mic acquisition never
          // kills the call: the screen keeps being shared without audio.
          try {
            streams.push(await getUserMedia({ audio: getOptimizedAudioConstraints() }));
          } catch {
            try {
              streams.push(await getUserMedia({ audio: true }));
            } catch {
              // No mic available / permission denied — screen only.
            }
          }
        }
      } else if (options.audio || options.video) {
        const audioConstraints = options.audio ? getOptimizedAudioConstraints() : false;
        try {
          streams.push(
            await getUserMedia({
              audio: audioConstraints,
              video: options.video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : undefined
            })
          );
        } catch {
          if (options.audio) {
            streams.push(
              await getUserMedia({
                audio: true,
                video: options.video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : undefined
              })
            );
          } else {
            return null;
          }
        }
      }
    } catch {
      return null;
    }
    const merged = new MediaStream();
    for (const s of streams) for (const t of s.getTracks()) {
      // Audio + (optionally deduped) video tracks get merged into one stream.
      if (t.kind === 'audio' || options.video || !merged.getVideoTracks().length) merged.addTrack(t);
    }
    return merged;
  }

  /** Starts local media acquisition for the given call type. Returns false when unavailable/denied. */
  async startLocal(options: CallOptions): Promise<boolean> {
    if (this.state !== 'idle' && this.state !== 'ended') return false;
    this.setState('acquiring');
    this.options = options;
    const stream = await this.withLocalMedia(options);
    if (!stream) {
      this.setState('failed');
      return false;
    }
    this.localStream = stream;
    if (options.video) {
      this.cameraTrack = stream.getVideoTracks()[0] ?? null;
    }
    if (options.screen) {
      this.screenTrack = stream.getVideoTracks()[0] ?? null;
      this.screenActive = true;
      if (this.screenTrack) {
        this.screenTrack.onended = () => {
          void this.disableScreenShare();
        };
      }
    }
    this.deps.onLocalStream?.(stream, options);
    this.setState('ringing');
    return true;
  }

  /** Creates an offer for a new call. Caller must have started local media first. */
  async createOffer(callId: string, peerId: string): Promise<RTCSessionDescriptionInit | null> {
    if (!this.pc) this.setPeer(peerId);
    this.callId = callId;
    this.peerId = peerId;
    try {
      const offer = await this.pc!.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: this.options?.video || this.options?.screen || false });
      const optimized = { type: offer.type, sdp: optimizeAudioSdp(offer.sdp ?? '') };
      await this.pc!.setLocalDescription(optimized);
      return optimized;
    } catch {
      this.setState('failed');
      return null;
    }
  }

  async acceptOffer(callId: string, peerId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
    if (!this.pc) this.setPeer(peerId);
    this.callId = callId;
    this.peerId = peerId;
    try {
      if (this.pc!.signalingState === 'have-local-offer') {
        try {
          await this.pc!.setLocalDescription({ type: 'rollback' } as any);
        } catch {
          // ignore rollback failure in non-supporting environments
        }
      }
      await this.pc!.setRemoteDescription(new RTCSessionDescription(offer));
      if (this.pc!.remoteDescription && this.pc!.remoteDescription.type !== 'offer') {
        // An existing negotiation is being updated; re-offer behaviour stays with the caller.
        return this.pc!.localDescription?.toJSON() ?? null;
      }
      for (const c of this.pendingCandidates.splice(0)) {
        try {
          await this.pc!.addIceCandidate(new RTCIceCandidate(c));
        } catch {
          // stale/unusable candidate - ignore
        }
      }
      const answer = await this.pc!.createAnswer();
      const optimized = { type: answer.type, sdp: optimizeAudioSdp(answer.sdp ?? '') };
      await this.pc!.setLocalDescription(optimized);
      this.setState('connected');
      this.flushPendingRenegotiation();
      return optimized;
    } catch {
      this.setState('failed');
      return null;
    }
  }

  async adoptOffer(callId: string, peerId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
    return this.acceptOffer(callId, peerId, offer);
  }

  markConnected(): void {
    if (this.state === 'ringing' || this.state === 'active') {
      this.setState('connected');
      this.flushPendingRenegotiation();
    }
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  getSignalingState(): RTCSignalingState | null {
    return this.pc ? this.pc.signalingState : null;
  }

  async adoptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;
    if (this.pc.signalingState === 'stable' && this.state === 'connected') return;
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      for (const c of this.pendingCandidates.splice(0)) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(c));
        } catch {
          // ignore
        }
      }
      this.setState('connected');
      this.flushPendingRenegotiation();
    } catch {
      if (this.pc.signalingState !== 'stable') {
        this.setState('failed');
      }
    }
  }

  async adoptIce(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // ignore stale candidates
    }
  }

  /** Toggles audio track(s), returns the new muted state. */
  toggleMute(): boolean {
    if (!this.localStream) return false;
    const next = this.localStream.getAudioTracks().some(t => !t.enabled);
    for (const t of this.localStream.getAudioTracks()) t.enabled = next;
    return next;
  }

  /** Toggles the camera track when a video/screen call is active. */
  toggleVideo(): boolean {
    if (!this.localStream) return false;
    if (this.cameraTrack) {
      this.cameraTrack.enabled = !this.cameraTrack.enabled;
      if (!this.screenActive) {
        void this.applyVideoTrack(this.cameraTrack.enabled ? this.cameraTrack : null);
      }
      this.deps.onStateChange?.(this.state);
      return this.cameraTrack.enabled;
    }
    const tracks = this.localStream.getVideoTracks().filter(t => t !== this.screenTrack);
    if (!tracks.length) return false;
    const next = !tracks[0].enabled;
    for (const t of tracks) t.enabled = next;
    if (!this.screenActive) {
      void this.applyVideoTrack(next ? tracks[0] : null);
    }
    this.deps.onStateChange?.(this.state);
    return next;
  }

  /** Ensures a camera feed is live mid-call (used from a voice call). */
  async ensureCamera(): Promise<boolean> {
    if (!this.localStream) return false;
    if (this.cameraTrack && this.cameraTrack.readyState !== 'ended') {
      this.cameraTrack.enabled = true;
      if (!this.screenActive) {
        await this.applyVideoTrack(this.cameraTrack);
      }
      this.deps.onStateChange?.(this.state);
      this.deps.onLocalStream?.(this.localStream, this.options ?? { type: 'video', audio: true, video: true, screen: this.screenActive });
      return true;
    }
    const getUserMedia = this.deps.getUserMedia ?? ((constraints: MediaStreamConstraints) => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        return Promise.reject(new Error('camera unavailable'));
      }
      return navigator.mediaDevices.getUserMedia(constraints);
    });
    let stream: MediaStream;
    try {
      stream = await getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
    } catch {
      return false;
    }
    const track = stream.getVideoTracks()[0];
    if (!track) return false;
    this.cameraTrack = track;
    this.localStream.addTrack(track);
    if (!this.screenActive) {
      await this.applyVideoTrack(track);
    }
    this.deps.onStateChange?.(this.state);
    this.deps.onLocalStream?.(this.localStream, this.options ?? { type: 'video', audio: true, video: true, screen: this.screenActive });
    return true;
  }

  /** Starts sharing the user's screen over the current call. */
  async enableScreenShare(): Promise<boolean> {
    if (!this.localStream || this.screenActive) return false;
    const getDisplayMedia = this.deps.getDisplayMedia ?? (() => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
        return Promise.reject(new Error('screen sharing unsupported'));
      }
      return navigator.mediaDevices.getDisplayMedia({ video: true });
    });
    let stream: MediaStream;
    try {
      stream = await getDisplayMedia();
    } catch {
      return false;
    }
    const track = stream.getVideoTracks()[0];
    if (!track) return false;
    this.screenStream = stream;
    this.screenTrack = track;
    this.screenActive = true;
    track.onended = () => {
      void this.disableScreenShare();
    };
    this.localStream.addTrack(track);
    await this.applyVideoTrack(track);
    this.deps.onStateChange?.(this.state);
    this.deps.onLocalStream?.(this.localStream, this.options ?? { type: 'video', audio: true, video: !this.isVideoOff(), screen: true });
    return true;
  }

  /** Stops screen sharing and restores the camera feed if one was live. */
  async disableScreenShare(): Promise<boolean> {
    if (!this.screenActive || !this.screenTrack) return false;
    try {
      this.screenTrack.stop();
    } catch {}
    try {
      this.localStream?.removeTrack(this.screenTrack);
    } catch {}
    if (this.screenStream) {
      try {
        for (const t of this.screenStream.getTracks()) t.stop();
      } catch {}
    }
    this.screenStream = null;
    this.screenTrack = null;
    this.screenActive = false;
    const restoreTrack = this.cameraTrack && this.cameraTrack.enabled && this.cameraTrack.readyState !== 'ended' ? this.cameraTrack : null;
    await this.applyVideoTrack(restoreTrack);
    this.deps.onStateChange?.(this.state);
    if (this.localStream) {
      this.deps.onLocalStream?.(this.localStream, this.options ?? { type: 'video', audio: true, video: !this.isVideoOff(), screen: false });
    }
    return true;
  }

  /** True while the user is sharing their screen. */
  isScreenSharing(): boolean {
    return this.screenActive;
  }

  /** Tracks whether the user is currently muted (any audio track disabled). */
  isMuted(): boolean {
    return !!this.localStream && this.localStream.getAudioTracks().every(t => !t.enabled);
  }

  /** Enables/disables audio playback of the remote stream (used for deafen). */
  setRemoteAudioEnabled(enabled: boolean): void {
    if (!this.remoteStream) return;
    for (const t of this.remoteStream.getAudioTracks()) t.enabled = enabled;
  }

  /** Tracks whether the video is currently disabled. */
  isVideoOff(): boolean {
    if (this.screenActive) return false;
    if (this.cameraTrack) return !this.cameraTrack.enabled;
    const tracks = this.localStream?.getVideoTracks().filter(t => t !== this.screenTrack);
    return !tracks || tracks.length === 0 || tracks.every(t => !t.enabled);
  }

  /** Whether any local camera track exists and is not ended. */
  hasCameraTrack(): boolean {
    return (!!this.cameraTrack && this.cameraTrack.readyState !== 'ended') ||
      (!!this.localStream && this.localStream.getVideoTracks().some(t => t !== this.screenTrack && t.readyState !== 'ended'));
  }

  /** Whether any local video track exists (camera or screen). */
  hasVideoTracks(): boolean {
    return !!this.localStream && this.localStream.getVideoTracks().length > 0;
  }

  hangUp(reason: 'ended' | 'declined' | 'canceled' = 'ended'): void {
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }
    if (this.screenTrack) {
      try { this.screenTrack.stop(); } catch {}
      this.screenTrack = null;
    }
    if (this.screenStream) {
      try {
        for (const t of this.screenStream.getTracks()) t.stop();
      } catch {}
      this.screenStream = null;
    }
    if (this.cameraTrack) {
      try { this.cameraTrack.stop(); } catch {}
      this.cameraTrack = null;
    }
    if (this.localStream) {
      for (const t of this.localStream.getTracks()) t.stop();
      this.localStream = null;
    }
    this.remoteStream = null;
    this.pendingCandidates = [];
    this.callId = null;
    this.peerId = null;
    this.options = null;
    this.videoSender = null;
    this.screenActive = false;
    this.renegotiating = false;
    this.needsRenegotiation = false;
    this.setState(reason === 'canceled' ? 'idle' : reason === 'declined' ? 'ended' : 'ended');
  }
}

export function defaultIceServers(): RTCIceServer[] {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ];
}

export function defaultPeerConfiguration(iceServers?: RTCConfiguration['iceServers']): RTCConfiguration {
  return {
    iceServers: iceServers ?? defaultIceServers(),
    iceCandidatePoolSize: 2,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };
}

export function getOptimizedAudioConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000
  };
}

export function applyAudioSenderOptimizations(sender: RTCRtpSender | null | undefined): void {
  if (!sender) return;
  try {
    if (typeof sender.getParameters === 'function' && typeof sender.setParameters === 'function') {
      const params = sender.getParameters();
      if (params.encodings && params.encodings.length > 0) {
        params.encodings[0].maxBitrate = 64000;
        (params.encodings[0] as any).networkPriority = 'high';
        (params.encodings[0] as any).priority = 'high';
        void sender.setParameters(params).catch(() => {});
      }
    }
  } catch {
    // Best-effort
  }
}

export function optimizeAudioSdp(sdp: string): string {
  if (!sdp || typeof sdp !== 'string') return sdp;
  const opusMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
  if (!opusMatch) return sdp;
  const pt = opusMatch[1];
  const params = 'minptime=10;useinbandfec=1;usedtx=0;stereo=0;sprop-stereo=0;maxaveragebitrate=64000';

  const fmtpRegex = new RegExp(`(a=fmtp:${pt}\\s+)([^\\r\\n]*)`, 'i');
  if (fmtpRegex.test(sdp)) {
    return sdp.replace(fmtpRegex, (_match, prefix, existing) => {
      const currentParts = existing.split(';').map((p: string) => p.trim()).filter(Boolean);
      const newParts = params.split(';').map((p: string) => p.trim());
      const keys = new Set(newParts.map((p: string) => p.split('=')[0]));
      const filteredCurrent = currentParts.filter((p: string) => !keys.has(p.split('=')[0]));
      return `${prefix}${[...filteredCurrent, ...newParts].join(';')}`;
    });
  } else {
    const rtpmapRegex = new RegExp(`(a=rtpmap:${pt}\\s+opus\\/48000[^\\r\\n]*)`, 'i');
    return sdp.replace(rtpmapRegex, `$1\r\na=fmtp:${pt} ${params}`);
  }
}