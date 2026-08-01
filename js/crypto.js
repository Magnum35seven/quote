/* ProjectPro — AES-GCM encryption with optional PIN / biometric gate (Web Crypto API)
 * A single app AES-256 key (K) encrypts sensitive fields + attachments.
 * - PIN disabled: K stored raw in IndexedDB (encryption at rest, protects backups/casual access).
 * - PIN enabled:  K wrapped with a PBKDF2(SHA-256, 250k) key derived from the PIN; K kept only in memory.
 * - Biometric (WebAuthn platform authenticator): quick-unlock gate that releases a stored copy of K
 *   after a successful local assertion (device-level security).
 */
'use strict';
window.PP = window.PP || {};

PP.crypto = (() => {
  let K = null;                          // active CryptoKey
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function importRaw(raw) {
    K = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }
  async function deriveKEK(pin, saltB64) {
    const salt = unb64(saltB64);
    const base = await crypto.subtle.importKey('raw', te.encode(String(pin)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encWithKey(key, dataU8) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, dataU8);
    return { iv: b64(iv), d: b64(ct) };
  }
  async function decWithKey(key, obj) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.iv) }, key, unb64(obj.d)));
  }

  /** Initialise security state. Returns {ready, locked, pinEnabled, biometricEnabled} */
  async function setup() {
    let sec = await PP.db.getKV('sec');
    if (!sec) {
      const raw = crypto.getRandomValues(new Uint8Array(32));
      sec = { k: 'sec', raw: b64(raw), pinEnabled: false, biometricEnabled: false };
      await PP.db.setKV('sec', sec);
    }
    if (sec.pinEnabled) {
      return { ready: false, locked: true, pinEnabled: true, biometricEnabled: !!sec.biometricEnabled };
    }
    if (sec.wrapped) { // biometric copy without PIN — use stored copy
      await importRaw(unb64(sec.bioKey || sec.raw));
    } else {
      await importRaw(unb64(sec.raw));
    }
    return { ready: true, locked: false, pinEnabled: false, biometricEnabled: false };
  }

  async function unlock(pin) {
    const sec = await PP.db.getKV('sec');
    if (!sec.pinEnabled) return true;
    try {
      const kek = await deriveKEK(pin, sec.salt);
      const raw = await decWithKey(kek, sec.wrapped);
      await importRaw(raw);
      return true;
    } catch { return false; }
  }

  async function unlockBiometric() {
    const sec = await PP.db.getKV('sec');
    if (!sec || !sec.biometricEnabled || !sec.bioCredId || !sec.bioKey) return false;
    try {
      await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: unb64(sec.bioCredId) }],
          userVerification: 'required', timeout: 60000
        }
      });
      await importRaw(unb64(sec.bioKey));
      return true;
    } catch { return false; }
  }

  async function enablePIN(pin) {
    const raw = await crypto.subtle.exportKey('raw', K);
    const saltB64 = b64(crypto.getRandomValues(new Uint8Array(16)));
    const kek = await deriveKEK(pin, saltB64);
    const sec = (await PP.db.getKV('sec')) || { k: 'sec' };
    sec.salt = saltB64;
    sec.wrapped = await encWithKey(kek, new Uint8Array(raw));
    sec.pinEnabled = true;
    delete sec.raw; delete sec.bioKey;
    await PP.db.setKV('sec', sec);
  }
  async function enableBiometric() {
    if (!window.PublicKeyCredential) return false;
    if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) return false;
    try {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'ProjectPro' },
          user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'projectpro-user', displayName: 'ProjectPro User' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
          timeout: 60000
        }
      });
      if (!cred) return false;
      const raw = await crypto.subtle.exportKey('raw', K);
      const sec = await PP.db.getKV('sec');
      sec.bioCredId = b64(cred.rawId);
      sec.bioKey = b64(raw);
      sec.biometricEnabled = true;
      await PP.db.setKV('sec', sec);
      return true;
    } catch { return false; }
  }
  async function disableSecurity() {
    const raw = await crypto.subtle.exportKey('raw', K);
    await PP.db.setKV('sec', { k: 'sec', raw: b64(raw), pinEnabled: false, biometricEnabled: false });
  }
  async function status() {
    const sec = await PP.db.getKV('sec');
    return { pinEnabled: !!(sec && sec.pinEnabled), biometricEnabled: !!(sec && sec.biometricEnabled) };
  }

  /** Encrypt a UTF-8 string -> {iv, d} (persistable). */
  async function encText(str) {
    if (!K) return null;
    return encWithKey(K, te.encode(String(str)));
  }
  async function decText(obj) {
    if (!obj || !K) return '';
    try { return td.decode(await decWithKey(K, obj)); } catch { return ''; }
  }
  /** Encrypt raw bytes -> {iv, d: base64} persistable payload. */
  async function encBytes(u8) {
    if (!K) throw new Error('Encryption key not ready');
    return encWithKey(K, u8);
  }
  /** Encrypt a Blob/File -> {iv, data: base64, type} for the attachments store. */
  async function encBlob(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const out = await encWithKey(K, buf);
    return { iv: out.iv, data: out.d, type: file.type || 'application/octet-stream' };
  }
  /** Decrypt an attachment record {iv, data(base64), type, encrypted} -> Blob. */
  async function decBlob(rec) {
    const payload = rec.data != null ? rec.data : rec.d;
    if (rec.encrypted === false) return new Blob([unb64(payload)], { type: rec.type });
    const bytes = await decWithKey(K, { iv: rec.iv, d: payload });
    return new Blob([bytes], { type: rec.type });
  }
  /** Decrypt a field value that may be encrypted ({iv,d}) or plain. */
  async function maybeDec(v) {
    if (v && typeof v === 'object' && v.iv && v.d) return decText(v);
    return v == null ? '' : String(v);
  }
  const ready = () => !!K;

  return { setup, unlock, unlockBiometric, enablePIN, enableBiometric, disableSecurity, status, encText, decText, encBytes, encBlob, decBlob, maybeDec, ready };
})();
