import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startPresenceAutoDetect } from '../../../src/lib/dm/presence-auto';
import { dmState, setDmState, resetDmStore } from '../../../src/lib/dm/store';
import { resetForDmTests, stubFetch } from '../../dm-helpers';
import type { PresenceStatus } from '../../../src/lib/dm/types';

describe('presence-auto', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDmStore();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('does not auto-drive a manually-set idle status', async () => {
    resetForDmTests();
    setMyStatus('idle');
    const restore = stubFetch({});
    const handle = startPresenceAutoDetect({ idleMs: 50, evalMs: 20, heartbeatMs: 1000 });
    await vi.advanceTimersByTimeAsync(100);
    expect(dmState.myPresence?.status).toBe('idle');
    handle.poke();
    await vi.advanceTimersByTimeAsync(100);
    expect(dmState.myPresence?.status).toBe('idle');
    handle.stop();
    restore();
  });

  it('flips online to idle after inactivity and back to online on poke', async () => {
    resetForDmTests();
    const status = (s: PresenceStatus) => ({ userId: 'u-me', status: s, customStatus: null, lastSeenAt: new Date().toISOString() });
    const restore = stubFetch({
      '/api/dm/presence': (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return { body: { success: true, presence: status(body.status as PresenceStatus) } };
      }
    });
    setMyStatus('online');
    const handle = startPresenceAutoDetect({ idleMs: 50, evalMs: 20, heartbeatMs: 1000 });
    await vi.advanceTimersByTimeAsync(100);
    expect(dmState.myPresence?.status).toBe('idle');
    handle.poke();
    await vi.advanceTimersByTimeAsync(50);
    expect(dmState.myPresence?.status).toBe('online');
    handle.stop();
    restore();
  });

  it('reload (pagehide) cancels the deferred offline write so the stored status survives', async () => {
    resetForDmTests();
    const posts: string[] = [];
    const status = (s: PresenceStatus) => ({ userId: 'u-me', status: s, customStatus: null, lastSeenAt: new Date().toISOString() });
    const restore = stubFetch({
      '/api/dm/presence': (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        if (body.status) posts.push(body.status);
        return { body: { success: true, presence: status(body.status as PresenceStatus) } };
      }
    });
    setMyStatus('online');
    const handle = startPresenceAutoDetect({ idleMs: 60_000, evalMs: 20, heartbeatMs: 60_000, hiddenMs: 100 });
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(10);
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(250);
    expect(dmState.myPresence?.status).toBe('online');
    expect(posts).toEqual([]);
    handle.stop();
    restore();
  });

  it('writes offline while hidden, then restores online when the user returns', async () => {
    resetForDmTests();
    const status = (s: PresenceStatus) => ({ userId: 'u-me', status: s, customStatus: null, lastSeenAt: new Date().toISOString() });
    const restore = stubFetch({
      '/api/dm/presence': (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return { body: { success: true, presence: status(body.status as PresenceStatus) } };
      }
    });
    setMyStatus('online');
    const handle = startPresenceAutoDetect({ idleMs: 60_000, evalMs: 20, heartbeatMs: 60_000, hiddenMs: 100 });
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(250);
    expect(dmState.myPresence?.status).toBe('offline');
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(100);
    expect(dmState.myPresence?.status).toBe('online');
    handle.stop();
    restore();
  });

  it('bfcache restore (pagehide then persisted pageshow) never writes offline and re-raises to online', async () => {
    resetForDmTests();
    const posts: string[] = [];
    const status = (s: PresenceStatus) => ({ userId: 'u-me', status: s, customStatus: null, lastSeenAt: new Date().toISOString() });
    const restore = stubFetch({
      '/api/dm/presence': (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        if (body.status) posts.push(body.status);
        return { body: { success: true, presence: status(body.status as PresenceStatus) } };
      }
    });
    setMyStatus('online');
    const handle = startPresenceAutoDetect({ idleMs: 60_000, evalMs: 20, heartbeatMs: 60_000, hiddenMs: 100 });

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(10);
    window.dispatchEvent(new Event('pagehide'));
    // Long enough that the deferred offline write WOULD have fired — pagehide
    // must have canceled it.
    await vi.advanceTimersByTimeAsync(250);
    expect(posts).toEqual([]);

    // Same-tab back / bfcache restore: re-arm the monitor as activity. The
    // page is visible again, so nothing offline is written and online stays.
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(100);
    expect(posts).toEqual([]);
    expect(dmState.myPresence?.status).toBe('online');
    handle.stop();
    restore();
  });

  it('heartbeats immediately when the tab returns to view after a long hidden spell', async () => {
    resetForDmTests();
    const beats: number[] = [];
    const restore = stubFetch({
      '/api/dm/presence/heartbeat': () => {
        beats.push(1);
        return { body: { success: true } };
      },
      '/api/dm/presence': (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return { body: { success: true, presence: { userId: 'u-me', status: body.status ?? 'dnd', customStatus: null, lastSeenAt: new Date().toISOString() } } };
      }
    });
    // Manual DND: hidden flushing never auto-writes it, so the stored row is
    // only kept fresh by heartbeats while the tab is away.
    setMyStatus('dnd');
    const handle = startPresenceAutoDetect({ idleMs: 600_000, evalMs: 20, heartbeatMs: 1000, hiddenMs: 100 });

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(2000);
    expect(beats.length).toBe(0);

    // Return: the heartbeat must fire NOW, not on the next interval tick.
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(10);
    expect(beats.length).toBe(1);
    handle.stop();
    restore();
  });

  it('poke re-raises auto idle to online without waiting for the eval tick', async () => {
    resetForDmTests();
    const status = (s: PresenceStatus) => ({ userId: 'u-me', status: s, customStatus: null, lastSeenAt: new Date().toISOString() });
    const restore = stubFetch({
      '/api/dm/presence': (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return { body: { success: true, presence: status(body.status as PresenceStatus) } };
      }
    });
    setMyStatus('online');
    const handle = startPresenceAutoDetect({ idleMs: 50, evalMs: 20, heartbeatMs: 60_000 });
    await vi.advanceTimersByTimeAsync(100);
    expect(dmState.myPresence?.status).toBe('idle');

    // Activity: the monitor flushes on poke itself, so 'idle' clears without
    // waiting for the next eval tick (which is 20ms away here).
    handle.poke();
    await vi.advanceTimersByTimeAsync(1);
    expect(dmState.myPresence?.status).toBe('online');
    handle.stop();
    restore();
  });

  function setMyStatus(status: PresenceStatus) {
    setDmState('myPresence', { status, customStatus: null });
  }

  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
    document.dispatchEvent(new Event('visibilitychange'));
  }
});