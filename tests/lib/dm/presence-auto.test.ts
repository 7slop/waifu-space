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

  function setMyStatus(status: PresenceStatus) {
    setDmState('myPresence', { status, customStatus: null });
  }
});