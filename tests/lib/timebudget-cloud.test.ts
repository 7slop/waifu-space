import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  state,
  setState,
  DEFAULT_STATE,
  addTimeBudgetActivity,
  unlockBudgetKey,
  loadBudgetFromCloud,
  pushBudgetToCloud,
  forgetBudgetKey,
  isBudgetUnlocked,
  budgetKeyReady,
  budgetCloudStatus
} from '../../src/lib/store';
import { generateBudgetSalt, deriveBudgetKey, encryptBudgetState, exportBudgetKey } from '../../src/lib/cloudcrypt';

const CLOUD_PRIVACY = {
  timebudget: {
    activities: [
      {
        id: 'act-cloud',
        name: 'C++',
        icon: 'code',
        minHours: 4,
        targetHours: 8,
        dangerHours: 12,
        currentMinutes: 245,
        history: [],
        lastResetWeek: '',
        priority: 1
      }
    ],
    settings: { resetDay: 1, resetHour: 0, notifications: true, catchUpReminders: true }
  },
  calendar: {
    events: [
      { id: 'cal-1', title: 'Chill', start: '2026-09-12T19:00:00Z', end: '2026-09-12T20:00:00Z', allDay: false, type: 'event', completed: false, color: '#6c5ce7', recurrence: 'none' },
      { id: 'cal-2', title: 'Cram', start: '2026-09-12T18:00:00Z', end: '2026-09-12T18:30:00Z', allDay: false, type: 'task', completed: true, color: 'not-a-hex', recurrence: 'daily' }
    ],
    occurrenceOverrides: []
  }
};

function fakeResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function buildCloudBlob(password: string, payload: unknown) {
  const salt = generateBudgetSalt();
  const key = await deriveBudgetKey(password, salt);
  const blob = await encryptBudgetState(payload, key, salt, new Date().toISOString());
  return { key, salt, blob };
}

describe('Time Budget encrypted cloud sync (store wiring)', () => {
  beforeEach(() => {
    localStorage.clear();
    setState(JSON.parse(JSON.stringify(DEFAULT_STATE)));
    forgetBudgetKey();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    forgetBudgetKey();
  });

  it('never pushes while the budget key is missing (locked)', async () => {
    const fetchMock = stubFetch(() => fakeResponse({ success: true }));
    setState('user', { id: 'u1', username: 'senpai', token: 'tok-1' });
    expect(isBudgetUnlocked()).toBe(false);
    expect(await pushBudgetToCloud()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(budgetCloudStatus()).toBe('locked');
  });

  it('unlock without a cloud copy caches a key, then pushes an encrypted blob', async () => {
    stubFetch((url, init) => {
      if (init?.method === 'POST') return fakeResponse({ success: true, syncedAt: new Date().toISOString() });
      return fakeResponse({ success: true, blob: null });
    });
    setState('user', { id: 'u1', username: 'senpai', token: 'tok-1' });
    addTimeBudgetActivity({ name: 'Guitar', minHours: 1, targetHours: 2, dangerHours: null, priority: 5, icon: 'music-notes' });

    expect(await unlockBudgetKey('hunter2')).toBe(true);
    expect(budgetKeyReady()).toBe(true);
    expect(isBudgetUnlocked()).toBe(true);

    expect(await pushBudgetToCloud()).toBe(true);
    const post = vi.mocked(fetch).mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(post).toBeTruthy();
    const body = JSON.parse((post![1] as RequestInit).body as string);
    expect(body.blob.v).toBe(1);
    expect(typeof body.blob.salt).toBe('string');
    expect(body.blob.salt.length).toBeGreaterThan(0);
    expect(typeof body.blob.iv).toBe('string');
    expect(typeof body.blob.ciphertext).toBe('string');
    expect(body.blob.ciphertext).not.toContain('Guitar');
  });

  it('locks when a cloud copy exists but no password-derived key is in memory', async () => {
    const { blob } = await buildCloudBlob('secret', CLOUD_PRIVACY);
    stubFetch(() => fakeResponse({ success: true, blob }));
    setState('user', { id: 'u2', username: 'senpai', token: 'tok-2' });

    expect(isBudgetUnlocked()).toBe(false);
    await loadBudgetFromCloud('tok-2');
    expect(budgetCloudStatus()).toBe('locked');
    expect(state.timebudget.activities.length).toBe(0); // local untouched
    expect(await pushBudgetToCloud()).toBe(false); // never overwrites the cloud copy
  });

  it('unlocks with the right password, decrypts and merges the cloud data', async () => {
    const { blob } = await buildCloudBlob('secret', CLOUD_PRIVACY);
    stubFetch(() => fakeResponse({ success: true, blob }));
    setState('user', { id: 'u2', username: 'senpai', token: 'tok-2' });

    expect(await unlockBudgetKey('secret')).toBe(true);
    expect(budgetCloudStatus()).toBe('synced');
    expect(state.timebudget.activities.map(a => a.name)).toEqual(['C++']);
    expect(state.timebudget.activities[0].icon).toBe('code');
    // The decrypted blob also merges the encrypted calendar.
    expect(state.calendar.events.map(e => e.id)).toEqual(['cal-1', 'cal-2']);
    expect(state.calendar.events[1].title).toBe('Cram');
    expect(state.calendar.events[1].color).toBe('#ff6584'); // invalid hex sanitized
  });

  it('locks (instead of clobbering) on a wrong password', async () => {
    const { blob } = await buildCloudBlob('secret', CLOUD_PRIVACY);
    stubFetch((_url, init) => {
      if (init?.method === 'POST') return fakeResponse({ success: true });
      return fakeResponse({ success: true, blob });
    });
    setState('user', { id: 'u2', username: 'senpai', token: 'tok-2' });

    expect(await unlockBudgetKey('wrongpass')).toBe(false);
    expect(budgetCloudStatus()).toBe('locked');
    expect(isBudgetUnlocked()).toBe(false);
    expect(state.timebudget.activities.length).toBe(0);
    expect(await pushBudgetToCloud()).toBe(false);
  });

  it('auto-unlocks from the persisted key without re-entering the password', async () => {
    let uploadedBlob: any = null;
    stubFetch((_url, init) => {
      if (init?.method === 'POST') {
        uploadedBlob = JSON.parse(init.body as string).blob;
        return fakeResponse({ success: true, syncedAt: new Date().toISOString() });
      }
      return fakeResponse({ success: true, blob: uploadedBlob });
    });
    setState('user', { id: 'u3', username: 'AutoUnlock', token: 'tok-3' });
    addTimeBudgetActivity({ name: 'Painting', minHours: 2, targetHours: 4, dangerHours: null, priority: 2, icon: 'palette' });

    expect(await unlockBudgetKey('s3cret')).toBe(true);
    expect(await pushBudgetToCloud()).toBe(true);
    expect(uploadedBlob).toBeTruthy();

    // A fresh tab boots with the stored session token: in-memory key is gone,
    // but the persisted key (localStorage) survives.
    forgetBudgetKey();
    expect(isBudgetUnlocked()).toBe(false);
    expect(budgetKeyReady()).toBe(false);

    // The boot path pulls the cloud blob with no password and auto-unlocks.
    await loadBudgetFromCloud('tok-3');
    expect(budgetKeyReady()).toBe(true);
    expect(isBudgetUnlocked()).toBe(true);
    expect(budgetCloudStatus()).toBe('synced');
    expect(state.timebudget.activities[0].name).toBe('Painting');
  });

  it('encrypts the calendar too - no plaintext leaks into the blob', async () => {
    stubFetch((url, init) => {
      if (init?.method === 'POST') return fakeResponse({ success: true, syncedAt: new Date().toISOString() });
      return fakeResponse({ success: true, blob: null });
    });
    setState('user', { id: 'u4', username: 'EncryptCheck', token: 'tok-4' });
    addTimeBudgetActivity({ name: 'Yoga', minHours: 1, targetHours: 2, dangerHours: null, priority: 1, icon: 'yoga' });
    setState('calendar', 'events', [
      { id: 'c-ev', title: 'Secret Appointment', start: '2026-09-13T10:00:00Z', end: '2026-09-13T11:00:00Z', allDay: false, type: 'event', completed: false, color: '#ff6584', recurrence: 'none' }
    ]);

    await unlockBudgetKey('p4ssw0rd');
    expect(await pushBudgetToCloud()).toBe(true);
    const post = vi.mocked(fetch).mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'POST');
    const body = JSON.parse((post![1] as RequestInit).body as string);
    expect(body.blob.v).toBe(1);
    expect(body.blob.ciphertext).not.toContain('Yoga');
    expect(body.blob.ciphertext).not.toContain('Secret Appointment');
    expect(body.blob.ciphertext.length).toBeGreaterThan(20);
  });

  it('a second device with the same password can decrypt what the first device pushed', async () => {
    // Device A: first ever login for this account -> deterministic salt, push.
    let cloud: any = null;
    stubFetch((_url, init) => {
      if (init?.method === 'POST') {
        cloud = JSON.parse(init.body as string).blob;
        return fakeResponse({ success: true, syncedAt: new Date().toISOString() });
      }
      return fakeResponse({ success: true, blob: cloud });
    });
    setState('user', { id: 'u5', username: 'CrossDevice', token: 'tok-5' });
    addTimeBudgetActivity({ name: 'Cross', minHours: 1, targetHours: 2, dangerHours: null, priority: 1, icon: 'globe' });

    expect(await unlockBudgetKey('shared-pw')).toBe(true);
    expect(await pushBudgetToCloud()).toBe(true);
    expect(cloud).toBeTruthy();

    // Device B: brand-new tab, same account + password, no persisted key.
    localStorage.clear();
    forgetBudgetKey();
    setState(JSON.parse(JSON.stringify(DEFAULT_STATE)));
    setState('user', { id: 'u5', username: 'CrossDevice', token: 'tok-5' });

    stubFetch((_url, init) => {
      if (init?.method === 'POST') return fakeResponse({ success: true, syncedAt: new Date().toISOString() });
      return fakeResponse({ success: true, blob: cloud });
    });

    expect(await unlockBudgetKey('shared-pw')).toBe(true);
    expect(isBudgetUnlocked()).toBe(true);
    expect(budgetCloudStatus()).toBe('synced');
    // The first device's activity was pulled from the cloud and merged.
    expect(state.timebudget.activities.map(a => a.name)).toEqual(['Cross']);
    // And the second device re-encrypts under the SAME salt (no drift).
    expect(await pushBudgetToCloud()).toBe(true);
    const B = JSON.parse((vi.mocked(fetch).mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'POST')![1] as RequestInit).body as string).blob;
    expect(B.salt).toBe(cloud.salt);
  });

  it('re-derives against the cloud salt when the local cached salt drifted (heal)', async () => {
    // A blob was created on another device with its own (random) salt.
    const { blob } = await buildCloudBlob('pw-heal', CLOUD_PRIVACY);
    stubFetch((_url, init) => {
      if (init?.method === 'POST') return fakeResponse({ success: true, syncedAt: new Date().toISOString() });
      return fakeResponse({ success: true, blob: null });
    });
    setState('user', { id: 'u6', username: 'Heal', token: 'tok-6' });

    // This device unlocked BEFORE the cloud copy existed, so it cached a key
    // under a locally-derived salt.
    expect(await unlockBudgetKey('pw-heal')).toBe(true);

    // Now the cloud copy (with a different salt) shows up: the cached key
    // cannot decrypt it -> it must stay locked, never overwrite it.
    stubFetch((_url, init) => {
      if (init?.method === 'POST') return fakeResponse({ success: true, syncedAt: new Date().toISOString() });
      return fakeResponse({ success: true, blob });
    });
    await loadBudgetFromCloud('tok-6');
    expect(budgetCloudStatus()).toBe('locked');
    expect(state.timebudget.activities.length).toBe(0);

    // A correct-password login must re-derive against the blob's OWN salt and
    // recover - this was previously impossible because the cached key made
    // unlockBudgetKey return early (permanent lockout).
    expect(await unlockBudgetKey('pw-heal')).toBe(true);
    expect(budgetCloudStatus()).toBe('synced');
    expect(isBudgetUnlocked()).toBe(true);
    expect(state.timebudget.activities.map(a => a.name)).toEqual(['C++']);
    expect(await pushBudgetToCloud()).toBe(true);
  });

  it('never hollows out real local data with an empty cloud blob', async () => {
    // A leftover empty blob (created by the old clobber bug) must NOT wipe a
    // device that has actual activities and events.
    const empty = {
      timebudget: { activities: [], settings: { resetDay: 1, resetHour: 0, notifications: true, catchUpReminders: true } },
      calendar: { events: [], occurrenceOverrides: [] }
    };
    const { blob } = await buildCloudBlob('pw-keep', empty);
    stubFetch((_url, init) => {
      if (init?.method === 'POST') return fakeResponse({ success: true, syncedAt: new Date().toISOString() });
      return fakeResponse({ success: true, blob });
    });
    setState('user', { id: 'u7', username: 'KeepLocal', token: 'tok-7' });
    addTimeBudgetActivity({ name: 'Keep Me', minHours: 1, targetHours: 2, dangerHours: null, priority: 1, icon: 'heart' });
    setState('calendar', 'events', [
      { id: 'keep-ev', title: 'Keep Event', start: new Date().toISOString(), end: new Date().toISOString(), allDay: false, type: 'event', completed: false, color: '#ff6584', recurrence: 'none' }
    ]);

    await unlockBudgetKey('pw-keep');
    expect(isBudgetUnlocked()).toBe(true);
    expect(state.timebudget.activities.map(a => a.name)).toEqual(['Keep Me']);
    expect(state.calendar.events.map(e => e.title)).toEqual(['Keep Event']);

    // The next push repairs the cloud copy with the real data.
    expect(await pushBudgetToCloud()).toBe(true);
    const post = vi.mocked(fetch).mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'POST');
    const body = JSON.parse((post![1] as RequestInit).body as string);
    expect(body.blob.ciphertext).not.toContain('Keep Me'); // still encrypted
    expect(body.blob.salt).toBe(blob.salt);
  });

  it('drops a stale persisted key that can no longer decrypt the cloud blob (wedge fix)', async () => {
    // A blob was created (e.g. on another device) under its own random salt.
    const { blob } = await buildCloudBlob('pw-wedge', CLOUD_PRIVACY);

    // This device carries a PERSISTED key from a pre-fix build that was derived
    // under a DIFFERENT (drifted/random) salt - it can never decrypt the blob.
    const staleSalt = generateBudgetSalt();
    const staleKey = await deriveBudgetKey('pw-wedge', staleSalt);
    localStorage.setItem(
      `waifu_space_budget_key_v1_u9`,
      JSON.stringify({ v: 1, raw: await exportBudgetKey(staleKey), salt: staleSalt })
    );

    stubFetch((_url, init) => {
      if (init?.method === 'POST') return fakeResponse({ success: true, syncedAt: new Date().toISOString() });
      return fakeResponse({ success: true, blob });
    });
    setState('user', { id: 'u9', username: 'Wedge', token: 'tok-9' });

    // Auto-login from a stored token: the restored stale key fails to decrypt.
    await loadBudgetFromCloud('tok-9');
    expect(budgetCloudStatus()).toBe('locked');
    expect(state.timebudget.activities.length).toBe(0);

    // The wedge fix: the useless persisted key was REMOVED, so a later auto-login
    // starts clean instead of being permanently stuck on the bad key.
    expect(localStorage.getItem('waifu_space_budget_key_v1_u9')).toBeNull();
    expect(isBudgetUnlocked()).toBe(false);

    // A correct-password login re-derives against the blob's own salt and recovers.
    expect(await unlockBudgetKey('pw-wedge')).toBe(true);
    expect(budgetCloudStatus()).toBe('synced');
    expect(state.timebudget.activities.map(a => a.name)).toEqual(['C++']);
    expect(localStorage.getItem('waifu_space_budget_key_v1_u9')).not.toBeNull();
  });
});