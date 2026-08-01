/* ProjectPro — Documents: quotes, invoices, receipts with auto-numbering,
 * statuses, quote→invoice→receipt conversion, PDF generation, reminders. */
'use strict';
window.PP = window.PP || {};
PP.views = PP.views || {};

PP.views.documents = (() => {
  const U = PP.util, ui = PP.ui, C = PP.calc;
  const { el, icon, money, num, fmtDate } = U;
  let tab = localStorage.getItem('pp-doc-tab') || 'all';
  let q = '';

  /* ============================ LIST ============================ */
  async function renderList(root, query) {
    const view = el('div.view');
    const [documents, customers, projects] = await Promise.all([PP.db.all('documents'), PP.db.all('customers'), PP.db.all('projects')]);
    const custById = Object.fromEntries(customers.map((c) => [c.id, c]));
    const projById = Object.fromEntries(projects.map((p) => [p.id, p]));

    const tabs = [['all', 'All'], ['quote', 'Quotes'], ['invoice', 'Invoices'], ['receipt', 'Receipts']];
    const tabBar = el('div.tabs', {}, tabs.map(([k, l]) => el('button.tab' + (k === tab ? '.active' : ''), {
      onclick: () => { tab = k; localStorage.setItem('pp-doc-tab', k); refresh(); tabBar.querySelectorAll('.tab').forEach((b, i) => b.classList.toggle('active', tabs[i][0] === k)); }
    }, l)));
    const search = el('input', { type: 'search', placeholder: 'Search number, customer, status…', value: q, class: 'grow' });
    search.oninput = U.debounce(() => { q = search.value; refresh(); }, 250);
    view.append(tabBar, el('div.filter-bar', {}, search,
      el('button.btn.tonal', { onclick: () => exportCSV(documents, custById) }, icon('export', 18), 'Export CSV')));
    const listWrap = el('div');
    view.append(listWrap);

    function refresh() {
      listWrap.innerHTML = '';
      let rows = documents.filter((d) => tab === 'all' || d.kind === tab);
      if (q) rows = rows.filter((d) => [d.number, d.kind, d.status, (custById[d.customerId] || {}).name].join(' ').toLowerCase().includes(q.toLowerCase()));
      rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      // derived statuses
      const today = U.todayISO();
      rows.forEach((d) => { if (d.kind === 'invoice' && !['paid', 'converted'].includes(d.status) && d.dueDate && d.dueDate < today) d._overdue = true; });
      if (!rows.length) { listWrap.append(ui.emptyState('documents', 'No documents', 'Create quotes, invoices and receipts with professional PDF output.')); return; }
      const summary = el('div.grid.cols-3', { style: 'margin-bottom:14px' });
      const sums = {
        quotes: U.sum(rows.filter((d) => d.kind === 'quote'), (d) => C.docTotals(d).total),
        invoicesDue: U.sum(rows.filter((d) => d.kind === 'invoice'), (d) => C.docTotals(d).balance),
        receipts: U.sum(rows.filter((d) => d.kind === 'receipt'), (d) => C.docTotals(d).total)
      };
      summary.append(ui.kpi('Quoted value', money(sums.quotes), 'shown rows'), ui.kpi('Invoice balance', money(sums.invoicesDue), 'outstanding', sums.invoicesDue > 0 ? 'bad' : 'good'), ui.kpi('Received', money(sums.receipts), 'receipts shown'));
      const card = el('div.card.elevated', {}, el('div.list'));
      for (const d of rows) {
        const t = C.docTotals(d);
        card.firstChild.append(ui.listItem({
          iconName: d.kind, title: `${d.number} — ${(custById[d.customerId] || {}).name || 'Cash sale'}`,
          sub: `${fmtDate(d.issueDate)}${projById[d.projectId] ? ' • ' + projById[d.projectId].name : ''}${d.convertedFrom ? ' • from ' + d.convertedFrom : ''}`,
          onClick: () => location.hash = '#/document/' + d.id,
          end: el('div', { style: 'display:flex;flex-direction:column;align-items:flex-end;gap:3px' },
            el('span.amount', {}, money(t.total)), d._overdue ? ui.chip('overdue', 'error') : ui.statusChip(d.status))
        }));
      }
      listWrap.append(summary, card);
    }
    refresh();
    root.append(view, el('button.fab', { onclick: () => newDocumentDialog(tab === 'all' ? 'quote' : tab) }, icon('add'), tab === 'invoice' ? 'Invoice' : tab === 'receipt' ? 'Receipt' : 'Quote'));
    const newKind = query && query.get('new');
    if (newKind && ['quote', 'invoice', 'receipt'].includes(newKind)) newDocumentDialog(newKind);
    return view;
  }

  /* ============================ DETAIL ============================ */
  async function renderDetail(root, id) {
    const view = el('div.view');
    const d = await PP.db.get('documents', id);
    if (!d) { view.append(ui.emptyState('warning', 'Document not found', '')); root.append(view); return view; }
    const [customers, projects] = await Promise.all([PP.db.all('customers'), PP.db.all('projects')]);
    const cust = customers.find((c) => c.id === d.customerId);
    const proj = projects.find((p) => p.id === d.projectId);
    const t = C.docTotals(d);

    const headerBar = el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px' },
      el('button.ic-btn', { onclick: () => location.hash = '#/documents', html: icon('back'), 'aria-label': 'Back' }),
      el('div', { style: 'flex:1' },
        el('h1', { style: 'font-size:22px;font-weight:700' }, `${d.number}`),
        el('div.muted', {}, `${d.kind} • issued ${fmtDate(d.issueDate)}${cust ? ' • ' + cust.name : ''}${proj ? ' • ' + proj.name : ''}`)),
      ui.statusChip(d.status));
    view.append(headerBar);

    /* actions row */
    const pdfBtn = el('button.btn.filled', { onclick: async () => { ui.toast('Rendering PDF…'); const blob = await PP.pdf.renderDocument(d); U.download(`${d.number}.pdf`, blob); } }, icon('pdf', 18), 'PDF');
    const printBtn = el('button.btn.tonal', { onclick: async () => { const blob = await PP.pdf.renderDocument(d); const url = URL.createObjectURL(blob); const w = window.open(url, '_blank'); if (w) w.onload = () => setTimeout(() => w.print(), 600); } }, icon('print', 18), 'Print');
    const editBtn = el('button.btn.tonal', { onclick: () => editDocumentDialog(d, () => { root.innerHTML = ''; renderDetail(root, id); }) }, icon('edit', 18), 'Edit');
    view.append(el('div.btn-row', { style: 'margin:0 0 14px' }, pdfBtn, printBtn, editBtn,
      el('button.btn.tonal', { onclick: async () => {
        const copy = { ...d, id: U.uid('d'), number: await PP.db.nextDocNumber(d.kind), status: 'draft', issueDate: U.todayISO(), items: JSON.parse(JSON.stringify(d.items)), convertedFrom: '', convertedTo: '', signatureAttachmentId: '', amountPaid: 0, paidDate: '' };
        await PP.db.put('documents', copy); ui.toast('Duplicated as ' + copy.number); location.hash = '#/document/' + copy.id;
      } }, icon('copy', 18), 'Duplicate'),
      el('button.btn.danger.tonal', { onclick: async () => {
        if (await ui.confirm({ title: `Delete ${d.number}?` })) { await PP.db.del('documents', d.id); ui.toast('Deleted'); location.hash = '#/documents'; }
      } }, icon('delete', 18), 'Delete')));

    const gridCols = el('div.grid.cols-2');
    view.append(gridCols);

    /* status + workflow card */
    const flow = el('div.card', {}, el('div.card-h', {}, icon('convert'), el('h3', {}, 'Status & workflow')));
    const statusButtons = el('div.btn-row', { style: 'margin-top:0' });
    async function setStatus(st) {
      d.status = st;
      if (st === 'sent' && d.kind === 'quote') await addReminder('quote', `Follow up quote ${d.number}`, U.addDaysISO(U.todayISO(), 7), d.id);
      if (st === 'sent' && d.kind === 'invoice') await addReminder('invoice', `Invoice ${d.number} due — chase payment`, d.dueDate || U.addDaysISO(U.todayISO(), 14), d.id);
      await PP.db.put('documents', d);
      root.innerHTML = ''; renderDetail(root, id);
    }
    if (d.kind === 'quote') {
      if (d.status === 'draft') statusButtons.append(el('button.btn.outlined', { onclick: () => setStatus('sent') }, icon('mail', 18), 'Mark sent'));
      if (d.status === 'sent' || d.status === 'viewed') {
        statusButtons.append(
          el('button.btn.success', { onclick: () => setStatus('accepted') }, icon('check', 18), 'Customer accepted'),
          el('button.btn.danger.tonal', { onclick: () => setStatus('declined') }, icon('close', 18), 'Declined'));
      }
      if (d.status === 'accepted') statusButtons.append(el('button.btn.filled', { onclick: () => convertToInvoice(d, root, id) }, icon('convert', 18), 'Convert to invoice'));
      if (d.status === 'converted' && d.convertedTo) statusButtons.append(el('span.chip.success', {}, 'Converted to ', d.convertedTo));
    }
    if (d.kind === 'invoice') {
      if (d.status === 'draft') statusButtons.append(el('button.btn.outlined', { onclick: () => setStatus('sent') }, icon('mail', 18), 'Mark sent'));
      if (['sent', 'partial', 'overdue'].includes(d.status)) {
        statusButtons.append(el('button.btn.success', { onclick: () => recordPayment(d, root, id) }, icon('money', 18), 'Record payment'));
      }
      if (d.status === 'paid' && !d.convertedTo) statusButtons.append(el('button.btn.filled', { onclick: () => convertToReceipt(d, root, id) }, icon('convert', 18), 'Convert to receipt'));
      if (d.convertedTo) statusButtons.append(el('button.btn.tonal', { onclick: async () => { const all = await PP.db.all('documents'); const rc = all.find((x) => x.number === d.convertedTo); if (rc) location.hash = '#/document/' + rc.id; } }, icon('receipt', 18), 'View receipt ' + d.convertedTo));
    }
    flow.append(statusButtons);
    if (d.convertedFrom) flow.append(el('div.muted', {}, `Converted from ${d.convertedFrom}`));
    if (d.kind === 'quote' && d.status === 'accepted' && !d.signatureAttachmentId) {
      const sig = ui.signaturePad({ onSave: async (rec) => { d.signatureAttachmentId = rec.id; await PP.db.put('documents', d); ui.toast('Signature saved'); root.innerHTML = ''; renderDetail(root, id); } });
      flow.append(el('div', { style: 'margin-top:12px' }, el('div.field', {}, el('label', {}, 'Customer acceptance signature (optional)'), sig.node)));
    }
    gridCols.append(flow);

    /* totals card */
    const s = PP.state.settings;
    const totalsCard = el('div.card', {}, el('div.card-h', {}, icon('money'), el('h3', {}, 'Totals')),
      el('div.totals-box', { style: 'margin:0;width:100%' },
        el('div.trow', {}, el('span', {}, 'Subtotal'), el('b', {}, money(t.subtotal))),
        t.discount ? el('div.trow', {}, el('span', {}, `Discount${d.discount.type === 'percent' ? ` (${num(d.discount.value, 1)}%)` : ''}`), el('b', {}, '−' + money(t.discount))) : null,
        s.taxRate ? el('div.trow', {}, el('span', {}, s.taxName + ' ' + num(s.taxRate, 0) + '%'), el('b', {}, money(t.tax))) : null,
        el('div.trow.grand', {}, el('span', {}, 'Total'), el('b', {}, money(t.total))),
        d.kind === 'invoice' && t.paid > 0 ? el('div.trow', {}, el('span', {}, 'Paid'), el('b.money-good', {}, money(t.paid))) : null,
        d.kind === 'invoice' && t.paid > 0 ? el('div.trow', {}, el('span', {}, 'Balance'), el('b', { class: t.balance > 0 ? 'money-bad' : '' }, money(t.balance))) : null));
    gridCols.append(totalsCard);

    /* items */
    const itemsCard = el('div.card', {}, el('div.card-h', {}, icon('list'), el('h3', {}, 'Line items'),
      el('button.btn.small.text', { onclick: () => editDocumentDialog(d, () => { root.innerHTML = ''; renderDetail(root, id); }) }, icon('edit', 16), 'Edit')));
    itemsCard.append(el('div.tbl-wrap', {}, el('table.tbl', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Description'), el('th.num', {}, 'Qty'), el('th', {}, 'Unit'), el('th.num', {}, 'Unit price'), el('th.num', {}, 'Amount'))),
      el('tbody', {}, (d.items || []).map((it) => el('tr', {},
        el('td', {}, it.desc), el('td.num', {}, num(it.qty).replace(/\.00$/, '')), el('td', {}, it.unit || 'ea'),
        el('td.num', {}, money(it.unitPrice)), el('td.num', {}, money(C.docLineAmount(it)))))),
      el('tfoot', {}, el('tr', {}, el('td', { colspan: '4' }, 'Subtotal'), el('td.num', {}, money(t.subtotal)))))));
    view.append(itemsCard);

    if (d.terms || d.notes) {
      view.append(el('div.grid.cols-2', {},
        d.terms ? el('div.card', {}, el('div.card-h', {}, icon('info'), el('h3', {}, 'Terms')), el('div.muted', { style: 'white-space:pre-wrap' }, d.terms)) : null,
        d.notes ? el('div.card', {}, el('div.card-h', {}, icon('notes'), el('h3', {}, 'Notes')), el('div.muted', { style: 'white-space:pre-wrap' }, d.notes)) : null));
    }
    root.append(view);
    return view;
  }

  /* ============================ WORKFLOWS ============================ */
  async function addReminder(type, title, date, refId) {
    const existing = (await PP.db.all('reminders')).find((r) => r.refId === refId && r.type === type && !r.done);
    if (existing) return;
    await PP.db.put('reminders', { id: U.uid('r'), type, title, date, refId, done: false });
  }
  async function convertToInvoice(d, root, id) {
    d.status = 'converted';
    const invNum = await PP.db.nextDocNumber('invoice');
    const inv = {
      id: U.uid('d'), kind: 'invoice', number: invNum, status: 'draft',
      projectId: d.projectId, customerId: d.customerId,
      items: JSON.parse(JSON.stringify(d.items)), discount: d.discount ? { ...d.discount } : { type: 'amount', value: 0 },
      issueDate: U.todayISO(), dueDate: U.addDaysISO(U.todayISO(), 14),
      convertedFrom: d.number, convertedTo: '', amountPaid: 0,
      terms: PP.state.settings.invoiceTerms, notes: d.notes || ''
    };
    d.convertedTo = invNum;
    await PP.db.put('documents', d);
    await PP.db.put('documents', inv);
    await addReminder('invoice', `Invoice ${invNum} due — chase payment`, inv.dueDate, inv.id);
    ui.toast(`Quote converted to ${invNum}`);
    location.hash = '#/document/' + inv.id;
  }
  async function convertToReceipt(d, root, id) {
    d.convertedTo = d.convertedTo || '';
    const rNum = await PP.db.nextDocNumber('receipt');
    const rec = {
      id: U.uid('d'), kind: 'receipt', number: rNum, status: 'paid',
      projectId: d.projectId, customerId: d.customerId,
      items: JSON.parse(JSON.stringify(d.items)), discount: d.discount ? { ...d.discount } : { type: 'amount', value: 0 },
      issueDate: U.todayISO(), paidDate: U.todayISO(), paymentMethod: d.paymentMethod || PP.state.settings.paymentDetails.method || 'Bank transfer',
      convertedFrom: d.number, convertedTo: '', terms: PP.state.settings.receiptTerms, notes: ''
    };
    d.convertedTo = rNum;
    await PP.db.put('documents', d);
    await PP.db.put('documents', rec);
    ui.toast(`Receipt ${rNum} created`);
    location.hash = '#/document/' + rec.id;
  }
  function recordPayment(d, root, id) {
    const t = C.docTotals(d);
    const body = el('div',
      el('div.muted', { style: 'margin-bottom:12px' }, `Invoice total ${money(t.total)} — balance due ${money(t.balance)}`),
      ui.field('Amount received', ui.numberInput('amount', t.balance || t.total)),
      ui.fieldRow(
        ui.field('Date', ui.input('date', U.todayISO(), { type: 'date' })),
        ui.field('Method', ui.select('method', 'Bank transfer', [['Bank transfer', 'Bank transfer'], ['Card', 'Card'], ['Cash', 'Cash'], ['PayID', 'PayID'], ['Cheque', 'Cheque'], ['Other', 'Other']]))));
    ui.dialog({
      title: 'Record payment', body,
      actions: [{ label: 'Save payment', kind: 'filled', onClick: async (data, done) => {
        if (!(data.amount > 0)) { ui.toast('Enter an amount'); return; }
        d.amountPaid = U.round2((d.amountPaid || 0) + data.amount);
        d.paymentMethod = data.method;
        const t2 = C.docTotals(d);
        if (t2.balance <= 0.005) { d.status = 'paid'; d.paidDate = data.date; } else d.status = 'partial';
        await PP.db.put('documents', d);
        done(false);
        if (d.status === 'paid') convertToReceipt(d, root, id);
        else { root.innerHTML = ''; renderDetail(root, id); }
      } }]
    });
  }

  /* ============================ EDITOR ============================ */
  function editorBody(d, items) {
    const wrap = el('div');
    const tbl = el('table.tbl');
    const s = PP.state.settings;
    function rebuild() {
      tbl.innerHTML = '';
      tbl.append(el('thead', {}, el('tr', {},
        el('th', { style: 'min-width:200px' }, 'Description'), el('th.num', {}, 'Qty'), el('th', {}, 'Unit'), el('th.num', {}, 'Unit price'),
        ...(s.taxRate ? [el('th.num', {}, s.taxName + ' %')] : []),
        el('th.num', {}, 'Amount'), el('th'))));
      const body = el('tbody');
      items.forEach((it, i) => {
        const desc = el('input', { value: it.desc, placeholder: 'Work or item description' });
        desc.oninput = () => it.desc = desc.value;
        const qty = el('input', { type: 'number', step: 'any', value: it.qty, style: 'max-width:84px' });
        qty.oninput = () => { it.qty = +qty.value || 0; upd(); };
        const unit = ui.select(null, it.unit || 'ea', PP.templates.UNIT_OPTIONS.map((u) => [u, u]));
        unit.onchange = () => it.unit = unit.value;
        const price = el('input', { type: 'number', step: 'any', value: it.unitPrice, style: 'max-width:110px' });
        price.oninput = () => { it.unitPrice = +price.value || 0; upd(); };
        let taxIn = null;
        if (s.taxRate) { taxIn = el('input', { type: 'number', step: 'any', value: it.taxPct == null ? s.taxRate : it.taxPct, style: 'max-width:74px' }); taxIn.oninput = () => { it.taxPct = +taxIn.value; }; }
        body.append(el('tr', {},
          el('td', {}, desc), el('td.num', {}, qty), el('td', {}, unit), el('td.num', {}, price),
          ...(s.taxRate ? [el('td.num', {}, taxIn)] : []),
          el('td.num', { 'data-amt': i }, money(C.docLineAmount(it))),
          el('td', {}, el('button.ic-btn', { title: 'Remove', html: icon('close', 16), onclick: () => { items.splice(i, 1); rebuild(); } }))));
      });
      tbl.append(body);
    }
    function upd() { items.forEach((it, i) => { const c = tbl.querySelector(`[data-amt="${i}"]`); if (c) c.textContent = money(C.docLineAmount(it)); }); }
    rebuild();
    wrap.append(el('div.tbl-wrap', {}, tbl),
      el('div.btn-row', {}, el('button.btn.small.tonal', { onclick: (e) => { e.preventDefault(); items.push({ desc: '', qty: 1, unit: 'ea', unitPrice: 0, taxPct: null }); rebuild(); } }, icon('add', 16), 'Add line')));
    return wrap;
  }

  function newDocumentDialog(kind, prefill = {}) {
    (async () => {
      const [customers, projects] = await Promise.all([PP.db.all('customers'), PP.db.all('projects')]);
      const s = PP.state.settings;
      const number = await PP.db.nextDocNumber(kind);
      const project = projects.find((p) => p.id === prefill.projectId);
      const items = project && kind === 'quote' ? C.itemsFromProject(project) : [];
      if (!items.length) items.push({ desc: '', qty: 1, unit: 'ea', unitPrice: 0, taxPct: null });
      const draft = {
        kind, number, status: 'draft',
        customerId: prefill.customerId || (project ? project.customerId : '') || '',
        projectId: prefill.projectId || '',
        issueDate: U.todayISO(),
        validUntil: U.addDaysISO(U.todayISO(), 30), dueDate: U.addDaysISO(U.todayISO(), 14),
        discount: { type: 'amount', value: 0 },
        terms: s[kind + 'Terms'], notes: ''
      };
      const body = el('div',
        el('div.muted', { style: 'margin-bottom:10px' }, `Document number: `, el('b', {}, number)),
        ui.fieldRow(
          ui.field('Customer', ui.select('customerId', draft.customerId, [['', '— Cash sale —'], ...customers.map((c) => [c.id, c.name])])),
          ui.field('Project (optional)', ui.select('projectId', draft.projectId, [['', '— none —'], ...projects.map((p) => [p.id, p.name])]))),
        ui.fieldRow(
          ui.field('Issue date', ui.input('issueDate', draft.issueDate, { type: 'date' })),
          kind === 'quote' ? ui.field('Valid until', ui.input('validUntil', draft.validUntil, { type: 'date' }))
            : kind === 'invoice' ? ui.field('Payment due', ui.input('dueDate', draft.dueDate, { type: 'date' }))
            : ui.field('Payment date', ui.input('paidDate', U.todayISO(), { type: 'date' }))),
        editorBody(draft, items),
        ui.fieldRow(
          ui.field('Discount type', ui.select('dtype', 'amount', [['amount', 'Amount'], ['percent', 'Percent']])),
          ui.field('Discount value', ui.numberInput('dvalue', 0))),
        ui.field('Notes (printed on PDF)', ui.textarea('notes', '')));
      ui.dialog({
        title: `New ${kind} — ${number}`, body, wide: true,
        actions: [{ label: `Create ${kind}`, kind: 'filled', onClick: async (data, done) => {
          if (!items.length || !items.some((i) => i.desc)) { ui.toast('Add at least one line item'); return; }
          const doc = {
            id: U.uid('d'), ...draft, ...{
              customerId: data.customerId, projectId: data.projectId, issueDate: data.issueDate,
              validUntil: data.validUntil, dueDate: data.dueDate, paidDate: data.paidDate,
              discount: { type: data.dtype, value: data.dvalue || 0 }, notes: data.notes,
              items: items.filter((i) => i.desc), status: kind === 'receipt' ? 'paid' : 'draft'
            }
          };
          await PP.db.put('documents', doc);
          done(false);
          ui.toast(`${doc.number} created`);
          location.hash = '#/document/' + doc.id;
          PP.app.rerender();
        } }]
      });
    })();
  }

  function editDocumentDialog(d, onSaved) {
    const items = JSON.parse(JSON.stringify(d.items || []));
    const s = PP.state.settings;
    const body = el('div',
      ui.fieldRow(
        ui.field('Issue date', ui.input('issueDate', d.issueDate, { type: 'date' })),
        d.kind === 'quote' ? ui.field('Valid until', ui.input('validUntil', d.validUntil, { type: 'date' }))
          : d.kind === 'invoice' ? ui.field('Payment due', ui.input('dueDate', d.dueDate, { type: 'date' }))
          : ui.field('Payment date', ui.input('paidDate', d.paidDate || U.todayISO(), { type: 'date' }))),
      editorBody(d, items),
      ui.fieldRow(
        ui.field('Discount type', ui.select('dtype', d.discount && d.discount.type || 'amount', [['amount', 'Amount'], ['percent', 'Percent']])),
        ui.field('Discount value', ui.numberInput('dvalue', d.discount ? d.discount.value : 0))),
      ui.field('Terms (overrides default on PDF)', ui.textarea('terms', d.terms || s[d.kind + 'Terms'])),
      ui.field('Notes', ui.textarea('notes', d.notes || '')));
    ui.dialog({
      title: `Edit ${d.number}`, body, wide: true,
      actions: [{ label: 'Save changes', kind: 'filled', onClick: async (data, done) => {
        Object.assign(d, {
          issueDate: data.issueDate, validUntil: data.validUntil, dueDate: data.dueDate, paidDate: data.paidDate,
          discount: { type: data.dtype, value: data.dvalue || 0 }, terms: data.terms, notes: data.notes,
          items: items.filter((i) => i.desc)
        });
        await PP.db.put('documents', d);
        done(false); ui.toast('Saved'); onSaved && onSaved();
      } }]
    });
  }

  function exportCSV(documents, custById) {
    const csv = U.recordsToCSV([
      { key: 'number', label: 'Number' }, { key: 'kind', label: 'Type' },
      { key: 'customer', label: 'Customer', value: (r) => (custById[r.customerId] || {}).name || '' },
      { key: 'issueDate', label: 'Date' }, { key: 'dueDate', label: 'Due' }, { key: 'status', label: 'Status' },
      { key: 'subtotal', label: 'Subtotal', value: (r) => C.docTotals(r).subtotal },
      { key: 'tax', label: 'Tax', value: (r) => C.docTotals(r).tax },
      { key: 'total', label: 'Total', value: (r) => C.docTotals(r).total },
      { key: 'paid', label: 'Paid', value: (r) => C.docTotals(r).paid }
    ], documents);
    U.download('documents.csv', csv, 'text/csv');
  }

  async function render(root, params, query) {
    if (params && params[0]) return renderDetail(root, params[0]);
    return renderList(root, query);
  }

  return { title: 'Documents', icon: 'documents', render, newDocumentDialog };
})();
