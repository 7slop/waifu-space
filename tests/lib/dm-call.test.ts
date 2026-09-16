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
}

interface FakeStream {
  tracks: FakeTrack[];
}

function makeTrack(kind: 'audio' | 'video'): FakeTrack {
  return { kind, enabled: true, stop: vi.fn() };
}

function makeStream(...kinds: Array<'audio' | 'video'>): FakeStream {
  return { tracks: kinds.map(makeTrack) };
}

const streamObj = (s: FakeStream): MediaStream =>
  ({
    getTracks: () => s.tracks,
    getAudioTracks: () => s.tracks.filter(t => t.kind === 'audio'),
    getVideoTracks: () => s.tracks.filter(t => t.kind === 'video'),
    addTrack: (t: any) => void s.tracks.push(t)
  }) as unknown as MediaStream;

class FakePeerConnection {
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  ontrack: ((ev: { track: unknown }) => void) | null = null;
  onicecandidate: ((ev: { candidate: { toJSON: () => object } | null }) => void) | null = null;
  addTrack = vi.fn();
  close = vi.fn();
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'offer-sdp' }));
  createAnswer = vi.fn(async () => ({ type: 'answer', sdp: 'answer-sdp' }));
  setLocalDescription = vi.fn(async (d: { type: string; sdp: string }) => {
    this.localDescription = d;
  });
  setRemoteDescription = vi.fn(async (d: { type: string; sdp: string }) => {
    this.remoteDescription = d;
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
      if (stream) this.tracks = stream.tracks;
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
      this.tracks.push(t);
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
      sampleRate: 48000,
      latency: 0
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
    expect(optimized).toContain('usedtx=1');
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
    expect(optimized2).toContain('a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1;stereo=0;sprop-stereo=0;maxaveragebitrate=64000');

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
});