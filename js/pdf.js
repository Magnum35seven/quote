/* ProjectPro — dependency-free PDF engine + branded document renderers.
 * Low-level writer builds a valid PDF 1.4 file (Helvetica fonts, colors,
 * vector shapes, JPEG XObjects, multi-page). Renderers produce quotes,
 * invoices, receipts, shopping/material lists, project summaries and reports.
 */
'use strict';
window.PP = window.PP || {};

PP.pdf = (() => {
  const U = PP.util;
  const te = new TextEncoder();
  const enc = (s) => te.encode(s);
  const concat = (parts) => { const n = parts.reduce((a, p) => a + p.length, 0); const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

  /** Map JS string to PDF WinAnsi-ish byte string. Currency-safe. */
  function pdfStr(s) {
    const MAP = { '€': '\x80', '£': '\xA3', '¥': '\xA5', '¢': '\xA2', '—': '\x97', '–': '\x96', '“': '\x93', '”': '\x94', '‘': '\x91', '’': '\x92', '•': '\x95', '…': '\x85', '©': '\xA9', '®': '\xAE', '°': '\xB0', '±': '\xB1' };
    let out = '';
    for (const ch of String(s ?? '')) {
      const code = ch.codePointAt(0);
      if (code >= 32 && code <= 126) out += ch;
      else if (MAP[ch]) out += MAP[ch];
      else if (code >= 160 && code <= 255) out += String.fromCharCode(code);
      else out += '?';
    }
    return '(' + out.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
  }
  const ascii = (s) => String(s).replace(/[^\x00-\x7F]/g, '?');

  class PdfDoc {
    constructor(opts = {}) {
      this.w = opts.width || 595.28;   // A4
      this.h = opts.height || 841.89;
      this.margin = opts.margin != null ? opts.margin : 50;
      this.pages = [];
      this.ops = [];
      this.images = new Map(); // alias -> {bytes, w, h, objNum}
      this.newPage();
    }
    newPage() {
      if (this.ops.length) this.pages.push(this.ops.join('\n'));
      this.ops = [];
      this.y = this.margin;
      return this;
    }
    _closePage() { if (this.ops.length) { this.pages.push(this.ops.join('\n')); this.ops = []; } }

    /* ---- graphics state ---- */
    rgb(hex) {
      const m = /^#?([0-9a-f]{6})/i.exec(hex || '#000000');
      const v = m ? parseInt(m[1], 16) : 0;
      return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
    }
    setFill(hex) { const [r, g, b] = this.rgb(hex); this.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`); return this; }
    setStroke(hex) { const [r, g, b] = this.rgb(hex); this.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`); return this; }

    /* ---- text ---- */
    /** x = left edge; y = distance from top. align: left|center|right (center/right approximate width via char count) */
    text(txt, x, y, { size = 10, font = 'F1', color = '#000000', align = 'left', maxWidth = null } = {}) {
      let t = String(txt ?? '');
      if (maxWidth) t = this.truncate(t, size, maxWidth);
      const wdt = this.textWidth(t, size, font);
      let tx = x;
      if (align === 'right') tx = x - wdt;
      else if (align === 'center') tx = x - wdt / 2;
      this.setFill(color);
      this.ops.push(`BT /${font} ${size.toFixed(2)} Tf 1 0 0 1 ${tx.toFixed(2)} ${(this.h - y).toFixed(2)} Tm ${pdfStr(t)} Tj ET`);
      return this;
    }
    textWidth(t, size = 10, font = 'F1') {
      // Helvetica average char widths (good enough for alignment at typical sizes)
      const bold = font !== 'F1';
      let w = 0;
      for (const ch of String(t)) {
        if (ch === ' ') w += .278; else if ('iIljtf.,:;\''.includes(ch)) w += .25;
        else if ('mwMW'.includes(ch)) w += .85; else if ('0123456789'.includes(ch)) w += .556;
        else w += bold ? .60 : .556;
      }
      return w * size;
    }
    truncate(t, size, maxW) {
      let s = String(t);
      while (s.length > 1 && this.textWidth(s + '…', size) > maxW) s = s.slice(0, -1);
      return s + (s.length < String(t).length ? '…' : '');
    }
    /** Word-wrap; returns lines (respects \n). */
    wrap(t, size, maxW, font = 'F1') {
      const out = [];
      for (const para of String(t ?? '').split('\n')) {
        const words = para.split(/\s+/).filter(Boolean);
        let line = '';
        for (const w of words) {
          const test = line ? line + ' ' + w : w;
          if (this.textWidth(test, size, font) <= maxW) line = test;
          else { if (line) out.push(line); line = w; }
        }
        out.push(line);
      }
      return out.length ? out : [''];
    }
    paragraph(t, x, y, { size = 10, font = 'F1', color = '#000000', maxWidth, lineHeight = 1.35 } = {}) {
      let yy = y;
      for (const line of this.wrap(t, size, maxWidth, font)) {
        this.text(line, x, yy, { size, font, color });
        yy += size * lineHeight;
      }
      return yy;
    }

    /* ---- shapes ---- */
    line(x1, y1, x2, y2, { width = .7, color = '#000000' } = {}) {
      this.setStroke(color);
      this.ops.push(`${width} w ${x1.toFixed(2)} ${(this.h - y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.h - y2).toFixed(2)} l S`);
      return this;
    }
    rect(x, y, w, h2, { fill = null, stroke = null, width = .7 } = {}) {
      const ops = [];
      if (fill) { const [r, g, b] = this.rgb(fill); ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`); }
      if (stroke) { const [r, g, b] = this.rgb(stroke); ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`); }
      ops.push(`${width} w ${x.toFixed(2)} ${(this.h - y - h2).toFixed(2)} ${w.toFixed(2)} ${h2.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
      this.ops.push(ops.join('\n'));
      return this;
    }

    /* ---- images (JPEG via canvas dataURL) ---- */
    addImage(alias, jpegBytes, w, h) { this.images.set(alias, { bytes: jpegBytes, w, h }); return this; }
    async addImageFromDataURL(alias, dataURL) {
      if (!dataURL || !dataURL.startsWith('data:image/')) return false;
      // normalise to jpeg via canvas
      const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = dataURL; });
      if (!img) return false;
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      cv.getContext('2d').drawImage(img, 0, 0);
      const jpg = cv.toDataURL('image/jpeg', .88);
      const bstr = atob(jpg.split(',')[1]);
      const bytes = Uint8Array.from(bstr, (c) => c.charCodeAt(0));
      this.addImage(alias, bytes, cv.width, cv.height);
      return true;
    }
    drawImage(alias, x, y, w) {
      const img = this.images.get(alias);
      if (!img) return this;
      const h = w * (img.h / img.w);
      this.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(this.h - y - h).toFixed(2)} cm /${alias} Do Q`);
      return h; // drawn height
    }

    /* ---- table helper ---- */
    /** cols: [{label, width(flex w), align}] rows: array of arrays of strings. Returns end y. Manages page breaks. */
    table(cols, rows, { x, y, rowH = 20, headerFill = '#6750A4', headerColor = '#FFFFFF', fontSize = 9.5, zebra = true, maxY = null, onPage = null } = {}) {
      const totalW = this.w - 2 * this.margin;
      let cx = x != null ? x : this.margin;
      let yy = y != null ? y : this.y;
      const widths = cols.map((c) => (c.width / cols.reduce((a, c2) => a + c2.width, 0)) * totalW);
      const limit = maxY || (this.h - this.margin - 30);
      const drawHeader = () => {
        this.rect(cx, yy, widths.reduce((a, b) => a + b, 0), rowH, { fill: headerFill });
        let px = cx;
        cols.forEach((c, i) => {
          const tx = c.align === 'right' ? px + widths[i] - 5 : c.align === 'center' ? px + widths[i] / 2 : px + 5;
          this.text(c.label, tx, yy + rowH - 6.5, { size: fontSize, font: 'F2', color: headerColor, align: c.align || 'left', maxWidth: widths[i] - 8 });
          px += widths[i];
        });
        yy += rowH;
      };
      drawHeader();
      rows.forEach((r, ri) => {
        const linesPerCell = r.map((cell, i) => this.wrap(typeof cell === 'object' ? cell.text : cell, fontSize, widths[i] - 8));
        const hRow = Math.max(rowH, ...linesPerCell.map((l) => l.length * fontSize * 1.25 + 9));
        if (yy + hRow > limit) { if (onPage) onPage(); this.newPage(); yy = this.margin; drawHeader(); }
        if (zebra && ri % 2 === 1) this.rect(cx, yy, widths.reduce((a, b) => a + b, 0), hRow, { fill: '#F3F0F7' });
        let px = cx;
        r.forEach((cell, i) => {
          const obj = typeof cell === 'object' ? cell : { text: cell };
          const lines = linesPerCell[i];
          lines.forEach((ln, li) => {
            const tx = obj.align === 'right' ? px + widths[i] - 5 : obj.align === 'center' ? px + widths[i] / 2 : px + 5;
            this.text(ln, tx, yy + 12 + li * fontSize * 1.25, { size: fontSize, font: obj.bold ? 'F2' : 'F1', color: obj.color || '#1D1B20', align: obj.align || cols[i].align || 'left' });
          });
          px += widths[i];
        });
        this.line(cx, yy + hRow, cx + widths.reduce((a, b) => a + b, 0), yy + hRow, { color: '#D9D3E0', width: .4 });
        yy += hRow;
      });
      this.line(cx, yy, cx + widths.reduce((a, b) => a + b, 0), yy, { color: '#B9AFC4', width: .8 });
      this.y = yy;
      return yy;
    }

    /* ---- serialise ---- */
    build() {
      this._closePage();
      const parts = [];
      const offsets = [];           // byte offset of each numbered object (1 0 obj, 2 0 obj, ...)
      let pos = 0;
      const pushBytes = (bytes) => { parts.push(bytes); pos += bytes.length; };
      const pushObj = (bytes) => { offsets.push(pos); parts.push(bytes); pos += bytes.length; };
      // binary-safe header (latin1 bytes, not UTF-8)
      pushBytes(Uint8Array.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', (c) => c.charCodeAt(0)));
      const push = pushObj;
      // total objects: 1 catalog, 2 pages, 3..3+P-1 page, then contents, then 3 fonts, then images
      const nP = this.pages.length;
      const pageObjStart = 3;
      const contentObjStart = pageObjStart + nP;
      const fontObjStart = contentObjStart + nP;
      const imgObjStart = fontObjStart + 3;
      const imgAliases = [...this.images.keys()];

      push(enc(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`));
      const kids = this.pages.map((_, i) => `${pageObjStart + i} 0 R`).join(' ');
      push(enc(`2 0 obj\n<< /Type /Pages /Kids [ ${kids} ] /Count ${nP} >>\nendobj\n`));
      this.pages.forEach((_, i) => {
        let resources = `/Font << /F1 ${fontObjStart} 0 R /F2 ${fontObjStart + 1} 0 R /F3 ${fontObjStart + 2} 0 R >>`;
        if (imgAliases.length) resources += ` /XObject << ${imgAliases.map((a, j) => `/${a} ${imgObjStart + j} 0 R`).join(' ')} >>`;
        push(enc(`${pageObjStart + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.w.toFixed(2)} ${this.h.toFixed(2)}] /Resources << ${resources} >> /Contents ${contentObjStart + i} 0 R >>\nendobj\n`));
      });
      this.pages.forEach((stream, i) => {
        const b = enc(stream);
        push(concat([enc(`${contentObjStart + i} 0 obj\n<< /Length ${b.length} >>\nstream\n`), b, enc(`\nendstream\nendobj\n`)]));
      });
      push(enc(`${fontObjStart} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`));
      push(enc(`${fontObjStart + 1} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`));
      push(enc(`${fontObjStart + 2} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>\nendobj\n`));
      imgAliases.forEach((a, j) => {
        const img = this.images.get(a);
        push(concat([enc(`${imgObjStart + j} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`), img.bytes, enc(`\nendstream\nendobj\n`)]));
      });
      const xrefPos = pos;
      const count = offsets.length + 1;
      let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
      for (const off of offsets) xref += String(off).padStart(10, '0') + ' 00000 n \n';
      pushBytes(enc(xref + `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`));
      return new Blob([concat(parts)], { type: 'application/pdf' });
    }
  }

  /* =========================================================================
     Document renderers
     ========================================================================= */
  const BRAND = '#6750A4', DARK = '#1D1B20', GREY = '#6B6570', LIGHT = '#F3F0F7', OK = '#2E7D32';

  function biz() { return (PP.state.settings && PP.state.settings.business) || {}; }
  function money(n) { return U.money(n); }
  function moneyPlain(n) {
    // PDF-safe currency (Helvetica can't render every symbol) — use code prefix when needed
    const s = U.money(n);
    return /^[\x20-\x7E€£¥¢]*$/.test(s) ? s : (PP.state.settings.currency + ' ' + U.num(n));
  }

  async function header(doc, title, metaLines) {
    const b = biz();
    doc.rect(0, 0, doc.w, 6, { fill: BRAND });
    let nameX = doc.margin;
    if (b.logoAttachmentId) {
      const durl = await PP.db.getAttachmentDataURL(b.logoAttachmentId);
      if (durl) {
        await doc.addImageFromDataURL('LOGO', durl);
        const hh = doc.drawImage('LOGO', doc.margin, 42, 110);
        nameX = doc.margin;
        doc.y = 42 + Math.max(hh, 40) + 8;
      }
    }
    const topY = b.logoAttachmentId && doc.images.has('LOGO') ? 42 + 10 : 46;
    if (!doc.images.has('LOGO')) {
      doc.text(b.name || 'Your Business Name', nameX, 58, { size: 22, font: 'F2', color: BRAND });
      doc.y = 78;
    }
    let by = topY + (doc.images.has('LOGO') ? 6 : 16);
    const blines = [b.abn && (b.abn.length <= 13 ? `ABN: ${b.abn}` : `Reg: ${b.abn}`), b.address, [b.phone, b.email].filter(Boolean).join('  •  '), b.website].filter(Boolean);
    blines.forEach((ln2, i) => doc.text(ln2, nameX, by + i * 13, { size: 9.5, color: GREY, maxWidth: 250 }));
    const infoBottom = by + blines.length * 13;

    doc.text(title.toUpperCase(), doc.w - doc.margin, 52, { size: 24, font: 'F2', color: BRAND, align: 'right' });
    metaLines.forEach(([k, v], i) => {
      doc.text(k, doc.w - doc.margin - 150, 74 + i * 14, { size: 9.5, color: GREY, align: 'left' });
      doc.text(v, doc.w - doc.margin, 74 + i * 14, { size: 9.5, font: 'F2', align: 'right' });
    });
    const headerBottom = Math.max(infoBottom, 74 + metaLines.length * 14, doc.y);
    doc.line(doc.margin, headerBottom + 4, doc.w - doc.margin, headerBottom + 4, { color: '#C9BFD6', width: 1 });
    doc.y = headerBottom + 18;
  }

  function footer(doc, pageNote) {
    doc.text(pageNote || '', doc.margin, doc.h - 26, { size: 8, color: GREY });
    doc.text(`Generated by ProjectPro • ${new Date().toLocaleString()}`, doc.w - doc.margin, doc.h - 26, { size: 8, color: GREY, align: 'right' });
  }

  function totalsBlock(doc, rows, yStart, label = 'TOTAL') {
    const xLabel = doc.w - doc.margin - 240, xVal = doc.w - doc.margin;
    let y = yStart != null ? yStart : doc.y + 8;
    rows.forEach(([k, v, bold, color]) => {
      if (bold) doc.rect(xLabel - 10, y - 12, 250, 19, { fill: BRAND });
      doc.text(k, xLabel, y + 2, { size: bold ? 11 : 10, font: bold ? 'F2' : 'F1', color: bold ? '#FFFFFF' : (color || DARK) });
      doc.text(v, xVal - 10, y + 2, { size: bold ? 11 : 10, font: bold ? 'F2' : 'F1', color: bold ? '#FFFFFF' : (color || DARK), align: 'right' });
      y += bold ? 23 : 15;
    });
    doc.y = y;
    return y;
  }

  /** Render quote/invoice/receipt document record -> PDF Blob */
  async function renderDocument(rec) {
    const cust = rec.customerId ? await PP.db.get('customers', rec.customerId) : null;
    const proj = rec.projectId ? await PP.db.get('projects', rec.projectId) : null;
    const s = PP.state.settings;
    const doc = new PdfDoc();
    const kindTitle = rec.kind === 'quote' ? 'Quotation' : rec.kind === 'invoice' ? 'Tax Invoice' : 'Payment Receipt';
    const meta = [
      ['Document No.', rec.number],
      ['Date issued', U.fmtDate(rec.issueDate)]
    ];
    if (rec.kind === 'quote') meta.push(['Valid until', U.fmtDate(rec.validUntil)]);
    if (rec.kind === 'invoice') meta.push(['Payment due', U.fmtDate(rec.dueDate)]);
    if (rec.kind === 'receipt') meta.push(['Payment date', U.fmtDate(rec.paidDate)], ['Payment method', rec.paymentMethod || '—']);
    if (rec.convertedFrom) meta.push(['Reference', rec.convertedFrom]);
    meta.push(['Status', (rec.status || '').toUpperCase()]);
    await header(doc, kindTitle, meta);

    // Bill to / job
    const by = doc.y;
    doc.text('BILL TO', doc.margin, by, { size: 9, font: 'F2', color: GREY });
    doc.text(cust ? cust.name : 'Cash sale', doc.margin, by + 13, { size: 12, font: 'F2' });
    let ty = by + 27;
    if (cust) {
      if (cust.address) ty = doc.paragraph(cust.address, doc.margin, ty, { size: 9.5, maxWidth: 220, color: GREY });
      if (cust.phone) { doc.text(cust.phone, doc.margin, ty, { size: 9.5, color: GREY }); ty += 12; }
      if (cust.email) { doc.text(cust.email, doc.margin, ty, { size: 9.5, color: GREY }); ty += 12; }
    }
    if (proj) {
      doc.text('JOB / PROJECT', doc.w - doc.margin - 200, by, { size: 9, font: 'F2', color: GREY });
      doc.text(proj.name, doc.w - doc.margin - 200, by + 13, { size: 11, font: 'F2' });
      if (proj.address) doc.paragraph(proj.address, doc.w - doc.margin - 200, by + 27, { size: 9, maxWidth: 200, color: GREY });
    }
    doc.y = Math.max(ty, by + 30) + 14;

    // Items table
    const showTax = s.taxRate > 0;
    const cols = [
      { label: 'Description', width: 42 },
      { label: 'Qty', width: 9, align: 'right' },
      { label: 'Unit', width: 9 },
      { label: 'Unit price', width: 13, align: 'right' },
      ...(showTax ? [{ label: s.taxName + ' %', width: 9, align: 'right' }] : []),
      { label: 'Amount', width: 14, align: 'right' }
    ];
    const rows = (rec.items || []).map((it) => {
      const amount = PP.calc.docLineAmount(it);
      return [
        it.desc || '', U.num(it.qty, 2).replace(/\.00$/, ''), it.unit || '',
        { text: moneyPlain(it.unitPrice), align: 'right' },
        ...(showTax ? [{ text: U.num(it.taxPct != null ? it.taxPct : s.taxRate, 0), align: 'right' }] : []),
        { text: moneyPlain(amount), align: 'right' }
      ];
    });
    doc.table(cols, rows, {
      fontSize: 9.5,
      onPage: () => footer(doc, `${rec.number} — continued`)
    });

    const t = PP.calc.docTotals(rec);
    totalsBlock(doc, [
      ['Subtotal', moneyPlain(t.subtotal)],
      ...(t.discount > 0 ? [[`Discount${rec.discount.type === 'percent' ? ` (${U.num(rec.discount.value, 1)}%)` : ''}`, '-' + moneyPlain(t.discount)]] : []),
      ...(showTax ? [[s.taxName, moneyPlain(t.tax)]] : []),
      [t.label || 'TOTAL', moneyPlain(t.total), true],
      ...(rec.kind === 'receipt' ? [['Amount paid', moneyPlain(t.total), false, OK], ['Balance due', moneyPlain(0), false, OK]] :
        rec.kind === 'invoice' && t.paid > 0 ? [['Paid to date', moneyPlain(t.paid), false, OK], ['Balance due', moneyPlain(t.total - t.paid), true]] : [])
    ]);

    // Signature block
    if (rec.signatureAttachmentId) {
      const durl = await PP.db.getAttachmentDataURL(rec.signatureAttachmentId);
      if (durl) {
        if (doc.y > doc.h - 220) { footer(doc, rec.number); doc.newPage(); }
        doc.text('Accepted by:', doc.margin, doc.y + 10, { size: 9, color: GREY });
        await doc.addImageFromDataURL('SIG', durl);
        doc.drawImage('SIG', doc.margin, doc.y + 16, 140);
        doc.line(doc.margin, doc.y + 78, doc.margin + 160, doc.y + 78, { color: '#999', width: .6 });
        doc.text('Signature', doc.margin, doc.y + 90, { size: 8, color: GREY });
        doc.y += 96;
      }
    } else if (rec.kind === 'quote') {
      if (doc.y > doc.h - 190) { footer(doc, rec.number); doc.newPage(); }
      doc.y += 10;
      doc.line(doc.margin, doc.y + 30, doc.margin + 170, doc.y + 30, { color: '#999', width: .6 });
      doc.line(doc.margin + 210, doc.y + 30, doc.margin + 360, doc.y + 30, { color: '#999', width: .6 });
      doc.text('Customer signature', doc.margin, doc.y + 40, { size: 8, color: GREY });
      doc.text('Date', doc.margin + 210, doc.y + 40, { size: 8, color: GREY });
      doc.y += 50;
    }

    // Terms + payment details
    if (doc.y > doc.h - 150) { footer(doc, rec.number); doc.newPage(); }
    doc.y += 8;
    const termsKey = rec.kind + 'Terms';
    const terms = rec.terms || s[termsKey];
    if (terms) {
      doc.text('Terms & Conditions', doc.margin, doc.y, { size: 10, font: 'F2', color: BRAND });
      doc.y = doc.paragraph(terms, doc.margin, doc.y + 14, { size: 8.5, color: GREY, maxWidth: doc.w - 2 * doc.margin }) + 8;
    }
    if (rec.kind === 'invoice') {
      const p = s.paymentDetails || {};
      const pd = [p.method, p.bsb && `BSB: ${p.bsb}`, p.account && `Account: ${p.account}`, p.payId && `PayID: ${p.payId}`].filter(Boolean).join('   ');
      if (pd) {
        doc.text('Payment Details', doc.margin, doc.y, { size: 10, font: 'F2', color: BRAND });
        doc.y = doc.paragraph(pd, doc.margin, doc.y + 14, { size: 9, color: DARK, maxWidth: doc.w - 2 * doc.margin }) + 6;
      }
    }
    if (rec.notes) {
      doc.text('Notes', doc.margin, doc.y, { size: 10, font: 'F2', color: BRAND });
      doc.y = doc.paragraph(rec.notes, doc.margin, doc.y + 14, { size: 8.5, color: GREY, maxWidth: doc.w - 2 * doc.margin }) + 6;
    }
    footer(doc, `${kindTitle} ${rec.number}`);
    return doc.build();
  }

  /** Shopping / material list PDF */
  async function renderShoppingList(title, groups, opts = {}) {
    const doc = new PdfDoc();
    await header(doc, title, [['Date', U.fmtDate(U.todayISO())], ['Suppliers', String(groups.length)], ['Total est.', moneyPlain(groups.reduce((a, g) => a + g.total, 0))]]);
    for (const g of groups) {
      doc.text(g.name, doc.margin, doc.y, { size: 13, font: 'F2', color: BRAND });
      doc.y += 6;
      doc.table(
        [{ label: 'Item', width: 40 }, { label: 'Qty', width: 12, align: 'right' }, { label: 'Unit', width: 12 },
         { label: 'Unit price', width: 14, align: 'right' }, { label: 'Total', width: 14, align: 'right' },
         ...(opts.checkboxes ? [{ label: '✓', width: 6, align: 'center' }] : [])],
        g.items.map((i) => [
          i.name, { text: U.num(i.qty, 2), align: 'right' }, i.unit,
          { text: moneyPlain(i.unitPrice), align: 'right' }, { text: moneyPlain(i.total), align: 'right' },
          ...(opts.checkboxes ? [''] : [])
        ]),
        { onPage: () => footer(doc, title) }
      );
      totalsBlock(doc, [[`${g.name} subtotal`, moneyPlain(g.total), true]]);
      doc.y += 10;
    }
    footer(doc, title);
    return doc.build();
  }

  /** Project summary PDF */
  async function renderProjectSummary(projectId) {
    const proj = await PP.db.get('projects', projectId);
    const cust = proj.customerId ? await PP.db.get('customers', proj.customerId) : null;
    const expenses = (await PP.db.all('expenses')).filter((e) => e.projectId === projectId);
    const docs = (await PP.db.all('documents')).filter((d) => d.projectId === projectId);
    const fin = PP.calc.projectFinancials(proj, expenses, docs);
    const doc = new PdfDoc();
    await header(doc, 'Project Summary', [
      ['Project', proj.name], ['Status', (proj.status || '').toUpperCase()],
      ['Start date', U.fmtDate(proj.startDate)], ['Target date', U.fmtDate(proj.dueDate)],
      ['Progress', U.pct(proj.progress || 0)]
    ]);
    if (cust) { doc.text(`Customer: ${cust.name}`, doc.margin, doc.y, { size: 11, font: 'F2' }); doc.y += 16; }
    if (proj.address) { doc.y = doc.paragraph(`Site: ${proj.address}`, doc.margin, doc.y, { size: 9.5, color: GREY, maxWidth: doc.w - 2 * doc.margin }) + 6; }

    totalsBlock(doc, [
      ['Estimate (cost)', moneyPlain(fin.estimateCost)],
      ['Estimate (sell)', moneyPlain(fin.estimateSell)],
      ['Budget', moneyPlain(proj.budget || 0)],
      ['Actual spend to date', moneyPlain(fin.actualSpend)],
      ['Invoiced to date', moneyPlain(fin.invoiced)],
      ['Received to date', moneyPlain(fin.received)],
      ['Budget remaining', moneyPlain(fin.budgetRemaining), true, fin.budgetRemaining < 0 ? '#B3261E' : DARK],
      ['Projected margin', moneyPlain(fin.projectedProfit) + ` (${U.pct(fin.marginPct)})`, true, fin.projectedProfit < 0 ? '#B3261E' : OK]
    ], doc.y);

    doc.y += 14;
    doc.text('Cost breakdown (estimate)', doc.margin, doc.y, { size: 12, font: 'F2', color: BRAND }); doc.y += 6;
    doc.table(
      [{ label: 'Category', width: 30 }, { label: 'Cost', width: 15, align: 'right' }, { label: 'Sell', width: 15, align: 'right' }, { label: 'Share', width: 12, align: 'right' }],
      Object.entries(fin.byType).map(([k, v]) => [
        PP.calc.TYPE_LABELS[k] || k, { text: moneyPlain(v.cost), align: 'right' },
        { text: moneyPlain(v.sell), align: 'right' }, { text: U.pct(fin.estimateCost ? v.cost / fin.estimateCost * 100 : 0), align: 'right' }
      ]),
      { onPage: () => footer(doc, proj.name) }
    );

    if (expenses.length) {
      doc.y += 14;
      doc.text('Expenses', doc.margin, doc.y, { size: 12, font: 'F2', color: BRAND }); doc.y += 6;
      doc.table(
        [{ label: 'Date', width: 14 }, { label: 'Description', width: 34 }, { label: 'Category', width: 14 }, { label: 'Amount', width: 12, align: 'right' }],
        expenses.sort((a, b) => a.date.localeCompare(b.date)).map((e) => [
          U.fmtDate(e.date), e.description, e.category, { text: moneyPlain(e.amount), align: 'right' }
        ]),
        { onPage: () => footer(doc, proj.name) }
      );
    }

    const tasks = (proj.phases || []).flatMap((p) => p.tasks);
    if (tasks.length) {
      doc.y += 14;
      doc.text(`Tasks (${fin.tasksDone}/${tasks.length} complete)`, doc.margin, doc.y, { size: 12, font: 'F2', color: BRAND }); doc.y += 10;
      for (const ph of proj.phases) {
        doc.text(ph.name, doc.margin, doc.y, { size: 10, font: 'F2' }); doc.y += 13;
        ph.tasks.forEach((t) => {
          if (doc.y > doc.h - 80) { footer(doc, proj.name); doc.newPage(); }
          doc.text(t.done ? '☑' : '☐', doc.margin + 6, doc.y, { size: 10 });
          doc.text(t.name, doc.margin + 24, doc.y, { size: 9.5, color: t.done ? GREY : DARK, maxWidth: doc.w - 2 * doc.margin - 30 });
          doc.y += 14;
        });
        doc.y += 4;
      }
    }
    if (proj.notes) {
      doc.y += 8;
      doc.text('Notes', doc.margin, doc.y, { size: 12, font: 'F2', color: BRAND });
      doc.y = doc.paragraph(proj.notes, doc.margin, doc.y + 6, { size: 9, color: DARK, maxWidth: doc.w - 2 * doc.margin });
    }
    footer(doc, `Project Summary — ${proj.name}`);
    return doc.build();
  }

  /** Business report (budget & profit) PDF */
  async function renderReport(stats, rangeLabel) {
    const doc = new PdfDoc();
    await header(doc, 'Budget & Profit Report', [
      ['Period', rangeLabel],
      ['Revenue', moneyPlain(stats.revenue)],
      ['Expenses', moneyPlain(stats.expense)],
      ['Net profit', moneyPlain(stats.profit)]
    ]);
    totalsBlock(doc, [
      ['Quotes issued (value)', moneyPlain(stats.quoteValue)],
      ['Quotes accepted rate', U.pct(stats.quoteAcceptRate)],
      ['Invoices issued (value)', moneyPlain(stats.invoiced)],
      ['Payments received', moneyPlain(stats.revenue)],
      ['Expenses recorded', moneyPlain(stats.expense)],
      ['Gross profit', moneyPlain(stats.profit), true, stats.profit < 0 ? '#B3261E' : OK],
      ['Profit margin', U.pct(stats.margin), true, stats.profit < 0 ? '#B3261E' : OK]
    ], doc.y);
    doc.y += 16;
    doc.text('Revenue vs expenses (last 6 months)', doc.margin, doc.y, { size: 12, font: 'F2', color: BRAND }); doc.y += 8;
    const maxV = Math.max(1, ...stats.months.map((m) => Math.max(m.rev, m.exp)));
    const chartW = doc.w - 2 * doc.margin, n = stats.months.length, groupW = chartW / n, barW = Math.min(26, groupW / 3);
    stats.months.forEach((m, i) => {
      const gx = doc.margin + i * groupW + (groupW - 2 * barW) / 2;
      const baseY = doc.y + 120;
      const rh = m.rev / maxV * 110, eh = m.exp / maxV * 110;
      doc.rect(gx, baseY - rh, barW, rh, { fill: BRAND });
      doc.rect(gx + barW + 3, baseY - eh, barW, eh, { fill: '#B3261E' });
      doc.text(m.label, gx + barW, baseY + 12, { size: 8, color: GREY, align: 'center' });
    });
    doc.y += 145;
    doc.text('Revenue', doc.margin, doc.y, { size: 9, color: BRAND });
    doc.rect(doc.margin + 46, doc.y - 8, 9, 9, { fill: BRAND });
    doc.text('Expenses', doc.margin + 80, doc.y, { size: 9, color: '#B3261E' });
    doc.rect(doc.margin + 136, doc.y - 8, 9, 9, { fill: '#B3261E' });
    doc.y += 22;
    if (stats.topProjects.length) {
      doc.text('Top projects by revenue', doc.margin, doc.y, { size: 12, font: 'F2', color: BRAND }); doc.y += 6;
      doc.table(
        [{ label: 'Project', width: 40 }, { label: 'Revenue', width: 15, align: 'right' }, { label: 'Expenses', width: 15, align: 'right' }, { label: 'Profit', width: 15, align: 'right' }],
        stats.topProjects.map((p) => [p.name, { text: moneyPlain(p.revenue), align: 'right' }, { text: moneyPlain(p.expense), align: 'right' }, { text: moneyPlain(p.profit), align: 'right', color: p.profit < 0 ? '#B3261E' : '#2E7D32' }]),
        { onPage: () => footer(doc, 'Budget & Profit Report') }
      );
    }
    footer(doc, 'Budget & Profit Report');
    return doc.build();
  }

  return { PdfDoc, renderDocument, renderShoppingList, renderProjectSummary, renderReport };
})();
