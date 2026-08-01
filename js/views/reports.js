/* ProjectPro — Reports: revenue, expenses, profit, budgets; PDF + CSV export. */
'use strict';
window.PP = window.PP || {};
PP.views = PP.views || {};

PP.views.reports = (() => {
  const U = PP.util, ui = PP.ui, C = PP.calc;
  const { el, icon, money, num, pct, fmtDate } = U;

  async function render(root) {
    const view = el('div.view');
    const [projects, expenses, documents, customers] = await Promise.all([
      PP.db.all('projects'), PP.db.all('expenses'), PP.db.all('documents'), PP.db.all('customers')
    ]);
    const stats = C.businessStats(expenses, documents, projects);

    view.append(el('div.filter-bar', {},
      el('h1', { style: 'font-size:22px;font-weight:700;flex:1' }, 'Budget & profit report'),
      el('button.btn.tonal', { onclick: async () => { ui.toast('Rendering PDF…'); const blob = await PP.pdf.renderReport(stats, 'All records to ' + fmtDate(U.todayISO())); U.download(`ProjectPro-report-${U.todayISO()}.pdf`, blob); } }, icon('pdf', 18), 'PDF report'),
      el('button.btn.tonal', { onclick: () => {
        const rows = stats.months.map((m) => [m.label, m.rev, m.exp, U.round2(m.rev - m.exp)]);
        U.download('report-monthly.csv', U.toCSV(['Month', 'Revenue', 'Expenses', 'Profit'], rows), 'text/csv');
      } }, icon('export', 18), 'CSV')));

    view.append(el('div.grid.cols-4', {},
      ui.kpi('Revenue received', money(stats.revenue), `${documents.filter((d) => d.kind === 'receipt').length} receipts`),
      ui.kpi('Expenses', money(stats.expense), `${expenses.length} entries`),
      ui.kpi('Net profit', money(stats.profit), `margin ${pct(stats.margin)}`, stats.profit < 0 ? 'bad' : 'good'),
      ui.kpi('Outstanding', money(stats.outstanding), `${documents.filter((d) => d.kind === 'invoice' && !['paid', 'converted'].includes(d.status)).length} invoices`, stats.outstanding > 0 ? 'bad' : 'good')));

    view.append(el('div.grid.cols-2', {},
      el('div.card.elevated', {}, el('div.card-h', {}, icon('reports'), el('h3', {}, 'Cash flow — last 6 months')), ui.barChart(stats.months, { labels: ['Revenue', 'Expenses'] })),
      (() => {
        const byCat = {};
        for (const e2 of expenses) byCat[e2.category || 'Other'] = (byCat[e2.category || 'Other'] || 0) + (+e2.amount || 0);
        const palette = ['#6750A4', '#7D5260', '#625B71', '#B26A00', '#2E7D32', '#B3261E', '#005B8F', '#00696C', '#8B2C61'];
        const segs = Object.entries(byCat).map(([k, v], i) => ({ label: k, value: U.round2(v), color: palette[i % palette.length], text: money(v) })).sort((a, b) => b.value - a.value);
        return el('div.card.elevated', {}, el('div.card-h', {}, icon('money'), el('h3', {}, 'Expenses by category')),
          segs.length ? ui.donutChart(segs) : ui.emptyState('money', 'No expenses', 'Record expenses against projects to see the breakdown.'));
      })()));

    view.append(el('div.grid.cols-3', {},
      ui.kpi('Quotes issued', String(stats.quoteCount), `${money(stats.quoteValue)} total • ${pct(stats.quoteAcceptRate)} accepted`),
      ui.kpi('Invoices issued', String(stats.invoiceCount), `${money(stats.invoiced)} total`),
      ui.kpi('Active projects', String(stats.activeProjects), `${projects.length} total`)));

    if (stats.topProjects.length) {
      view.append(el('div.card.elevated', {},
        el('div.card-h', {}, icon('project'), el('h3', {}, 'Profit by project')),
        el('div.tbl-wrap', {}, el('table.tbl', {},
          el('thead', {}, el('tr', {}, el('th', {}, 'Project'), el('th.num', {}, 'Revenue'), el('th.num', {}, 'Expenses'), el('th.num', {}, 'Profit'), el('th.num', {}, 'Margin'))),
          el('tbody', {}, stats.topProjects.map((p) => el('tr', {},
            el('td', {}, p.name),
            el('td.num', {}, money(p.revenue)), el('td.num', {}, money(p.expense)),
            el('td.num', { class: p.profit < 0 ? 'money-bad' : 'money-good' }, money(p.profit)),
            el('td.num', {}, p.revenue ? pct(p.profit / p.revenue * 100) : '—'))))))));
    }

    /* budget watch */
    const watch = projects.map((p) => ({ p, fin: C.projectFinancials(p, expenses, documents) })).filter((x) => x.fin.budget > 0 && ['active', 'approved', 'quoted'].includes(x.p.status));
    if (watch.length) {
      view.append(el('div.card.elevated', {},
        el('div.card-h', {}, icon('warning'), el('h3', {}, 'Budget watch')),
        el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, watch.map(({ p, fin }) => {
          const usedPct = Math.min(100, fin.budgetUsedPct);
          return el('div', {},
            el('div', { style: 'display:flex;justify-content:space-between;font-size:14px;margin-bottom:3px' },
              el('b', {}, p.name),
              el('span', { class: fin.budgetRemaining < 0 ? 'money-bad' : 'muted' }, `${money(fin.actualSpend)} / ${money(fin.budget)} (${pct(fin.budgetUsedPct)})`)),
            (() => { const bar = ui.progressBar(usedPct); bar.firstChild.style.background = usedPct > 95 ? 'var(--error)' : usedPct > 80 ? 'var(--warning)' : 'var(--primary)'; bar.onclick = () => location.hash = '#/project/' + p.id + '?tab=expenses'; bar.style.cursor = 'pointer'; return bar; })());
        }))));
    }

    view.append(el('div.muted', { style: 'margin-top:10px' }, 'Revenue counts receipts (money received). Accrual view: invoiced ' + money(stats.invoiced) + ' of which ' + money(stats.outstanding) + ' outstanding.'));
    root.append(view);
    return view;
  }

  return { title: 'Reports', icon: 'reports', render };
})();
