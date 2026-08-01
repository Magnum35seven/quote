/* ProjectPro — Materials library: CRUD, multi-supplier price lists,
 * automatic price comparison, CSV import/export. */
'use strict';
window.PP = window.PP || {};
PP.views = PP.views || {};

PP.views.materials = (() => {
  const U = PP.util, ui = PP.ui, C = PP.calc, T = PP.templates;
  const { el, icon, money } = U;
  let q = '', cat = '';

  async function render(root, _params, query) {
    if (query && query.get('q')) q = query.get('q');
    const view = el('div.view');
    const [materials, suppliers] = await Promise.all([PP.db.all('materials'), PP.db.all('suppliers')]);
    const supById = Object.fromEntries(suppliers.map((s) => [s.id, s]));

    const search = el('input', { type: 'search', placeholder: 'Search materials…', value: q, class: 'grow' });
    search.oninput = U.debounce(() => { q = search.value; refresh(); }, 250);
    const catSel = ui.select(null, cat, [['', 'All categories'], ...T.MATERIAL_CATEGORIES.map((c) => [c, c])]);
    catSel.onchange = () => { cat = catSel.value; refresh(); };
    view.append(el('div.filter-bar', {}, search, catSel,
      el('button.btn.tonal', { onclick: () => importCSV(suppliers) }, icon('import', 18), 'CSV'),
      el('button.btn.tonal', { onclick: () => exportCSV(materials, supById) }, icon('export', 18), 'Export')));
    const listWrap = el('div');
    view.append(listWrap);

    function refresh() {
      listWrap.innerHTML = '';
      let rows = materials;
      if (q) rows = rows.filter((m) => [m.name, m.category, m.sku].join(' ').toLowerCase().includes(q.toLowerCase()));
      if (cat) rows = rows.filter((m) => m.category === cat);
      rows.sort((a, b) => a.name.localeCompare(b.name));
      if (!rows.length) { listWrap.append(ui.emptyState('materials', 'No materials found', 'Add materials with supplier prices — shopping lists and estimates use them automatically.')); return; }
      const card = el('div.card.elevated', {}, el('div.tbl-wrap', {}, el('table.tbl', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Material'), el('th', {}, 'Category'), el('th.num', {}, 'Best price'), el('th', {}, 'Compare'), el('th'))),
        el('tbody', {}, rows.map((m) => {
          const comp = C.priceComparison(m, suppliers);
          const best = comp[0];
          const savings = comp.length > 1 ? comp[comp.length - 1].price - best.price : 0;
          return el('tr', {},
            el('td', {}, el('b', {}, m.name), m.sku ? el('span.muted', {}, `  SKU ${m.sku}`) : null,
              el('div.muted', { style: 'font-size:12px' }, `per ${m.unit || 'ea'}${m.wastePct ? ` • +${m.wastePct}% waste` : ''}`)),
            el('td', {}, m.category || '—'),
            el('td.num', {}, best ? `${money(best.price)}` : m.defaultPrice ? `${money(m.defaultPrice)}` : '—',
              best ? el('div.muted', { style: 'font-size:12px' }, best.supplierName) : el('div.muted', { style: 'font-size:12px' }, 'library default')),
            el('td', {}, el('button.btn.small.text', { onclick: () => compareDialog(m, comp) }, comp.length ? `${comp.length} price${comp.length > 1 ? 's' : ''}` : 'add price',
              savings > 0 ? ui.chip('save ' + money(savings), 'success') : null)),
            el('td', { style: 'white-space:nowrap' },
              el('button.ic-btn', { title: 'Edit', html: icon('edit', 17), onclick: () => materialDialog(m, suppliers, refresh) }),
              el('button.ic-btn', { title: 'Delete', html: icon('delete', 17), onclick: async () => {
                if (await ui.confirm({ title: `Delete "${m.name}"?` })) { await PP.db.del('materials', m.id); refresh(); }
              } })));
        })))));
      listWrap.append(card);
    }
    refresh();
    root.append(view, el('button.fab', {
      onclick: async () => { const sups = await PP.db.all('suppliers'); materialDialog(null, sups, () => PP.app.rerender()); }
    }, icon('add'), 'Material'));
    return view;
  }

  /* ---------------- price comparison dialog ---------------- */
  function compareDialog(material, comp) {
    const body = el('div');
    if (!comp.length) body.append(ui.emptyState('suppliers', 'No supplier prices', 'Edit this material to add supplier prices.'));
    else {
      const best = comp[0].price;
      body.append(el('div.tbl-wrap', {}, el('table.tbl', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Supplier'), el('th.num', {}, `Price / ${material.unit || 'ea'}`), el('th.num', {}, 'vs best'), el('th', {}, 'Updated'))),
        el('tbody', {}, comp.map((p, i) => el('tr', {},
          el('td', {}, p.supplierName, i === 0 ? ui.chip(' best price', 'success') : null),
          el('td.num', {}, money(p.price)),
          el('td.num', { class: i ? 'money-bad' : 'money-good' }, i ? '+' + money(p.price - best) : '—'),
          el('td', {}, U.friendlyDate((p.date || '').slice(0, 10)))))))));
    }
    ui.dialog({ title: `Price comparison — ${material.name}`, body, actions: [{ label: 'Close', kind: 'text', onClick: (d, c) => c() }] });
  }

  /* ---------------- material edit dialog ---------------- */
  function materialDialog(existing, suppliers, onSaved) {
    const m = existing || { name: '', category: 'Other', unit: 'ea', sku: '', defaultPrice: null, wastePct: 10, markupPct: 20, prices: [] };
    const prices = JSON.parse(JSON.stringify(m.prices || []));
    const priceRows = el('tbody');
    const rebuildPrices = () => {
      priceRows.innerHTML = '';
      prices.forEach((p, i) => {
        const supSel = ui.select(null, p.supplierId, [['', '— supplier —'], ...suppliers.map((s) => [s.id, s.name])]);
        supSel.onchange = () => p.supplierId = supSel.value;
        const priceIn = el('input', { type: 'number', step: 'any', value: p.price || '', placeholder: '0.00' });
        priceIn.oninput = () => { p.price = +priceIn.value || 0; p.date = U.nowISO(); };
        priceRows.append(el('tr', {},
          el('td', {}, supSel), el('td', {}, priceIn),
          el('td', {}, el('button.ic-btn', { html: icon('close', 16), title: 'Remove price', onclick: () => { prices.splice(i, 1); rebuildPrices(); } }))));
      });
      if (!prices.length) priceRows.append(el('tr', {}, el('td', { colspan: '3', class: 'muted' }, 'No supplier prices yet — add one per supplier for comparison.')));
    };
    rebuildPrices();
    const body = el('div', {},
      ui.field('Material name', ui.input('name', m.name)),
      ui.fieldRow(
        ui.field('Category', ui.select('category', m.category, T.MATERIAL_CATEGORIES.map((c) => [c, c]))),
        ui.field('Unit', ui.select('unit', m.unit || 'ea', T.UNIT_OPTIONS.map((u) => [u, u])))),
      ui.fieldRow(
        ui.field('SKU / code', ui.input('sku', m.sku)),
        ui.field('Library default price', ui.numberInput('defaultPrice', m.defaultPrice))),
      ui.fieldRow(
        ui.field('Waste allowance %', ui.numberInput('wastePct', m.wastePct)),
        ui.field('Default markup %', ui.numberInput('markupPct', m.markupPct))),
      el('div.field', {}, el('label', {}, 'Supplier prices (best = cheapest)'),
        el('div.tbl-wrap', {}, el('table.tbl', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Supplier'), el('th', {}, 'Price'), el('th'))), priceRows)),
        el('div.btn-row', {}, el('button.btn.small.tonal', { onclick: (e) => { e.preventDefault(); prices.push({ supplierId: '', price: 0, date: U.nowISO() }); rebuildPrices(); } }, icon('add', 16), 'Add price'))),
      existing ? el('div.btn-row', { style: 'margin-top:0' }, el('button.btn.danger.tonal', { onclick: async (e) => {
        e.preventDefault();
        if (await ui.confirm({ title: `Delete "${existing.name}"?` })) { await PP.db.del('materials', existing.id); ui.toast('Deleted'); onSaved && onSaved(); }
      } }, icon('delete', 18), 'Delete material')) : null);
    ui.dialog({
      title: existing ? 'Edit material' : 'New material', body, wide: true,
      actions: [{ label: 'Save', kind: 'filled', onClick: async (d, done) => {
        if (!d.name.trim()) { ui.toast('Enter a name'); return; }
        await PP.db.put('materials', {
          ...m, ...d, id: m.id || U.uid('m'),
          defaultPrice: d.defaultPrice || 0, wastePct: d.wastePct || 0, markupPct: d.markupPct == null ? 20 : d.markupPct,
          prices: prices.filter((p) => p.supplierId && p.price > 0)
        });
        done(false); ui.toast('Material saved'); onSaved && onSaved();
      } }]
    });
  }

  /* ---------------- CSV ---------------- */
  function exportCSV(materials, supById) {
    const cols = [
      { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }, { key: 'unit', label: 'Unit' },
      { key: 'sku', label: 'SKU' }, { key: 'defaultPrice', label: 'Default price' }, { key: 'wastePct', label: 'Waste %' },
      { key: 'markupPct', label: 'Markup %' },
      { key: 'supplier1', label: 'Supplier 1', value: (r) => (supById[(r.prices || [])[0] && r.prices[0].supplierId] || {}).name || '' },
      { key: 'price1', label: 'Price 1', value: (r) => r.prices && r.prices[0] ? r.prices[0].price : '' },
      { key: 'supplier2', label: 'Supplier 2', value: (r) => (supById[(r.prices || [])[1] && r.prices[1].supplierId] || {}).name || '' },
      { key: 'price2', label: 'Price 2', value: (r) => r.prices && r.prices[1] ? r.prices[1].price : '' }
    ];
    U.download('materials.csv', U.recordsToCSV(cols, materials), 'text/csv');
  }

  function importCSV(suppliers) {
    const inp = el('input', { type: 'file', accept: '.csv', style: 'display:none' });
    document.body.append(inp);
    inp.onchange = async () => {
      const text = await inp.files[0].text(); inp.remove();
      const supByName = Object.fromEntries(suppliers.map((s) => [s.name.toLowerCase(), s]));
      const cols = [
        { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }, { key: 'unit', label: 'Unit' },
        { key: 'sku', label: 'SKU' }, { key: 'defaultPrice', label: 'Default price' }, { key: 'wastePct', label: 'Waste %' },
        { key: 'markupPct', label: 'Markup %' }, { key: 'supplier1', label: 'Supplier 1' }, { key: 'price1', label: 'Price 1' },
        { key: 'supplier2', label: 'Supplier 2' }, { key: 'price2', label: 'Price 2' }
      ];
      try {
        const rows = U.csvToRecords(text, cols).filter((r) => r.name);
        const existing = await PP.db.all('materials');
        const existingByName = Object.fromEntries(existing.map((m) => [m.name.toLowerCase(), m]));
        let added = 0, updated = 0;
        for (const r of rows) {
          const prices = [];
          [[r.supplier1, r.price1], [r.supplier2, r.price2]].forEach(([sn, pr]) => {
            const sup = sn && supByName[sn.toLowerCase()];
            const price = parseFloat(pr);
            if (sup && price > 0) prices.push({ supplierId: sup.id, price, date: U.nowISO() });
          });
          const base = {
            name: r.name, category: r.category || 'Other', unit: r.unit || 'ea', sku: r.sku || '',
            defaultPrice: parseFloat(r.defaultPrice) || 0, wastePct: parseFloat(r.wastePct) || 10,
            markupPct: r.markupPct === '' || r.markupPct == null ? 20 : parseFloat(r.markupPct), prices
          };
          const dup = existingByName[r.name.toLowerCase()];
          if (dup) { await PP.db.put('materials', { ...dup, ...base, id: dup.id }); updated++; }
          else { await PP.db.put('materials', { id: U.uid('m'), ...base }); added++; }
        }
        ui.toast(`${added} added, ${updated} updated`);
        PP.app.rerender();
      } catch (e) { console.error(e); ui.toast('Import failed — check the CSV headers (Name required)'); }
    };
    inp.click();
  }

  return { title: 'Materials', icon: 'materials', render };
})();
