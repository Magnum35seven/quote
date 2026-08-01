/* ProjectPro — bootstrap: DB open, security unlock, theme, router, nav,
 * notifications, install handling, first-run sample data, service worker. */
'use strict';
window.PP = window.PP || {};

PP.app = (() => {
  const U = PP.util, ui = PP.ui;
  const { el, icon } = U;

  const NAV = [
    { hash: '#/dashboard', view: 'dashboard' },
    { hash: '#/projects', view: 'projects' },
    { hash: '#/customers', view: 'people' },
    { hash: '#/suppliers', view: 'people' },
    { hash: '#/materials', view: 'materials' },
    { hash: '#/documents', view: 'documents' },
    { hash: '#/sketch', view: 'sketch' },
    { hash: '#/reports', view: 'reports' },
    { hash: '#/settings', view: 'settings' }
  ];
  const MOBILE = ['#/dashboard', '#/projects', '#/documents', '#/sketch', '#/settings'];
  let currentRoute = { view: 'dashboard', params: [], query: new URLSearchParams() };

  /* ---------------- routing ---------------- */
  function parseHash() {
    const raw = (location.hash || '#/dashboard').replace(/^#/, '');
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    let view = 'dashboard', params = [];
    const head = parts[0];
    if (head === 'project' || head === 'customer' || head === 'supplier' || head === 'document') {
      view = { project: 'projects', customer: 'people', supplier: 'people', document: 'documents' }[head];
      params = parts.slice(1);
    } else if (head === 'customers' || head === 'suppliers') { view = 'people'; }
    else if (NAV.some((n) => n.hash === '#/' + head)) { view = head; }
    return { view, params, query: new URLSearchParams(qs || '') };
  }

  async function render() {
    currentRoute = parseHash();
    const { view, params, query } = currentRoute;
    const appEl = document.getElementById('app');
    appEl.innerHTML = '';
    const shell = buildShell();
    const scroll = shell.querySelector('.main-scroll');
    scroll.innerHTML = '';
    const mod = PP.views[view];
    document.title = (mod ? mod.title : 'ProjectPro') + ' — ProjectPro';
    shell.querySelector('.page-title').textContent = mod ? mod.title : 'ProjectPro';
    await mod.render(scroll, params, query);
    scroll.scrollTop = 0;
  }

  function activeBase(hash) {
    const h = '#' + (hash.split('/').slice(0, 2).join('/'));
    if (h === '#/project') return '#/projects';
    if (h === '#/customer') return '#/customers';
    if (h === '#/supplier') return '#/suppliers';
    if (h === '#/document') return '#/documents';
    return h;
  }

  function buildShell() {
    const base = activeBase(currentRoute.view === 'people' ? '#/' + (location.hash.split('/')[1] || 'customers') : location.hash);
    const shell = el('div.app-shell');
    /* top bar */
    const titleBtn = el('button.ic-btn', { title: 'Toggle theme', html: icon(themeIcon()), onclick: cycleTheme, 'aria-label': 'Toggle theme' });
    const backupDot = el('span', { id: 'backup-dot', title: 'Unsaved changes — auto-backup pending', style: 'width:9px;height:9px;border-radius:50%;background:var(--warning);display:' + (PP.db.changeCount >= 40 ? 'inline-block' : 'none') });
    shell.append(el('header.topbar', {},
      el('div.brand', {}, el('img', { src: 'assets/icons/icon-192.png', alt: '' }), el('span', {}, 'ProjectPro')),
      el('div.page-title', {}),
      backupDot,
      el('button.ic-btn', { title: 'Search', 'aria-label': 'Search', html: icon('search'), onclick: () => ui.globalSearchOverlay() }),
      titleBtn,
      el('button.ic-btn', { title: 'Backup now', 'aria-label': 'Backup now', html: icon('shield'), onclick: async () => { const st = PP.state._lockState; await PP.db.backup('manual'); ui.toast('Backup saved locally'); backupDot.style.display = 'none'; } })));
    /* body + nav */
    const rail = el('nav.nav-rail', { 'aria-label': 'Main navigation' },
      NAV.map((n) => {
        const mod = PP.views[n.view];
        const isActive = base === n.hash || (n.view === 'people' && ['#/customers', '#/suppliers'].includes(base) && n.hash === base);
        return el('button.rail-item' + (isActive ? '.active' : ''), { onclick: () => location.hash = n.hash },
          el('span.ic', { html: icon(n.view === 'people' ? (n.hash === '#/suppliers' ? 'suppliers' : 'customers') : mod.icon) }),
          el('span', {}, n.view === 'people' ? (n.hash === '#/suppliers' ? 'Suppliers' : 'Customers') : mod.title));
      }));
    const scroll = el('div.main-scroll', { id: 'main-scroll' });
    const body = el('div.body-row', {}, rail, scroll);
    /* bottom nav (mobile) */
    const bottom = el('nav.bottom-nav', { 'aria-label': 'Main navigation' },
      MOBILE.map((hashStr) => {
        const n = NAV.find((x) => x.hash === hashStr);
        const mod = PP.views[n.view];
        const icons = { '#/dashboard': 'dashboard', '#/projects': 'project', '#/documents': 'documents', '#/sketch': 'sketch', '#/settings': 'settings' };
        return el('button.nav-item' + (base === hashStr ? '.active' : ''), { onclick: () => location.hash = hashStr },
          el('span.ic', { html: icon(icons[hashStr]) }), el('span', {}, mod.title));
      }));
    shell.append(body, bottom);
    document.getElementById('app').append(shell);
    return shell;
  }

  const themeIcon = () => document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon';
  function applyTheme() {
    const t = (PP.state.settings && PP.state.settings.theme) || 'auto';
    const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const eff = t === 'auto' ? (sysDark ? 'dark' : 'light') : t;
    document.documentElement.dataset.theme = eff;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', eff === 'dark' ? '#141218' : '#6750A4');
  }
  async function cycleTheme() {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    await PP.db.saveSettings({ theme: next });
    applyTheme();
    const btn = document.querySelector('.topbar [aria-label="Toggle theme"]');
    if (btn) btn.innerHTML = icon(themeIcon());
  }

  /* ---------------- reminders / notifications ---------------- */
  async function checkReminders() {
    const s = PP.state.settings;
    if (!s.notifications) return;
    const reminders = await PP.db.all('reminders');
    const due = reminders.filter((r) => !r.done && r.date <= U.todayISO());
    if (due.length) ui.toast(`${due.length} reminder${due.length > 1 ? 's' : ''} due — see dashboard`, { ms: 6000 });
    if ('Notification' in window && Notification.permission === 'granted') {
      for (const r of due.slice(0, 3)) {
        try { new Notification('ProjectPro reminder', { body: r.title, icon: 'assets/icons/icon-192.png', tag: r.id }); } catch {}
      }
    }
  }

  /* ---------------- install prompt ---------------- */
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    const banner = el('div.install-banner', {},
      el('span', {}, 'Install ProjectPro for one-tap access'),
      el('button.btn.filled.small', { onclick: async () => { banner.remove(); deferredInstall.prompt(); deferredInstall = null; } }, 'Install'),
      el('button.ic-btn', { html: icon('close', 18), 'aria-label': 'Dismiss', onclick: () => banner.remove() }));
    document.body.append(banner);
    setTimeout(() => banner.remove(), 25000);
  });

  /* ---------------- backup indicator ---------------- */
  U.on('data', () => {
    const dot = document.getElementById('backup-dot');
    if (dot) dot.style.display = PP.db.changeCount >= 40 ? 'inline-block' : 'none';
  });
  U.on('settings', applyTheme);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') PP.db.maybeBackup(true).catch(() => {});
  });
  window.addEventListener('beforeunload', () => { if (PP.db.changeCount >= 40) PP.db.maybeBackup().catch(() => {}); });

  /* ---------------- boot ---------------- */
  async function boot() {
    try {
      await PP.db.open();
      await PP.db.loadSettings();
      const sec = await PP.crypto.setup();
      if (sec.locked) {
        document.getElementById('app').innerHTML = '';
        await ui.lockScreen();                          // resolves on successful PIN/bio unlock
        document.querySelectorAll('.lock-screen').forEach((n) => n.remove());
      }
      applyTheme();
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

      if (!PP.state.settings.seeded) {
        await PP.seed();
        await PP.db.saveSettings({ seeded: true });
      }
      window.addEventListener('hashchange', render);
      if (!location.hash) location.hash = '#/dashboard';
      await render();
      checkReminders();
      if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
      }
    } catch (e) {
      console.error(e);
      document.getElementById('app').innerHTML = '';
      document.getElementById('app').append(el('div', { style: 'padding:40px;max-width:520px;margin:60px auto;text-align:center' },
        el('h2', {}, 'Could not start ProjectPro'),
        el('p', { style: 'color:var(--on-surface-variant);margin-top:10px' }, String(e && e.message || e)),
        el('button.btn.filled', { style: 'margin-top:16px', onclick: () => location.reload() }, 'Retry')));
    }
  }

  const rerender = () => render().catch(console.error);
  PP.app = { rerender, applyTheme };
  boot();
  return PP.app;
})();

/* ---------------- sample data (first run + Settings → Load sample data) -- */
PP.seed = async function seed() {
  const U = PP.util, nowiso = U.nowISO();
  const sup = (name, cats) => ({ id: U.uid('s'), name, phone: '02 ' + (9000 + Math.floor(Math.random() * 900)) + ' ' + (1000 + Math.floor(Math.random() * 9000)), email: 'sales@' + name.toLowerCase().replace(/[^a-z]+/g, '') + '.example.com.au', address: '', website: '', categories: cats, notes: '' });
  const [sBunn, sMitre, sPaint, sLand] = [
    sup('Bunnings Trade', ['Timber & Sheet', 'Fixings & Hardware', 'Tools & Consumables']),
    sup('Mitre 10 Hardware', ['Timber & Sheet', 'Concrete & Masonry', 'Fixings & Hardware']),
    sup('PaintRight Trade Centre', ['Paint & Coatings']),
    sup('Sydney Landscape Supplies', ['Aggregates & Soil', 'Garden & Landscaping'])
  ];
  for (const s of [sBunn, sMitre, sPaint, sLand]) await PP.db.put('suppliers', s);

  const mat = (name, category, unit, defPrice, prices, wastePct = 10) => ({
    id: U.uid('m'), name, category, unit, sku: '', defaultPrice: defPrice, wastePct, markupPct: 20,
    prices: prices.map(([s, p]) => ({ supplierId: s.id, price: p, date: nowiso }))
  });
  const mats = [
    mat('Interior wall paint low-sheen 15L', 'Paint & Coatings', 'ea', 189, [[sBunn, 189], [sPaint, 172]]),
    mat('Exterior acrylic 15L', 'Paint & Coatings', 'ea', 219, [[sBunn, 219], [sPaint, 198]]),
    mat('Undercoat / primer 10L', 'Paint & Coatings', 'ea', 98, [[sBunn, 98], [sPaint, 89]]),
    mat('Sugar soap 1L', 'Cleaning Supplies', 'ea', 6.5, [[sBunn, 6.5]]),
    mat('Drop sheets & masking kit', 'Tools & Consumables', 'ea', 28, [[sBunn, 28], [sMitre, 24.5]]),
    mat('Framing pine MGP10 90x45 (per m)', 'Timber & Sheet', 'm', 4.9, [[sBunn, 4.9], [sMitre, 4.6]]),
    mat('Treated pine posts 100x100 2.4m', 'Timber & Sheet', 'ea', 18.9, [[sBunn, 18.9], [sMitre, 16.4]]),
    mat('Treated pine palings 150x12 (each)', 'Timber & Sheet', 'ea', 2.2, [[sBunn, 2.2], [sMitre, 1.95]], 5),
    mat('Rapid set concrete 20kg', 'Concrete & Masonry', 'bag', 11.9, [[sBunn, 11.9], [sMitre, 10.9]]),
    mat('Galvanised rails 2.4m', 'Timber & Sheet', 'ea', 14.5, [[sMitre, 14.5]]),
    mat('Garden mix soil (bulk, per m³)', 'Aggregates & Soil', 'm³', 88, [[sLand, 88]]),
    mat('Mulch premium (bulk, per m³)', 'Aggregates & Soil', 'm³', 72, [[sLand, 72]]),
    mat('Sir Walter buffalo turf (per m²)', 'Garden & Landscaping', 'm²', 14.5, [[sLand, 14.5]], 5),
    mat('Concrete 25MPa (per m³)', 'Concrete & Masonry', 'm³', 265, []),
    mat('Hybrid vinyl planks (per m²)', 'Flooring & Tiles', 'm²', 42, [[sBunn, 42]], 8)
  ];
  for (const m of mats) await PP.db.put('materials', m);

  const c1 = { id: U.uid('c'), name: 'Sarah Mitchell', type: 'Residential', phone: '0412 345 678', email: 'sarah.mitchell@example.com', address: '14 Banksia Avenue, Lane Cove NSW 2066', notes: 'Prefers SMS. Dog friendly yard — close gate.' };
  const c2 = { id: U.uid('c'), name: 'James & Priya Kapoor', type: 'Residential', phone: '0433 210 987', email: 'kapoor@example.com', address: '8 Figtree Parade, Ryde NSW 2112', notes: '' };
  const c3 = { id: U.uid('c'), name: 'Hornsby Property Group', type: 'Real estate', phone: '02 9477 1234', email: 'jobs@hpg.example.com.au', address: 'Suite 3, 22 Bridge Road, Hornsby NSW 2077', notes: 'Invoices to accounts@ 30-day terms.' };
  for (const c of [c1, c2, c3]) await PP.db.put('customers', c);

  const today = U.todayISO();
  const day = (n) => U.addDaysISO(today, n);
  const paintT = PP.templates.TEMPLATES.find((t) => t.id === 'painting');
  const p1 = {
    id: U.uid('p'), name: 'Mitchell — interior repaint', templateId: 'painting', customerId: c1.id, status: 'active',
    address: '14 Banksia Avenue, Lane Cove NSW', startDate: day(-6), dueDate: day(9), budget: 4200, progress: 45,
    phases: paintT.phases.map((p, i) => ({ name: p.name, tasks: p.tasks.map((t, ti) => ({ name: t, done: i === 0 || (i === 1 && ti < 2) })) })),
    lineItems: [
      { id: U.uid(), type: 'material', name: 'Interior wall paint low-sheen 15L', qty: 3, unit: 'ea', unitCost: 172, markupPct: 25, materialId: mats[0].id, supplierId: sPaint.id },
      { id: U.uid(), type: 'material', name: 'Undercoat / primer 10L', qty: 1, unit: 'ea', unitCost: 89, markupPct: 25, materialId: mats[2].id, supplierId: sPaint.id },
      { id: U.uid(), type: 'material', name: 'Drop sheets, tape & consumables', qty: 1, unit: 'job', unitCost: 60, markupPct: 20 },
      { id: U.uid(), type: 'labour', name: 'Painter — 2 persons', qty: 32, unit: 'hr', unitCost: 55, markupPct: 36 },
      { id: U.uid(), type: 'travel', name: 'Travel & parking', qty: 4, unit: 'day', unitCost: 22, markupPct: 0 }
    ], notes: 'Client chose "Lexicon Quarter" walls, "Vivid White" trim. Master bedroom feature wall TBD.', createdAt: nowiso
  };
  const fenceT = PP.templates.TEMPLATES.find((t) => t.id === 'fencing');
  const p2 = {
    id: U.uid('p'), name: 'Kapoor — 28m paling fence', templateId: 'fencing', customerId: c2.id, status: 'quoted',
    address: '8 Figtree Parade, Ryde NSW', startDate: day(14), dueDate: day(18), budget: 2900, progress: 0,
    phases: fenceT.phases.map((p) => ({ name: p.name, tasks: p.tasks.map((t) => ({ name: t, done: false })) })),
    lineItems: [
      { id: U.uid(), type: 'material', name: 'Treated pine posts 100x100 2.4m', qty: 13, unit: 'ea', unitCost: 16.4, markupPct: 25, materialId: mats[6].id, supplierId: sMitre.id },
      { id: U.uid(), type: 'material', name: 'Treated pine palings (incl 5% waste)', qty: 195, unit: 'ea', unitCost: 1.95, markupPct: 25, materialId: mats[7].id, supplierId: sMitre.id },
      { id: U.uid(), type: 'material', name: 'Galvanised rails 2.4m', qty: 24, unit: 'ea', unitCost: 14.5, markupPct: 25, materialId: mats[9].id, supplierId: sMitre.id },
      { id: U.uid(), type: 'material', name: 'Rapid set concrete 20kg', qty: 26, unit: 'bag', unitCost: 10.9, markupPct: 20, materialId: mats[8].id, supplierId: sMitre.id },
      { id: U.uid(), type: 'labour', name: 'Fencing installers — 2 persons', qty: 20, unit: 'hr', unitCost: 62, markupPct: 30 },
      { id: U.uid(), type: 'waste', name: 'Old fence removal & tip fees', qty: 1, unit: 'job', unitCost: 240, markupPct: 15 },
      { id: U.uid(), type: 'fuel', name: 'Fuel & tolls', qty: 1, unit: 'job', unitCost: 45, markupPct: 0 }
    ], notes: 'Neighbour splitting 50% — invoice Kapoor 100%, they settle privately.', createdAt: nowiso
  };
  for (const p of [p1, p2]) await PP.db.put('projects', p);

  const exp = (projectId, days, category, description, amount, supplierId) => ({ id: U.uid('e'), projectId, date: day(days), category, description, amount, supplierId: supplierId || '', createdAt: nowiso });
  const expenses = [
    exp(p1.id, -5, 'Materials', 'PaintRight — 2×15L low-sheen + undercoat', 433, sPaint.id),
    exp(p1.id, -4, 'Materials', 'Bunnings — tape, dropsheets, filler', 67, sBunn.id),
    exp(p1.id, -2, 'Labour', 'Casual labourer — prep day', 180, ''),
    exp(p2.id, -1, 'Materials', 'Mitre 10 — deposit posts & rails', 350, sMitre.id),
    exp('', -12, 'Fuel & Travel', 'Ute fuel', 96, '')
  ];
  for (const e of expenses) await PP.db.put('expenses', e);

  /* documents (numbers seeded; counters then set ahead) */
  const q1 = {
    id: U.uid('d'), kind: 'quote', number: 'Q-' + new Date().getFullYear() + '-0001', status: 'sent',
    projectId: p2.id, customerId: c2.id,
    items: PP.calc.itemsFromProject(p2),
    discount: { type: 'percent', value: 5 },
    issueDate: day(-3), validUntil: day(27), status: 'sent',
    terms: PP.state.settings.quoteTerms, notes: 'Includes removal of existing timber fence. Neighbour contribution to be settled privately.', createdAt: nowiso
  };
  const inv1 = {
    id: U.uid('d'), kind: 'invoice', number: 'INV-' + new Date().getFullYear() + '-0001', status: 'partial',
    projectId: p1.id, customerId: c1.id,
    items: [
      { desc: 'Progress payment 1 — preparation complete (repaint project)', qty: 1, unit: 'job', unitPrice: 1500, taxPct: null },
      { desc: 'Materials supplied to date', qty: 1, unit: 'job', unitPrice: 520, taxPct: null }
    ],
    discount: { type: 'amount', value: 0 }, amountPaid: 1000, paymentMethod: 'Bank transfer',
    issueDate: day(-4), dueDate: day(10),
    terms: PP.state.settings.invoiceTerms, notes: '', createdAt: nowiso
  };
  const rcpt1 = {
    id: U.uid('d'), kind: 'receipt', number: 'RCP-' + new Date().getFullYear() + '-0001', status: 'paid',
    projectId: '', customerId: c3.id,
    items: [{ desc: 'End-of-lease clean — 2 bedroom unit, Hornsby', qty: 1, unit: 'job', unitPrice: 385, taxPct: null }],
    discount: { type: 'amount', value: 0 },
    issueDate: day(-9), paidDate: day(-9), paymentMethod: 'Bank transfer',
    terms: PP.state.settings.receiptTerms, notes: '', createdAt: nowiso, amountPaid: 423.5
  };
  for (const d of [q1, inv1, rcpt1]) await PP.db.put('documents', d);

  const reminders = [
    { id: U.uid('r'), type: 'quote', title: 'Follow up quote ' + q1.number + ' (Kapoor fence)', date: day(4), refId: q1.id, done: false, createdAt: nowiso },
    { id: U.uid('r'), type: 'invoice', title: 'Invoice ' + inv1.number + ' second progress payment due', date: day(10), refId: inv1.id, done: false, createdAt: nowiso },
    { id: U.uid('r'), type: 'custom', title: 'Order exterior acrylic before Friday trade price rise', date: day(2), refId: '', done: false, createdAt: nowiso }
  ];
  for (const r of reminders) await PP.db.put('reminders', r);

  await PP.db.put('sketches', {
    id: U.uid('sk'), name: 'Mitchell — living room floor', projectId: p1.id,
    scaleM: .5, depthMM: 0, preset: 'room',
    shape: { type: 'polygon', closed: true, points: [[2, 2], [12, 2], [12, 8], [8, 8], [8, 12], [2, 12]] },
    createdAt: nowiso
  });

  await PP.db.saveSettings({ counters: { quote: 2, invoice: 2, receipt: 2 } });
};
