/* ProjectPro — utilities: DOM helpers, formatting, dates, units, CSV, events */
'use strict';
window.PP = window.PP || {};

PP.util = (() => {
  /** RFC4122-ish unique id */
  const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

  const round2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;

  /* ---------- DOM ---------- */
  /** el('div.cls#id', {attrs}, ...children) */
  function el(spec, attrs, ...children) {
    const parts = spec.split(/(?=[.#])/);
    const node = document.createElement(parts[0] || 'div');
    for (const p of parts.slice(1)) {
      if (p.startsWith('.')) node.classList.add(...p.slice(1).split('.'));
      else if (p.startsWith('#')) node.id = p.slice(1);
    }
    if (attrs && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'onclick') node.addEventListener('click', v);
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'value') node.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected') node[k] = !!v;
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat(20)) {
      if (c == null || c === false) continue;
      node.append(c.nodeType ? c : document.createTextNode(c));
    }
    return node;
  }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Inline SVG icon by name, opts: size, cls */
  const icon = (name, size = 22) => {
    const path = PP.icons[name] || PP.icons.help;
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;
  };

  /* ---------- Money / numbers ---------- */
  function settings() { return PP.state && PP.state.settings ? PP.state.settings : {}; }
  function currency() { return (settings().currency) || 'AUD'; }
  function money(n, cur) {
    const c = cur || currency();
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: c }).format(Number(n) || 0);
    } catch { return c + ' ' + (Number(n) || 0).toFixed(2); }
  }
  const num = (n, d = 2) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (n) => num(n, 1) + '%';

  /* ---------- Dates ---------- */
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const nowISO = () => new Date().toISOString();
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso); if (isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };
  function friendlyDate(iso) {
    if (!iso) return '';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1) return `in ${diff} days`;
    return `${-diff} days ago`;
  }
  const addDaysISO = (iso, days) => { const d = new Date((iso || todayISO()) + 'T00:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
  const monthKey = (iso) => (iso || '').slice(0, 7); // YYYY-MM

  /* ---------- Units ---------- */
  const UNIT_DEFS = {
    length:  { metric: [['m', 1], ['cm', 100], ['mm', 1000]],        imperial: [['ft', 3.28084], ['in', 39.3701]] },
    area:    { metric: [['m²', 1]],                                   imperial: [['ft²', 10.7639], ['yd²', 1.19599]] },
    volume:  { metric: [['m³', 1], ['L', 1000]],                      imperial: [['ft³', 35.3147], ['gal', 264.172]] },
    weight:  { metric: [['kg', 1], ['t', .001]],                      imperial: [['lb', 2.20462], ['oz', 35.274]] },
    liquid:  { metric: [['L', 1], ['mL', 1000]],                      imperial: [['gal', .264172], ['fl oz', 33.814]] }
  };
  function unitSystem() { return settings().unitSystem || 'metric'; }
  /** Convert a base-unit (metric SI: m, m², m³, kg, L) value to the active system. Returns {value, unit}. */
  function displayUnit(kind, baseValue, prefer) {
    const defs = (UNIT_DEFS[kind] || UNIT_DEFS.length)[unitSystem()] || UNIT_DEFS[kind].metric;
    let pick = defs[0];
    if (prefer) { const hit = defs.find((d) => d[0] === prefer); if (hit) pick = hit; }
    else if (defs.length > 1) { // choose human-friendly magnitude
      for (const d of defs) if (Math.abs(baseValue * d[1]) >= 1) pick = d;
    }
    return { value: baseValue * pick[1], unit: pick[0] };
  }
  function fmtUnit(kind, baseValue, digits = 2, prefer) {
    const r = displayUnit(kind, baseValue, prefer);
    return `${num(r.value, digits)} ${r.unit}`;
  }
  /** Parse user-entered value with unit into base SI. e.g. parseUnit("12 ft","length") -> 3.6576 */
  function parseUnit(str, kind) {
    const m = String(str || '').trim().match(/^(-?[\d.,]+)\s*(.*)$/);
    if (!m) return 0;
    const val = parseFloat(m[1].replace(',', '.')) || 0;
    const unitTxt = (m[2] || '').trim().toLowerCase();
    if (!unitTxt) return val; // assume base
    const all = [...UNIT_DEFS[kind].metric, ...UNIT_DEFS[kind].imperial];
    const hit = all.find((d) => d[0].toLowerCase() === unitTxt || d[0].toLowerCase().replace(/[^a-z]/g, '') === unitTxt.replace(/[^a-z]/g, ''));
    return hit ? val / hit[1] : val;
  }

  /* ---------- CSV ---------- */
  function toCSV(headers, rows) {
    const cell = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n');
  }
  function parseCSV(text) {
    const rows = []; let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => c !== ''));
  }
  /** Convert records -> CSV using columns [{key,label}] */
  const recordsToCSV = (cols, recs) => toCSV(cols.map((c) => c.label), recs.map((r) => cols.map((c) => (typeof c.value === 'function' ? c.value(r) : r[c.key]))));
  /** Import CSV text with header row, mapping headers to object keys via map {csvHeader: key} */
  function csvToRecords(text, columns) {
    const rows = parseCSV(text);
    if (!rows.length) return [];
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const out = [];
    for (const r of rows.slice(1)) {
      const o = {};
      for (const col of columns) {
        const idx = head.indexOf(col.label.toLowerCase());
        if (idx >= 0) o[col.key] = r[idx];
      }
      out.push(o);
    }
    return out;
  }

  /* ---------- Files ---------- */
  function download(filename, data, mime = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const copyText = async (t) => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };

  /* ---------- Events (loose coupling between data layer and views) ---------- */
  const listeners = {};
  const on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); };
  const emit = (evt, payload) => { (listeners[evt] || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } }); };

  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const sum = (arr, fn = (x) => x) => arr.reduce((a, x) => a + (+fn(x) || 0), 0);
  const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return {
    uid, round2, el, $, $$, esc, icon, money, num, pct, currency,
    todayISO, nowISO, fmtDate, fmtDateTime, friendlyDate, addDaysISO, monthKey,
    unitSystem, displayUnit, fmtUnit, parseUnit, UNIT_DEFS,
    toCSV, parseCSV, recordsToCSV, csvToRecords, download, copyText,
    on, emit, debounce, sum, initials
  };
})();
