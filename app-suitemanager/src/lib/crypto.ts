// Password hashing via PBKDF2-SHA256 in Web Crypto.
// Stored format: `pbkdf2-sha256$<iterations>$<saltBase64>$<hashBase64>`

const ITERATIONS = 100_000;
const HASH = 'SHA-256';
const KEY_LEN_BYTES = 32;
const SALT_LEN_BYTES = 16;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iter: number
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: HASH },
    key,
    KEY_LEN_BYTES * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_LEN_BYTES);
  crypto.getRandomValues(salt);
  const derived = await derive(password, salt, ITERATIONS);
  return `pbkdf2-sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iter = parseInt(parts[1], 10);
  if (!Number.isFinite(iter) || iter < 1000) return false;
  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  const actual = await derive(password, salt, iter);
  if (actual.length !== expected.length) return false;
  // Constant-time compare.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Reversible secret encryption — AES-GCM via Web Crypto.
//
// Used for the property credentials vault (vendor logins, fire-alarm codes,
// lock-box codes). Unlike account passwords (which are one-way hashed above),
// these MUST be decryptable so a GM can reveal them. The 32-byte key lives in
// the Cloudflare Worker secret `CREDENTIALS_KEY` (base64) — never in source.
//
// Storage: `ciphertext` (base64, includes the GCM auth tag) + `iv` (base64,
// a fresh 12-byte nonce per encryption). Decrypt only server-side, in the
// audited reveal endpoint.
// ---------------------------------------------------------------------------

const AES_IV_BYTES = 12; // 96-bit nonce, the GCM standard.
const AES_KEY_BYTES = 32; // AES-256.

// WebCrypto wants a `BufferSource`; the strict DOM lib doesn't widen a typed
// Uint8Array to it, so hand it the backing ArrayBuffer directly.
function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

async function importAesKey(keyB64: string): Promise<CryptoKey> {
  if (!keyB64) throw new Error('CREDENTIALS_KEY not configured');
  const raw = fromBase64(keyB64);
  if (raw.length !== AES_KEY_BYTES) {
    throw new Error(
      `CREDENTIALS_KEY must be a base64-encoded ${AES_KEY_BYTES}-byte key`
    );
  }
  return crypto.subtle.importKey('raw', bufferOf(raw), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptSecret(
  keyB64: string,
  plaintext: string
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importAesKey(keyB64);
  const iv = new Uint8Array(AES_IV_BYTES);
  crypto.getRandomValues(iv);
  const enc = new TextEncoder();
  const buf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: bufferOf(iv) },
    key,
    bufferOf(enc.encode(plaintext))
  );
  return { ciphertext: toBase64(new Uint8Array(buf)), iv: toBase64(iv) };
}

export async function decryptSecret(
  keyB64: string,
  ciphertext: string,
  iv: string
): Promise<string> {
  const key = await importAesKey(keyB64);
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bufferOf(fromBase64(iv)) },
    key,
    bufferOf(fromBase64(ciphertext))
  );
  return new TextDecoder().decode(buf);
}
