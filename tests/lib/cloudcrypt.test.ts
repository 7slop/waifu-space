import { describe, it, expect } from 'vitest';
import {
  generateBudgetSalt,
  deriveBudgetKey,
  encryptBudgetState,
  decryptBudgetState,
  isEncryptedBudgetBlob,
  BUDGET_CRYPT_VERSION
} from '../../src/lib/cloudcrypt';

const SAMPLE_STATE = {
  activities: [
    {
      id: 'act-1',
      name: 'C++',
      icon: 'code',
      minHours: 4,
      targetHours: 8,
      dangerHours: 12,
      currentMinutes: 245,
      history: [
        { timestamp: '2026-09-13T10:00:00.000Z', minutes: 45 },
        { timestamp: '2026-09-13T11:00:00.000Z', minutes: 200, note: 'daily kata' }
      ],
      lastResetWeek: '2026-W37',
      priority: 1,
      color: '#ff6584'
    }
  ],
  settings: { resetDay: 1, resetHour: 0, notifications: true, catchUpReminders: true }
};

async function buildBlob(password: string) {
  const salt = generateBudgetSalt();
  const key = await deriveBudgetKey(password, salt);
  const updatedAt = '2026-09-13T12:00:00.000Z';
  const blob = await encryptBudgetState(SAMPLE_STATE, key, salt, updatedAt);
  return { salt, key, blob };
}

describe('cloudcrypt (time budget end-to-end encryption)', () => {
  it('round-trips a payload with the same password', async () => {
    const { key, blob } = await buildBlob('hunter2');
    expect(isEncryptedBudgetBlob(blob)).toBe(true);
    expect(blob.v).toBe(BUDGET_CRYPT_VERSION);
    expect(blob.salt.length).toBeGreaterThan(0);
    expect(blob.iv.length).toBeGreaterThan(0);
    expect(blob.ciphertext).not.toContain('C++'); // plaintext never leaks into the blob

    const decrypted = await decryptBudgetState(blob, key);
    expect(decrypted).toEqual(SAMPLE_STATE);
  });

  it('refuses to decrypt with the wrong password (GCM auth tag)', async () => {
    const { blob } = await buildBlob('hunter2');
    const wrongKey = await deriveBudgetKey('hunter3', blob.salt);
    expect(await decryptBudgetState(blob, wrongKey)).toBeNull();
  });

  it('detects tampered ciphertext', async () => {
    const { key, blob } = await buildBlob('hunter2');
    const tampered: string = blob.ciphertext[0] === 'A' ? 'B' + blob.ciphertext.slice(1) : 'A' + blob.ciphertext.slice(1);
    expect(await decryptBudgetState({ ...blob, ciphertext: tampered }, key)).toBeNull();
  });

  it('derives a different key for a different salt', async () => {
    const saltA = generateBudgetSalt();
    const keyA = await deriveBudgetKey('pw', saltA);
    const keyB = await deriveBudgetKey('pw', generateBudgetSalt());
    // Keys are non-extractable, so prove the difference behaviourally: data
    // encrypted under keyA must refuse to decrypt under keyB.
    const blob = await encryptBudgetState(SAMPLE_STATE, keyA, saltA, 'x');
    expect(await decryptBudgetState(blob, keyB)).toBeNull();
  });

  it('derives the same key for the same password + salt across calls', async () => {
    const salt = generateBudgetSalt();
    const a = await deriveBudgetKey('pw', salt);
    const b = await deriveBudgetKey('pw', salt);
    expect(await decryptBudgetState(await encryptBudgetState(SAMPLE_STATE, a, salt, 'x'), b)).toEqual(SAMPLE_STATE);
  });

  it('rejects structurally invalid blobs', () => {
    expect(isEncryptedBudgetBlob(null)).toBe(false);
    expect(isEncryptedBudgetBlob({})).toBe(false);
    expect(isEncryptedBudgetBlob({ v: 99, salt: 'a', iv: 'b', ciphertext: 'c', updatedAt: 'now' })).toBe(false);
    expect(isEncryptedBudgetBlob({ v: 1, salt: '', iv: 'b', ciphertext: 'c', updatedAt: new Date().toISOString() })).toBe(false);
  });
});