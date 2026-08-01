/* ProjectPro — Dashboard view: KPIs, charts, action lists, reminders. */
'use strict';
window.PP = window.PP || {};
PP.views = PP.views || {};

PP.views.dashboard = (() => {
  const U = PP.util, ui = PP.ui;
  const { el, icon, money, fmtDate, friendlyDate } = U;

  async function render(root) {
    const view = el('div.view');
    root.append(view);

    const [projects, expenses, documents, customers, reminders] = await Promise.all([
      PP.db.all('projects'), PP.db.all('expenses'), PP.db.all('documents'), PP.db.all('customers'), PP.db.all('reminders')
    ]);
    const stats = PP.calc.businessStats(expenses, documents, projects);
    const s = PP.state.settings;
    const bizName = (s.business && s.business.name) || '';

    view.append(el('div', { style: 'margin-bottom:16px' },
      el('h1', { style: 'font-size:26px;font-weight:700' }, bizName ? `${bizName}` : 'Welcome to ProjectPro'),
      el('div.muted', {}, new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))));

    /* KPI strip */
    const kpiGrid = el('div.grid.cols-4', {},
      ui.kpi('Revenue (received)', money(stats.revenue), `${stats.months[stats.months.length - 1].label}: ${money(stats.months[stats.months.length - 1].rev)}`),
      ui.kpi('Expenses', money(stats.expense), 'all recorded', ''),
      ui.kpi('Net profit', money(stats.profit), `margin ${U.pct(stats.margin)}`, stats.profit < 0 ? 'bad' : 'good'),
      ui.kpi('Outstanding invoices', money(stats.outstanding), `${documents.filter((d) => d.kind === 'invoice' && ['sent', 'partial', 'overdue'].includes(d.status)).length} open`, stats.outstanding > 0 ? 'bad' : 'good'));
    view.append(kpiGrid);

    const row = el('div.grid.cols-2');

    /* Revenue vs expense chart */
    row.append(el('div.card.elevated', {},
      el('div.card-h', {}, icon('reports'), el('h3', {}, 'Revenue vs expenses')),
      ui.barChart(stats.months, { labels: ['Revenue', 'Expenses'] })));

    /* Project status donut */
    const STATUSES = [['quoted', 'Quoted', '#7D5260'], ['approved', 'Approved', '#625B71'], ['active', 'Active', '#6750A4'], ['on-hold', 'On hold', '#B26A00'], ['completed', 'Completed', '#2E7D32']];
    const segs = STATUSES.map(([k, label, color]) => ({ label, color, value: projects.filter((p) => p.status === k).length, text: String(projects.filter((p) => p.status === k).length) })).filter((x) => x.value > 0);
    row.append(el('div.card.elevated', {},
      el('div.card-h', {}, icon('project'), el('h3', {}, 'Projects')),
      segs.length ? el('div', { style: 'display:flex;gap:24px;align-items:center;flex-wrap:wrap' }, ui.donutChart(segs),
        el('div', {}, el('div.kpi-value', { style: 'font-size:34px;font-weight:700' }, String(projects.length)), el('div.muted', {}, 'total projects'),
          el('div.btn-row', {}, el('button.btn.tonal', { onclick: () => location.hash = '#/projects' }, 'View all', icon('chevronR', 18)))))
        : ui.emptyState('project', 'No projects yet', 'Create your first project to see the pipeline here.')));
    view.append(row);

    const row2 = el('div.grid.cols-2');

    /* Action required */
    const needsAction = [];
    const openQuotes = documents.filter((d) => d.kind === 'quote' && d.status === 'sent');
    const overdueInv = documents.filter((d) => d.kind === 'invoice' && d.status !== 'paid' && d.dueDate && d.dueDate < U.todayISO());
    for (const q of openQuotes) needsAction.push({ iconName: 'quote', title: `Quote ${q.number} awaiting response`, sub: `Sent ${fmtDate(q.issueDate)} • ${money(PP.calc.docTotals(q).total)}`, go: '#/document/' + q.id });
    for (const inv of overdueInv) needsAction.push({ iconName: 'invoice', title: `Invoice ${inv.number} overdue`, sub: `Due ${fmtDate(inv.dueDate)} • ${money(PP.calc.docTotals(inv).balance)} outstanding`, go: '#/document/' + inv.id });
    const dueReminders = reminders.filter((r) => !r.done && r.date <= U.addDaysISO(U.todayISO(), s.remindersDaysAhead || 3)).sort((a, b) => a.date.localeCompare(b.date));
    for (const r of dueReminders) needsAction.push({ iconName: 'bell', title: r.title, sub: `${friendlyDate(r.date)} (${fmtDate(r.date)}) • ${r.type}`, go: r.refId && r.type !== 'custom' ? '#/document/' + r.refId : '#/projects', reminder: r });

    row2.append(el('div.card.elevated', {},
      el('div.card-h', {}, icon('bell'), el('h3', {}, 'Needs attention'), el('span.chip.primary', {}, String(needsAction.length))),
      needsAction.length ? el('div.list', {}, needsAction.slice(0, 8).map((n) => {
        const item = ui.listItem({
          iconName: n.iconName, title: n.title, sub: n.sub, onClick: () => location.hash = n.go,
          end: n.reminder ? el('button.ic-btn', { title: 'Mark done', html: icon('check'), onclick: async (e) => { e.stopPropagation(); await PP.db.put('reminders', { ...n.reminder, done: true }); PP.app.rerender(); } }) : icon('chevronR', 20)
        });
        return item;
      })) : ui.emptyState('check', 'All clear', 'Nothing overdue, and no reminders in the next few days.')));

    /* Active projects */
    const active = projects.filter((p) => ['active', 'approved', 'quoted'].includes(p.status));
    active.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    row2.append(el('div.card.elevated', {},
      el('div.card-h', {}, icon('project'), el('h3', {}, 'Active projects'),
        el('button.btn.small.tonal', { onclick: () => PP.views.projects.newProjectDialog() }, icon('add', 16), 'New')),
      active.length ? el('div.list', {}, active.slice(0, 6).map((p) => {
        const cust = customers.find((c) => c.id === p.customerId);
        return el('div', { style: 'margin-bottom:6px' },
          ui.listItem({
            title: p.name, sub: `${cust ? cust.name + ' • ' : ''}due ${fmtDate(p.dueDate)}`, iconName: p.templateIcon || 'project',
            onClick: () => location.hash = '#/project/' + p.id,
            end: el('span.chip.tonal', {}, (p.status || '').toUpperCase())
          }),
          el('div', { style: 'padding:0 14px 6px' }, ui.progressBar(p.progress || 0, true)));
      })) : ui.emptyState('project', 'Nothing active', 'Start a project from a template — painting, fencing, mowing and more.')));
    view.append(row2);

    /* Quick actions */
    view.append(el('div.card', {},
      el('div.card-h', {}, icon('bolt'), el('h3', {}, 'Quick actions')),
      el('div.btn-row', { style: 'margin-top:0' },
        el('button.btn.filled', { onclick: () => PP.views.documents.newDocumentDialog('quote') }, icon('quote', 18), 'New quote'),
        el('button.btn.tonal', { onclick: () => PP.views.projects.newProjectDialog() }, icon('project', 18), 'New project'),
        el('button.btn.tonal', { onclick: () => PP.views.people.customerDialog() }, icon('customers', 18), 'Add customer'),
        el('button.btn.tonal', { onclick: () => location.hash = '#/sketch' }, icon('sketch', 18), 'Measure sketch'),
        el('button.btn.tonal', { onclick: () => PP.views.documents.newDocumentDialog('invoice') }, icon('invoice', 18), 'New invoice'))));

    /* Tips when fresh */
    if (!projects.length && !documents.length) {
      view.append(el('div.card', {},
        el('div.card-h', {}, icon('info'), el('h3', {}, 'Getting started')),
        el('ol', { style: 'padding-left:22px;display:flex;flex-direction:column;gap:8px;color:var(--on-surface-variant)' },
          el('li', {}, 'Set up your business profile and logo in Settings so PDFs are branded.'),
          el('li', {}, 'Add customers, suppliers and your material price lists.'),
          el('li', {}, 'Create a project from a template — it prefills tasks and estimate items.'),
          el('li', {}, 'Build the estimate, generate a quote PDF, then convert it to an invoice and receipt.'),
          el('li', {}, 'Track expenses against the budget and watch profit on this dashboard.'))));
    }
    return view;
  }

  return { title: 'Dashboard', icon: 'dashboard', render };
})();
