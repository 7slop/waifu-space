import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CallManager } from '../../src/lib/dm/call';

interface FakeTrack {
  id: string;
  kind: 'audio' | 'video';
  enabled: boolean;
  readyState: 'live' | 'ended';
  stop: () => void;
  onended?: (() => void) | null;
}

function createFakeTrack(kind: 'audio' | 'video'): FakeTrack {
  return {
    id: `track-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    enabled: true,
    readyState: 'live',
    stop: vi.fn()
  };
}

class FakeMediaStream {
  tracks: FakeTrack[] = [];
  constructor(initialTracks?: FakeTrack[]) {
    if (initialTracks) this.tracks = [...initialTracks];
  }
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  addTrack(t: FakeTrack): void {
    if (!this.tracks.includes(t)) this.tracks.push(t);
  }
  removeTrack(t: FakeTrack): void {
    this.tracks = this.tracks.filter((x) => x !== t);
  }
}

class FakePeerConnection {
  signalingState: RTCSignalingState = 'stable';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  ontrack: ((ev: { track: FakeTrack }) => void) | null = null;
  onicecandidate: ((ev: { candidate: any }) => void) | null = null;
  senders: Array<{ track: FakeTrack | null; replaceTrack: any; getParameters: any; setParameters: any }> = [];

  addTrack = vi.fn((track: FakeTrack) => {
    const sender = {
      track,
      replaceTrack: vi.fn(async (newTrack: FakeTrack | null) => {
        sender.track = newTrack;
      }),
      getParameters: vi.fn(() => ({ encodings: [{ maxBitrate: 0 }] })),
      setParameters: vi.fn(async () => undefined)
    };
    this.senders.push(sender);
    return sender;
  });

  close = vi.fn(() => {
    this.signalingState = 'closed';
  });

  createOffer = vi.fn(async () => {
    return { type: 'offer' as const, sdp: 'fake-offer-sdp\r\na=rtpmap:111 opus/48000' };
  });

  createAnswer = vi.fn(async () => {
    return { type: 'answer' as const, sdp: 'fake-answer-sdp\r\na=rtpmap:111 opus/48000' };
  });

  setLocalDescription = vi.fn(async (desc: RTCSessionDescriptionInit) => {
    this.localDescription = desc;
    if (desc.type === 'offer') this.signalingState = 'have-local-offer';
    else if (desc.type === 'answer') this.signalingState = 'stable';
    else if ((desc as any).type === 'rollback') this.signalingState = 'stable';
  });

  setRemoteDescription = vi.fn(async (desc: RTCSessionDescriptionInit) => {
    this.remoteDescription = desc;
    if (desc.type === 'offer') this.signalingState = 'have-remote-offer';
    else if (desc.type === 'answer') this.signalingState = 'stable';
  });

  addIceCandidate = vi.fn(async () => undefined);
}

describe('two-peer DM voice & video calls', () => {
  let peerConnections: FakePeerConnection[] = [];

  beforeEach(() => {
    peerConnections = [];
    (globalThis as any).MediaStream = FakeMediaStream;
    (globalThis as any).RTCSessionDescription = class {
      type: string;
      sdp: string;
      constructor(init: { type?: string; sdp?: string }) {
        this.type = init.type ?? '';
        this.sdp = init.sdp ?? '';
      }
    };
    (globalThis as any).RTCIceCandidate = class {
      candidate: any;
      constructor(init: any) {
        this.candidate = init;
      }
    };
    (globalThis as any).RTCPeerConnection = class {
      constructor() {
        const pc = new FakePeerConnection();
        peerConnections.push(pc);
        return pc;
      }
    };
  });

  afterEach(() => {
    delete (globalThis as any).MediaStream;
    delete (globalThis as any).RTCSessionDescription;
    delete (globalThis as any).RTCIceCandidate;
    delete (globalThis as any).RTCPeerConnection;
  });

  it('negotiates call initiation between caller (Peer A) and callee (Peer B) with bi-directional audio', async () => {
    const audioTrackA = createFakeTrack('audio');
    const audioTrackB = createFakeTrack('audio');

    let peerBManager: CallManager;

    const peerADeps = {
      getUserMedia: vi.fn(async () => new FakeMediaStream([audioTrackA]) as unknown as MediaStream),
      onStateChange: vi.fn(),
      onIceCandidate: vi.fn(async (cand) => {
        if (peerBManager) await peerBManager.adoptIce(cand);
      })
    };

    const peerBDeps = {
      getUserMedia: vi.fn(async () => new FakeMediaStream([audioTrackB]) as unknown as MediaStream),
      onStateChange: vi.fn(),
      onIceCandidate: vi.fn(async (cand) => {
        await peerAManager.adoptIce(cand);
      })
    };

    const peerAManager = new CallManager(peerADeps);
    peerBManager = new CallManager(peerBDeps);

    // 1. Peer A starts local voice media
    const okA = await peerAManager.startLocal({ type: 'voice', audio: true, video: false });
    expect(okA).toBe(true);
    expect(peerAManager.localMedia?.getAudioTracks()).toHaveLength(1);

    // 2. Peer A creates offer for call-123 to Peer B
    const offer = await peerAManager.createOffer('call-123', 'user-b');
    expect(offer).toBeDefined();
    expect(offer.type).toBe('offer');
    expect(peerAManager.currentState).toBe('ringing');

    // 3. Peer B answers incoming call: starts local media, then accepts Peer A's offer
    const okB = await peerBManager.startLocal({ type: 'voice', audio: true, video: false });
    expect(okB).toBe(true);

    const answer = await peerBManager.acceptOffer('call-123', 'user-a', offer);
    expect(answer).toBeDefined();
    expect(answer?.type).toBe('answer');
    expect(peerBManager.currentState).toBe('connected');
    expect(peerBManager.isConnected()).toBe(true);

    // Simulate Peer B's WebRTC receiving Peer A's audio track
    const pcB = peerConnections[1];
    pcB.ontrack?.({ track: audioTrackA });
    expect(peerBManager.remoteMedia?.getAudioTracks()).toHaveLength(1);

    // 4. Peer A adopts Peer B's answer
    await peerAManager.adoptAnswer(answer!);
    expect(peerAManager.currentState).toBe('connected');
    expect(peerAManager.isConnected()).toBe(true);

    // Simulate Peer A's WebRTC receiving Peer B's audio track
    const pcA = peerConnections[0];
    pcA.ontrack?.({ track: audioTrackB });
    expect(peerAManager.remoteMedia?.getAudioTracks()).toHaveLength(1);

    // Both peers are now connected and can hear each other!
    expect(peerAManager.isMuted()).toBe(false);
    expect(peerBManager.isMuted()).toBe(false);
  });

  it('allows Peer A to toggle camera mid-call and transmits video track to Peer B', async () => {
    const audioTrackA = createFakeTrack('audio');
    const audioTrackB = createFakeTrack('audio');
    const videoTrackA = createFakeTrack('video');

    let peerBManager: CallManager;

    const peerADeps = {
      getUserMedia: vi.fn(async (constraints: any) => {
        if (constraints.video) {
          return new FakeMediaStream([videoTrackA]) as unknown as MediaStream;
        }
        return new FakeMediaStream([audioTrackA]) as unknown as MediaStream;
      }),
      onRenegotiation: vi.fn(async (renegOffer) => {
        const renegAnswer = await peerBManager.acceptOffer('call-123', 'user-a', renegOffer);
        if (renegAnswer) await peerAManager.adoptAnswer(renegAnswer);
      })
    };

    const peerBDeps = {
      getUserMedia: vi.fn(async () => new FakeMediaStream([audioTrackB]) as unknown as MediaStream)
    };

    const peerAManager = new CallManager(peerADeps);
    peerBManager = new CallManager(peerBDeps);

    await peerAManager.startLocal({ type: 'voice', audio: true, video: false });
    const offer = await peerAManager.createOffer('call-123', 'user-b');
    await peerBManager.startLocal({ type: 'voice', audio: true, video: false });
    const answer = await peerBManager.acceptOffer('call-123', 'user-a', offer);
    await peerAManager.adoptAnswer(answer!);
    expect(peerAManager.isConnected()).toBe(true);

    // Peer A turns camera on
    const camOk = await peerAManager.ensureCamera();
    expect(camOk).toBe(true);
    expect(peerAManager.isVideoOff()).toBe(false);
    expect(peerAManager.localMedia?.getVideoTracks()).toHaveLength(1);

    // Peer B receives Peer A's video track via ontrack
    const pcB = peerConnections[1];
    pcB.ontrack?.({ track: videoTrackA });
    expect(peerBManager.remoteMedia?.getVideoTracks()).toHaveLength(1);

    // Peer A turns camera off
    peerAManager.toggleVideo();
    expect(peerAManager.isVideoOff()).toBe(true);
  });

  it('allows Peer B to share screen and stops cleanly', async () => {
    const audioTrackA = createFakeTrack('audio');
    const audioTrackB = createFakeTrack('audio');
    const screenTrackB = createFakeTrack('video');

    let peerAManager: CallManager;

    const peerBDeps = {
      getUserMedia: vi.fn(async () => new FakeMediaStream([audioTrackB]) as unknown as MediaStream),
      getDisplayMedia: vi.fn(async () => new FakeMediaStream([screenTrackB]) as unknown as MediaStream),
      onRenegotiation: vi.fn(async (renegOffer) => {
        const renegAnswer = await peerAManager.acceptOffer('call-123', 'user-b', renegOffer);
        if (renegAnswer) await peerBManager.adoptAnswer(renegAnswer);
      })
    };

    const peerADeps = {
      getUserMedia: vi.fn(async () => new FakeMediaStream([audioTrackA]) as unknown as MediaStream)
    };

    peerAManager = new CallManager(peerADeps);
    const peerBManager = new CallManager(peerBDeps);

    await peerAManager.startLocal({ type: 'voice', audio: true, video: false });
    const offer = await peerAManager.createOffer('call-123', 'user-b');
    await peerBManager.startLocal({ type: 'voice', audio: true, video: false });
    const answer = await peerBManager.acceptOffer('call-123', 'user-a', offer);
    await peerAManager.adoptAnswer(answer!);

    // Peer B enables screen share
    const screenOk = await peerBManager.enableScreenShare();
    expect(screenOk).toBe(true);
    expect(peerBManager.isScreenSharing()).toBe(true);
    expect(peerBManager.localMedia?.getVideoTracks()).toHaveLength(1);

    // Peer A receives screen track
    const pcA = peerConnections[0];
    pcA.ontrack?.({ track: screenTrackB });
    expect(peerAManager.remoteMedia?.getVideoTracks()).toHaveLength(1);

    // Peer B disables screen share
    const disableOk = await peerBManager.disableScreenShare();
    expect(disableOk).toBe(true);
    expect(peerBManager.isScreenSharing()).toBe(false);
    expect(screenTrackB.stop).toHaveBeenCalled();
  });

  it('cleans up resources and marks state ended when a peer hangs up', async () => {
    const audioTrack = createFakeTrack('audio');
    const peer = new CallManager({
      getUserMedia: vi.fn(async () => new FakeMediaStream([audioTrack]) as unknown as MediaStream)
    });

    await peer.startLocal({ type: 'voice', audio: true });
    await peer.createOffer('call-hangup', 'user-b');
    expect(peer.currentState).toBe('ringing');

    peer.hangUp('ended');
    expect(peer.currentState).toBe('ended');
    expect(peerConnections[0].close).toHaveBeenCalled();
  });
});
