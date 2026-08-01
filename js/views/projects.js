/* ProjectPro — Projects: list + full detail (estimate, tasks, expenses,
 * documents, supplier shopping list, notes & attachments). */
'use strict';
window.PP = window.PP || {};
PP.views = PP.views || {};

PP.views.projects = (() => {
  const U = PP.util, ui = PP.ui, C = PP.calc, T = PP.templates;
  const { el, icon, money, num, fmtDate } = U;
  let filter = { q: '', status: '', template: '' };

  /* =========================================================== LIST ==== */
  async function renderList(root, query) {
    const view = el('div.view');
    const [projects, customers, expenses, documents] = await Promise.all([
      PP.db.all('projects'), PP.db.all('customers'), PP.db.all('expenses'), PP.db.all('documents')
    ]);
    const custById = Object.fromEntries(customers.map((c) => [c.id, c]));

    const statusSel = ui.select(null, filter.status, [['', 'All statuses'], ['quoted', 'Quoted'], ['approved', 'Approved'], ['active', 'Active'], ['on-hold', 'On hold'], ['completed', 'Completed'], ['cancelled', 'Cancelled']]);
    statusSel.onchange = () => { filter.status = statusSel.value; refresh(); };
    const searchEl = el('input', { type: 'search', placeholder: 'Search projects…', value: filter.q, class: 'grow' });
    searchEl.oninput = U.debounce(() => { filter.q = searchEl.value; refresh(); }, 250);
    view.append(el('div.filter-bar', {}, searchEl, statusSel,
      el('button.btn.tonal', { onclick: () => { const inp = el('input', { type: 'file', accept: '.csv', style: 'display:none' }); document.body.append(inp); inp.onchange = async () => { const text = await inp.files[0].text(); inp.remove(); await importProjectsCSV(text); }; inp.click(); } }, icon('import', 18), 'CSV'),
      el('button.btn.tonal', { onclick: () => exportProjectsCSV(projects, custById) }, icon('export', 18), 'Export')));

    const listWrap = el('div');
    view.append(listWrap);

    function refresh() {
      listWrap.innerHTML = '';
      let rows = projects;
      if (filter.q) rows = rows.filter((p) => [p.name, p.address, custById[p.customerId] && custById[p.customerId].name].join(' ').toLowerCase().includes(filter.q.toLowerCase()));
      if (filter.status) rows = rows.filter((p) => p.status === filter.status);
      rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      if (!rows.length) { listWrap.append(ui.emptyState('project', 'No projects found', 'Create a new project from one of 18 templates — or add your own.')); return; }
      const grid = el('div.grid.cols-2');
      for (const p of rows) {
        const fin = C.projectFinancials(p, expenses, documents);
        const tmpl = T.TEMPLATES.find((t) => t.id === p.templateId);
        grid.append(el('div.card.elevated', { style: 'cursor:pointer', onclick: () => location.hash = '#/project/' + p.id },
          el('div.card-h', {}, icon(tmpl ? tmpl.icon : 'project'), el('h3', {}, p.name),
            ui.statusChip(p.status)),
          el('div.muted', { style: 'margin-bottom:8px' }, `${custById[p.customerId] ? custById[p.customerId].name : 'No customer'}${p.address ? ' • ' + p.address : ''}`),
          el('div', { style: 'display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px;font-size:13.5px' },
            el('span', {}, el('b', {}, 'Estimate '), money(fin.estimateSell)),
            el('span', {}, el('b', {}, 'Spent '), money(fin.actualSpend)),
            p.budget ? el('span', {}, el('b', {}, 'Budget '), money(p.budget)) : null),
          ui.progressBar(p.progress || 0, true),
          el('div.muted', { style: 'margin-top:4px;font-size:12px' }, `${fin.tasksDone}/${fin.tasksTotal} tasks • updated ${U.friendlyDate(p.updatedAt.slice(0, 10))}`)));
      }
      listWrap.append(grid);
    }
    refresh();
    root.append(view, fab('New project', newProjectDialog));
    if (query.get('new')) newProjectDialog();
    return view;
  }

  function fab(label, fn) { return el('button.fab', { onclick: fn }, icon('add'), label); }

  /* =========================================================== DETAIL == */
  async function renderDetail(root, id, query) {
    const project = await PP.db.get('projects', id);
    const view = el('div.view');
    root.append(view);
    if (!project) { view.append(ui.emptyState('warning', 'Project not found', 'It may have been deleted.')); return view; }
    const [customers, expensesAll, docsAll, materials, suppliers, sketches] = await Promise.all([
      PP.db.all('customers'), PP.db.all('expenses'), PP.db.all('documents'), PP.db.all('materials'), PP.db.all('suppliers'), PP.db.all('sketches')
    ]);
    const expenses = expensesAll.filter((e) => e.projectId === id).sort((a, b) => b.date.localeCompare(a.date));
    const projectDocs = docsAll.filter((d) => d.projectId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const customer = customers.find((c) => c.id === project.customerId);
    const tmpl = T.TEMPLATES.find((t) => t.id === project.templateId);

    /* header */
    const nameBtn = el('button.ic-btn', { title: 'Edit details', html: icon('edit'), onclick: () => editProjectDialog(refreshAll) });
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px' },
      el('button.ic-btn', { onclick: () => history.back(), 'aria-label': 'Back', html: icon('back') }),
      el('div', { style: 'flex:1;min-width:200px' },
        el('div', { style: 'display:flex;align-items:center;gap:6px' }, el('h1', { style: 'font-size:23px;font-weight:700' }, project.name), nameBtn),
        el('div.muted', {}, `${customer ? customer.name + ' • ' : ''}${tmpl ? tmpl.name + ' • ' : ''}${project.address || ''}`)),
      ui.statusChip(project.status),
      el('button.btn.tonal', { onclick: async () => { ui.toast('Rendering PDF…'); const blob = await PP.pdf.renderProjectSummary(id); U.download(`Summary-${project.name.replace(/[^\w]+/g, '-')}.pdf`, blob); } }, icon('pdf', 18), 'Summary PDF'));
    view.append(head);

    /* tabs */
    const tabBar = el('div.tabs');
    const tabBody = el('div');
    view.append(tabBar, tabBody);
    const tabs = [
      ['overview', 'Overview', () => tabOverview()],
      ['estimate', 'Estimate', () => tabEstimate()],
      ['tasks', 'Tasks', () => tabTasks()],
      ['expenses', 'Expenses', () => tabExpenses()],
      ['documents', 'Documents', () => tabDocuments()],
      ['shopping', 'Shopping list', () => tabShopping()],
      ['notes', 'Notes & files', () => tabNotes()]
    ];
    let currentTab = query.get('tab') || 'overview';
    function drawTabs() {
      tabBar.innerHTML = '';
      for (const [key, label] of tabs) tabBar.append(el('button.tab' + (key === currentTab ? '.active' : ''), { onclick: () => { currentTab = key; draw(); } }, label));
    }
    async function draw() {
      drawTabs();
      tabBody.innerHTML = '';
      tabBody.append(await tabs.find(([k]) => k === currentTab)[2]());
    }
    const refreshAll = async () => { root.innerHTML = ''; await renderDetail(root, id, new URLSearchParams('tab=' + currentTab)); };

    async function saveProject(patch, rerender = false) {
      Object.assign(project, patch);
      await PP.db.put('projects', project);
      if (rerender) await draw();
    }

    /* ------------------------- Overview ------------------------- */
    function tabOverview() {
      const fin = C.projectFinancials(project, expensesAll, docsAll);
      const wrap = el('div');
      wrap.append(el('div.grid.cols-4', {},
        ui.kpi('Estimate (sell)', money(fin.estimateSell), `cost ${money(fin.estimateCost)}`),
        ui.kpi('Budget', money(fin.budget), fin.budget ? `${U.pct(fin.budgetUsedPct)} used` : 'not set'),
        ui.kpi('Actual spend', money(fin.actualSpend), fin.budget ? `${money(fin.budgetRemaining)} remaining` : '', fin.budget && fin.budgetRemaining < 0 ? 'bad' : ''),
        ui.kpi('Projected margin', money(fin.projectedProfit), `${U.pct(fin.marginPct)} on estimate`, fin.projectedProfit < 0 ? 'bad' : 'good')));
      wrap.append(el('div.grid.cols-2', {},
        el('div.card', {},
          el('div.card-h', {}, icon('check'), el('h3', {}, `Progress — ${fin.tasksDone}/${fin.tasksTotal} tasks`)),
          ui.progressBar(project.progress || 0),
          el('div.muted', { style: 'margin:8px 0' }, 'Progress updates automatically when you tick off tasks. Drag to override:'),
          (() => {
            const r = el('input', { type: 'range', min: '0', max: '100', value: project.progress || 0, style: 'width:100%' });
            r.onchange = () => saveProject({ progress: +r.value }, true);
            return r;
          })()),
        el('div.card', {},
          el('div.card-h', {}, icon('money'), el('h3', {}, 'Revenue')),
          el('div.totals-box', { style: 'margin:0;width:100%' },
            trow('Invoiced to date', fin.invoiced), trow('Received to date', fin.received),
            trow('Actual profit (received − spend)', fin.received - fin.actualSpend, fin.received - fin.actualSpend < 0)),
          el('div.btn-row', {},
            el('button.btn.filled', { onclick: () => PP.views.documents.newDocumentDialog('quote', { projectId: id }) }, icon('quote', 18), 'Quote'),
            el('button.btn.tonal', { onclick: () => PP.views.documents.newDocumentDialog('invoice', { projectId: id }) }, icon('invoice', 18), 'Invoice')))));
      const byTypeCard = el('div.card', {},
        el('div.card-h', {}, icon('reports'), el('h3', {}, 'Estimate by category')));
      const tt = el('div.tbl-wrap', {}, el('table.tbl', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Category'), el('th.num', {}, 'Cost'), el('th.num', {}, 'Sell'), el('th.num', {}, 'Margin'))),
        el('tbody', {}, Object.entries(fin.byType).map(([k, v]) => el('tr', {},
          el('td', {}, C.TYPE_LABELS[k] || k), el('td.num', {}, money(v.cost)), el('td.num', {}, money(v.sell)),
          el('td.num', { class: v.sell - v.cost < 0 ? 'money-bad' : '' }, money(v.sell - v.cost))))),
        el('tfoot', {}, el('tr', {}, el('td', {}, 'Total'), el('td.num', {}, money(fin.estimateCost)), el('td.num', {}, money(fin.estimateSell)), el('td.num', {}, money(fin.projectedProfit))))));
      byTypeCard.append(tt);
      wrap.append(byTypeCard);
      return wrap;
    }
    const trow = (label, val, bad) => el('div.trow', {}, el('span', {}, label), el('b', { class: bad ? 'money-bad' : '' }, money(U.round2(val))));

    /* ------------------------- Estimate ------------------------- */
    function tabEstimate() {
      const wrap = el('div');
      const list = project.lineItems || [];
      const save = U.debounce(() => PP.db.put('projects', project), 400);
      const fin = () => C.estimateBreakdown(project);

      const tbl = el('table.tbl');
      function rebuild() {
        tbl.innerHTML = '';
        tbl.append(el('thead', {}, el('tr', {},
          el('th', {}, 'Type'), el('th', { style: 'min-width:170px' }, 'Item'), el('th.num', {}, 'Qty'), el('th', {}, 'Unit'),
          el('th.num', {}, 'Unit cost'), el('th.num', {}, 'Markup %'), el('th.num', {}, 'Cost'), el('th.num', {}, 'Sell'), el('th'))));
        const body = el('tbody');
        list.forEach((li, idx) => {
          const typeSel = ui.select(null, li.type, T.LINE_TYPES);
          typeSel.onchange = () => { li.type = typeSel.value; save(); };
          const nameIn = el('input', { value: li.name, placeholder: 'Description' });
          nameIn.oninput = () => { li.name = nameIn.value; save(); };
          const qtyIn = el('input', { type: 'number', step: 'any', value: li.qty, style: 'max-width:90px' });
          qtyIn.oninput = () => { li.qty = +qtyIn.value || 0; upd(); save(); };
          const unitSel = ui.select(null, li.unit || 'ea', T.UNIT_OPTIONS.map((u) => [u, u]));
          unitSel.onchange = () => { li.unit = unitSel.value; save(); };
          const costIn = el('input', { type: 'number', step: 'any', value: li.unitCost, style: 'max-width:100px' });
          costIn.oninput = () => { li.unitCost = +costIn.value || 0; upd(); save(); };
          const mkIn = el('input', { type: 'number', step: 'any', value: li.markupPct || 0, style: 'max-width:80px' });
          mkIn.oninput = () => { li.markupPct = +mkIn.value || 0; upd(); save(); };
          const tr = el('tr', {},
            el('td', {}, typeSel), el('td', {}, nameIn), el('td.num', {}, qtyIn), el('td', {}, unitSel),
            el('td.num', {}, costIn), el('td.num', {}, mkIn),
            el('td.num', { 'data-cost': idx }, money(C.lineCost(li))),
            el('td.num', { 'data-sell': idx }, money(C.lineSell(li))),
            el('td', {}, el('button.ic-btn', { title: 'Remove line', html: icon('delete', 18), onclick: async () => { list.splice(idx, 1); await saveProject({}); draw(); } })));
          body.append(tr);
        });
        const f = fin();
        tbl.append(body, el('tfoot', {}, el('tr', {},
          el('td', { colspan: '6' }, 'Totals'), el('td.num', {}, money(f.estimateCost)), el('td.num', {}, money(f.estimateSell)), el('td'))))
      }
      function upd() {
        list.forEach((li, idx) => {
          const c = tbl.querySelector(`[data-cost="${idx}"]`), s = tbl.querySelector(`[data-sell="${idx}"]`);
          if (c) c.textContent = money(C.lineCost(li));
          if (s) s.textContent = money(C.lineSell(li));
        });
      }
      rebuild();
      const s = PP.state.settings;
      wrap.append(el('div.card', {},
        el('div.card-h', {}, icon('list'), el('h3', {}, 'Estimate'),
          el('span.muted', {}, `sell = cost + markup; ${s.taxName} added on the quote/invoice`)),
        el('div.tbl-wrap', {}, tbl),
        el('div.btn-row', {},
          el('button.btn.tonal', { onclick: () => { list.push({ id: U.uid(), type: 'material', name: '', qty: 1, unit: 'ea', unitCost: 0, markupPct: 20 }); rebuild(); } }, icon('add', 18), 'Add line'),
          el('button.btn.tonal', { onclick: () => materialPicker() }, icon('materials', 18), 'From library'),
          el('button.btn.tonal', { onclick: () => location.hash = '#/sketch?project=' + id }, icon('sketch', 18), 'From sketch'),
          el('button.btn.filled', { onclick: () => PP.views.documents.newDocumentDialog('quote', { projectId: id }) }, icon('quote', 18), 'Create quote from estimate'))));
      wrap.append(el('div.card', {},
        el('div.card-h', {}, icon('percent'), el('h3', {}, 'Tip')),
        el('div.muted', {}, 'Markup covers overheads and profit. Quotes show the SELL prices (cost + markup); your cost base stays private in this estimate. Markup on materials typically 15–30%, labour can be your full charge-out rate.')));
      return wrap;

      function materialPicker() {
        const body = el('div');
        const search = el('input', { type: 'search', placeholder: 'Search materials…' });
        const listBox = el('div.list', { style: 'max-height:320px;overflow:auto' });
        body.append(el('div.field', {}, search), listBox);
        const render = () => {
          listBox.innerHTML = '';
          const q = search.value.toLowerCase();
          materials.filter((m) => !q || [m.name, m.category].join(' ').toLowerCase().includes(q)).slice(0, 40).forEach((m) => {
            const best = (m.prices || []).filter((p) => p.price > 0).sort((a, b) => a.price - b.price)[0];
            const price = best ? best.price : m.defaultPrice || 0;
            listBox.append(ui.listItem({
              title: m.name, sub: `${m.category || ''} • ${money(price)}/${m.unit || 'ea'}${best ? ' (' + ((suppliers.find((s2) => s2.id === best.supplierId) || {}).name || 'supplier') + ')' : ''}`,
              iconName: 'materials',
              onClick: () => {
                const qty = parseFloat(prompt(`Quantity of "${m.name}" (in ${m.unit || 'ea'}):`, '1'));
                if (!(qty > 0)) return;
                list.push({ id: U.uid(), type: 'material', name: m.name, qty, unit: m.unit || 'ea', unitCost: price, markupPct: m.markupPct != null ? m.markupPct : 20, materialId: m.id, supplierId: best ? best.supplierId : '' });
                saveProject({}); closeDlg(); draw();
              }
            }));
          });
        };
        search.oninput = render; render();
        const closeDlg = ui.dialog({ title: 'Add from material library', body, actions: [{ label: 'Close', kind: 'text', onClick: (d, c) => c() }] });
      }
    }

    /* ------------------------- Tasks ------------------------- */
    function tabTasks() {
      const wrap = el('div.card');
      wrap.append(el('div.card-h', {}, icon('check'), el('h3', {}, 'Job checklist'),
        el('button.btn.small.tonal', { onclick: async () => { const name = prompt('Phase name:'); if (!name) return; project.phases.push({ name, tasks: [] }); await saveProject({}); draw(); } }, icon('add', 16), 'Add phase')));
      project.phases.forEach((ph, pi) => {
        const sec = el('div');
        sec.append(el('div.phase-title', {}, ph.name,
          el('button.ic-btn', { style: 'width:26px;height:26px;vertical-align:middle', title: 'Add task', html: icon('add', 16), onclick: async () => { const name2 = prompt('Task:'); if (!name2) return; ph.tasks.push({ name: name2, done: false }); await saveProject({}); draw(); } }),
          el('button.ic-btn', { style: 'width:26px;height:26px;vertical-align:middle', title: 'Delete phase', html: icon('delete', 15), onclick: async () => { if (await ui.confirm({ title: `Delete phase "${ph.name}"?` })) { project.phases.splice(pi, 1); await saveProject({}); draw(); } } })));
        if (!ph.tasks.length) sec.append(el('div.muted', { style: 'padding:2px 0 6px' }, 'No tasks in this phase.'));
        ph.tasks.forEach((t, ti) => {
          const cb = el('input', { type: 'checkbox', checked: t.done });
          cb.onchange = async () => {
            t.done = cb.checked;
            const tasks = project.phases.flatMap((p) => p.tasks);
            project.progress = tasks.length ? Math.round(tasks.filter((x) => x.done).length / tasks.length * 100) : 0;
            await PP.db.put('projects', project);
            row.classList.toggle('done', t.done);
          };
          const del = el('button.ic-btn', { style: 'width:28px;height:28px', title: 'Delete task', html: icon('close', 15), onclick: async () => { ph.tasks.splice(ti, 1); await saveProject({}); draw(); } });
          const row = el('div.task-check' + (t.done ? '.done' : ''), {}, cb,
            el('div', { style: 'flex:1', onclick: async () => { const nn = prompt('Edit task:', t.name); if (nn) { t.name = nn; await saveProject({}); draw(); } } },
              el('div.t-name', {}, t.name), t.note ? el('div.t-note', {}, t.note) : null), del);
          sec.append(row);
        });
        wrap.append(sec);
      });
      return wrap;
    }

    /* ------------------------- Expenses ------------------------- */
    function tabExpenses() {
      const wrap = el('div');
      const fin = C.projectFinancials(project, expensesAll, docsAll);
      const card = el('div.card', {},
        el('div.card-h', {}, icon('money'), el('h3', {}, 'Expenses'),
          el('button.btn.small.tonal', { onclick: () => expenseDialog() }, icon('add', 16), 'Add expense')),
        el('div', { style: 'margin-bottom:10px' },
          el('div.muted', {}, `Budget ${money(fin.budget)} • spent ${money(fin.actualSpend)} (${U.pct(fin.budgetUsedPct)})`),
          ui.progressBar(Math.min(100, fin.budgetUsedPct), true)));
      if (expenses.length) {
        card.append(el('div.tbl-wrap', {}, el('table.tbl', {},
          el('thead', {}, el('tr', {}, el('th', {}, 'Date'), el('th', {}, 'Description'), el('th', {}, 'Category'), el('th.num', {}, 'Amount'), el('th'))),
          el('tbody', {}, expenses.map((e2) => el('tr', {},
            el('td', {}, fmtDate(e2.date)), el('td', {}, e2.description), el('td', {}, e2.category),
            el('td.num', {}, money(e2.amount)),
            el('td', { style: 'white-space:nowrap' },
              el('button.ic-btn', { title: 'Edit', html: icon('edit', 17), onclick: () => expenseDialog(e2) }),
              el('button.ic-btn', { title: 'Delete', html: icon('delete', 17), onclick: async () => { if (await ui.confirm({ title: 'Delete expense?', message: e2.description })) { await PP.db.del('expenses', e2.id); refreshAll(); } } }))))),
          el('tfoot', {}, el('tr', {}, el('td', { colspan: '3' }, 'Total'), el('td.num', {}, money(fin.actualSpend)), el('td'))))));
        card.append(el('div.btn-row', {}, el('button.btn.text', { onclick: () => {
          const csv = U.recordsToCSV([
            { key: 'date', label: 'Date' }, { key: 'description', label: 'Description' }, { key: 'category', label: 'Category' },
            { key: 'amount', label: 'Amount' }, { key: 'supplierName', label: 'Supplier', value: (r) => (suppliers.find((s2) => s2.id === r.supplierId) || {}).name || '' }
          ], expenses);
          U.download(`expenses-${project.name.replace(/\W+/g, '-')}.csv`, csv, 'text/csv');
        } }, icon('download', 18), 'Export CSV')));
      } else card.append(ui.emptyState('money', 'No expenses recorded', 'Track every purchase — materials, fuel, disposal fees — to measure profit accurately.'));
      wrap.append(card);
      return wrap;

      function expenseDialog(existing) {
        const e2 = existing || { date: U.todayISO(), category: 'Materials', amount: null, description: '', supplierId: '' };
        const attachBox = el('div');
        const body = el('div', {},
          ui.fieldRow(
            ui.field('Date', ui.input('date', e2.date, { type: 'date' })),
            ui.field('Category', ui.select('category', e2.category, T.EXPENSE_CATEGORIES.map((c) => [c, c])))),
          ui.field('Description', ui.input('description', e2.description)),
          ui.fieldRow(
            ui.field('Amount', ui.numberInput('amount', e2.amount)),
            ui.field('Supplier (optional)', ui.select('supplierId', e2.supplierId, [['', '—'], ...suppliers.map((su) => [su.id, su.name])]))),
          el('div.field', {}, el('label', {}, 'Receipt (optional)'), attachBox));
        (async () => attachBox.append(await ui.attachmentGrid('expense', e2.id || 'new', { onChange: draw })))();
        ui.dialog({
          title: existing ? 'Edit expense' : 'Add expense', body,
          actions: [{ label: existing ? 'Save changes' : 'Add expense', kind: 'filled', onClick: async (d, done) => {
            if (!(d.amount > 0)) { ui.toast('Enter an amount'); return; }
            const rec = { id: e2.id || U.uid(), projectId: id, date: d.date, category: d.category, description: d.description, amount: d.amount, supplierId: d.supplierId, createdAt: e2.createdAt };
            await PP.db.put('expenses', rec);
            done(false); refreshAll(); ui.toast('Expense saved');
          } }]
        });
      }
    }

    /* ------------------------- Documents ------------------------- */
    function tabDocuments() {
      const wrap = el('div.card', {},
        el('div.card-h', {}, icon('documents'), el('h3', {}, 'Quotes, invoices & receipts'),
          el('div.btn-row', { style: 'margin:0' },
            el('button.btn.small.filled', { onclick: () => PP.views.documents.newDocumentDialog('quote', { projectId: id }) }, icon('quote', 16), 'Quote'),
            el('button.btn.small.tonal', { onclick: () => PP.views.documents.newDocumentDialog('invoice', { projectId: id }) }, icon('invoice', 16), 'Invoice'))),
        projectDocs.length ? el('div.list', {}, projectDocs.map((d) => {
          const t = C.docTotals(d);
          return ui.listItem({
            iconName: d.kind, title: `${d.number} — ${d.kind[0].toUpperCase()}${d.kind.slice(1)}`,
            sub: `${fmtDate(d.issueDate)} • ${d.status}`,
            end: el('span.amount', {}, money(t.total)),
            onClick: () => location.hash = '#/document/' + d.id
          });
        })) : ui.emptyState('quote', 'No documents yet', 'Generate a professional quote from your estimate — it converts to an invoice, then a receipt.'));
      return wrap;
    }

    /* ------------------------- Shopping list ------------------------- */
    function tabShopping() {
      const wrap = el('div');
      const requirements = (project.lineItems || [])
        .filter((li) => li.type === 'material')
        .map((li) => {
          if (li.materialId) return { materialId: li.materialId, qty: li.qty };
          let m = materials.find((mm) => mm.name.toLowerCase() === (li.name || '').toLowerCase());
          if (!m) m = materials.find((mm) => (li.name || '').toLowerCase().includes(mm.name.toLowerCase()));
          return m ? { materialId: m.id, qty: li.qty } : { materialId: '', qty: 0 };
        });
      // merge same material
      const merged = {};
      requirements.forEach((r) => { if (r.materialId) merged[r.materialId] = (merged[r.materialId] || 0) + r.qty; });
      const reqs = Object.entries(merged).map(([materialId, qty]) => ({ materialId, qty }));
      const groups = C.bestSupplierGroups(reqs, materials, suppliers);
      const grand = U.sum(groups, (g) => g.total);
      const card = el('div.card', {},
        el('div.card-h', {}, icon('suppliers'), el('h3', {}, 'Auto shopping list — cheapest supplier per item'),
          el('div.btn-row', { style: 'margin:0' },
            el('button.btn.small.tonal', { onclick: async () => { ui.toast('Rendering PDF…'); const blob = await PP.pdf.renderShoppingList(`Shopping list — ${project.name}`, groups, { checkboxes: true }); U.download(`ShoppingList-${project.name.replace(/\W+/g, '-')}.pdf`, blob); } }, icon('pdf', 16), 'PDF'),
            el('button.btn.small.tonal', { onclick: () => {
              const rows = [];
              groups.forEach((g) => g.items.forEach((i) => rows.push([g.name, i.name, i.qty, i.unit, i.unitPrice, i.total])));
              U.download(`shopping-${project.name.replace(/\W+/g, '-')}.csv`, U.toCSV(['Supplier', 'Item', 'Qty', 'Unit', 'Unit price', 'Total'], rows), 'text/csv');
            } }, icon('export', 16), 'CSV'))));
      if (!reqs.length) { card.append(ui.emptyState('materials', 'No materials in the estimate', 'Add material lines to your estimate and link them to the materials library, then this list builds itself with the cheapest supplier per item.')); }
      else {
        for (const g of groups) {
          card.append(el('div', { style: 'margin-bottom:16px' },
            el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin:10px 0 6px' },
              el('b', {}, g.name), el('span.chip.primary', {}, money(g.total))),
            el('div.tbl-wrap', {}, el('table.tbl', {},
              el('thead', {}, el('tr', {}, el('th', {}, 'Item'), el('th.num', {}, 'Qty'), el('th', {}, 'Unit'), el('th.num', {}, 'Unit price'), el('th.num', {}, 'Total'))),
              el('tbody', {}, g.items.map((i) => el('tr', {},
                el('td', {}, i.name), el('td.num', {}, num(i.qty)), el('td', {}, i.unit),
                el('td.num', {}, i.unitPrice ? money(i.unitPrice) : '—'), el('td.num', {}, i.unitPrice ? money(i.total) : 'set price'))))))));
        }
        card.append(el('div.totals-box', {}, el('div.trow.grand', {}, el('span', {}, 'Estimated material spend'), el('b', {}, money(grand)))),
          el('div.muted', {}, 'Missing prices? Add supplier prices in Materials to complete the comparison.'));
      }
      wrap.append(card);
      return wrap;
    }

    /* ------------------------- Notes & files ------------------------- */
    async function tabNotes() {
      const wrap = el('div.grid.cols-2');
      const notes = ui.textarea('notes', project.notes || '', { placeholder: 'Job notes, access instructions, customer requests…' });
      notes.oninput = U.debounce(() => saveProject({ notes: notes.value }), 500);
      const attachWrap = el('div');
      const reattach = async () => { attachWrap.innerHTML = ''; attachWrap.append(await ui.attachmentGrid('project', id, { onChange: reattach })); };
      await reattach();
      wrap.append(
        el('div.card', {}, el('div.card-h', {}, icon('notes'), el('h3', {}, 'Job notes')), el('div.field', {}, notes)),
        el('div.card', {}, el('div.card-h', {}, icon('camera'), el('h3', {}, 'Photos & documents'), ui.attachButton('project', id, reattach)), attachWrap));
      return wrap;
    }

    /* ------------------------- edit dialog ------------------------- */
    function editProjectDialog(onSaved) {
      const body = el('div', {},
        ui.field('Project name', ui.input('name', project.name)),
        ui.fieldRow(
          ui.field('Customer', ui.select('customerId', project.customerId, [['', '— none —'], ...customers.map((c) => [c.id, c.name])])),
          ui.field('Status', ui.select('status', project.status, [['quoted', 'Quoted'], ['approved', 'Approved'], ['active', 'Active'], ['on-hold', 'On hold'], ['completed', 'Completed'], ['cancelled', 'Cancelled']]))),
        ui.field('Site address', ui.input('address', project.address)),
        ui.fieldRow(
          ui.field('Start date', ui.input('startDate', project.startDate, { type: 'date' })),
          ui.field('Target finish', ui.input('dueDate', project.dueDate, { type: 'date' }))),
        ui.field('Budget (cost limit)', ui.numberInput('budget', project.budget)),
        el('div.btn-row', { style: 'margin-top:0' },
          el('button.btn.danger.tonal', { onclick: async (e) => {
            e.preventDefault();
            if (await ui.confirm({ title: `Delete project "${project.name}"?`, message: 'Linked expenses and documents are kept but unlinked.' })) {
              await PP.db.del('projects', project.id); ui.toast('Project deleted'); location.hash = '#/projects';
            }
          } }, icon('delete', 18), 'Delete project')));
      ui.dialog({
        title: 'Edit project', body,
        actions: [{ label: 'Save', kind: 'filled', onClick: async (d, done) => {
          await saveProject({ name: d.name, customerId: d.customerId, status: d.status, address: d.address, startDate: d.startDate, dueDate: d.dueDate, budget: d.budget || 0 });
          done(false); onSaved && onSaved(); ui.toast('Saved');
        } }]
      });
    }

    draw();
    return view;
  }

  /* ========================================================== DIALOGS == */
  function newProjectDialog() {
    const bodyEl = el('div');
    (async () => {
      const customers = await PP.db.all('customers');
      const tmplSel = ui.select('templateId', 'custom', T.TEMPLATES.map((t) => [t.id, t.name]));
      const desc = el('div.hint', {}, 'Blank project — build your own.');
      tmplSel.onchange = () => desc.textContent = T.TEMPLATES.find((t) => t.id === tmplSel.value).description;
      bodyEl.append(
        ui.field('Template', tmplSel), el('div.field', {}, desc),
        ui.field('Project name', ui.input('name', '', { placeholder: 'e.g. Smith — repaint interior' })),
        ui.fieldRow(
          ui.field('Customer', ui.select('customerId', '', [['', '— none —'], ...customers.map((c) => [c.id, c.name])])),
          ui.field('Status', ui.select('status', 'quoted', [['quoted', 'Quoted'], ['approved', 'Approved'], ['active', 'Active']]))),
        ui.field('Site address', ui.input('address', '')),
        ui.fieldRow(
          ui.field('Start date', ui.input('startDate', U.todayISO(), { type: 'date' })),
          ui.field('Target finish', ui.input('dueDate', '', { type: 'date' }))),
        ui.field('Budget (cost limit)', ui.numberInput('budget', null, { placeholder: 'Optional — for budget tracking' })));
    })();
    ui.dialog({
      title: 'New project', body: bodyEl,
      actions: [{ label: 'Create project', kind: 'filled', icon: 'add', onClick: async (d, done) => {
        if (!d.name.trim()) { ui.toast('Name the project'); return; }
        const tmpl = T.TEMPLATES.find((t) => t.id === d.templateId);
        const project = {
          id: U.uid('p'), name: d.name.trim(), templateId: tmpl.id, customerId: d.customerId || '',
          status: d.status || 'quoted', address: d.address || '', startDate: d.startDate || U.todayISO(),
          dueDate: d.dueDate || '', budget: d.budget || 0, progress: 0,
          phases: JSON.parse(JSON.stringify(tmpl.phases.map((ph) => ({ name: ph.name, tasks: ph.tasks.map((t) => ({ name: t, done: false })) })))),
          lineItems: tmpl.starterItems.map((li) => ({ id: U.uid(), ...li })),
          notes: '', createdAt: U.nowISO()
        };
        await PP.db.put('projects', project);
        done(false); ui.toast('Project created');
        location.hash = '#/project/' + project.id + '?tab=estimate';
        PP.app.rerender();
      } }]
    });
  }

  async function importProjectsCSV(text) {
    const cols = [
      { key: 'name', label: 'Name' }, { key: 'customer', label: 'Customer' }, { key: 'address', label: 'Address' },
      { key: 'status', label: 'Status' }, { key: 'budget', label: 'Budget' }, { key: 'startDate', label: 'Start date' }, { key: 'dueDate', label: 'Due date' }
    ];
    try {
      const rows = U.csvToRecords(text, cols);
      if (!rows.length) { ui.toast('No rows found — check the header row'); return; }
      const customers = await PP.db.all('customers');
      const custByName = Object.fromEntries(customers.map((c) => [c.name.toLowerCase(), c.id]));
      let n = 0;
      for (const r of rows) {
        if (!r.name) continue;
        await PP.db.put('projects', {
          id: U.uid('p'), name: r.name, templateId: 'custom',
          customerId: custByName[(r.customer || '').toLowerCase()] || '',
          address: r.address || '', status: ['quoted', 'approved', 'active', 'on-hold', 'completed', 'cancelled'].includes(r.status) ? r.status : 'quoted',
          budget: parseFloat(r.budget) || 0, startDate: r.startDate || U.todayISO(), dueDate: r.dueDate || '',
          progress: 0, phases: [{ name: 'Phase 1', tasks: [] }], lineItems: [], notes: ''
        });
        n++;
      }
      ui.toast(`${n} projects imported`);
      PP.app.rerender();
    } catch (e) { console.error(e); ui.toast('Import failed — check the CSV format'); }
  }

  function exportProjectsCSV(projects, custById) {
    const csv = U.recordsToCSV([
      { key: 'name', label: 'Name' }, { key: 'customer', label: 'Customer', value: (r) => (custById[r.customerId] || {}).name || '' },
      { key: 'address', label: 'Address' }, { key: 'status', label: 'Status' }, { key: 'budget', label: 'Budget' },
      { key: 'startDate', label: 'Start date' }, { key: 'dueDate', label: 'Due date' }, { key: 'progress', label: 'Progress %' }
    ], projects);
    U.download('projects.csv', csv, 'text/csv');
  }

  /* route dispatcher */
  async function render(root, params, query) {
    if (params && params[0]) return renderDetail(root, params[0], query);
    return renderList(root, query);
  }

  return { title: 'Projects', icon: 'project', render, newProjectDialog };
})();
