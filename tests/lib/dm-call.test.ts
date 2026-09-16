import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CallManager,
  defaultPeerConfiguration,
  defaultIceServers,
  getOptimizedAudioConstraints,
  applyAudioSenderOptimizations,
  optimizeAudioSdp
} from '../../src/lib/dm/call';

interface FakeTrack {
  kind: 'audio' | 'video';
  enabled: boolean;
  stop: () => void;
  onended?: (() => void) | null;
  readyState?: 'live' | 'ended';
}

interface FakeStream {
  tracks: FakeTrack[];
}

function makeTrack(kind: 'audio' | 'video'): FakeTrack {
  return { kind, enabled: true, stop: vi.fn(), onended: null, readyState: 'live' };
}

function makeStream(...kinds: Array<'audio' | 'video'>): FakeStream {
  return { tracks: kinds.map(makeTrack) };
}

const streamObj = (s: FakeStream): MediaStream =>
  ({
    getTracks: () => s.tracks,
    getAudioTracks: () => s.tracks.filter(t => t.kind === 'audio'),
    getVideoTracks: () => s.tracks.filter(t => t.kind === 'video'),
    addTrack: (t: any) => void s.tracks.push(t),
    removeTrack: (t: any) => { s.tracks = s.tracks.filter(x => x !== t); }
  }) as unknown as MediaStream;

class FakePeerConnection {
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  signalingState: RTCSignalingState = 'stable';
  ontrack: ((ev: { track: unknown }) => void) | null = null;
  onicecandidate: ((ev: { candidate: { toJSON: () => object } | null }) => void) | null = null;
  addTrack = vi.fn((track: any) => ({
    replaceTrack: vi.fn(async () => undefined),
    getParameters: vi.fn(() => ({ encodings: [{ maxBitrate: 0 }] })),
    setParameters: vi.fn(async () => undefined)
  }));
  close = vi.fn();
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'offer-sdp' }));
  createAnswer = vi.fn(async () => ({ type: 'answer', sdp: 'answer-sdp' }));
  setLocalDescription = vi.fn(async (d: { type: string; sdp: string }) => {
    this.localDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
  });
  setRemoteDescription = vi.fn(async (d: { type: string; sdp: string }) => {
    this.remoteDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable';
  });
  addIceCandidate = vi.fn(async () => undefined as any);
}

function setupPeers(count: number): FakePeerConnection[] {
  const peers = Array.from({ length: count }, () => new FakePeerConnection());
  globalThis.RTCPeerConnection = class {
    constructor() {
      return peers[peerCounter++];
    }
  } as unknown as typeof RTCPeerConnection;
  return peers;
}

let peerCounter = 0;
const mediaByContext = new Map<object, FakeStream>();

function installMedia() {
  globalThis.MediaStream = class {
    tracks: FakeTrack[] = [];
    constructor(stream?: FakeStream) {
      if (stream) this.tracks = [...stream.tracks];
    }
    getTracks() {
      return this.tracks;
    }
    getAudioTracks() {
      return this.tracks.filter(t => t.kind === 'audio');
    }
    getVideoTracks() {
      return this.tracks.filter(t => t.kind === 'video');
    }
    addTrack(t: FakeTrack) {
      if (!this.tracks.includes(t)) this.tracks.push(t);
    }
    removeTrack(t: FakeTrack) {
      this.tracks = this.tracks.filter(x => x !== t);
    }
  } as unknown as typeof MediaStream;
  (globalThis as any).RTCSessionDescription = class {
    type: string;
    sdp: string;
    constructor(init: { type?: string; sdp?: string }) {
      this.type = init.type ?? '';
      this.sdp = init.sdp ?? '';
    }
  };
  (globalThis as any).RTCIceCandidate = class {
    candidate: unknown;
    constructor(init: unknown) {
      this.candidate = init;
    }
  };
}

describe('CallManager', () => {
  afterEach(() => {
    delete (globalThis as any).RTCPeerConnection;
    delete (globalThis as any).MediaStream;
    delete (globalThis as any).RTCSessionDescription;
    delete (globalThis as any).RTCIceCandidate;
    peerCounter = 0;
    mediaByContext.clear();
  });

  it('starts local media and creates a serializable offer', async () => {
    installMedia();
    const peers = setupPeers(1);
    const local = streamObj(makeStream('audio', 'video'));
    const manager = new CallManager({
      getUserMedia: async () => local,
      onLocalStream: (s: MediaStream) => {
        expect(s.getTracks().length).toBe(2);
      }
    });

    const ok = await manager.startLocal({ type: 'video', audio: true, video: true, screen: false });
    expect(ok).toBe(true);
    expect(manager.currentState).toBe('ringing');

    const offer = await manager.createOffer('call-1', 'peer-1');
    expect(offer).toMatchObject({ type: 'offer', sdp: 'offer-sdp' });
    expect(peers[0].addTrack).toHaveBeenCalledTimes(2);
    expect(peers[0].setLocalDescription).toHaveBeenCalledOnce();
  });

  it('accepts an offer and returns an answer, then handles the callee ICE buffer', async () => {
    installMedia();
    const peers = setupPeers(1);
    const manager = new CallManager({ getUserMedia: async () => streamObj(makeStream('audio', 'video')) });
    await manager.startLocal({ type: 'video', audio: true, video: true, screen: false });

    // ICE arriving before the offer completes must be buffered.
    await manager.adoptIce({ candidate: 'cand-1' });
    const answer = await manager.acceptOffer('call-2', 'peer-2', { type: 'offer', sdp: 'offer-sdp' });
    expect(answer).toMatchObject({ type: 'answer', sdp: 'answer-sdp' });
    expect(peers[0].addIceCandidate).toHaveBeenCalledTimes(1);
    expect(manager.currentState).toBe('connected');
  });

  it('adopts the caller answer and flushes pending ICE', async () => {
    installMedia();
    const peers = setupPeers(1);
    const manager = new CallManager({ getUserMedia: async () => streamObj(makeStream('audio')) });
    await manager.startLocal({ type: 'voice', audio: true, video: false, screen: false });
    await manager.createOffer('call-3', 'peer-3');

    await manager.adoptIce({ candidate: 'cand-1' });
    expect(peers[0].addIceCandidate).not.toHaveBeenCalled();
    await manager.adoptAnswer({ type: 'answer', sdp: 'answer-sdp' });
    expect(peers[0].addIceCandidate).toHaveBeenCalledTimes(1);
    expect(manager.currentState).toBe('connected');
  });

  it('emits ICE candidates through onIceCandidate', async () => {
    installMedia();
    const peers = setupPeers(1);
    const seen: any[] = [];
    const manager = new CallManager({
      getUserMedia: async () => streamObj(makeStream('audio', 'video')),
      onIceCandidate: (c, callId) => seen.push({ c, callId })
    });
    await manager.startLocal({ type: 'video', audio: true, video: true, screen: false });
    await manager.createOffer('call-4', 'peer-4');
    peers[0].onicecandidate!({ candidate: { toJSON: () => ({ candidate: 'cand' }) } });
    expect(seen).toHaveLength(1);
    expect(seen[0].callId).toBe('call-4');
  });

  it('pipes a remote track into onRemoteStream', async () => {
    installMedia();
    const peers = setupPeers(1);
    const remoteSeen: MediaStream[] = [];
    const manager = new CallManager({
      getUserMedia: async () => streamObj(makeStream('audio')),
      onRemoteStream: (s) => remoteSeen.push(s)
    });
    await manager.startLocal({ type: 'voice', audio: true, video: false, screen: false });
    await manager.createOffer('call-6', 'peer-6');
    peers[0].ontrack!({ track: makeTrack('audio') });
    expect(remoteSeen).toHaveLength(1);
    expect(remoteSeen[0].getTracks()).toHaveLength(1);
  });

  it('toggleMute/toggleVideo flip track enabled flags', async () => {
    installMedia();
    setupPeers(1);
    const manager = new CallManager({ getUserMedia: async () => streamObj(makeStream('audio', 'video')) });
    await manager.startLocal({ type: 'video', audio: true, video: true, screen: false });
    expect(manager.isMuted()).toBe(false);
    manager.toggleMute();
    expect(manager.isMuted()).toBe(true);
    expect(manager.isVideoOff()).toBe(false);
    manager.toggleVideo();
    expect(manager.isVideoOff()).toBe(true);
  });

  it('returns false and goes failed when media is rejected', async () => {
    installMedia();
    setupPeers(1);
    const manager = new CallManager({
      getUserMedia: async () => {
        throw new Error('Permission denied');
      }
    });
    const ok = await manager.startLocal({ type: 'voice', audio: true, video: false, screen: false });
    expect(ok).toBe(false);
    expect(manager.currentState).toBe('failed');
  });

  it('hangUp stops local tracks and resets state', async () => {
    installMedia();
    setupPeers(1);
    const tracks = [makeTrack('audio'), makeTrack('video')];
    const local = streamObj({ tracks });
    const manager = new CallManager({ getUserMedia: async () => local });
    await manager.startLocal({ type: 'video', audio: true, video: true, screen: false });
    await manager.createOffer('call-5', 'peer-5');
    manager.hangUp('ended');
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(tracks[1].stop).toHaveBeenCalled();
    expect(manager.currentState).toBe('ended');
    expect(manager.localMedia).toBeNull();
  });

  it('provides low-latency default peer configuration and audio constraints', () => {
    const config = defaultPeerConfiguration();
    expect(config.iceCandidatePoolSize).toBe(2);
    expect(config.bundlePolicy).toBe('max-bundle');
    expect(config.rtcpMuxPolicy).toBe('require');
    expect(config.iceServers).toEqual(defaultIceServers());

    const constraints = getOptimizedAudioConstraints();
    expect(constraints).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000
    });
  });

  it('optimizes audio SDP for Opus with low-latency parameters', () => {
    // Case 1: SDP with existing fmtp line
    const sdpWithFmtp = [
      'v=0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'a=rtpmap:111 opus/48000/2',
      'a=fmtp:111 minptime=20;useinbandfec=0',
      ''
    ].join('\r\n');
    const optimized = optimizeAudioSdp(sdpWithFmtp);
    expect(optimized).toContain('minptime=10');
    expect(optimized).toContain('useinbandfec=1');
    expect(optimized).toContain('usedtx=0');
    expect(optimized).toContain('stereo=0');
    expect(optimized).toContain('sprop-stereo=0');
    expect(optimized).toContain('maxaveragebitrate=64000');

    // Case 2: SDP with no fmtp line
    const sdpWithoutFmtp = [
      'v=0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'a=rtpmap:111 opus/48000/2',
      ''
    ].join('\r\n');
    const optimized2 = optimizeAudioSdp(sdpWithoutFmtp);
    expect(optimized2).toContain('a=fmtp:111 minptime=10;useinbandfec=1;usedtx=0;stereo=0;sprop-stereo=0;maxaveragebitrate=64000');

    // Case 3: SDP with no opus
    const sdpNoOpus = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 0\r\na=rtpmap:0 PCMU/8000\r\n';
    expect(optimizeAudioSdp(sdpNoOpus)).toBe(sdpNoOpus);
  });

  it('applies sender optimizations to audio RTCRtpSender', () => {
    const encodings = [{ maxBitrate: 0 }];
    const fakeSender = {
      getParameters: vi.fn(() => ({ encodings })),
      setParameters: vi.fn(async () => undefined)
    } as unknown as RTCRtpSender;

    applyAudioSenderOptimizations(fakeSender);
    expect(fakeSender.getParameters).toHaveBeenCalled();
    expect(encodings[0].maxBitrate).toBe(64000);
    expect((encodings[0] as any).priority).toBe('high');
    expect((encodings[0] as any).networkPriority).toBe('high');
    expect(fakeSender.setParameters).toHaveBeenCalledWith({ encodings });
  });

  it('enables screen sharing, toggles camera without interrupting screen, and restores camera on stop', async () => {
    installMedia();
    const peers = setupPeers(1);
    const cameraStream = streamObj(makeStream('audio', 'video'));
    const screenStream = streamObj(makeStream('video'));
    const manager = new CallManager({
      getUserMedia: async () => cameraStream,
      getDisplayMedia: async () => screenStream
    });

    await manager.startLocal({ type: 'video', audio: true, video: true, screen: false });
    await manager.createOffer('call-s1', 'peer-s1');
    expect(manager.isScreenSharing()).toBe(false);
    expect(manager.isVideoOff()).toBe(false);
    expect(manager.hasCameraTrack()).toBe(true);

    // Enable screen share
    const okShare = await manager.enableScreenShare();
    expect(okShare).toBe(true);
    expect(manager.isScreenSharing()).toBe(true);
    expect(manager.isVideoOff()).toBe(false);

    // Toggle camera while sharing screen
    const camState = manager.toggleVideo();
    expect(camState).toBe(false);
    // Screen sharing should still be active
    expect(manager.isScreenSharing()).toBe(true);

    // Turn camera back on
    manager.toggleVideo();

    // Disable screen share
    const okStop = await manager.disableScreenShare();
    expect(okStop).toBe(true);
    expect(manager.isScreenSharing()).toBe(false);
    expect(manager.isVideoOff()).toBe(false);
  });

  it('automatically disables screen share when native screenTrack ends', async () => {
    installMedia();
    setupPeers(1);
    const local = streamObj(makeStream('audio'));
    const screenTrack = makeTrack('video');
    const screenStream = streamObj({ tracks: [screenTrack] });
    let stateChanges = 0;
    const manager = new CallManager({
      getUserMedia: async () => local,
      getDisplayMedia: async () => screenStream,
      onStateChange: () => {
        stateChanges++;
      }
    });

    await manager.startLocal({ type: 'voice', audio: true, video: false, screen: false });
    await manager.createOffer('call-s2', 'peer-s2');

    await manager.enableScreenShare();
    expect(manager.isScreenSharing()).toBe(true);

    // Native browser "Stop sharing" fires onended on screenTrack
    screenTrack.onended?.();
    expect(manager.isScreenSharing()).toBe(false);
    expect(stateChanges).toBeGreaterThan(0);
  });

  it('a screen call merges the shared screen with the caller microphone audio', async () => {
    installMedia();
    setupPeers(1);
    const screenStream = streamObj(makeStream('video'));
    const micStream = streamObj(makeStream('audio'));
    let micConstraints: unknown;
    const manager = new CallManager({
      getUserMedia: async (constraints) => {
        micConstraints = constraints;
        return micStream;
      },
      getDisplayMedia: async () => screenStream,
      onLocalStream: (s: MediaStream) => {
        expect(s.getVideoTracks()).toHaveLength(1);
        expect(s.getAudioTracks()).toHaveLength(1);
      }
    });

    const ok = await manager.startLocal({ type: 'screen', audio: true, video: false, screen: true });
    expect(ok).toBe(true);
    expect(manager.currentState).toBe('ringing');
    expect(manager.isScreenSharing()).toBe(true);
    // The microphone is requested with the optimized constraints.
    expect(micConstraints).toEqual({ audio: getOptimizedAudioConstraints() });

    const offer = await manager.createOffer('call-s4', 'peer-s4');
    expect(offer).toMatchObject({ type: 'offer', sdp: 'offer-sdp' });
  });

  it('a screen call still shares the screen when the microphone is denied', async () => {
    installMedia();
    setupPeers(1);
    const screenStream = streamObj(makeStream('video'));
    let micAttempts = 0;
    const manager = new CallManager({
      getUserMedia: async () => {
        micAttempts++;
        throw new Error('mic denied');
      },
      getDisplayMedia: async () => screenStream,
      onLocalStream: (s: MediaStream) => {
        expect(s.getVideoTracks()).toHaveLength(1);
        expect(s.getAudioTracks()).toHaveLength(0);
      }
    });

    const ok = await manager.startLocal({ type: 'screen', audio: true, video: false, screen: true });
    expect(ok).toBe(true);
    expect(manager.isScreenSharing()).toBe(true);
    // Optimized + plain-audio fallback were both attempted before giving up.
    expect(micAttempts).toBe(2);
  });

  it('acquires camera while screen sharing without stopping the screen share', async () => {
    installMedia();
    setupPeers(1);
    const voiceStream = streamObj(makeStream('audio'));
    const screenStream = streamObj(makeStream('video'));
    const cameraStream = streamObj(makeStream('video'));

    const manager = new CallManager({
      getUserMedia: async (constraints) => (constraints && typeof constraints === 'object' && 'video' in constraints && constraints.video ? cameraStream : voiceStream),
      getDisplayMedia: async () => screenStream
    });

    // Start voice call
    await manager.startLocal({ type: 'voice', audio: true, video: false, screen: false });
    await manager.createOffer('call-s3', 'peer-s3');
    expect(manager.hasCameraTrack()).toBe(false);

    // Start screen sharing
    await manager.enableScreenShare();
    expect(manager.isScreenSharing()).toBe(true);

    // Acquire camera mid-share
    const okCam = await manager.ensureCamera();
    expect(okCam).toBe(true);
    expect(manager.hasCameraTrack()).toBe(true);
    expect(manager.isScreenSharing()).toBe(true);
  });

  it('removes remote track when track fires onended', async () => {
    installMedia();
    const peers = setupPeers(1);
    let remoteStreamRef: MediaStream | null = null;
    const manager = new CallManager({
      getUserMedia: async () => streamObj(makeStream('audio')),
      onRemoteStream: (s) => {
        remoteStreamRef = s;
      }
    });
    await manager.startLocal({ type: 'voice', audio: true, video: false, screen: false });
    await manager.createOffer('call-s4', 'peer-s4');

    const remoteVideoTrack = makeTrack('video');
    peers[0].ontrack!({ track: remoteVideoTrack as any });
    expect(remoteStreamRef).not.toBeNull();
    expect((remoteStreamRef as any).getVideoTracks().length).toBe(1);

    // Remote track ends
    remoteVideoTrack.onended?.();
    expect((remoteStreamRef as any).getVideoTracks().length).toBe(0);
  });

  it('queues a camera/screen track change made while ringing and signals it once connected', async () => {
    installMedia();
    const peers = setupPeers(1);
    const reneg: any[] = [];
    const manager = new CallManager({
      getUserMedia: async () => streamObj(makeStream('audio', 'video')),
      onRenegotiation: (offer, callId) => reneg.push({ offer, callId })
    });
    await manager.startLocal({ type: 'video', audio: true, video: true, screen: false });
    await manager.createOffer('call-q1', 'peer-q1');

    // Still ringing with the initial offer in flight -> signalingState is
    // 'have-local-offer', so a track change must be queued, not dropped.
    manager.toggleVideo();
    await new Promise((r) => setTimeout(r, 0));
    expect(reneg).toHaveLength(0);
    expect((manager as any).needsRenegotiation).toBe(true);

    // Caller answer arrives -> connection goes stable+connected; the queued
    // renegotiation offer is now flushed to the peer.
    await manager.adoptAnswer({ type: 'answer', sdp: 'answer-sdp' });
    expect(manager.isConnected()).toBe(true);
    expect((manager as any).needsRenegotiation).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(reneg).toHaveLength(1);
    expect(reneg[0].callId).toBe('call-q1');
    expect(reneg[0].offer.sdp).toBe('offer-sdp');
  });
});