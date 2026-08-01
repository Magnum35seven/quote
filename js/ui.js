/* ProjectPro — UI toolkit: dialogs, toasts, field builders, empty states,
 * confirm prompts, search overlay, lock screen, attachment grids, charts. */
'use strict';
window.PP = window.PP || {};

PP.ui = (() => {
  const U = PP.util;
  const { el, icon } = U;

  /* ---------------- toasts ---------------- */
  function toast(msg, opts = {}) {
    const t = el('div.toast', { role: 'status' }, el('span', {}, msg),
      opts.action ? el('button', { onclick: () => { opts.action.fn(); t.remove(); } }, opts.action.label) : null);
    document.getElementById('layer-toasts').append(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, opts.ms || 3200);
  }

  /* ---------------- dialogs ---------------- */
  let dialogCount = 0;
  /** dialog({title, body (Node), actions:[{label, kind, onClick(data, close), keep}], onClose, wide}) -> close() */
  function dialog({ title, body, actions = [], onClose, wide = false } = {}) {
    dialogCount++;
    const close = (result) => {
      scrim.remove(); dialogCount--;
      document.removeEventListener('keydown', onKey, true);
      onClose && onClose(result);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    const getData = () => {
      const data = {};
      body.querySelectorAll('[data-field]').forEach((inp) => {
        if (inp.type === 'checkbox') data[inp.dataset.field] = inp.checked;
        else if (inp.type === 'number' || inp.dataset.number != null) data[inp.dataset.field] = inp.value === '' ? null : parseFloat(inp.value);
        else data[inp.dataset.field] = inp.value;
      });
      return data;
    };
    const dlg = el('div.dialog' + (wide ? '.full' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div.dialog-head', {}, el('h2', {}, title), el('button.ic-btn', { onclick: () => close(), 'aria-label': 'Close', html: icon('close') })),
      el('div.dialog-body', {}, body),
      actions.length ? el('div.dialog-actions', {}, actions.map((a) => el('button.btn.' + (a.kind || 'text'), {
        onclick: () => { if (a.onClick) a.onClick(getData(), close); }
      }, a.icon ? icon(a.icon, 18) : null, a.label))) : null
    );
    const scrim = el('div.scrim', { onclick: (e) => { if (e.target === scrim) close(); } }, dlg);
    document.getElementById('layer-dialogs').append(scrim);
    setTimeout(() => { const f = dlg.querySelector('input,select,textarea'); f && f.focus(); }, 50);
    return close;
  }

  function confirm({ title = 'Are you sure?', message = '', okLabel = 'Delete', danger = true }) {
    return new Promise((resolve) => {
      dialog({
        title,
        body: el('div', {}, el('p', { style: 'color:var(--on-surface-variant);margin-bottom:4px' }, message)),
        onClose: () => resolve(false),
        actions: [
          { label: 'Cancel', kind: 'text', onClick: (d, close) => { close(); resolve(false); } },
          { label: okLabel, kind: danger ? 'danger' : 'filled', onClick: (d, close) => { close(); resolve(true); } }
        ]
      });
    });
  }

  /* ---------------- field builders (use data-field for dialog getData) ---------------- */
  function field(label, input, hint) {
    return el('div.field', {}, el('label', {}, label), input, hint ? el('div.hint', {}, hint) : null);
  }
  const input = (name, value, opts = {}) => el('input', {
    'data-field': name, value: value ?? '', type: opts.type || 'text',
    placeholder: opts.placeholder || '', step: opts.step, min: opts.min, max: opts.max,
    enterkeyhint: opts.enterkeyhint
  });
  const numberInput = (name, value, opts = {}) => input(name, value ?? '', { type: 'number', step: opts.step || 'any', min: opts.min, ...opts });
  const textarea = (name, value, opts = {}) => el('textarea', { 'data-field': name, placeholder: opts.placeholder || '' }, value ?? '');
  const select = (name, value, options, opts = {}) => el('select', { 'data-field': name },
    options.map(([v, label]) => el('option', { value: v, selected: String(v) === String(value) }, label)));
  const fieldRow = (...fields) => el('div.field-row', {}, ...fields);

  /* ---------------- misc components ---------------- */
  const emptyState = (iconName, title, msg) => el('div.empty', {}, icon(iconName, 56), el('h3', {}, title), el('div', {}, msg || ''));
  const chip = (label, kind = '', iconName) => el('span.chip' + (kind ? '.' + kind : ''), {}, iconName ? icon(iconName, 15) : null, label);

  function statusChip(status) {
    const MAP = {
      draft: ['Draft', 'tonal'], sent: ['Sent', 'primary'], viewed: ['Viewed', 'primary'],
      accepted: ['Accepted', 'success'], declined: ['Declined', 'error'], converted: ['Converted', 'success'],
      paid: ['Paid', 'success'], overdue: ['Overdue', 'error'], partial: ['Part paid', 'warning'],
      quoted: ['Quoted', 'primary'], approved: ['Approved', 'primary'], active: ['Active', 'success'],
      'on-hold': ['On hold', 'warning'], completed: ['Completed', 'success'], cancelled: ['Cancelled', 'error']
    };
    const [label, kind] = MAP[status] || [status || '—', 'tonal'];
    return chip(label, kind);
  }

  function progressBar(pct, small) {
    return el('div.progress' + (small ? '.small' : ''), {}, el('div', { style: `width:${Math.min(100, Math.max(0, pct))}%` }));
  }

  function kpi(label, value, sub, kind = '') {
    return el('div.card', {}, el('div.kpi', {},
      el('span.kpi-label', {}, label),
      el('span.kpi-value' + (kind ? '.' + kind : ''), {}, value),
      sub ? el('span.kpi-sub', {}, sub) : null));
  }

  function listItem({ title, sub, avatarText, iconName, end, onClick, selected }) {
    return el('div.list-item' + (selected ? '.selected' : ''), { onclick: onClick, role: onClick ? 'button' : null, tabindex: onClick ? '0' : null },
      avatarText != null ? el('div.avatar', {}, avatarText) : el('div.avatar', { html: icon(iconName || 'project') }),
      el('div.li-main', {}, el('div.li-title', {}, title), sub ? el('div.li-sub', {}, sub) : null),
      end ? el('div.li-end', {}, end) : null);
  }

  /* ---------------- attachment grid ---------------- */
  async function attachmentGrid(refType, refId, { onChange, readOnly = false } = {}) {
    const wrap = el('div');
    const atts = await PP.db.attachmentsFor(refType, refId);
    if (!atts.length) { wrap.append(el('div.muted', {}, 'No attachments yet.')); return wrap; }
    const grid = el('div.attach-grid');
    for (const a of atts) {
      const cell = el('div.attach-cell', { title: a.name });
      if (a.type && a.type.startsWith('image/')) {
        const { blob } = await PP.db.getAttachmentBlob(a.id);
        const url = URL.createObjectURL(blob);
        cell.append(el('img', { src: url, alt: a.name, loading: 'lazy' }));
        cell.onclick = () => window.open(url, '_blank');
        grid.append(cell);
      } else {
        cell.append(el('div.file-badge', {}, icon('attach'), el('span', {}, a.name)));
        cell.onclick = async () => { const { blob } = await PP.db.getAttachmentBlob(a.id); U.download(a.name, blob); };
        grid.append(cell);
      }
      if (!readOnly) {
        cell.append(el('button.del-att', {
          title: 'Remove', onclick: async (e) => {
            e.stopPropagation();
            if (await PP.ui.confirm({ title: 'Remove attachment?', message: a.name, okLabel: 'Remove' })) {
              await PP.db.del('attachments', a.id); onChange && onChange();
            }
          }
        }, '×'));
      }
    }
    wrap.append(grid);
    return wrap;
  }

  function attachButton(refType, refId, onAdded) {
    const fileInput = el('input', { type: 'file', multiple: '', accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt', style: 'display:none' });
    fileInput.onchange = async () => {
      for (const f of fileInput.files) {
        try { await PP.db.saveAttachment(f, refType, refId); }
        catch (e) { console.error(e); toast('Could not save ' + f.name); }
      }
      fileInput.value = '';
      onAdded && onAdded();
      toast('Attachment saved');
    };
    const btn = el('button.btn.tonal', { onclick: () => fileInput.click() }, icon('camera', 18), 'Add photo / file', fileInput);
    return btn;
  }

  /* ---------------- charts (SVG, dependency-free) ---------------- */
  function barChart(data, { width = 560, height = 200, colors = ['#6750A4', '#B3261E'], series = ['rev', 'exp'], labels = [] } = {}) {
    const maxV = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s] || 0)));
    const n = data.length, groupW = width / Math.max(1, n), barW = Math.min(22, groupW / (series.length + 1));
    let bars = '';
    data.forEach((d, i) => {
      const gx = i * groupW + (groupW - barW * series.length) / 2;
      series.forEach((s, j) => {
        const h = (d[s] || 0) / maxV * (height - 42);
        bars += `<rect x="${(gx + j * barW).toFixed(1)}" y="${(height - 26 - h).toFixed(1)}" width="${(barW - 3).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="3" fill="${colors[j]}"/>`;
      });
      bars += `<text x="${(i * groupW + groupW / 2).toFixed(1)}" y="${height - 10}" font-size="10" text-anchor="middle" fill="currentColor" opacity=".7">${U.esc(d.label)}</text>`;
    });
    const grid = [0, .5, 1].map((f) => {
      const y = height - 26 - f * (height - 42);
      return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="currentColor" stroke-opacity=".12"/><text x="2" y="${y - 3}" font-size="9" fill="currentColor" opacity=".5">${f === 1 ? U.num(maxV, 0) : f === .5 ? U.num(maxV / 2, 0) : '0'}</text>`;
    }).join('');
    const svg = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;max-width:${width * 1.6}px" role="img" aria-label="Bar chart">${grid}${bars}</svg>`;
    const legendHtml = labels.length ? `<div class="legend">${labels.map((l, i) => `<span><i style="background:${colors[i]}"></i>${U.esc(l)}</span>`).join('')}</div>` : '';
    return el('div.chart-box', { html: svg + legendHtml });
  }

  function donutChart(segments, { size = 170 } = {}) {
    const total = U.sum(segments, (s) => s.value) || 1;
    const R = 70, C = 2 * Math.PI * R;
    let offset = 0, arcs = '';
    for (const s of segments) {
      const frac = s.value / total;
      arcs += `<circle cx="85" cy="85" r="${R}" fill="none" stroke="${s.color}" stroke-width="26" stroke-dasharray="${(frac * C).toFixed(1)} ${(C - frac * C).toFixed(1)}" stroke-dashoffset="${(-offset * C).toFixed(1)}" transform="rotate(-90 85 85)"/>`;
      offset += frac;
    }
    const legend = segments.map((s) => `<span><i style="background:${s.color}"></i>${U.esc(s.label)} — ${U.esc(s.text || String(s.value))}</span>`).join('');
    return el('div', { html: `<svg viewBox="0 0 170 170" style="width:${size}px;height:${size}px">${arcs}</svg><div class="legend" style="margin-top:8px">${legend}</div>` });
  }

  /* ---------------- global search ---------------- */
  async function globalSearchOverlay() {
    const body = el('div');
    const inputEl = el('input', { type: 'search', placeholder: 'Search projects, customers, materials, documents…', 'aria-label': 'Search' });
    const results = el('div.search-results');
    const box = el('div.search-box', {}, inputEl, results);
    const ov = el('div.search-overlay', { onclick: (e) => { if (e.target === ov) ov.remove(); } }, box);
    document.body.append(ov);
    inputEl.focus();
    const onKey = (e) => { if (e.key === 'Escape') { ov.remove(); } };
    document.addEventListener('keydown', onKey, { once: true });
    ov.addEventListener('remove', () => document.removeEventListener('keydown', onKey));

    const run = U.debounce(async () => {
      const q = inputEl.value.trim().toLowerCase();
      results.innerHTML = '';
      if (q.length < 2) return;
      const go = (hash) => (e) => { e.preventDefault(); ov.remove(); location.hash = hash; };
      const add = (label, items) => {
        if (!items.length) return;
        results.append(el('div.group-label', {}, label), ...items);
      };
      const [projects, customers, suppliers, materials, docs] = await Promise.all([
        PP.db.all('projects'), PP.db.all('customers'), PP.db.all('suppliers'), PP.db.all('materials'), PP.db.all('documents')
      ]);
      add('Projects', projects.filter((p) => [p.name, p.address, p.status].join(' ').toLowerCase().includes(q)).slice(0, 6)
        .map((p) => listItem({ title: p.name, sub: (p.address || '') + ' • ' + (p.status || ''), iconName: 'project', onClick: go('#/project/' + p.id) })));
      add('Customers', customers.filter((c) => [c.name, c.phone, c.email, c.address].join(' ').toLowerCase().includes(q)).slice(0, 6)
        .map((c) => listItem({ title: c.name, sub: c.phone || c.email || '', avatarText: U.initials(c.name), onClick: go('#/customer/' + c.id) })));
      add('Materials', materials.filter((m) => [m.name, m.category].join(' ').toLowerCase().includes(q)).slice(0, 6)
        .map((m) => listItem({ title: m.name, sub: m.category, iconName: 'materials', onClick: go('#/materials?q=' + encodeURIComponent(m.name)) })));
      add('Suppliers', suppliers.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 4)
        .map((s) => listItem({ title: s.name, sub: s.phone || s.email || '', iconName: 'suppliers', onClick: go('#/supplier/' + s.id) })));
      add('Documents', docs.filter((d) => [d.number, d.status, d.kind].join(' ').toLowerCase().includes(q)).slice(0, 6)
        .map((d) => listItem({ title: d.number, sub: `${d.kind} • ${d.status}`, iconName: d.kind, onClick: go('#/document/' + d.id) })));
      if (!results.children.length) results.append(emptyState('search', 'No results', 'Try a different search term.'));
    }, 200);
    inputEl.addEventListener('input', run);
  }

  /* ---------------- lock screen ---------------- */
  function lockScreen(onUnlock, reason) {
    let entered = '';
    const dots = el('div.pin-dots', {}, ...[0, 1, 2, 3].map(() => el('span')));
    const msg = el('div.muted', {}, reason || 'Enter your PIN');
    const screen = el('div.lock-screen', {},
      el('img', { src: 'assets/icons/icon-192.png', alt: 'ProjectPro' }),
      el('h2', { style: 'font-size:20px' }, 'ProjectPro is locked'),
      dots, msg, el('div.pin-pad'));
    const state = PP.state._lockState = { promise: null, resolve: null };
    state.promise = new Promise((res) => state.resolve = res);

    const setDots = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < entered.length));
    const submit = async () => {
      const ok = await PP.crypto.unlock(entered);
      entered = ''; setDots();
      if (ok) { screen.remove(); state.resolve(true); onUnlock && onUnlock(); }
      else { msg.textContent = 'Incorrect PIN — try again'; msg.style.color = 'var(--error)'; setTimeout(() => { msg.textContent = 'Enter your PIN'; msg.style.color = ''; }, 1400); }
    };
    const pad = screen.querySelector('.pin-pad');
    [1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, ''].forEach((k) => {
      pad.append(el('button', {
        onclick: () => {
          if (k === '⌫') { entered = entered.slice(0, -1); setDots(); return; }
          if (k === '' || entered.length >= 4) return;
          entered += k; setDots();
          if (entered.length === 4) submit();
        }
      }, k === '' ? '' : String(k)));
    });
    (async () => {
      const st = await PP.crypto.status();
      if (st.biometricEnabled && window.PublicKeyCredential) {
        screen.append(el('button.btn.tonal', {
          onclick: async () => {
            const ok = await PP.crypto.unlockBiometric();
            if (ok) { screen.remove(); state.resolve(true); onUnlock && onUnlock(); }
            else toast('Biometric unlock failed — use your PIN');
          }
        }, icon('fingerprint', 18), 'Unlock with biometrics'));
      }
    })();
    document.body.append(screen);
    return state.promise;
  }

  /* ---------------- signature pad ---------------- */
  function signaturePad({ onSave }) {
    const cv = el('canvas', { width: 600, height: 200, style: 'width:100%;border:1.5px dashed var(--outline);border-radius:12px;background:#fff;touch-action:none' });
    const ctx = cv.getContext('2d');
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#1a1a2e';
    let drawing = false, dirty = false;
    const pos = (e) => { const r = cv.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return [(p.clientX - r.left) * (cv.width / r.width), (p.clientY - r.top) * (cv.height / r.height)]; };
    const start = (e) => { drawing = true; dirty = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); e.preventDefault(); };
    const move = (e) => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); e.preventDefault(); };
    const end = () => drawing = false;
    cv.addEventListener('pointerdown', start); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', end); cv.addEventListener('pointerleave', end);
    return {
      node: el('div', {}, cv, el('div.btn-row', {},
        el('button.btn.text', { onclick: () => { ctx.clearRect(0, 0, cv.width, cv.height); dirty = false; } }, 'Clear'),
        el('button.btn.filled', {
          onclick: async () => {
            if (!dirty) { toast('Please sign first'); return; }
            const dataUrl = cv.toDataURL('image/jpeg', .85);
            const file = new File([await (await fetch(dataUrl)).blob()], 'signature.jpg', { type: 'image/jpeg' });
            const rec = await PP.db.saveAttachment(file, 'signature', '');
            onSave(rec);
          }
        }, icon('check', 18), 'Save signature'))),
      hasInk: () => dirty
    };
  }

  return { toast, dialog, confirm, field, input, numberInput, textarea, select, fieldRow, emptyState, chip, statusChip, progressBar, kpi, listItem, attachmentGrid, attachButton, barChart, donutChart, globalSearchOverlay, lockScreen, signaturePad };
})();
