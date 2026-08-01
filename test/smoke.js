/* ProjectPro smoke tests (Node): PDF writer validity + calculation engine.
 * Run: node test/smoke.js   (from the project root) */
'use strict';
const fs = require('fs');
const path = require('path');

global.window = global;
global.PP = {};
const load = (f) => eval(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
load('js/utils.js');
load('js/templates.js');
load('js/calc.js');
load('js/pdf.js');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok —', msg); };

/* ---- calc engine ---- */
PP.state = { settings: { currency: 'AUD', taxRate: 10, taxName: 'GST', unitSystem: 'metric' } };
const C = PP.calc;

const doc = { kind: 'invoice', items: [
  { desc: 'Labour', qty: 8, unitPrice: 100, unit: 'hr', taxPct: null },
  { desc: 'Materials', qty: 5, unitPrice: 40, unit: 'ea', taxPct: 10 }
], discount: { type: 'percent', value: 10 } };
const t = C.docTotals(doc);
assert(t.subtotal === 1000, `doc subtotal 1000 (got ${t.subtotal})`);
assert(t.discount === 100, `doc discount 100 (got ${t.discount})`);
assert(t.tax === 90, `doc tax 90 after discount (got ${t.tax})`);
assert(t.total === 990, `doc total 990 (got ${t.total})`);

const li = { type: 'material', qty: 10, unitCost: 5, markupPct: 20 };
assert(C.lineCost(li) === 50 && C.lineSell(li) === 60, 'line cost/sell with markup');

const proj = { id: 'p1', budget: 1000, lineItems: [li], phases: [{ name: 'x', tasks: [{ name: 't', done: true }, { name: 't2', done: false }] }] };
const fin = C.projectFinancials(proj, [{ projectId: 'p1', amount: 300 }], [{ kind: 'receipt', projectId: 'p1', items: [], discount: null }]);
assert(fin.estimateCost === 50 && fin.estimateSell === 60, 'project estimate totals');
assert(fin.budgetRemaining === 700 && fin.tasksDone === 1 && fin.tasksTotal === 2, 'budget + task progress');

const mats = [{ id: 'm1', name: 'Paint', unit: 'L', defaultPrice: 0, prices: [{ supplierId: 's1', price: 12 }, { supplierId: 's2', price: 10 }] }];
const sups = [{ id: 's1', name: 'A' }, { id: 's2', name: 'B' }];
const groups = C.bestSupplierGroups([{ materialId: 'm1', qty: 5 }], mats, sups);
assert(groups.length === 1 && groups[0].supplierId === 's2' && groups[0].total === 50, 'shopping list picks cheapest supplier');

/* geometry: 4x3 m room with scale 0.5 -> points in grid units */
const pts = [[0, 0], [8, 0], [8, 6], [0, 6]];
const g = C.shapeMetrics({ type: 'polygon', points: pts, closed: true }, .5, .1);
assert(Math.abs(g.areaM2 - 12) < 1e-9 && Math.abs(g.perimeterM - 14) < 1e-9 && Math.abs(g.volumeM3 - 1.2) < 1e-9, `sketch geometry (got ${JSON.stringify(g)})`);
const fc = C.shapeMetrics({ type: 'line', points: [[0, 0], [10, 0], [10, 10]] }, .2);
assert(Math.abs(fc.lengthM - 4) < 1e-9, 'fence line length');
const mq = C.materialsForArea(12, { coveragePerUnit: 2, wastePct: 10 });
assert(mq.qty === 7 && mq.withWaste === 13.2, 'materialsForArea with waste');

/* ---- PDF writer ---- */
(async () => {
  const d = new PP.pdf.PdfDoc();
  d.text('ProjectPro test', 50, 60, { size: 18, font: 'F2', color: '#6750A4' });
  d.rect(50, 80, 200, 40, { fill: '#EADDFF', stroke: '#6750A4' });
  d.line(50, 130, 545, 130, { color: '#6750A4' });
  d.paragraph('Multi-line wrapped paragraph with € and “smart quotes” for encoding checks.', 50, 150, { maxWidth: 300, size: 10 });
  d.table([{ label: 'Item', width: 3 }, { label: 'Qty', width: 1, align: 'right' }, { label: 'Price', width: 1, align: 'right' }],
    [['Concrete 25MPa, delivered', { text: '5.0', align: 'right' }, { text: '$1,325.00', align: 'right' }], ['Mesh', { text: '4', align: 'right' }, { text: '$272.00', align: 'right' }]]);
  d.newPage();
  d.text('Page 2', 50, 60, { size: 12 });
  const blob = d.build();
  const buf = Buffer.from(await blob.arrayBuffer());
  fs.writeFileSync(path.join(__dirname, 'out-test.pdf'), buf);
  assert(buf.slice(0, 5).toString() === '%PDF-', 'PDF header');
  const txt = buf.toString('latin1');
  assert(txt.includes('%%EOF'), 'PDF EOF marker');
  const sx = /startxref\s+(\d+)/.exec(txt);
  assert(sx && txt.slice(+sx[1], +sx[1] + 4) === 'xref', 'startxref points at xref table');
  // every xref offset must point at "N 0 obj"
  const xrefBlock = txt.slice(+sx[1]);
  const offsetLines = xrefBlock.split('\n').slice(2).filter((l) => /^\d{10} 00000 n/.test(l));
  let offsetsOk = offsetLines.length > 0;
  for (const l of offsetLines) {
    const off = parseInt(l.slice(0, 10), 10);
    if (txt.slice(off, off + 20) && !/^\d+ 0 obj/.test(txt.slice(off, off + 20))) { offsetsOk = false; console.error('bad offset line:', l, '->', txt.slice(off, off + 20)); }
  }
  assert(offsetsOk, `all ${offsetLines.length} xref offsets resolve to objects`);
  const pageCount = (txt.match(/\/Type \/Page\b/g) || []).length;
  assert(pageCount === 2, `2 pages (got ${pageCount})`);
  console.log(process.exitCode ? '\nSMOKE TESTS FAILED' : '\nALL SMOKE TESTS PASSED');
})();
