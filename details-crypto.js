/* Encrypted-details format, shared by the browser and the Node build (same file, so they cannot drift).
   AES-GCM 256, key from PBKDF2-SHA256 (>= 600,000 iterations), random 16-byte salt, random 12-byte IV.
   Envelope: { v, kdf, alg, iter, salt, iv, ct } with base64 binary fields. The passphrase is never stored. */
(function () {
  'use strict';
  const FORMAT = { v: 1, kdf: 'PBKDF2-SHA256', alg: 'AES-256-GCM', minIter: 600000, maxIter: 5000000, saltLen: 16, ivLen: 12 };
  const AAD = new TextEncoder().encode('japan-trip-details/v1');   // binds the ciphertext to this format version

  class CryptoError extends Error {
    constructor(code, message) { super(message); this.name = 'CryptoError'; this.code = code; }
  }

  const subtle = () => {
    const c = globalThis.crypto;
    if (!c || !c.subtle) throw new CryptoError('unsupported', 'Web Crypto is not available here (it needs HTTPS or localhost).');
    return c.subtle;
  };
  const toB64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
  const fromB64 = (str) => { const s = atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };

  async function deriveKey(passphrase, salt, iter, extractable) {
    const base = await subtle().importKey('raw', new TextEncoder().encode(String(passphrase).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, !!extractable, ['encrypt', 'decrypt']);
  }

  function validateEnvelope(env) {
    const bad = (m) => { throw new CryptoError('format', 'The encrypted details file is not valid: ' + m); };
    if (!env || typeof env !== 'object') bad('not an object');
    if (env.v !== FORMAT.v) bad('unsupported version');
    if (env.kdf !== FORMAT.kdf || env.alg !== FORMAT.alg) bad('unsupported algorithms');
    if (!Number.isInteger(env.iter) || env.iter < FORMAT.minIter || env.iter > FORMAT.maxIter) bad('iteration count out of range');
    for (const f of ['salt', 'iv', 'ct']) if (typeof env[f] !== 'string') bad('missing ' + f);
    let salt, iv;
    try { salt = fromB64(env.salt); iv = fromB64(env.iv); fromB64(env.ct); } catch (e) { bad('bad encoding'); }
    if (salt.length !== FORMAT.saltLen || iv.length !== FORMAT.ivLen) bad('wrong salt or IV length');
    return env;
  }

  /** Encrypt a JSON-serialisable object. Returns the envelope (safe to publish). */
  async function encryptJSON(obj, passphrase, opts) {
    const iter = (opts && opts.iterations) || FORMAT.minIter;
    if (iter < FORMAT.minIter) throw new CryptoError('format', 'Refusing fewer than ' + FORMAT.minIter + ' iterations.');
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(FORMAT.saltLen));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(FORMAT.ivLen));
    const key = await deriveKey(passphrase, salt, iter, false);
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return { v: FORMAT.v, kdf: FORMAT.kdf, alg: FORMAT.alg, iter, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
  }

  /** Decrypt with an existing CryptoKey. Throws CryptoError('badpass') on any authentication failure; never returns partial data. */
  async function decryptWithKey(env, key) {
    validateEnvelope(env);
    let plain;
    try {
      plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(env.iv), additionalData: AAD }, key, fromB64(env.ct));
    } catch (e) {
      throw new CryptoError('badpass', 'Wrong passphrase, or the details file has changed.');
    }
    return JSON.parse(new TextDecoder().decode(plain));
  }

  /** Derive a NON-extractable key from the passphrase and decrypt. Returns { data, key }. */
  async function decryptWithPassphrase(env, passphrase) {
    validateEnvelope(env);
    const key = await deriveKey(passphrase, fromB64(env.salt), env.iter, false);
    return { data: await decryptWithKey(env, key), key };
  }

  /** Identifies one specific encrypted file, so a remembered key is dropped after the passphrase is rotated. */
  const fingerprint = (env) => env.salt + '.' + env.iv;

  const api = { FORMAT, CryptoError, validateEnvelope, encryptJSON, decryptWithKey, decryptWithPassphrase, fingerprint };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.DetailsCrypto = api;
})();
