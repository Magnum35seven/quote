/* ProjectPro — Sketch measurement tool: draw rooms, gardens, fence lines and
 * simple layouts on a scaled grid. Auto-computes area, perimeter/length,
 * volume and material quantities; can push results into project estimates. */
'use strict';
window.PP = window.PP || {};
PP.views = PP.views || {};

PP.views.sketch = (() => {
  const U = PP.util, ui = PP.ui, C = PP.calc;
  const { el, icon, money, num } = U;

  async function render(root, _params, query) {
    const view = el('div.view');
    const projects = await PP.db.all('projects');
    const materials = await PP.db.all('materials');
    const suppliers = await PP.db.all('suppliers');
    const presets = {
      room: { name: 'Room / floor area', coverageLabel: 'coverage per unit (m² per unit)', help: 'e.g. one litre of paint ≈ 14 m²/coat; a box of planks ≈ 2 m²' },
      garden: { name: 'Garden / lawn area', coverageLabel: 'coverage per unit (m³ covers)', help: 'e.g. 1 m³ of mulch covers ~10 m² at 100 mm depth' },
      fence: { name: 'Fence line', coverageLabel: 'material per metre (m per unit)', help: 'e.g. a paling covers 0.15 m of fence line' },
      concrete: { name: 'Slab / volume', coverageLabel: '(volume computed from depth)', help: 'volume = area × depth; order m³ of concrete direct' }
    };

    /* ---------------- state ---------------- */
    const st = {
      tool: 'polygon',           // polygon | rect | circle | line
      scaleM: 1,                 // metres per grid cell
      depthMM: 100,
      snap: true,
      points: [],                // current working shape (grid coords)
      rectStart: null, circleStart: null, dragPos: null,
      shape: null,               // completed shape
      projectId: query.get('project') || '',
      preset: 'room'
    };

    /* ---------------- layout ---------------- */
    const scaleIn = el('input', { type: 'number', min: '0.1', step: '0.1', value: st.scaleM, style: 'max-width:86px' });
    scaleIn.oninput = () => { st.scaleM = Math.max(.01, +scaleIn.value || 1); draw(); updMetrics(); };
    const depthIn = el('input', { type: 'number', min: '0', step: '10', value: st.depthMM, style: 'max-width:86px' });
    depthIn.oninput = () => { st.depthMM = Math.max(0, +depthIn.value || 0); draw(); updMetrics(); };
    const snapBtn = el('button.btn.small.tonal', {}, icon('grid', 16), 'Snap');
    snapBtn.onclick = () => { st.snap = !st.snap; snapBtn.classList.toggle('filled', st.snap); snapBtn.classList.toggle('tonal', !st.snap); };
    snapBtn.classList.add('filled'); snapBtn.classList.remove('tonal');

    const toolSeg = el('div.seg', {},
      ...[['polygon', 'Room / area', 'area'], ['rect', 'Rectangle', 'grid'], ['circle', 'Circle', 'pool'], ['line', 'Fence line', 'fence']]
        .map(([k, label, ic]) => el('button', { class: k === st.tool ? 'active' : '', onclick: (e) => { st.tool = k; resetShape(); [...toolSeg.children].forEach((b) => b.classList.remove('active')); e.currentTarget.classList.add('active'); } }, icon(ic, 16), label)));

    const canvasWrap = el('div.sketch-wrap');
    const cv = el('canvas', { id: 'sketch-canvas', width: 1280, height: 760 });
    canvasWrap.append(cv);
    const statsRow = el('div.sketch-stats');
    const projSel = ui.select('projectId', st.projectId, [['', '— no project (just measure) —'], ...projects.map((p) => [p.id, p.name])]);
    projSel.onchange = () => st.projectId = projSel.value;

    /* materials panel */
    const matSel = ui.select(null, '', [['', '— pick a material to calculate qty —'], ...materials.map((m) => [m.id, `${m.name} (${m.unit || 'ea'})`])]);
    const covIn = el('input', { type: 'number', step: 'any', value: 2, style: 'max-width:100px' });
    const wasteIn = el('input', { type: 'number', step: '1', value: 10, style: 'max-width:80px' });
    const matResult = el('div.muted', {}, 'Pick a material and set its coverage to get a quantity.');
    const presetSel = ui.select(null, st.preset, Object.entries(presets).map(([k, p]) => [k, p.name]));
    presetSel.onchange = () => { st.preset = presetSel.value; hintEl.textContent = presets[st.preset].help; covLabel.textContent = presets[st.preset].coverageLabel; if (st.preset === 'fence' && st.tool !== 'line') { st.tool = 'line'; resetShape(); [...toolSeg.children].forEach((b, i) => b.classList.toggle('active', i === 3)); } };
    const hintEl = el('div.hint', {}, presets.room.help);
    const covLabel = el('label', {}, presets.room.coverageLabel);

    matSel.onchange = () => {
      const m = materials.find((x) => x.id === matSel.value);
      if (m) { wasteIn.value = m.wastePct != null ? m.wastePct : 10; if (m.coverage) covIn.value = m.coverage; }
      updMat();
    };
    covIn.oninput = updMat; wasteIn.oninput = updMat;

    view.append(
      el('div.card', {},
        el('div.card-h', {}, icon('sketch'), el('h3', {}, 'Measure by sketching'),
          el('span.muted', {}, 'draw to scale — areas, perimeters and volumes compute automatically')),
        el('div.sketch-toolbar', {}, toolSeg,
          el('span.field', { style: 'margin:0;flex-direction:row;align-items:center;gap:6px' }, el('label', { style: 'margin:0' }, '1 grid square ='), scaleIn, el('span.muted', {}, 'm')),
          el('span.field', { style: 'margin:0;flex-direction:row;align-items:center;gap:6px' }, el('label', { style: 'margin:0' }, 'depth'), depthIn, el('span.muted', {}, 'mm')),
          snapBtn,
          el('button.btn.small.tonal', { onclick: undoPoint }, icon('undo', 16), 'Undo point'),
          el('button.btn.small.tonal', { onclick: closeShape }, icon('done', 16), 'Finish shape'),
          el('button.btn.small.tonal', { onclick: resetShape }, icon('delete', 16), 'Clear')),
        canvasWrap, statsRow),
      el('div.grid.cols-2', {},
        el('div.card', {},
          el('div.card-h', {}, icon('materials'), el('h3', {}, 'Material quantity calculator')),
          el('div.field', {}, el('label', {}, 'What are you measuring?'), presetSel, hintEl),
          el('div.field', {}, el('label', {}, 'Material'), matSel),
          el('div.field-row', {},
            el('div.field', {}, covLabel, covIn),
            el('div.field', {}, el('label', {}, 'Waste %'), wasteIn)),
          matResult,
          el('div.btn-row', {},
            el('button.btn.tonal', { onclick: saveSketch }, icon('check', 18), 'Save sketch'),
            el('button.btn.filled', { onclick: addToEstimate }, icon('add', 18), 'Add to project estimate'))),
        el('div.card', {},
          el('div.card-h', {}, icon('project'), el('h3', {}, 'Link to project')),
          el('div.field', {}, el('label', {}, 'Project'), projSel),
          el('div.muted', {}, 'Saved sketches appear under the project\'s Notes, and “Add to estimate” creates a priced line item with the computed quantity.'))));

    root.append(view);

    /* ---------------- canvas ---------------- */
    const ctx = cv.getContext('2d');
    const G = 64; // px per grid cell
    const toGrid = (e) => {
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) * (cv.width / r.width);
      const py = (e.clientY - r.top) * (cv.height / r.height);
      let gx = px / G, gy = py / G;
      if (st.snap) { gx = Math.round(gx * 2) / 2; gy = Math.round(gy * 2) / 2; }
      return [gx, gy];
    };

    cv.addEventListener('pointerdown', (e) => {
      const [gx, gy] = toGrid(e);
      if (st.tool === 'polygon' || st.tool === 'line') {
        st.points.push([gx, gy]);
        if (st.tool === 'polygon' && st.points.length > 1 && Math.hypot(gx - st.points[0][0], gy - st.points[0][1]) < .55 && st.points.length >= 3) {
          st.points.pop(); closeShape();
        }
      } else if (st.tool === 'rect') {
        if (!st.rectStart) st.rectStart = [gx, gy];
        else { st.shape = { type: 'rect', x: Math.min(st.rectStart[0], gx), y: Math.min(st.rectStart[1], gy), w: Math.abs(gx - st.rectStart[0]), h: Math.abs(gy - st.rectStart[1]) }; st.rectStart = null; finish(); }
      } else if (st.tool === 'circle') {
        if (!st.circleStart) st.circleStart = [gx, gy];
        else { const r = Math.hypot(gx - st.circleStart[0], gy - st.circleStart[1]); st.shape = { type: 'circle', cx: st.circleStart[0], cy: st.circleStart[1], radius: r }; st.circleStart = null; finish(); }
      }
      draw(); updMetrics();
    });
    cv.addEventListener('pointermove', (e) => { st.dragPos = toGrid(e); draw(); });
    cv.addEventListener('dblclick', closeShape);
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); undoPoint(); });

    function resetShape() { st.points = []; st.rectStart = null; st.circleStart = null; st.shape = null; draw(); updMetrics(); updMat(); }
    function undoPoint() { if (st.points.length) { st.points.pop(); } else if (st.shape) { st.shape = null; } else if (st.rectStart || st.circleStart) { st.rectStart = st.circleStart = null; } draw(); updMetrics(); }
    function closeShape() {
      if (st.tool === 'polygon' && st.points.length >= 3) { st.shape = { type: 'polygon', points: [...st.points], closed: true }; st.points = []; finish(); }
      else if (st.tool === 'line' && st.points.length >= 2) { st.shape = { type: 'line', points: [...st.points] }; st.points = []; finish(); }
      draw(); updMetrics();
    }
    function finish() { updMetrics(); updMat(); }

    function workingShape() {
      if (st.shape) return st.shape;
      if (st.tool === 'polygon' && st.points.length >= 3) return { type: 'polygon', points: st.points, closed: false };
      if (st.tool === 'line' && st.points.length >= 2) return { type: 'line', points: st.points };
      if (st.tool === 'rect' && st.rectStart && st.dragPos) return { type: 'rect', x: Math.min(st.rectStart[0], st.dragPos[0]), y: Math.min(st.rectStart[1], st.dragPos[1]), w: Math.abs(st.dragPos[0] - st.rectStart[0]), h: Math.abs(st.dragPos[1] - st.rectStart[1]) };
      if (st.tool === 'circle' && st.circleStart && st.dragPos) return { type: 'circle', cx: st.circleStart[0], cy: st.circleStart[1], radius: Math.hypot(st.dragPos[0] - st.circleStart[0], st.dragPos[1] - st.circleStart[1]) };
      return null;
    }

    function draw() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#fdfcff'; ctx.fillRect(0, 0, cv.width, cv.height);
      // grid
      ctx.strokeStyle = '#e8e3f0'; ctx.lineWidth = 1;
      for (let x = 0; x <= cv.width / G; x++) { ctx.beginPath(); ctx.moveTo(x * G + .5, 0); ctx.lineTo(x * G + .5, cv.height); ctx.stroke(); }
      for (let y = 0; y <= cv.height / G; y++) { ctx.beginPath(); ctx.moveTo(0, y * G + .5); ctx.lineTo(cv.width, y * G + .5); ctx.stroke(); }
      ctx.strokeStyle = '#cbc0dd';
      for (let x = 0; x <= cv.width / G; x += 4) { ctx.beginPath(); ctx.moveTo(x * G + .5, 0); ctx.lineTo(x * G + .5, cv.height); ctx.stroke(); }
      for (let y = 0; y <= cv.height / G; y += 4) { ctx.beginPath(); ctx.moveTo(0, y * G + .5); ctx.lineTo(cv.width, y * G + .5); ctx.stroke(); }

      const segLabel = (p1, p2) => {
        const m = C.polylineLength ? Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * st.scaleM : 0;
        if (m < .01) return;
        const midX = (p1[0] + p2[0]) / 2 * G, midY = (p1[1] + p2[1]) / 2 * G;
        ctx.fillStyle = '#5b4b8a'; ctx.font = 'bold 13px system-ui';
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
        const du = U.displayUnit('length', m);
        const label = num(du.value, 1) + du.unit;
        ctx.strokeText(label, midX + 4, midY - 4); ctx.fillText(label, midX + 4, midY - 4);
      };

      const drawShape = (sh, dashed) => {
        ctx.save();
        ctx.strokeStyle = '#6750A4'; ctx.fillStyle = 'rgba(103,80,164,.16)'; ctx.lineWidth = 3;
        ctx.setLineDash(dashed ? [7, 5] : []);
        ctx.beginPath();
        if (sh.type === 'polygon') {
          sh.points.forEach((p, i) => i ? ctx.lineTo(p[0] * G, p[1] * G) : ctx.moveTo(p[0] * G, p[1] * G));
          if (sh.closed || sh.points.length > 2) ctx.closePath(); ctx.fill();
          ctx.stroke();
          for (let i = 1; i < sh.points.length; i++) segLabel(sh.points[i - 1], sh.points[i]);
          if (sh.closed) segLabel(sh.points[sh.points.length - 1], sh.points[0]);
        } else if (sh.type === 'line') {
          sh.points.forEach((p, i) => i ? ctx.lineTo(p[0] * G, p[1] * G) : ctx.moveTo(p[0] * G, p[1] * G));
          ctx.stroke();
          for (let i = 1; i < sh.points.length; i++) segLabel(sh.points[i - 1], sh.points[i]);
        } else if (sh.type === 'rect') {
          ctx.rect(sh.x * G, sh.y * G, sh.w * G, sh.h * G); ctx.fill(); ctx.stroke();
          segLabel([sh.x, sh.y], [sh.x + sh.w, sh.y]); segLabel([sh.x, sh.y], [sh.x, sh.y + sh.h]);
        } else if (sh.type === 'circle') {
          ctx.arc(sh.cx * G, sh.cy * G, sh.radius * G, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          const dm = U.displayUnit('length', sh.radius * 2 * st.scaleM);
          ctx.fillStyle = '#5b4b8a'; ctx.font = 'bold 13px system-ui';
          ctx.fillText('⌀ ' + num(dm.value, 1) + dm.unit, sh.cx * G + 6, sh.cy * G);
        }
        ctx.restore();
        if (sh.type === 'polygon' || sh.type === 'line') sh.points.forEach((p) => { ctx.fillStyle = '#6750A4'; ctx.beginPath(); ctx.arc(p[0] * G, p[1] * G, 5, 0, Math.PI * 2); ctx.fill(); });
      };

      const compl = st.shape, work = workingShape();
      if (compl) drawShape(compl, false);
      else if (work) drawShape(work, true);
      st.points.forEach((p) => { ctx.fillStyle = '#B3261E'; ctx.beginPath(); ctx.arc(p[0] * G, p[1] * G, 5, 0, Math.PI * 2); ctx.fill(); });
      if (st.points.length && st.dragPos) {
        const last = st.points[st.points.length - 1];
        ctx.strokeStyle = '#B3261E'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(last[0] * G, last[1] * G); ctx.lineTo(st.dragPos[0] * G, st.dragPos[1] * G); ctx.stroke();
        ctx.setLineDash([]);
        segLabel(last, st.dragPos);
      }
      if (!st.points.length && !compl && !st.rectStart && !st.circleStart) {
        ctx.fillStyle = '#938F99'; ctx.font = '15px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('Click on the grid to start measuring — ' + { polygon: 'rooms, floors, gardens (close the shape)', rect: 'rectangular areas', circle: 'round areas, pools, tanks', line: 'fence lines, edging, piping' }[st.tool], cv.width / 2, cv.height / 2);
        ctx.textAlign = 'left';
      }
      // scale bar
      ctx.fillStyle = '#5b4b8a'; ctx.font = '12px system-ui';
      ctx.fillRect(14, cv.height - 26, G, 5);
      const du = U.displayUnit('length', st.scaleM);
      ctx.fillText(num(du.value, du.value >= 10 ? 0 : 1) + ' ' + du.unit, 18, cv.height - 32);
    }
    draw();

    /* ---------------- metrics ---------------- */
    function currentMetrics() {
      const sh = st.shape || workingShape();
      if (!sh) return null;
      return C.shapeMetrics(sh, st.scaleM, st.depthMM / 1000);
    }
    function updMetrics() {
      statsRow.innerHTML = '';
      const m = currentMetrics();
      if (!m) { statsRow.append(el('div.muted', {}, 'Draw a shape to see measurements.')); return; }
      const items = [];
      if (m.areaM2) items.push(['Area', U.fmtUnit('area', m.areaM2, 2)]);
      if (m.perimeterM) items.push(['Perimeter', U.fmtUnit('length', m.perimeterM, 2)]);
      if (m.lengthM) items.push(['Length', U.fmtUnit('length', m.lengthM, 2)]);
      if (m.volumeM3) items.push(['Volume', U.fmtUnit('volume', m.volumeM3, 3)]);
      for (const [label, value] of items) statsRow.append(el('div.kpi', {}, el('span.kpi-label', {}, label), el('span.kpi-value', {}, value)));
      updMat();
    }
    function updMat() {
      const m = currentMetrics();
      const mat = materials.find((x) => x.id === matSel.value);
      if (!m || !mat) {
        matResult.textContent = m ? 'Pick a material to compute quantity.' : 'Draw a shape first.';
        return;
      }
      const isLinear = st.preset === 'fence' || (m.lengthM > 0 && !m.areaM2);
      const basis = isLinear ? m.lengthM : (st.preset === 'concrete' ? m.volumeM3 : m.areaM2);
      if (basis <= 0) { matResult.textContent = 'This shape has no ' + (isLinear ? 'length' : 'area') + ' — adjust the tool/preset.'; return; }
      if (st.preset === 'concrete') {
        matResult.innerHTML = '';
        matResult.append(el('div', {},
          el('b', {}, `${U.fmtUnit('volume', basis, 3)} of concrete`),
          ' required (incl. no waste — add ~10% for spillage).'));
        return;
      }
      const cov = Math.max(.0001, +covIn.value || 1);
      const waste = Math.max(0, +wasteIn.value || 0);
      const qtyRes = C.materialsForArea(basis, { coveragePerUnit: cov, wastePct: waste, unit: mat.unit });
      const best = C.priceComparison(mat, suppliers)[0];
      const price = best ? best.price : mat.defaultPrice || 0;
      matResult.innerHTML = '';
      matResult.append(el('div', { style: 'display:flex;gap:16px;flex-wrap:wrap;align-items:center' },
        el('span', {}, 'Need ', el('b', { style: 'font-size:18px' }, `${qtyRes.qty} ${qtyRes.unit}`), ` of ${mat.name}`),
        el('span.muted', {}, `(${num(qtyRes.withWaste)} ${isLinear ? 'm' : 'm²'} incl. ${waste}% waste ÷ ${cov} coverage)`),
        price ? el('span.chip.primary', {}, `≈ ${money(qtyRes.qty * price)}${best ? ' @ ' + best.supplierName : ''}`) : ui.chip('no price in library', 'warning')));
    }

    async function saveSketch() {
      const sh = st.shape || workingShape();
      if (!sh || st.preset !== 'fence' && !sh) { ui.toast('Draw a shape first'); return; }
      const name = prompt('Name this measurement:', (st.preset === 'fence' ? 'Fence line' : 'Area') + ' ' + U.todayISO());
      if (!name) return;
      const rec = { id: U.uid('sk'), name, projectId: st.projectId, scaleM: st.scaleM, depthMM: st.depthMM, shape: sh, preset: st.preset, createdAt: U.nowISO() };
      await PP.db.put('sketches', rec);
      ui.toast('Sketch saved: ' + name);
    }

    async function addToEstimate() {
      if (!st.projectId) { ui.toast('Pick a project first'); return; }
      const m = currentMetrics();
      const mat = materials.find((x) => x.id === matSel.value);
      if (!m) { ui.toast('Draw a shape first'); return; }
      const project = await PP.db.get('projects', st.projectId);
      if (!project) { ui.toast('Project not found'); return; }
      const du = U.fmtUnit('length', 1) ;
      let li = null;
      if (st.preset === 'concrete') {
        const vol = m.volumeM3;
        if (!(vol > 0)) { ui.toast('Set a depth for volume'); return; }
        const best = mat ? C.priceComparison(mat, suppliers)[0] : null;
        li = { id: U.uid(), type: 'material', name: (mat ? mat.name : 'Concrete') + ` — ${num(vol, 2)} m³ (sketch)`, qty: U.round2(vol), unit: 'm³', unitCost: best ? best.price : (mat ? mat.defaultPrice || 0 : 0), markupPct: mat ? mat.markupPct : 20, materialId: mat ? mat.id : '' };
      } else {
        if (!mat) { ui.toast('Pick a material'); return; }
        const isLinear = st.preset === 'fence';
        const basis = isLinear ? m.lengthM : m.areaM2;
        if (!(basis > 0)) { ui.toast('Shape has no ' + (isLinear ? 'length' : 'area')); return; }
        const qtyRes = C.materialsForArea(basis, { coveragePerUnit: Math.max(.0001, +covIn.value || 1), wastePct: Math.max(0, +wasteIn.value || 0), unit: mat.unit });
        const best = C.priceComparison(mat, suppliers)[0];
        li = { id: U.uid(), type: 'material', name: `${mat.name} — ${qtyRes.qty} ${qtyRes.unit} (sketch: ${U.fmtUnit(isLinear ? 'length' : 'area', basis, 1)}${isLinear ? '' : ''})`, qty: qtyRes.qty, unit: qtyRes.unit, unitCost: best ? best.price : mat.defaultPrice || 0, markupPct: mat.markupPct != null ? mat.markupPct : 20, materialId: mat.id, supplierId: best ? best.supplierId : '' };
      }
      project.lineItems = project.lineItems || [];
      project.lineItems.push(li);
      await PP.db.put('projects', project);
      ui.toast('Added to estimate', { action: { label: 'Open project', fn: () => location.hash = '#/project/' + project.id + '?tab=estimate' } });
    }

    updMetrics();
    return view;
  }

  return { title: 'Sketch', icon: 'sketch', render };
})();
