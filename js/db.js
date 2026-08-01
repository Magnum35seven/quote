/* ProjectPro — IndexedDB data layer: CRUD w/ transparent field encryption,
 * export/import, automatic encrypted backups, and first-run sample data. */
'use strict';
window.PP = window.PP || {};

PP.db = (() => {
  const U = PP.util;
  const DB_NAME = 'projectpro';
  const DB_VERSION = 1;
  const STORES = ['settings', 'customers', 'suppliers', 'materials', 'projects', 'expenses',
    'documents', 'attachments', 'reminders', 'sketches', 'backups', 'kv'];
  // Per-store list of fields that are AES-GCM encrypted at rest.
  const ENC_FIELDS = { customers: ['phone', 'email', 'address'], suppliers: ['phone', 'email', 'address'] };

  let _db = null;
  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            if (s === 'backups') db.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
            else if (s === 'kv') db.createObjectStore(s, { keyPath: 'k' });
            else db.createObjectStore(s, { keyPath: 'id' });
          }
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }
  const tx = (store, mode = 'readonly') => _db.transaction(store, mode).objectStore(store);
  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  /* ---------- field encryption helpers ---------- */
  async function encRecord(store, obj) {
    const fields = ENC_FIELDS[store];
    if (!fields || !PP.crypto.ready()) return obj;
    const copy = { ...obj };
    for (const f of fields) {
      if (copy[f] != null && copy[f] !== '' && typeof copy[f] === 'string') copy[f] = await PP.crypto.encText(copy[f]);
    }
    return copy;
  }
  async function decRecord(store, obj) {
    if (!obj) return obj;
    const fields = ENC_FIELDS[store];
    if (!fields) return obj;
    const copy = { ...obj };
    for (const f of fields) copy[f] = await PP.crypto.maybeDec(copy[f]);
    return copy;
  }

  /* ---------- CRUD ---------- */
  async function put(store, obj) {
    if (!obj.id) obj.id = U.uid();
    obj.updatedAt = U.nowISO();
    if (!obj.createdAt) obj.createdAt = obj.updatedAt;
    await reqP(tx(store, 'readwrite').put(await encRecord(store, obj)));
    _changed();
    return obj;
  }
  async function get(store, id) {
    const o = await reqP(tx(store).get(id));
    return decRecord(store, o);
  }
  async function all(store) {
    const rows = await reqP(tx(store).getAll());
    if (!rows || !rows.length) return rows || [];
    if (!ENC_FIELDS[store]) return rows;
    return Promise.all(rows.map((r) => decRecord(store, r)));
  }
  async function del(store, id) { await reqP(tx(store, 'readwrite').delete(id)); _changed(); }
  async function clearStore(store) { await reqP(tx(store, 'readwrite').clear()); _changed(); }

  function getKV(k) { return reqP(tx('kv').get(k)); }
  function setKV(k, v) { return reqP(tx('kv', 'readwrite').put({ ...v, k })); }

  /* ---------- Settings ---------- */
  const DEFAULT_SETTINGS = {
    id: 'app', theme: 'auto', unitSystem: 'metric', currency: 'AUD',
    taxRate: 10, taxName: 'GST', taxInclusiveDefault: false,
    quotePrefix: 'Q', invoicePrefix: 'INV', receiptPrefix: 'RCP',
    counters: { quote: 1, invoice: 1, receipt: 1 },
    quoteTerms: 'Quote valid for 30 days from date of issue. Prices are estimates and subject to final measurement. Variations must be agreed in writing.',
    invoiceTerms: 'Payment due within 14 days of invoice date unless otherwise agreed. Late payments may incur interest at 10% p.a.',
    receiptTerms: 'Thank you for your payment.',
    paymentDetails: { method: 'Bank transfer', bsb: '', account: '', payId: '' },
    business: { name: '', abn: '', phone: '', email: '', address: '', website: '', logoAttachmentId: '' },
    notifications: true, remindersDaysAhead: 3,
    autoBackup: true, backupKeep: 10, seeded: false
  };
  async function loadSettings() {
    let s = await reqP(tx('settings').get('app'));
    if (!s) { s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); await reqP(tx('settings', 'readwrite').put(s)); }
    else s = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...s, business: { ...DEFAULT_SETTINGS.business, ...(s.business || {}) }, paymentDetails: { ...DEFAULT_SETTINGS.paymentDetails, ...(s.paymentDetails || {}) }, counters: { ...DEFAULT_SETTINGS.counters, ...(s.counters || {}) } };
    PP.state = PP.state || {};
    PP.state.settings = s;
    return s;
  }
  async function saveSettings(patch) {
    const s = { ...PP.state.settings, ...patch, id: 'app', updatedAt: U.nowISO() };
    await reqP(tx('settings', 'readwrite').put(s));
    PP.state.settings = s;
    U.emit('settings', s);
    return s;
  }
  /** Allocate the next document number atomically-ish, e.g. "INV-2026-0042" */
  async function nextDocNumber(kind) {
    const s = PP.state.settings;
    const n = s.counters[kind] || 1;
    const prefix = s[(kind) + 'Prefix'] || kind.toUpperCase();
    await saveSettings({ counters: { ...s.counters, [kind]: n + 1 } });
    return `${prefix}-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
  }

  /* ---------- change tracking + automatic backups ---------- */
  let _changeCount = 0;
  function _changed() {
    _changeCount++;
    U.emit('data');
    if (PP.state && PP.state.settings && PP.state.settings.autoBackup && _changeCount >= 40) maybeBackup(true);
  }
  async function maybeBackup(auto = false) {
    if (auto) { if (_changeCount < 40) return; }
    _changeCount = 0;
    try { await backup('auto'); } catch (e) { console.warn('backup failed', e); }
  }
  async function backup(trigger = 'manual') {
    const data = await exportAll();
    let payload = JSON.stringify(data);
    let rec = { createdAt: U.nowISO(), trigger, size: payload.length, encrypted: false, payload };
    if (PP.crypto.ready()) {
      const enc = await PP.crypto.encText(payload);
      rec = { createdAt: rec.createdAt, trigger, size: payload.length, encrypted: true, iv: enc.iv, payload: enc.d };
    }
    await reqP(tx('backups', 'readwrite').add(rec));
    // rotate
    const keep = (PP.state.settings && PP.state.settings.backupKeep) || 10;
    const allB = await reqP(tx('backups').getAll());
    allB.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const old of allB.slice(keep)) await reqP(tx('backups', 'readwrite').delete(old.id));
    U.emit('backups');
    return rec;
  }
  async function listBackups() {
    const b = await reqP(tx('backups').getAll());
    return b.map(({ id, createdAt, trigger, size, encrypted }) => ({ id, createdAt, trigger, size, encrypted }))
      .sort((a, b2) => b2.createdAt.localeCompare(a.createdAt));
  }
  async function getBackupRaw(id) {
    const b = await reqP(tx('backups').get(id));
    if (!b) return null;
    if (b.encrypted) return PP.crypto.decText({ iv: b.iv, d: b.payload });
    return b.payload;
  }
  async function deleteBackup(id) { await reqP(tx('backups', 'readwrite').delete(id)); U.emit('backups'); }

  /* ---------- export / import ---------- */
  async function exportAll() {
    const out = { app: 'ProjectPro', version: 1, exportedAt: U.nowISO(), stores: {} };
    for (const s of STORES) {
      if (s === 'backups' || s === 'kv') continue;
      if (s === 'settings') { out.stores.settings = [{ ...PP.state.settings }]; continue; }
      if (s === 'attachments') {
        const atts = await reqP(tx('attachments').getAll());
        out.stores.attachments = [];
        for (const a of atts) {
          const blob = await PP.crypto.decBlob(a);
          const buf = new Uint8Array(await blob.arrayBuffer());
          let bin = ''; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
          out.stores.attachments.push({ id: a.id, name: a.name, type: a.type, refType: a.refType, refId: a.refId, createdAt: a.createdAt, dataB64: btoa(bin) });
        }
        continue;
      }
      out.stores[s] = await all(s);
    }
    return out;
  }
  async function importAll(json, mode = 'replace') {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || data.app !== 'ProjectPro' || !data.stores) throw new Error('Not a ProjectPro backup file');
    if (mode === 'replace') for (const s of STORES) if (s !== 'kv' && s !== 'backups') await clearStore(s);
    for (const [s, rows] of Object.entries(data.stores)) {
      if (!STORES.includes(s) || s === 'kv' || s === 'backups') continue;
      for (const row of rows) {
        if (s === 'attachments') {
          const bytes = Uint8Array.from(atob(row.dataB64), (c) => c.charCodeAt(0));
          const rec = { id: row.id, name: row.name, type: row.type, refType: row.refType, refId: row.refId, createdAt: row.createdAt || U.nowISO() };
          if (PP.crypto.ready()) {
            const enc = await PP.crypto.encBytes(bytes);
            Object.assign(rec, { encrypted: true, iv: enc.iv, data: enc.d });
          } else {
            let bin = ''; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
            Object.assign(rec, { encrypted: false, data: btoa(bin) });
          }
          await reqP(tx('attachments', 'readwrite').put(rec));
          continue;
        }
        if (s === 'settings') { await reqP(tx('settings', 'readwrite').put({ ...row, id: 'app' })); continue; }
        await reqP(tx(s, 'readwrite').put(await encRecord(s, row)));
      }
    }
    if (data.stores.settings && data.stores.settings[0]) await loadSettings();
    _changeCount = 0;
    U.emit('data');
    U.emit('imported');
  }

  /* ---------- attachments (photos / documents, encrypted at rest) ---------- */
  async function saveAttachment(file, refType, refId) {
    const rec = { id: U.uid('att'), name: file.name || 'file', refType: refType || '', refId: refId || '', createdAt: U.nowISO(), size: file.size || 0 };
    if (PP.crypto.ready()) {
      const enc = await PP.crypto.encBlob(file);
      Object.assign(rec, { encrypted: true, type: enc.type, iv: enc.iv, data: enc.data });
    } else {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      Object.assign(rec, { encrypted: false, type: file.type || 'application/octet-stream', data: btoa(bin) });
    }
    await reqP(tx('attachments', 'readwrite').put(rec));
    _changed();
    return rec;
  }
  async function getAttachmentBlob(id) {
    const rec = await reqP(tx('attachments').get(id));
    if (!rec) return null;
    return { blob: await PP.crypto.decBlob(rec), rec };
  }
  /** Data-URL (jpeg/png bytes re-encoded through canvas for PDF embedding). */
  async function getAttachmentDataURL(id, mime = 'image/jpeg', quality = .85, maxDim = 900) {
    const got = await getAttachmentBlob(id);
    if (!got) return null;
    if (!got.blob.type.startsWith('image/')) return null;
    const bmp = await createImageBitmap(got.blob);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * scale));
    cv.height = Math.max(1, Math.round(bmp.height * scale));
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return cv.toDataURL(mime, quality);
  }
  async function attachmentsFor(refType, refId) {
    const rows = await reqP(tx('attachments').getAll());
    return rows.filter((r) => r.refType === refType && r.refId === refId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  return {
    open, put, get, all, del, clearStore, getKV, setKV,
    loadSettings, saveSettings, nextDocNumber, DEFAULT_SETTINGS,
    backup, maybeBackup, listBackups, getBackupRaw, deleteBackup,
    exportAll, importAll,
    saveAttachment, getAttachmentBlob, getAttachmentDataURL, attachmentsFor,
    get changeCount() { return _changeCount; }
  };
})();
