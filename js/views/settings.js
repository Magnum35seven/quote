/* ProjectPro — Settings: business profile & logo, preferences, document
 * numbering/terms, security (PIN/biometric), reminders, backup/restore,
 * import/export, sample data, about. */
'use strict';
window.PP = window.PP || {};
PP.views = PP.views || {};

PP.views.settings = (() => {
  const U = PP.util, ui = PP.ui, T = PP.templates;
  const { el, icon, money, fmtDateTime } = U;
  let section = 'profile';

  async function render(root) {
    const s = PP.state.settings;
    const view = el('div.view');
    const sections = [
      ['profile', 'Business profile', 'shop'], ['prefs', 'Preferences', 'settings'],
      ['docs', 'Document setup', 'documents'], ['security', 'Security', 'lock'],
      ['reminders', 'Reminders', 'bell'], ['data', 'Data & backup', 'shield'], ['about', 'About & install', 'info']
    ];
    const tabBar = el('div.tabs', {}, sections.map(([k, l]) => el('button.tab' + (k === section ? '.active' : ''), {
      onclick: (e) => { section = k; [...tabBar.children].forEach((b, i) => b.classList.toggle('active', sections[i][0] === section)); drawBody(); }
    }, l)));
    const body = el('div');
    view.append(tabBar, body);
    root.append(view);

    async function drawBody() {
      body.innerHTML = '';
      body.append(await {
        profile: sectionProfile, prefs: sectionPrefs, docs: sectionDocs,
        security: sectionSecurity, reminders: sectionReminders, data: sectionData, about: sectionAbout
      }[section]());
    }

    /* ---------------- Business profile ---------------- */
    async function sectionProfile() {
      const wrap = el('div.grid.cols-2');
      const b = s.business;
      const logoBox = el('div', { style: 'display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:14px' });
      if (b.logoAttachmentId) {
        const url = await PP.db.getAttachmentDataURL(b.logoAttachmentId, 'image/png', .9, 300);
        if (url) logoBox.append(el('img', { src: url, alt: 'Business logo', style: 'width:88px;height:88px;object-fit:contain;border:1px solid var(--outline-variant);border-radius:12px;padding:6px;background:#fff' }));
      }
      const logoInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      logoInput.onchange = async () => {
        const f = logoInput.files[0]; if (!f) return;
        const rec = await PP.db.saveAttachment(f, 'logo', 'business');
        await PP.db.saveSettings({ business: { ...PP.state.settings.business, logoAttachmentId: rec.id } });
        ui.toast('Logo saved'); PP.app.rerender();
      };
      logoBox.append(el('button.btn.tonal', { onclick: () => logoInput.click() }, icon('camera', 18), b.logoAttachmentId ? 'Change logo' : 'Upload logo'),
        b.logoAttachmentId ? el('button.btn.text', { onclick: async () => { await PP.db.saveSettings({ business: { ...PP.state.settings.business, logoAttachmentId: '' } }); PP.app.rerender(); } }, 'Remove') : null, logoInput);
      wrap.append(el('div.card', {},
        el('div.card-h', {}, icon('shop'), el('h3', {}, 'Your business')),
        el('div.muted', { style: 'margin-bottom:10px' }, 'Shown on all PDFs — quotes, invoices and reports.'),
        logoBox,
        ui.field('Business name', ui.input('name', b.name)),
        ui.fieldRow(ui.field('ABN / Reg. no.', ui.input('abn', b.abn)), ui.field('Website', ui.input('website', b.website))),
        ui.fieldRow(ui.field('Phone', ui.input('phone', b.phone, { type: 'tel' })), ui.field('Email', ui.input('email', b.email, { type: 'email' }))),
        ui.field('Address', ui.textarea('address', b.address)),
        el('div.btn-row', {}, el('button.btn.filled', { onclick: async (e) => {
          const dlg = e.target.closest('.dialog') || body;
          const val = (n) => body.querySelector(`[data-field="${n}"]`).value;
          await PP.db.saveSettings({ business: { ...b, name: val('name'), abn: val('abn'), website: val('website'), phone: val('phone'), email: val('email'), address: val('address') } });
          ui.toast('Business profile saved');
        } }, icon('check', 18), 'Save profile'))));
      wrap.append(el('div.card', {},
        el('div.card-h', {}, icon('money'), el('h3', {}, 'Payment details')),
        el('div.muted', { style: 'margin-bottom:10px' }, 'Printed on invoices.'),
        ui.field('Payment method label', ui.input('method', s.paymentDetails.method)),
        ui.fieldRow(ui.field('BSB', ui.input('bsb', s.paymentDetails.bsb)), ui.field('Account', ui.input('account', s.paymentDetails.account))),
        ui.field('PayID / other', ui.input('payId', s.paymentDetails.payId)),
        el('div.btn-row', {}, el('button.btn.filled', { onclick: () => {
          const val = (n) => body.querySelector(`[data-field="${n}"]`).value;
          PP.db.saveSettings({ paymentDetails: { method: val('method'), bsb: val('bsb'), account: val('account'), payId: val('payId') } }).then(() => ui.toast('Saved'));
        } }, icon('check', 18), 'Save'))));
      return wrap;
    }

    /* ---------------- Preferences ---------------- */
    async function sectionPrefs() {
      const wrap = el('div.grid.cols-2');
      const themeSel = ui.select('theme', s.theme, [['auto', 'Auto — follow device'], ['light', 'Light'], ['dark', 'Dark']]);
      themeSel.onchange = async () => { await PP.db.saveSettings({ theme: themeSel.value }); };
      wrap.append(el('div.card', {},
        el('div.card-h', {}, icon('settings'), el('h3', {}, 'Appearance & units')),
        el('div.field', {}, el('label', {}, 'Theme'), themeSel),
        ui.field('Measurement system', ui.select('unitSystem', s.unitSystem, [['metric', 'Metric (m, m², L, kg)'], ['imperial', 'Imperial (ft, ft², gal, lb)']])),
        ui.field('Currency', ui.select('currency', s.currency, T.CURRENCIES)),
        el('div.btn-row', {}, saveBtn({}))));
      wrap.append(el('div.card', {},
        el('div.card-h', {}, icon('percent'), el('h3', {}, 'Tax')),
        ui.fieldRow(
          ui.field('Tax name', ui.input('taxName', s.taxName, { placeholder: 'GST / VAT / Sales tax' })),
          ui.field('Rate %', ui.numberInput('taxRate', s.taxRate))),
        el('div.muted', { style: 'margin-bottom:8px' }, 'Tax is added on top of document line totals (per line). Set rate to 0 to disable tax.'),
        el('div.btn-row', {}, saveBtn({}))));
      function saveBtn() {
        return el('button.btn.filled', { onclick: () => {
          const val = (n) => body.querySelector(`[data-field="${n}"]`) && body.querySelector(`[data-field="${n}"]`).value;
          PP.db.saveSettings({
            theme: val('theme') || s.theme, unitSystem: val('unitSystem') || s.unitSystem,
            currency: val('currency') || s.currency,
            taxName: val('taxName') != null ? val('taxName') : s.taxName,
            taxRate: val('taxRate') != null && val('taxRate') !== '' ? parseFloat(val('taxRate')) : s.taxRate
          }).then(() => ui.toast('Preferences saved'));
        } }, 'Save'); // each card saves the whole prefs block — fields exist per card pairing
      }
      return wrap;
    }

    /* ---------------- Document setup ---------------- */
    async function sectionDocs() {
      const wrap = el('div');
      const c = s.counters;
      wrap.append(el('div.card', {},
        el('div.card-h', {}, icon('documents'), el('h3', {}, 'Automatic numbering')),
        el('div.muted', { style: 'margin-bottom:12px' }, 'Numbers look like >PREFIX-YEAR-####<. Set the next number for each type.'),
        ui.fieldRow(
          ui.field('Quote prefix', ui.input('qpre', s.quotePrefix)),
          ui.field('Next quote #', ui.numberInput('qnext', c.quote))),
        ui.fieldRow(
          ui.field('Invoice prefix', ui.input('ipre', s.invoicePrefix)),
          ui.field('Next invoice #', ui.numberInput('inext', c.invoice))),
        ui.fieldRow(
          ui.field('Receipt prefix', ui.input('rpre', s.receiptPrefix)),
          ui.field('Next receipt #', ui.numberInput('rnext', c.receipt))),
        el('div.btn-row', {}, el('button.btn.filled', { onclick: () => {
          const val = (n) => body.querySelector(`[data-field="${n}"]`).value;
          PP.db.saveSettings({
            quotePrefix: val('qpre') || 'Q', invoicePrefix: val('ipre') || 'INV', receiptPrefix: val('rpre') || 'RCP',
            counters: { quote: Math.max(1, +val('qnext') || 1), invoice: Math.max(1, +val('inext') || 1), receipt: Math.max(1, +val('rnext') || 1) }
          }).then(() => ui.toast('Numbering saved'));
        } }, 'Save numbering'))));
      wrap.append(el('div.grid.cols-3', {},
        el('div.card', {}, el('div.card-h', {}, icon('quote'), el('h3', {}, 'Quote terms')), ui.field(null, ui.textarea('qterms', s.quoteTerms))),
        el('div.card', {}, el('div.card-h', {}, icon('invoice'), el('h3', {}, 'Invoice terms')), ui.field(null, ui.textarea('iterms', s.invoiceTerms))),
        el('div.card', {}, el('div.card-h', {}, icon('receipt'), el('h3', {}, 'Receipt terms')), ui.field(null, ui.textarea('rterms', s.receiptTerms)))));
      wrap.append(el('div.btn-row', {}, el('button.btn.filled', { onclick: () => {
        const val = (n) => body.querySelector(`[data-field="${n}"]`).value;
        PP.db.saveSettings({ quoteTerms: val('qterms'), invoiceTerms: val('iterms'), receiptTerms: val('rterms') }).then(() => ui.toast('Terms saved'));
      } }, 'Save terms')));
      return wrap;
    }

    /* ---------------- Security ---------------- */
    async function sectionSecurity() {
      const st = await PP.crypto.status();
      const wrap = el('div.grid.cols-2');
      const secCard = el('div.card', {},
        el('div.card-h', {}, icon('lock'), el('h3', {}, 'App lock')),
        el('div.switch-row', {},
          el('div.sw-label', {}, el('b', {}, 'PIN lock'), el('span', {}, st.pinEnabled ? 'Enabled — app key is encrypted with your PIN.' : 'Require a 4-digit PIN on startup.')),
          (() => { const sw = el('label.switch', {}, el('input', { type: 'checkbox', checked: st.pinEnabled }), el('span.track')); sw.firstChild.onchange = async () => {
            if (sw.firstChild.checked) {
              const pin = prompt('Choose a 4-digit PIN:');
              if (!pin || !/^\d{4}$/.test(pin)) { sw.firstChild.checked = false; ui.toast('PIN must be 4 digits'); return; }
              if (prompt('Confirm PIN:') !== pin) { sw.firstChild.checked = false; ui.toast('PINs did not match'); return; }
              await PP.crypto.enablePIN(pin); ui.toast('PIN enabled');
            } else {
              if (await ui.confirm({ title: 'Disable PIN & biometric lock?', message: 'The app encryption key will be stored unprotected on this device.' })) {
                await PP.crypto.disableSecurity(); ui.toast('Security disabled');
              } else { sw.firstChild.checked = true; return; }
            }
            drawBody();
          }; return sw; })()));
      if (st.pinEnabled && window.PublicKeyCredential) {
        secCard.append(el('div.switch-row', {},
          el('div.sw-label', {}, el('b', {}, 'Biometric quick-unlock'), el('span', {}, st.biometricEnabled ? 'Enabled (fingerprint / face).' : 'Unlock with your device biometrics after enabling PIN.')),
          el('button.btn.small.tonal', { disabled: st.biometricEnabled, onclick: async () => {
            const ok = await PP.crypto.enableBiometric();
            ui.toast(ok ? 'Biometric unlock enabled' : 'Not available on this device/browser');
            if (ok) drawBody();
          } }, icon('fingerprint', 16), st.biometricEnabled ? 'Enabled' : 'Enable')));
      }
      wrap.append(secCard);
      wrap.append(el('div.card', {},
        el('div.card-h', {}, icon('shield'), el('h3', {}, 'Encrypted local storage')),
        el('div.muted', { style: 'display:flex;flex-direction:column;gap:8px' },
          el('span', {}, icon('check', 14) + ' Customer & supplier contact fields are AES-256-GCM encrypted in IndexedDB.'),
          el('span', {}, icon('check', 14) + ' Photos and file attachments are encrypted before storage.'),
          el('span', {}, icon('check', 14) + ' Automatic backups are encrypted.'),
          el('span', {}, icon('check', 14) + ' With PIN on, the master key only exists in memory while unlocked.'),
          el('span', {}, icon('info', 14) + ' Note: like every local-only PWA, someone with unlocked-device filesystem access plus your PIN could decrypt data.'))));
      return wrap;
    }

    /* ---------------- Reminders ---------------- */
    async function sectionReminders() {
      const reminders = (await PP.db.all('reminders')).sort((a, b) => a.date.localeCompare(b.date));
      const wrap = el('div');
      const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
      wrap.append(el('div.card', {},
        el('div.card-h', {}, icon('bell'), el('h3', {}, 'Notifications')),
        el('div.switch-row', {},
          el('div.sw-label', {}, el('b', {}, 'Local reminders'), el('span', {}, perm === 'granted' ? 'System notifications allowed.' : perm === 'denied' ? 'Blocked by browser — enable in site settings.' : 'Ask the browser for notification permission.')),
          (() => { const sw = el('label.switch', {}, el('input', { type: 'checkbox', checked: s.notifications }), el('span.track')); sw.firstChild.onchange = async () => {
            await PP.db.saveSettings({ notifications: sw.firstChild.checked });
            if (sw.firstChild.checked && 'Notification' in window && Notification.permission === 'default') {
              const p = await Notification.requestPermission();
              ui.toast(p === 'granted' ? 'Notifications enabled' : 'Permission not granted');
            }
            drawBody();
          }; return sw; })()),
        ui.field('Show reminders this many days ahead on the dashboard', ui.numberInput('ahead', s.remindersDaysAhead)),
        el('div.btn-row', {}, el('button.btn.filled', { onclick: () => { PP.db.saveSettings({ remindersDaysAhead: +body.querySelector('[data-field="ahead"]').value || 3 }).then(() => ui.toast('Saved')); } }, 'Save'))));
      const card = el('div.card', {},
        el('div.card-h', {}, icon('list'), el('h3', {}, 'Reminders'),
          el('button.btn.small.tonal', { onclick: () => {
            const bodyEl = el('div',
              ui.field('Title', ui.input('title', '', { placeholder: 'e.g. Call Mrs Smith about tree quote' })),
              ui.field('Date', ui.input('date', U.addDaysISO(U.todayISO(), 3), { type: 'date' })));
            ui.dialog({ title: 'New reminder', body: bodyEl, actions: [{ label: 'Add', kind: 'filled', onClick: async (d, done) => {
              if (!d.title.trim()) return ui.toast('Enter a title');
              await PP.db.put('reminders', { id: U.uid('r'), type: 'custom', title: d.title, date: d.date, done: false });
              done(false); drawBody();
            } }] });
          } }, icon('add', 16), 'Add')));
      if (!reminders.length) card.append(ui.emptyState('bell', 'No reminders', 'Follow-up reminders for quotes and invoices are created automatically. Add custom ones here.'));
      else card.append(el('div.list', {}, reminders.map((r) => {
        const cb = el('input', { type: 'checkbox', checked: r.done, style: 'width:20px;height:20px;accent-color:var(--primary)' });
        cb.onchange = async () => { await PP.db.put('reminders', { ...r, done: cb.checked }); drawBody(); };
        return el('div.list-item', { style: r.done ? 'opacity:.55' : '' },
          cb,
          el('div.li-main', {}, el('div.li-title', { style: r.done ? 'text-decoration:line-through' : '' }, r.title),
            el('div.li-sub', {}, `${r.type} • ${U.friendlyDate(r.date)} (${U.fmtDate(r.date)})`)),
          el('button.ic-btn', { title: 'Delete', html: icon('delete', 17), onclick: async () => { await PP.db.del('reminders', r.id); drawBody(); } }));
      })));
      wrap.append(card);
      return wrap;
    }

    /* ---------------- Data & backup ---------------- */
    async function sectionData() {
      const wrap = el('div');
      let usage = null;
      try { if (navigator.storage && navigator.storage.estimate) usage = await navigator.storage.estimate(); } catch {}
      wrap.append(el('div.grid.cols-2', {},
        el('div.card', {},
          el('div.card-h', {}, icon('download'), el('h3', {}, 'Export data')),
          el('div.muted', { style: 'margin-bottom:10px' }, 'Full database (decrypted — keep the file safe): JSON for backups, plus CSV for spreadsheets.'),
          el('div.btn-row', {},
            el('button.btn.filled', { onclick: async () => {
              ui.toast('Preparing export…');
              const data = await PP.db.exportAll();
              U.download(`projectpro-backup-${U.todayISO()}.json`, JSON.stringify(data, null, 1), 'application/json');
            } }, icon('download', 18), 'Export JSON (full)')),
          usage ? el('div.muted', { style: 'margin-top:8px' }, `Local storage in use: ${num((usage.usage || 0) / 1048576, 1)} MB${usage.quota ? ` of ${num(usage.quota / 1048576, 0)} MB` : ''}`) : null),
        el('div.card', {},
          el('div.card-h', {}, icon('upload'), el('h3', {}, 'Import / restore')),
          el('div.muted', { style: 'margin-bottom:10px' }, 'Restore from a ProjectPro JSON backup file.'),
          el('div.btn-row', {},
            el('button.btn.tonal', { onclick: () => pickImport('merge') }, icon('upload', 18), 'Import & merge'),
            el('button.btn.danger.tonal', { onclick: () => pickImport('replace') }, icon('warning', 18), 'Import & replace all')),
          el('div.btn-row', {},
            el('button.btn.text', { onclick: async () => {
              if (await ui.confirm({ title: 'Load sample data?', message: 'Adds demo customers, suppliers, materials, projects and documents.', okLabel: 'Load sample data', danger: false })) {
                await PP.seed(); ui.toast('Sample data loaded'); PP.app.rerender();
              }
            } }, icon('star', 18), 'Load sample data'),
            el('button.btn.danger.text', { onclick: async () => {
              if (await ui.confirm({ title: 'Erase ALL data?', message: 'Every project, document, customer and setting will be permanently removed.' }) &&
                await ui.confirm({ title: 'Really erase?', message: 'This cannot be undone. Export a backup first if unsure.' })) {
                for (const st of ['settings', 'customers', 'suppliers', 'materials', 'projects', 'expenses', 'documents', 'attachments', 'reminders', 'sketches', 'backups']) await PP.db.clearStore(st);
                await PP.db.setKV('sec-wiped', { at: U.nowISO() });
                ui.toast('All data erased — reloading'); setTimeout(() => location.reload(), 900);
              }
            } }, icon('delete', 18), 'Erase everything')))));
      const backups = await PP.db.listBackups();
      const bkCard = el('div.card', {},
        el('div.card-h', {}, icon('shield'), el('h3', {}, `Automatic backups (${backups.length})`),
          el('button.btn.small.tonal', { onclick: async () => { await PP.db.backup('manual'); ui.toast('Backup created'); drawBody(); } }, icon('add', 16), 'Backup now')));
      bkCard.append(el('div.switch-row', {},
        el('div.sw-label', {}, el('b', {}, 'Automatic backups'), el('span', {}, `Encrypted snapshot after every ~40 changes; keeps ${s.backupKeep}.`)),
        (() => { const sw = el('label.switch', {}, el('input', { type: 'checkbox', checked: s.autoBackup }), el('span.track')); sw.firstChild.onchange = () => PP.db.saveSettings({ autoBackup: sw.firstChild.checked }); return sw; })()));
      if (backups.length) {
        bkCard.append(el('div.tbl-wrap', {}, el('table.tbl', {},
          el('thead', {}, el('tr', {}, el('th', {}, 'Created'), el('th', {}, 'Type'), el('th.num', {}, 'Size'), el('th', {}, 'Encrypted'), el('th'))),
          el('tbody', {}, backups.map((b) => el('tr', {},
            el('td', {}, fmtDateTime(b.createdAt)), el('td', {}, b.trigger), el('td.num', {}, num(b.size / 1024, 0) + ' KB'),
            el('td', {}, b.encrypted ? 'AES-GCM' : '—'),
            el('td', { style: 'white-space:nowrap' },
              el('button.btn.small.text', { onclick: async () => {
                if (!(await ui.confirm({ title: 'Restore this backup?', message: 'Current data will be overwritten with this snapshot.', okLabel: 'Restore' }))) return;
                const raw = await PP.db.getBackupRaw(b.id);
                try { await PP.db.importAll(raw, 'replace'); ui.toast('Backup restored'); setTimeout(() => location.reload(), 700); }
                catch (e) { console.error(e); ui.toast('Restore failed — backup unreadable'); }
              } }, 'Restore'),
              el('button.btn.small.text', { onclick: async () => { const raw = await PP.db.getBackupRaw(b.id); U.download(`projectpro-backup-${b.createdAt.slice(0, 10)}.json`, raw, 'application/json'); } }, 'Download'),
              el('button.ic-btn', { title: 'Delete backup', html: icon('delete', 17), onclick: async () => { await PP.db.deleteBackup(b.id); drawBody(); } }))))))));
      } else bkCard.append(el('div.muted', {}, 'No backups yet.'));
      wrap.append(bkCard);
      return wrap;

      function pickImport(mode) {
        const inp = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
        document.body.append(inp);
        inp.onchange = async () => {
          const text = await inp.files[0].text(); inp.remove();
          try {
            await PP.db.importAll(text, mode);
            ui.toast('Import complete'); setTimeout(() => location.reload(), 700);
          } catch (e) { console.error(e); ui.toast('Import failed — not a ProjectPro backup file'); }
        };
        inp.click();
      }
    }

    /* ---------------- About ---------------- */
    async function sectionAbout() {
      const wrap = el('div.grid.cols-2');
      wrap.append(el('div.card', {},
        el('div.card-h', {}, el('img', { src: 'assets/icons/icon-192.png', style: 'width:30px;height:30px;border-radius:7px', alt: '' }), el('h3', {}, 'ProjectPro 1.0.0')),
        el('div.muted', { style: 'display:flex;flex-direction:column;gap:8px' },
          el('span', {}, 'Offline-first project estimating and job management. All data stays on your device — no account, no servers, no fees.'),
          el('span', {}, 'Works on Android, iOS, Windows, macOS and Linux as an installable PWA.')),
        el('div.btn-row', {},
          el('button.btn.tonal', { onclick: async () => {
            if ('serviceWorker' in navigator) {
              const reg = await navigator.serviceWorker.getRegistration();
              if (reg) { await reg.update(); ui.toast('Checked for updates — reload to apply'); }
              else ui.toast('Service worker not active (serving over plain file://?)');
            }
          } }, icon('refresh', 18), 'Check for updates'))));
      wrap.append(el('div.card', {},
        el('div.card-h', {}, icon('info'), el('h3', {}, 'Installing the app')),
        el('ol', { style: 'padding-left:20px;display:flex;flex-direction:column;gap:8px;color:var(--on-surface-variant)' },
          el('li', {}, 'Android / Chrome: open the app → menu ⋮ → “Install app” (or “Add to Home screen”).'),
          el('li', {}, 'iOS / Safari: Share → “Add to Home Screen”. Splash screens and the icon are included.'),
          el('li', {}, 'Windows / macOS / Linux (Chrome or Edge): click the install icon in the address bar.'),
          el('li', {}, 'Must be served over http(s) — see README for one-line local hosting.'))));
      return wrap;
    }

    drawBody();
    return view;
  }

  return { title: 'Settings', icon: 'settings', render };
})();
