// Client-side encryption for the private cloud sync (time budget + calendar).
//
// The user's data is encrypted BEFORE it ever leaves the device:
// - AES-256-GCM for the payload itself,
// - a per-user random salt, and
// - a key derived from the account password via PBKDF2-SHA256 (150k rounds).
//
// The server only ever receives and stores the opaque { salt, iv, ciphertext }
// blob, so even a database administrator with full read access cannot see the
// plaintext. Decryption only ever happens in the browser, with the key that is
// derived locally from the account password. The derived key is cached per
// account on the device so a session restored from a stored token can unlock
// the cloud copy automatically without re-prompting for the password.

export const BUDGET_CRYPT_VERSION = 1;

const KDF_ITERATIONS = 150_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;

export interface EncryptedBudgetBlob {
  v: number;
  /** base64, 16 random bytes. Stored so the key can be re-derived later. */
  salt: string;
  /** base64, 12 random bytes (AES-GCM nonce). */
  iv: string;
  /** base64 — ciphertext with the 16-byte GCM auth tag appended. */
  ciphertext: string;
  updatedAt: string;
}

interface CryptoLike {
  subtle: SubtleCrypto;
  getRandomValues<T extends ArrayBufferView>(array: T): T;
}

let resolvedCrypto: CryptoLike | null = null;

async function getCrypto(): Promise<CryptoLike> {
  if (resolvedCrypto) return resolvedCrypto;
  const g = globalThis as unknown as { crypto?: CryptoLike };
  if (g.crypto?.subtle && typeof g.crypto.getRandomValues === 'function') {
    resolvedCrypto = g.crypto;
    return resolvedCrypto;
  }
  // Node workers (vitest runs the tests in happy-dom) do not always expose
  // WebCrypto on globalThis - fall back to node:crypto there. This branch can
  // never run in a browser, so the dynamic import is never bundled.
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { webcrypto } = await import('node:crypto');
    resolvedCrypto = webcrypto as unknown as CryptoLike;
    return resolvedCrypto;
  }
  throw new Error('WebCrypto is not available in this environment.');
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  getCryptoRandomValues(bytes);
  return bytes;
}

function getCryptoRandomValues(bytes: Uint8Array): void {
  // getCrypto() resolves asynchronously, but getRandomValues is also available
  // synchronously on the global crypto object in every supported environment
  // (browsers and modern Node). Prefer it, then fall back to node:crypto.
  const g = globalThis as unknown as { crypto?: { getRandomValues: <T extends ArrayBufferView>(a: T) => T } };
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
    return;
  }
  throw new Error('No cryptographically secure random source available.');
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to avoid call-stack limits on large payloads in older browsers.
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function generateBudgetSalt(): string {
  return bytesToBase64(randomBytes(SALT_BYTES));
}

/**
 * Deterministic salt for a (account, password) pair. Used when no cloud copy
 * exists yet: every device that logs in with the same password derives the
 * SAME salt and therefore the SAME AES key, so a blob pushed by any device is
 * readable by every other device with that password. A per-user random salt at
 * this point is what used to drift keys apart across devices and lock each
 * other out of the first pushed blob.
 */
export async function deriveBudgetSalt(userId: string, password: string): Promise<string> {
  const c = await getCrypto();
  const material = new TextEncoder().encode(`${userId}\u0000waifu-space-budget-salt\u0000${password}`);
  const digest = new Uint8Array(await c.subtle.digest('SHA-256', material));
  return bytesToBase64(digest);
}

/** Derives the AES-256-GCM key from the account password + stored salt. */
export async function deriveBudgetKey(password: string, saltB64: string): Promise<CryptoKey> {
  const c = await getCrypto();
  const salt = base64ToBytes(saltB64);
  const material = await c.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await c.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    material,
    KEY_BITS
  );
  // The AES key is created extractable so its raw bytes can be persisted on the
  // device (see exportBudgetKey) and the cloud copy can be unlocked later
  // without the password. The raw bytes never leave localStorage.
  return c.subtle.importKey('raw', bits, 'AES-GCM', true, ['encrypt', 'decrypt']);
}

/**
 * Exports the raw AES key bytes (base64) so the derived key can be persisted
 * locally for automatic re-unlock on later sessions.
 */
export async function exportBudgetKey(key: CryptoKey): Promise<string> {
  const c = await getCrypto();
  const raw = new Uint8Array(await c.subtle.exportKey('raw', key));
  return bytesToBase64(raw);
}

/**
 * Re-imports a persisted raw AES key (base64) into a non-extractable CryptoKey.
 * Only the raw bytes are local; re-exporting is never needed after this.
 */
export async function importBudgetKey(rawB64: string): Promise<CryptoKey> {
  const c = await getCrypto();
  return c.subtle.importKey('raw', base64ToBytes(rawB64), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Encrypts an arbitrary JSON-serializable value into an opaque blob. */
export async function encryptBudgetState(
  data: unknown,
  key: CryptoKey,
  saltB64: string,
  updatedAt: string
): Promise<EncryptedBudgetBlob> {
  const c = await getCrypto();
  const iv = randomBytes(IV_BYTES);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = new Uint8Array(
    await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  );
  return {
    v: BUDGET_CRYPT_VERSION,
    salt: saltB64,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    updatedAt
  };
}

/**
 * Decrypts an opaque blob back into its JSON value. Returns null when the
 * blob is malformed, tampered with, or the key does not match (wrong
 * password) - the GCM auth tag guarantees this detection.
 */
export async function decryptBudgetState(
  blob: EncryptedBudgetBlob,
  key: CryptoKey
): Promise<unknown | null> {
  try {
    const c = await getCrypto();
    const iv = base64ToBytes(blob.iv);
    const ciphertext = base64ToBytes(blob.ciphertext);
    const plain = await c.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

/** Structural sanity check for a value received from the network / storage. */
export function isEncryptedBudgetBlob(raw: unknown): raw is EncryptedBudgetBlob {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const b = raw as Record<string, unknown>;
  return (
    b.v === BUDGET_CRYPT_VERSION &&
    typeof b.salt === 'string' &&
    b.salt.length > 0 &&
    typeof b.iv === 'string' &&
    b.iv.length > 0 &&
    typeof b.ciphertext === 'string' &&
    b.ciphertext.length > 0 &&
    typeof b.updatedAt === 'string' &&
    !Number.isNaN(new Date(b.updatedAt).getTime())
  );
}