import { strict as assert } from 'assert';
import { test } from 'node:test';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/* Mirror of collab.js's E2E envelope (sections/collab.js › collabEnc/collabDec) as pure
   functions, so the encryption scheme can be verified deterministically without a browser
   or the CDN noble module. The browser uses @noble/ciphers' synchronous AES-256-GCM; here
   we use Node's synchronous createCipheriv with the IDENTICAL byte layout:

     envelope value = { c: base64url( nonce[12] ‖ ciphertext ‖ gcmTag[16] ) }

   Both are standard AES-256-GCM (12-byte IV, 16-byte tag) so the layout is interoperable.
   Keep this in lockstep with collabEnc/collabDec. */

const NONCE = 12, TAG = 16;

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDec(str) {
  str = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return new Uint8Array(Buffer.from(str, 'base64'));
}

// enc = true mirrors _collabEncOn; when false collabEnc is a passthrough (deep clone).
function enc(v, key, on = true) {
  if (!on) return v == null ? v : JSON.parse(JSON.stringify(v));
  const pt = Buffer.from(JSON.stringify(v === undefined ? null : v), 'utf8');
  const nonce = randomBytes(NONCE);
  const c = createCipheriv('aes-256-gcm', key, nonce);
  const body = Buffer.concat([c.update(pt), c.final()]);
  const tag = c.getAuthTag();                                  // noble appends the tag to the ciphertext
  const packed = Buffer.concat([nonce, body, tag]);
  return { c: b64url(packed) };
}
function dec(v, key) {
  if (v && typeof v === 'object' && typeof v.c === 'string') {
    const packed = Buffer.from(b64urlDec(v.c));
    const nonce = packed.subarray(0, NONCE);
    const tag = packed.subarray(packed.length - TAG);
    const body = packed.subarray(NONCE, packed.length - TAG);
    const d = createDecipheriv('aes-256-gcm', key, nonce);
    d.setAuthTag(tag);
    const pt = Buffer.concat([d.update(body), d.final()]);
    return JSON.parse(pt.toString('utf8'));
  }
  return v == null ? v : JSON.parse(JSON.stringify(v));         // plaintext passthrough
}

const KEY = randomBytes(32);

test('round-trips an entity object through encrypt → decrypt', () => {
  const eng = { uid: 'u1', name: 'Ann Solberg', salary: 92000, idcard: { reportsTo: 3 } };
  const env = enc(eng, KEY);
  assert.equal(typeof env.c, 'string');
  assert.ok(!JSON.stringify(env).includes('Solberg'), 'ciphertext must not leak plaintext');
  assert.deepEqual(dec(env, KEY), eng);
});

test('every encryption uses a fresh nonce (ciphertext differs for identical input)', () => {
  const v = { uid: 'u1', name: 'Same' };
  assert.notEqual(enc(v, KEY).c, enc(v, KEY).c);
  assert.deepEqual(dec(enc(v, KEY), KEY), v);                   // …yet both decrypt correctly
});

test('a different key cannot decrypt (GCM auth tag fails, not silent garbage)', () => {
  const env = enc({ uid: 'u1', name: 'Secret' }, KEY);
  assert.throws(() => dec(env, randomBytes(32)));
});

test('tampering with the ciphertext is rejected by the auth tag', () => {
  const env = enc({ uid: 'u1', name: 'Secret' }, KEY);
  const packed = Buffer.from(b64urlDec(env.c));
  packed[packed.length - 1] ^= 0xff;                           // flip a bit in the tag
  assert.throws(() => dec({ c: b64url(packed) }, KEY));
});

test('plaintext values pass through unchanged (back-compat / mixed-room guard)', () => {
  const plain = { uid: 'u1', name: 'Legacy' };                 // no .c envelope
  assert.deepEqual(dec(plain, KEY), plain);
});

test('encryption off = passthrough, and dec still reads it (plaintext room)', () => {
  const v = { uid: 'u1', name: 'Open' };
  const stored = enc(v, KEY, false);
  assert.deepEqual(stored, v);                                  // stored as-is
  assert.deepEqual(dec(stored, KEY), v);
});

test('log-entry envelope keeps id + ts in the clear, hides the payload', () => {
  // Mirror of collabEncEntry: id + ts plaintext (dedupe + ordering), rest encrypted.
  const entry = { id: 'e1', ts: '2026-07-18T10:00:00Z', actor: 'Benoit', action: 'create',
                  entityType: 'engineer', label: 'Ann Solberg' };
  const e = enc(entry, KEY);
  const stored = { id: entry.id, ts: entry.ts, c: e.c };
  assert.ok(!JSON.stringify(stored).includes('Solberg'), 'person name must not leak in the log');
  assert.equal(stored.id, 'e1');                                // visible for dedupe
  const back = dec({ c: stored.c }, KEY);
  back.id = stored.id;
  assert.deepEqual(back, entry);
});

test('key is 32 bytes and base64url round-trips (matches collabRndKey layout)', () => {
  const k = randomBytes(32);
  const s = b64url(k);
  assert.ok(!/[+/=]/.test(s), 'base64url is URL-fragment-safe');
  assert.deepEqual(Buffer.from(b64urlDec(s)), k);
});
