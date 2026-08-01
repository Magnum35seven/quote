/* ProjectPro — calculation engine: estimates, documents, shopping lists,
 * geometry (sketch tool) and business reporting. */
'use strict';
window.PP = window.PP || {};

PP.calc = (() => {
  const U = PP.util;
  const TYPE_LABELS = Object.fromEntries(PP.templates.LINE_TYPES.map(([k, l]) => [k, l]));

  /* ---------------- Estimate (project line items) ---------------- */
  const lineCost = (li) => U.round2((+li.qty || 0) * (+li.unitCost || 0));
  const lineSell = (li) => U.round2(lineCost(li) * (1 + (+li.markupPct || 0) / 100));

  function estimateBreakdown(project) {
    const byType = {};
    for (const li of project.lineItems || []) {
      const t = li.type || 'other';
      byType[t] = byType[t] || { cost: 0, sell: 0 };
      byType[t].cost += lineCost(li);
      byType[t].sell += lineSell(li);
    }
    const estimateCost = U.round2(Object.values(byType).reduce((a, v) => a + v.cost, 0));
    const estimateSell = U.round2(Object.values(byType).reduce((a, v) => a + v.sell, 0));
    return { byType, estimateCost, estimateSell };
  }

  /** Full financial picture of a project. */
  function projectFinancials(project, expenses = [], documents = []) {
    const { byType, estimateCost, estimateSell } = estimateBreakdown(project);
    const projectExpenses = expenses.filter((e) => e.projectId === project.id);
    const projectDocs = documents.filter((d) => d.projectId === project.id);
    const actualSpend = U.round2(U.sum(projectExpenses, (e) => e.amount));
    const invoiced = U.round2(U.sum(projectDocs.filter((d) => d.kind === 'invoice'), (d) => docTotals(d).total));
    const received = U.round2(U.sum(projectDocs.filter((d) => d.kind === 'receipt'), (d) => docTotals(d).total));
    const budget = +project.budget || 0;
    const tasks = (project.phases || []).flatMap((p) => p.tasks);
    const tasksDone = tasks.filter((t) => t.done).length;
    const profitOnActuals = U.round2(received - actualSpend);
    const projectedProfit = U.round2(estimateSell - estimateCost);
    return {
      byType, estimateCost, estimateSell, actualSpend, invoiced, received,
      budget, budgetRemaining: U.round2(budget - actualSpend),
      budgetUsedPct: budget ? Math.min(999, U.round2(actualSpend / budget * 100)) : 0,
      tasksDone, tasksTotal: tasks.length,
      actualProfit: profitOnActuals, projectedProfit,
      marginPct: estimateSell ? U.round2(projectedProfit / estimateSell * 100) : 0,
      incomeFromEstimate: estimateSell, taxRate: (PP.state.settings && PP.state.settings.taxRate) || 0
    };
  }

  /* ---------------- Documents (quotes / invoices / receipts) ---------------- */
  const docLineAmount = (it) => U.round2((+it.qty || 0) * (+it.unitPrice || 0));

  function docTotals(rec) {
    const s = PP.state.settings || {};
    const taxRate = s.taxRate || 0;
    const items = rec.items || [];
    const subtotal = U.round2(U.sum(items, docLineAmount));
    let discount = 0;
    if (rec.discount) {
      discount = rec.discount.type === 'percent'
        ? U.round2(subtotal * (+rec.discount.value || 0) / 100)
        : Math.min(subtotal, U.round2(+rec.discount.value || 0));
    }
    // tax per line after pro-rata discount
    let tax = 0;
    if (taxRate > 0) {
      for (const it of items) {
        const base = docLineAmount(it);
        const share = subtotal ? base - discount * (base / subtotal) : base;
        tax += share * ((it.taxPct != null ? +it.taxPct : taxRate) / 100) * (s.taxInclusiveDefault ? 0 : 1);
      }
    }
    tax = U.round2(tax);
    const total = U.round2(subtotal - discount + tax);
    const paid = rec.kind === 'receipt' ? total : U.round2(+rec.amountPaid || 0);
    return { subtotal, discount, tax, total, paid, balance: U.round2(total - paid), label: total < 0 ? 'CREDIT' : 'TOTAL' };
  }

  /** Convert a project estimate into document line items (sell pricing, markup folded in). */
  function itemsFromProject(project) {
    return (project.lineItems || [])
      .filter((li) => lineSell(li) > 0 || li.name)
      .map((li) => ({
        desc: li.name + (li.notes ? ` — ${li.notes}` : ''),
        qty: +li.qty || 0, unit: li.unit || 'ea',
        unitPrice: +li.qty ? U.round2(lineSell(li) / (+li.qty)) : U.round2(+li.unitCost || 0),
        taxPct: null
      }));
  }

  /* ---------------- Shopping list / supplier comparison ---------------- */
  /**
   * For a set of material requirements [{materialId, qty, name?}] choose, per material,
   * the cheapest supplier price. Returns groups per supplier:
   * [{supplierId, name, items:[{materialId,name,qty,unit,unitPrice,total}], total}]
   */
  function bestSupplierGroups(requirements, materials, suppliers) {
    const matById = Object.fromEntries(materials.map((m) => [m.id, m]));
    const supById = Object.fromEntries(suppliers.map((s) => [s.id, s]));
    const groups = new Map();
    const unassigned = { supplierId: '', name: 'No supplier price set', items: [], total: 0 };
    for (const req of requirements) {
      const mat = matById[req.materialId];
      const qty = +req.qty || 0;
      if (!mat || qty <= 0) continue;
      let best = null;
      for (const p of mat.prices || []) {
        if (p.price > 0 && (!best || p.price < best.price)) best = p;
      }
      const name = mat.name;
      const unit = mat.unit || 'ea';
      if (best) {
        const g = groups.get(best.supplierId) || { supplierId: best.supplierId, name: (supById[best.supplierId] || {}).name || 'Supplier', items: [], total: 0 };
        g.items.push({ materialId: mat.id, name, qty, unit, unitPrice: best.price, total: U.round2(qty * best.price), supplierName: g.name });
        g.total = U.round2(g.total + qty * best.price);
        groups.set(best.supplierId, g);
      } else if (mat.defaultPrice > 0) {
        const g = groups.get('default') || { supplierId: 'default', name: 'Priced from library default', items: [], total: 0 };
        g.items.push({ materialId: mat.id, name, qty, unit, unitPrice: mat.defaultPrice, total: U.round2(qty * mat.defaultPrice), supplierName: g.name });
        g.total = U.round2(g.total + qty * mat.defaultPrice);
        groups.set('default', g);
      } else {
        unassigned.items.push({ materialId: mat.id, name, qty, unit, unitPrice: 0, total: 0, supplierName: '' });
      }
    }
    const out = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (unassigned.items.length) out.push(unassigned);
    return out;
  }

  /** For one material, all prices sorted cheapest-first (comparison view). */
  function priceComparison(material, suppliers) {
    const supById = Object.fromEntries(suppliers.map((s) => [s.id, s]));
    return (material.prices || [])
      .filter((p) => p.price > 0)
      .map((p) => ({ ...p, supplierName: (supById[p.supplierId] || {}).name || 'Supplier' }))
      .sort((a, b) => a.price - b.price);
  }

  /* ---------------- Sketch geometry ---------------- */
  /** points in grid units; scale = metres per grid unit. */
  function polygonArea(points) { // shoelace (grid²)
    let a = 0;
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
      a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a) / 2;
  }
  function polygonPerimeter(points) {
    let p = 0;
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
      p += Math.hypot(x2 - x1, y2 - y1);
    }
    return p;
  }
  /**
   * Compute real-world metrics from a sketch shape.
   * shape: {type:'polygon'|'rect'|'circle'|'line', points:[[x,y],...], radius?, w?, h?}
   * scale: metres per grid unit. depthM for volume. Returns metric base units (m, m², m³).
   */
  function shapeMetrics(shape, scale, depthM = 0) {
    const s = +scale > 0 ? +scale : 1;
    let areaG = 0, perimG = 0, lengthG = 0;
    if (shape.type === 'polygon') { areaG = polygonArea(shape.points); perimG = shape.closed !== false ? polygonPerimeter(shape.points) : polylineLength(shape.points); }
    else if (shape.type === 'rect') { areaG = (shape.w || 0) * (shape.h || 0); perimG = 2 * ((shape.w || 0) + (shape.h || 0)); }
    else if (shape.type === 'circle') { areaG = Math.PI * (shape.radius || 0) ** 2; perimG = 2 * Math.PI * (shape.radius || 0); }
    else if (shape.type === 'line') { lengthG = polylineLength(shape.points); }
    return {
      areaM2: areaG * s * s, perimeterM: perimG * s, lengthM: lengthG * s,
      volumeM3: areaG * s * s * (depthM || 0)
    };
  }
  function polylineLength(points) {
    let p = 0;
    for (let i = 1; i < points.length; i++) p += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    return p;
  }

  /** Material quantities from sketch: given m² and per-unit coverage. */
  function materialsForArea(areaM2, { coveragePerUnit = 1, wastePct = 10, unit = 'ea' } = {}) {
    const eff = areaM2 * (1 + wastePct / 100);
    return { rawArea: U.round2(areaM2), withWaste: U.round2(eff), qty: Math.ceil(eff / coveragePerUnit), unit };
  }

  /* ---------------- Business reporting ---------------- */
  function businessStats(expenses, documents, projects, months = 6) {
    const now = new Date();
    const monthKeys = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push({ key: U.monthKey(d.toISOString()), label: d.toLocaleString(undefined, { month: 'short' }) });
    }
    const receipts = documents.filter((d) => d.kind === 'receipt');
    const invoices = documents.filter((d) => d.kind === 'invoice');
    const quotes = documents.filter((d) => d.kind === 'quote');
    const revByMonth = {}, expByMonth = {};
    for (const r of receipts) { const k = U.monthKey(r.paidDate || r.issueDate); revByMonth[k] = (revByMonth[k] || 0) + docTotals(r).total; }
    for (const e of expenses) { const k = U.monthKey(e.date); expByMonth[k] = (expByMonth[k] || 0) + (+e.amount || 0); }
    const monthsArr = monthKeys.map(({ key, label }) => ({ label, rev: U.round2(revByMonth[key] || 0), exp: U.round2(expByMonth[key] || 0) }));
    const revenue = U.round2(U.sum(receipts, (r) => docTotals(r).total));
    const expense = U.round2(U.sum(expenses, (e) => e.amount));
    const invoiced = U.round2(U.sum(invoices, (d) => docTotals(d).total));
    const outstanding = U.round2(U.sum(invoices, (d) => { const t = docTotals(d); return Math.max(0, t.total - t.paid); }));
    const quoteValue = U.round2(U.sum(quotes, (d) => docTotals(d).total));
    const accepted = quotes.filter((q) => ['accepted', 'converted'].includes(q.status)).length;
    const projById = Object.fromEntries(projects.map((p) => [p.id, p]));
    const perProject = {};
    for (const r of receipts) { perProject[r.projectId] = perProject[r.projectId] || { revenue: 0, expense: 0 }; perProject[r.projectId].revenue += docTotals(r).total; }
    for (const e of expenses) if (e.projectId) { perProject[e.projectId] = perProject[e.projectId] || { revenue: 0, expense: 0 }; perProject[e.projectId].expense += +e.amount || 0; }
    const topProjects = Object.entries(perProject)
      .map(([pid, v]) => ({ name: (projById[pid] || {}).name || 'Unassigned', revenue: U.round2(v.revenue), expense: U.round2(v.expense), profit: U.round2(v.revenue - v.expense) }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const profit = U.round2(revenue - expense);
    return {
      months: monthsArr, revenue, expense, profit, invoiced, outstanding, quoteValue,
      margin: revenue ? U.round2(profit / revenue * 100) : 0,
      quoteAcceptRate: quotes.length ? U.round2(accepted / quotes.length * 100) : 0,
      topProjects,
      activeProjects: projects.filter((p) => ['active', 'quoted', 'approved'].includes(p.status)).length,
      quoteCount: quotes.length, invoiceCount: invoices.length
    };
  }

  return {
    TYPE_LABELS, lineCost, lineSell, estimateBreakdown, projectFinancials,
    docLineAmount, docTotals, itemsFromProject,
    bestSupplierGroups, priceComparison,
    polygonArea, polygonPerimeter, polylineLength, shapeMetrics, materialsForArea,
    businessStats
  };
})();
