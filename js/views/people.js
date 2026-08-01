/* ProjectPro — Customers & Suppliers: CRUD, detail pages, CSV import/export,
 * encrypted contact fields (AES-GCM at rest). */
'use strict';
window.PP = window.PP || {};
PP.views = PP.views || {};

PP.views.people = (() => {
  const U = PP.util, ui = PP.ui, C = PP.calc;
  const { el, icon, money, fmtDate } = U;
  let custQ = '', suppQ = '';

  /* ================= CUSTOMERS ================= */
  async function renderCustomers(root, query) {
    const view = el('div.view');
    const [customers, projects, documents] = await Promise.all([PP.db.all('customers'), PP.db.all('projects'), PP.db.all('documents')]);
    const search = el('input', { type: 'search', placeholder: 'Search customers…', value: custQ, class: 'grow' });
    search.oninput = U.debounce(() => { custQ = search.value; refreshList(); }, 250);
    view.append(el('div.filter-bar', {}, search,
      el('button.btn.tonal', { onclick: () => importCSV('customers') }, icon('import', 18), 'CSV'),
      el('button.btn.tonal', { onclick: () => exportCustomers(customers) }, icon('export', 18), 'Export')));
    const listWrap = el('div');
    view.append(listWrap);

    function refreshList() {
      listWrap.innerHTML = '';
      let rows = customers.filter((c) => !custQ || [c.name, c.phone, c.email, c.address].join(' ').toLowerCase().includes(custQ.toLowerCase()));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      if (!rows.length) { listWrap.append(ui.emptyState('customers', 'No customers yet', 'Add your first customer — contact details are stored encrypted.')); return; }
      const card = el('div.card.elevated', {}, el('div.list'));
      for (const c of rows) {
        const count = projects.filter((p) => p.customerId === c.id).length;
        const received = U.sum(documents.filter((d) => d.customerId === c.id && d.kind === 'receipt'), (d) => C.docTotals(d).total);
        card.firstChild.append(ui.listItem({
          title: c.name, sub: [c.phone, c.email].filter(Boolean).join(' • ') || c.address || '—',
          avatarText: U.initials(c.name),
          end: el('div', { style: 'text-align:right' }, el('span.chip.tonal', {}, `${count} job${count === 1 ? '' : 's'}`), received ? el('div.muted', { style: 'font-size:11.5px;margin-top:2px' }, money(received) + ' paid') : null),
          onClick: () => location.hash = '#/customer/' + c.id
        }));
      }
      listWrap.append(card);
    }
    refreshList();
    root.append(view, el('button.fab', { onclick: () => customerDialog() }, icon('add'), 'Customer'));
    return view;
  }

  async function renderCustomerDetail(root, id) {
    const view = el('div.view');
    const c = await PP.db.get('customers', id);
    if (!c) { view.append(ui.emptyState('warning', 'Customer not found', '')); root.append(view); return view; }
    const [projects, documents, expenses] = await Promise.all([PP.db.all('projects'), PP.db.all('documents'), PP.db.all('expenses')]);
    const myProjects = projects.filter((p) => p.customerId === id);
    const myDocs = documents.filter((d) => d.customerId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const received = U.sum(myDocs.filter((d) => d.kind === 'receipt'), (d) => C.docTotals(d).total);
    const quoted = U.sum(myDocs.filter((d) => d.kind === 'quote' && !['declined'].includes(d.status)), (d) => C.docTotals(d).total);
    const outstanding = U.sum(myDocs.filter((d) => d.kind === 'invoice'), (d) => C.docTotals(d).balance);

    const attachWrap = el('div');
    const reattach = async () => { attachWrap.innerHTML = ''; attachWrap.append(await ui.attachmentGrid('customer', id, { onChange: reattach })); };
    await reattach();

    view.append(el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px' },
      el('button.ic-btn', { onclick: () => history.back(), html: icon('back'), 'aria-label': 'Back' }),
      el('div.avatar', { style: 'width:52px;height:52px;font-size:19px' }, U.initials(c.name)),
      el('div', { style: 'flex:1' },
        el('h1', { style: 'font-size:22px;font-weight:700' }, c.name),
        el('div.muted', {}, c.type || 'Customer')),
      el('button.btn.tonal', { onclick: async () => { await customerDialog(c); root.innerHTML = ''; renderCustomerDetail(root, id); } }, icon('edit', 18), 'Edit')));

    view.append(el('div.grid.cols-3', {},
      el('div.card', {},
        el('div.card-h', {}, icon('phone'), el('h3', {}, 'Contact')),
        el('div', { style: 'display:flex;flex-direction:column;gap:10px' },
          c.phone ? el('a.chip.outlined', { href: 'tel:' + c.phone }, icon('phone', 15), c.phone) : null,
          c.email ? el('a.chip.outlined', { href: 'mailto:' + c.email }, icon('mail', 15), c.email) : null,
          c.address ? el('a.chip.outlined', { href: 'https://maps.google.com/?q=' + encodeURIComponent(c.address), target: '_blank', rel: 'noopener' }, icon('pin', 15), c.address) : null,
          !c.phone && !c.email && !c.address ? el('div.muted', {}, 'No contact details recorded.') : null)),
      el('div.card', {},
        el('div.card-h', {}, icon('money'), el('h3', {}, 'Value')),
        el('div.totals-box', { style: 'margin:0;width:100%' },
          el('div.trow', {}, el('span', {}, 'Received'), el('b', {}, money(received))),
          el('div.trow', {}, el('span', {}, 'Quoted (open)'), el('b', {}, money(quoted))),
          el('div.trow', {}, el('span', {}, 'Outstanding'), el('b', { class: outstanding > 0 ? 'money-bad' : '' }, money(outstanding)))),
        el('div.btn-row', {},
          el('button.btn.filled', { onclick: () => PP.views.documents.newDocumentDialog('quote', { customerId: id }) }, icon('quote', 18), 'New quote'),
          el('button.btn.tonal', { onclick: () => PP.views.projects.newProjectDialog() }, icon('project', 18), 'New project'))),
      el('div.card', {},
        el('div.card-h', {}, icon('notes'), el('h3', {}, 'Notes')),
        (() => { const ta = ui.textarea(null, c.notes || '', { placeholder: 'Preferences, gate codes, contact notes…' }); ta.oninput = U.debounce(() => PP.db.put('customers', { ...c, notes: ta.value }), 500); return el('div.field', {}, ta); })())));

    view.append(el('div.card', {},
      el('div.card-h', {}, icon('project'), el('h3', {}, `Projects (${myProjects.length})`)),
      myProjects.length ? el('div.list', {}, myProjects.map((p) => ui.listItem({
        iconName: 'project', title: p.name, sub: `${fmtDate(p.startDate)} • ${p.status}`,
        end: ui.statusChip(p.status), onClick: () => location.hash = '#/project/' + p.id
      }))) : ui.emptyState('project', 'No projects', 'Create one from the Projects screen.')));

    view.append(el('div.card', {},
      el('div.card-h', {}, icon('documents'), el('h3', {}, `Documents (${myDocs.length})`)),
      myDocs.length ? el('div.list', {}, myDocs.slice(0, 12).map((d) => ui.listItem({
        iconName: d.kind, title: d.number, sub: `${d.kind} • ${fmtDate(d.issueDate)} • ${d.status}`,
        end: el('span.amount', {}, money(C.docTotals(d).total)), onClick: () => location.hash = '#/document/' + d.id
      }))) : ui.emptyState('quote', 'No documents', 'Quotes, invoices and receipts for this customer appear here.')));

    view.append(el('div.card', {},
      el('div.card-h', {}, icon('attach'), el('h3', {}, 'Files'), ui.attachButton('customer', id, reattach)), attachWrap));
    root.append(view);
    return view;
  }

  function customerDialog(existing) {
    return new Promise((resolve) => {
      const c = existing || { name: '', type: 'Residential', phone: '', email: '', address: '', notes: '' };
      const body = el('div', {},
        ui.field('Name', ui.input('name', c.name)),
        ui.fieldRow(ui.field('Type', ui.select('type', c.type, [['Residential', 'Residential'], ['Commercial', 'Commercial'], ['Builder', 'Builder'], ['Real estate', 'Real estate'], ['Strata', 'Strata'], ['Other', 'Other']]))),
        ui.fieldRow(
          ui.field('Phone', ui.input('phone', c.phone, { type: 'tel' })),
          ui.field('Email', ui.input('email', c.email, { type: 'email' }))),
        ui.field('Address', ui.input('address', c.address)),
        ui.field('Notes', ui.textarea('notes', c.notes)),
        existing ? el('div.btn-row', { style: 'margin-top:0' }, el('button.btn.danger.tonal', { onclick: async (e) => {
          e.preventDefault();
          const projects = await PP.db.all('projects');
          const linked = projects.filter((p) => p.customerId === existing.id).length;
          if (await ui.confirm({ title: `Delete ${existing.name}?`, message: linked ? `${linked} linked project(s) will keep their data.` : 'No linked projects.' })) {
            await PP.db.del('customers', existing.id); ui.toast('Customer deleted'); resolve(true); PP.app.rerender();
          }
        } }, icon('delete', 18), 'Delete')) : null);
      ui.dialog({
        title: existing ? 'Edit customer' : 'New customer', body, onClose: resolve,
        actions: [{ label: existing ? 'Save' : 'Add customer', kind: 'filled', onClick: async (d, done) => {
          if (!d.name.trim()) { ui.toast('Enter a name'); return; }
          await PP.db.put('customers', { ...c, ...d, id: c.id || U.uid('c') });
          done(false); ui.toast('Customer saved'); resolve(true); PP.app.rerender();
        } }]
      });
    });
  }

  /* ================= SUPPLIERS ================= */
  async function renderSuppliers(root) {
    const view = el('div.view');
    const [suppliers, materials] = await Promise.all([PP.db.all('suppliers'), PP.db.all('materials')]);
    const search = el('input', { type: 'search', placeholder: 'Search suppliers…', value: suppQ, class: 'grow' });
    search.oninput = U.debounce(() => { suppQ = search.value; refresh(); }, 250);
    view.append(el('div.filter-bar', {}, search,
      el('button.btn.tonal', { onclick: () => importCSV('suppliers') }, icon('import', 18), 'CSV'),
      el('button.btn.tonal', { onclick: () => {
        const csv = U.recordsToCSV([{ key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'website', label: 'Website' }, { key: 'address', label: 'Address' }, { key: 'categories', label: 'Categories', value: (r) => (r.categories || []).join('; ') }, { key: 'notes', label: 'Notes' }], suppliers);
        U.download('suppliers.csv', csv, 'text/csv');
      } }, icon('export', 18), 'Export')));
    const listWrap = el('div');
    view.append(listWrap);
    function refresh() {
      listWrap.innerHTML = '';
      let rows = suppliers.filter((s) => !suppQ || [s.name, s.email, (s.categories || []).join(' ')].join(' ').toLowerCase().includes(suppQ.toLowerCase()));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      if (!rows.length) { listWrap.append(ui.emptyState('suppliers', 'No suppliers yet', 'Add suppliers and their prices, then let ProjectPro build cheapest-price shopping lists.')); return; }
      const grid = el('div.grid.cols-2');
      for (const s of rows) {
        const pricedCount = U.sum(materials, (m) => (m.prices || []).filter((p) => p.supplierId === s.id).length);
        grid.append(el('div.card.elevated', { style: 'cursor:pointer', onclick: () => location.hash = '#/supplier/' + s.id },
          el('div.card-h', {}, icon('suppliers'), el('h3', {}, s.name)),
          el('div.muted', { style: 'margin-bottom:8px' }, [s.phone, s.email].filter(Boolean).join(' • ') || '—'),
          el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
            ...(s.categories || []).slice(0, 4).map((cat) => ui.chip(cat, 'tonal')),
            ui.chip(`${pricedCount} prices`, 'primary'))));
      }
      listWrap.append(grid);
    }
    refresh();
    root.append(view, el('button.fab', { onclick: () => supplierDialog() }, icon('add'), 'Supplier'));
    return view;
  }

  async function renderSupplierDetail(root, id) {
    const view = el('div.view');
    const s = await PP.db.get('suppliers', id);
    if (!s) { view.append(ui.emptyState('warning', 'Supplier not found', '')); root.append(view); return view; }
    const materials = await PP.db.all('materials');
    const priced = materials.map((m) => ({ m, price: (m.prices || []).find((p) => p.supplierId === id) })).filter((x) => x.price);
    view.append(el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap' },
      el('button.ic-btn', { onclick: () => history.back(), html: icon('back'), 'aria-label': 'Back' }),
      el('div', { style: 'flex:1' }, el('h1', { style: 'font-size:22px;font-weight:700' }, s.name),
        el('div.muted', {}, [s.phone, s.email, s.website].filter(Boolean).join(' • ') || '—')),
      el('button.btn.tonal', { onclick: async () => { await supplierDialog(s); root.innerHTML = ''; renderSupplierDetail(root, id); } }, icon('edit', 18), 'Edit')));
    if (s.address) view.append(el('div.card', {}, el('div.muted', {}, s.address)));
    view.append(el('div.card', {},
      el('div.card-h', {}, icon('materials'), el('h3', {}, `Price list (${priced.length} items)`)),
      priced.length ? el('div.tbl-wrap', {}, el('table.tbl', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Material'), el('th', {}, 'Category'), el('th.num', {}, 'Price'), el('th', {}, 'Updated'))),
        el('tbody', {}, priced.sort((a, b) => a.m.name.localeCompare(b.m.name)).map(({ m, price }) => el('tr', { class: 'row-click', onclick: () => location.hash = '#/materials?q=' + encodeURIComponent(m.name) },
          el('td', {}, m.name), el('td', {}, m.category || '—'), el('td.num', {}, `${money(price.price)} / ${m.unit || 'ea'}`), el('td', {}, U.friendlyDate((price.date || '').slice(0, 10))))))))
        : ui.emptyState('materials', 'No prices yet', 'Add prices for this supplier from the Materials screen.')));
    root.append(view);
    return view;
  }

  function supplierDialog(existing) {
    return new Promise((resolve) => {
      const s = existing || { name: '', phone: '', email: '', website: '', address: '', categories: [], notes: '' };
      const catSel = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px' });
      const chosen = new Set(s.categories || []);
      PP.templates.MATERIAL_CATEGORIES.forEach((cat) => {
        const c2 = ui.chip(cat, chosen.has(cat) ? 'primary' : 'outlined');
        c2.classList.add('clickable');
        c2.onclick = () => { chosen.has(cat) ? chosen.delete(cat) : chosen.add(cat); c2.className = 'chip clickable ' + (chosen.has(cat) ? 'primary' : 'outlined'); };
        catSel.append(c2);
      });
      const body = el('div', {},
        ui.field('Supplier name', ui.input('name', s.name)),
        ui.fieldRow(ui.field('Phone', ui.input('phone', s.phone, { type: 'tel' })), ui.field('Email', ui.input('email', s.email, { type: 'email' }))),
        ui.fieldRow(ui.field('Website', ui.input('website', s.website, { type: 'url' })), ui.field('Address', ui.input('address', s.address))),
        el('div.field', {}, el('label', {}, 'Categories they supply'), catSel),
        ui.field('Notes', ui.textarea('notes', s.notes)),
        existing ? el('div.btn-row', { style: 'margin-top:0' }, el('button.btn.danger.tonal', { onclick: async (e) => {
          e.preventDefault();
          if (await ui.confirm({ title: `Delete ${existing.name}?`, message: 'Their prices are removed from materials.' })) {
            const mats = await PP.db.all('materials');
            for (const m of mats) {
              if ((m.prices || []).some((p) => p.supplierId === existing.id)) {
                m.prices = m.prices.filter((p) => p.supplierId !== existing.id);
                await PP.db.put('materials', m);
              }
            }
            await PP.db.del('suppliers', existing.id); ui.toast('Supplier deleted'); resolve(true); PP.app.rerender();
          }
        } }, icon('delete', 18), 'Delete')) : null);
      ui.dialog({
        title: existing ? 'Edit supplier' : 'New supplier', body, onClose: resolve,
        actions: [{ label: existing ? 'Save' : 'Add supplier', kind: 'filled', onClick: async (d, done) => {
          if (!d.name.trim()) { ui.toast('Enter a name'); return; }
          await PP.db.put('suppliers', { ...s, ...d, categories: [...chosen], id: s.id || U.uid('s') });
          done(false); ui.toast('Supplier saved'); resolve(true); PP.app.rerender();
        } }]
      });
    });
  }

  /* ================= CSV import ================= */
  async function importCSV(kind) {
    const inp = el('input', { type: 'file', accept: '.csv', style: 'display:none' });
    document.body.append(inp);
    inp.onchange = async () => {
      const text = await inp.files[0].text(); inp.remove();
      const isCust = kind === 'customers';
      const cols = isCust
        ? [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }, { key: 'notes', label: 'Notes' }]
        : [{ key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'website', label: 'Website' }, { key: 'address', label: 'Address' }, { key: 'categories', label: 'Categories' }, { key: 'notes', label: 'Notes' }];
      try {
        const rows = U.csvToRecords(text, cols).filter((r) => r.name);
        for (const r of rows) {
          if (isCust) await PP.db.put('customers', { id: U.uid('c'), ...r, type: r.type || 'Residential' });
          else await PP.db.put('suppliers', { id: U.uid('s'), ...r, categories: (r.categories || '').split(';').map((x) => x.trim()).filter(Boolean) });
        }
        ui.toast(`${rows.length} ${isCust ? 'customers' : 'suppliers'} imported`);
        PP.app.rerender();
      } catch { ui.toast('Import failed — check the CSV header row'); }
    };
    inp.click();
  }

  function exportCustomers(customers) {
    const csv = U.recordsToCSV([{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }, { key: 'notes', label: 'Notes' }], customers);
    U.download('customers.csv', csv, 'text/csv');
  }

  async function render(root, params) {
    const section = location.hash.split('/')[1];
    if (section === 'customer' && params && params[0]) return renderCustomerDetail(root, params[0]);
    if (section === 'supplier' && params && params[0]) return renderSupplierDetail(root, params[0]);
    if (section === 'suppliers') return renderSuppliers(root);
    return renderCustomers(root);
  }

  return { title: 'Customers', icon: 'customers', render, customerDialog, supplierDialog };
})();
