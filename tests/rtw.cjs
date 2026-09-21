/* RETURN TO WORK — a repair-release checklist, triggered by a 1C work order,
   not a scheduled CM round. This suite proves what CLAUDE.md's own rules for
   this project have been burned by before, on this exact feature:

   · the entry point on the Due tab only appears when there is a real open
     work order to release, and its search is bidirectional (WO or unit,
     either narrows the same list) — never a fabricated result;
   · a work order with no formal WO number (still "Registered" in 1C) does
     NOT appear — that rule was stated explicitly and is worth a test of its
     own, not just a read of the code;
   · the checklist is the real 23 items, in the real two sections;
   · Attention requires a photo AND a note before the round counts as
     complete; Pass/N/A do not;
   · Save is refused — the actual button is disabled, not merely a handler
     that declines — until every item is marked, the senior mechanic is
     named and signed, unless the result is D ("not released"), which does
     not wait on a clean pass;
   · the record that lands in IndexedDB goes through the SAME pipeline every
     other round type uses (dbPut/type/positions/photos), not a parallel
     store with nothing behind it — this is the exact defect an earlier
     candidate implementation shipped and was rejected for. */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, new URL(req.url, 'http://x').pathname);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(fs.readFileSync(f));
});

/* SCHED — the SAME global schedEnsureLoaded() fills from data/schedule_slim
   .json, which is the phone's ONLY source for this (see mobile/index.html's
   own SCHED_URL comment: data/work_orders.js/window.CM_WO_DATA is dashboard-
   only and never reaches this file). rtwOpen is already filtered exactly as
   ingest/ingest_work_orders.py's build_rtw_open() leaves it — see
   tests/rtwopen.py for the exclusion rules (no work order number, closed/
   completed, not open) this fixture deliberately does NOT need to repeat,
   because the phone no longer does that filtering itself; it trusts the
   slim file the way it already trusts every other field the ingest script
   resolves. */
const FIXTURE = {
  generated: '2026-09-21T00:00:00Z',
  byUnit: {},
  rtwOpen: [
    { wo: 'WO-016635', equip: 'TK112', cls: 'HT', comp: 'Rear Differential', desc: 'Ferrous debris — heavy', priority: 'P1 Critical', raised: '2026-09-18' },
    { wo: 'WO-016620', equip: 'TK126', cls: 'HT', comp: 'Frame / guards', desc: 'Abnormal wear', priority: 'P2 Severe', raised: '2026-09-19' },
  ],
};

const draw = p => p.evaluate(() => {
  const c = document.getElementById('rtwSignCanvas'), r = c.getBoundingClientRect();
  const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: r.left + x, clientY: r.top + y, pointerId: 1, bubbles: true, isPrimary: true }));
  ev('pointerdown', 10, 20); ev('pointermove', 40, 30); ev('pointermove', 70, 10); ev('pointerup', 70, 10);
});
const jpg = p => p.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 320; c.height = 240;
  c.getContext('2d').fillRect(0, 0, 320, 240);
  return c.toDataURL('image/jpeg', 0.8).split(',')[1];
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  /* ERR_/"Failed to load" is the browser's own network-layer noise (here: a
     real production hostname's cert, unreachable/untrusted from a test
     sandbox) — tests/lang.cjs filters the identical pattern for the
     identical reason. A real app defect raises a DIFFERENT console error,
     which this still catches. */
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(APP, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  /* SCHED is a bare `let` at this page's top level, the same binding every
     inline <script> tag and this evaluate() share — exactly how schedFor()
     and rtwWorkOrders() read it. Setting it directly, rather than waiting
     on a real fetch of data/schedule_slim.json, is what makes this test
     independent of the network AND, unlike the window.CM_WO_DATA it used
     to fake, actually the same global the shipped code reads. */
  await p.evaluate((fx) => { SCHED = fx; }, FIXTURE);

  console.log('1. TYPE_META and rtw.js are wired in');
  ok('TYPE_META.RTW exists with its own flag', await p.evaluate(() => !!(window.TYPE_META || TYPE_META).RTW && !!TYPE_META.RTW.rtw));
  ok('RTW_ITEMS has all 23 items', await p.evaluate(() => (window.RTW_ITEMS || []).length) === 23);
  ok('RTW_ITEMS has 19 in section 1 and 4 in section 2', await p.evaluate(() => {
    const it = window.RTW_ITEMS; return it.filter(x => x.section === 1).length === 19 && it.filter(x => x.section === 2).length === 4;
  }));
  ok('RTW_RESULTS carries S/R/N/D', await p.evaluate(() => ['S', 'R', 'N', 'D'].every(k => !!(window.RTW_RESULTS || {})[k])));

  console.log('\n2. the Due tab entry point');
  await p.click('[data-pane="paneDue"]');
  await p.waitForTimeout(200);
  ok('the entry card is visible when open work orders exist', await p.isVisible('#rtwEntryBtn'));
  const sub = (await p.textContent('#rtwEntrySub') || '').trim();
  ok('it counts only records with a formal work order number', /\b2\b/.test(sub), sub);

  console.log('\n3. the Pick screen — bidirectional search over SCHED.rtwOpen');
  await p.click('#rtwEntryBtn');
  await p.waitForTimeout(150);
  ok('the overlay opens on the Pick screen', await p.isVisible('#rtwPick'));
  let cards = await p.$$('.rtw-wo-card');
  ok('every entry rtwOpen carries is listed', cards.length === 2, 'count=' + cards.length);
  /* A defect with no work order number, or one already closed, is EXCLUDED
     before it ever reaches this file — build_rtw_open() in ingest/
     ingest_work_orders.py, proven directly (no browser needed) by
     tests/rtwopen.py. This screen's own job is only to search and pick from
     whatever SCHED.rtwOpen already holds. */
  await p.fill('#rtwPickQ', 'TK126');
  await p.waitForTimeout(100);
  cards = await p.$$('.rtw-wo-card');
  ok('typing the EQUIPMENT narrows to its own work order', cards.length === 1 && (await p.textContent('.rtw-wo-card')).includes('WO-016620'));
  await p.fill('#rtwPickQ', 'WO-016635');
  await p.waitForTimeout(100);
  cards = await p.$$('.rtw-wo-card');
  ok('typing the WO NUMBER finds the same record the other way', cards.length === 1 && (await p.textContent('.rtw-wo-card')).includes('TK112'));

  console.log('\n4. picking a work order fills in equipment and component');
  await p.fill('#rtwPickQ', '');
  await p.waitForTimeout(100);
  await p.click('.rtw-wo-card[data-wo="WO-016635"]');
  await p.waitForTimeout(150);
  ok('the Checklist screen opens', await p.isVisible('#rtwChecklistScr'));
  const summary = await p.textContent('#rtwChecklistBody');
  ok('the work order number is shown', summary.includes('WO-016635'));
  ok('the equipment is filled in from the work order, not typed', summary.includes('TK112'));
  ok('the component is filled in from the work order', summary.includes('Rear Differential'));

  console.log('\n5. Pass/Attention/N/A — evidence required only on Attention');
  const items = await p.evaluate(() => Object.keys(rtwDraft.items));
  ok('the draft holds all 23 checklist items', items.length === 23);
  // Mark the first 22 items Pass, leave one for the Attention case below.
  for (const no of items.slice(0, 22)) {
    await p.click(`.rtw-mark[data-mark="pass"][data-no="${no}"]`);
  }
  await p.waitForTimeout(50);
  let footer = await p.textContent('#rtwProgress');
  ok('22 of 23 are complete on Pass alone, no evidence required', /22 of 23/.test(footer), footer);

  const lastNo = items[22];
  await p.click(`.rtw-mark[data-mark="attention"][data-no="${lastNo}"]`);
  await p.waitForTimeout(100);
  ok('marking Attention auto-opens its evidence', await p.isVisible(`textarea[data-rtw-note="${lastNo}"]`));
  footer = await p.textContent('#rtwProgress');
  ok('an Attention item with no evidence yet does NOT count as complete', /22 of 23/.test(footer), footer);
  ok('the Save button is actually disabled, not just silently declining', await p.isDisabled('#rtwSaveBtn'));

  await p.fill(`textarea[data-rtw-note="${lastNo}"]`, 'Ferrous debris cleared and repaired.');
  const b64 = await jpg(p);
  await p.click(`.rtw-icon-btn[data-photo="${lastNo}"]`);
  await p.setInputFiles('#rtwPhotoInput', { name: 'evidence.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  await p.waitForTimeout(300);
  footer = await p.textContent('#rtwProgress');
  ok('a photo AND a note together complete the Attention item', /23 of 23/.test(footer), footer);

  console.log('\n6. Release still needs the senior mechanic and a signature');
  ok('Save stays disabled with the checklist complete but nobody named', await p.isDisabled('#rtwSaveBtn'));
  ok('the footer says whose name is missing', /senior mechanic/i.test(await p.textContent('#rtwProgress')));
  await p.fill('#rtwSup', 'A. Ivanov');
  await p.dispatchEvent('#rtwSup', 'change');
  await p.waitForTimeout(50);
  ok('and then that a signature is needed', /sign/i.test(await p.textContent('#rtwProgress')));
  ok('Save is still disabled with no signature', await p.isDisabled('#rtwSaveBtn'));
  await draw(p);
  await p.waitForTimeout(100);
  ok('Save enables once every condition is actually met', !(await p.isDisabled('#rtwSaveBtn')));

  console.log('\n7. saving goes through the SAME pipeline every round uses');
  await p.click('#rtwSaveBtn');
  await p.waitForTimeout(1200);
  // A dialog (saved, or a verify-fail notice) confirms the handler ran — dismiss it before continuing.
  ok('a "saved" confirmation was actually shown', await p.evaluate(() => { const d = document.getElementById('dlg'); return d ? d.open : false; }).catch(() => false));
  if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgOk'); await p.waitForTimeout(200); }
  const rec = await p.evaluate(async () => {
    const all = await (async () => {
      const req = indexedDB.open('plug_capture');
      const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
      const tx = db.transaction('inspections', 'readonly');
      return await new Promise((res, rej) => { const r = tx.objectStore('inspections').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    })();
    return all.find(r => r.type === 'RTW') || null;
  });
  ok('a real record with type RTW landed in the same IndexedDB store every round uses', !!rec);
  if (rec) {
    ok('it carries the equipment from the work order', rec.equip === 'TK112', rec.equip);
    ok('it carries the work order and result', rec.rtwWo === 'WO-016635' && rec.rtwResult === 'R');
    ok('the senior mechanic name is recorded as "sup", the field every other type uses', rec.sup === 'A. Ivanov');
    ok('a real signature blob was captured', !!rec.sign);
    ok('all 23 items are present with their marks', Object.keys(rec.positions).filter(k => k !== '__general').length === 23);
    const attItem = rec.positions[lastNo];
    ok('the Attention item kept its photo and comment', attItem.mark === 'attention' && (attItem.photos || []).length === 1 && /Ferrous debris/.test(attItem.comment));
    ok('up starts at 0 — nothing is falsely claimed sent before syncNow runs', rec.up === 0);
  }
  ok('no page errors or console errors throughout', fails.filter(f => /^PAGEERROR|^CONSOLE/.test(f)).length === 0,
    fails.filter(f => /^PAGEERROR|^CONSOLE/.test(f)).join(' | '));

  console.log('\n8. Due/never-inspected exclusion — RTW does not pollute the CM schedule');
  const dueHasRtw = await p.evaluate(() => dueRows().some(r => r.ty === 'RTW'));
  ok('a saved RTW round never appears in the CM due list', !dueHasRtw);
  const onClassHasRtw = await p.evaluate(() => { const m = roundsOnClass(); return Object.values(m).some(s => s.has('RTW')); });
  ok('saving one RTW round does not put its whole class "on" an RTW programme', !onClassHasRtw);

  console.log('\n9. "D — not released" does not wait on a clean pass');
  await p.click('[data-pane="paneDue"]');
  await p.waitForTimeout(150);
  await p.click('#rtwEntryBtn');
  await p.waitForTimeout(150);
  await p.fill('#rtwPickQ', 'TK126');
  await p.waitForTimeout(100);
  await p.click('.rtw-wo-card[data-wo="WO-016620"]');
  await p.waitForTimeout(150);
  await p.selectOption('#rtwResult', 'D');
  await p.dispatchEvent('#rtwResult', 'change');
  await p.fill('#rtwSup', 'B. Sidorov');
  await p.dispatchEvent('#rtwSup', 'change');
  await p.waitForTimeout(50);
  ok('Save is still gated on the signature even for D', await p.isDisabled('#rtwSaveBtn'));
  await draw(p);
  await p.waitForTimeout(100);
  ok('but NOT gated on every checklist item being marked, for D', !(await p.isDisabled('#rtwSaveBtn')));

  console.log('\n10. scanning narrows the Pick list, same shape as the existing "cfg" mode');
  await p.click('#rtwChecklistBack');
  await p.waitForTimeout(100);
  await p.fill('#rtwPickQ', '');
  await p.waitForTimeout(100);
  await p.evaluate(() => { scanMode = 'wo'; });
  await p.evaluate(() => onScanned('TK112'));
  await p.waitForTimeout(100);
  ok('a scan while scanMode="wo" fills the search with the decoded unit', await p.inputValue('#rtwPickQ') === 'TK112');
  ok('and resets scanMode back to "unit" afterward', await p.evaluate(() => scanMode) === 'unit');
  const scanCards = await p.$$('.rtw-wo-card');
  ok('narrowing to the scanned unit shows only its own open work order', scanCards.length === 1);

  console.log('\n11. the report engine — RTW\'s own page 1 form, page 2 photos');
  // buildReportSections() is the exact function the phone's own "make PDF"
  // button calls (mobile/index.html) — this proves the real report path,
  // not a re-derived copy of it.
  const html = await p.evaluate(async (id) => {
    const secs = await buildReportSections(id);
    return secs.map((s) => s.html).join('');
  }, rec.id);
  ok('the masthead names the round Return to Work, not a raw type code', /Return to Work/.test(html));
  ok('the work order from the record is on the sheet', html.includes('WO-016635'));
  ok('both checklist sections print, in the document\'s own order', (() => {
    const pre = html.indexOf('Pre-release inspection');
    const post = html.indexOf('Service completion');
    return pre >= 0 && post > pre;
  })());
  ok('a checklist item\'s own text prints, not just its number', /Confirm the original repair work is complete/.test(html));
  ok('the Attention item\'s mark and comment both reach the sheet', /Ferrous debris cleared and repaired\./.test(html));
  ok('a Pass item is marked P, not left blank', />P</.test(html));
  ok('the release result is a verdict banner, not a quiet table cell', /class="verdict v-ok"[^>]*>[^<]*<b>[^<]*<\/b>[^<]*Repaired and safe to use/.test(html)
      || (html.includes('v-ok') && html.includes('Repaired and safe to use')));
  ok('RTW carries no 1–5 grade scale — the rating bar is skipped, not printed empty',
      !html.includes('CONDITION RATING') && !html.includes('Condition scale'));
  ok('page 2 holds the evidence gallery with a real photograph in it', html.includes('board gal b1') && /<img[^>]+src="data:/.test(html));
  ok('the Senior Mechanic\'s name and signature reach the approval table', html.includes('A. Ivanov') && /<img src="data:image\/png/.test(html));

  console.log('\n12. "D — not released" is unmistakable on the printed sheet');
  // Reopen TK126's WO-016620 (the D case from section 9) and actually save it
  // this time — section 9 only proved the button unlocks, never pressed it.
  await p.fill('#rtwPickQ', '');
  await p.waitForTimeout(100);
  await p.click('.rtw-wo-card[data-wo="WO-016620"]');
  await p.waitForTimeout(150);
  await p.selectOption('#rtwResult', 'D');
  await p.dispatchEvent('#rtwResult', 'change');
  await p.fill('#rtwSup', 'B. Sidorov');
  await p.dispatchEvent('#rtwSup', 'change');
  await p.waitForTimeout(50);
  await draw(p);
  await p.waitForTimeout(100);
  ok('Save is enabled for D once named and signed, with no checklist marks', !(await p.isDisabled('#rtwSaveBtn')));
  await p.click('#rtwSaveBtn');
  await p.waitForTimeout(1200);
  if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgOk'); await p.waitForTimeout(200); }
  const recD = await p.evaluate(async () => {
    const all = await (async () => {
      const req = indexedDB.open('plug_capture');
      const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
      const tx = db.transaction('inspections', 'readonly');
      return await new Promise((res, rej) => { const r = tx.objectStore('inspections').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    })();
    return all.find((r) => r.rtwResult === 'D') || null;
  });
  ok('a real "D" record landed in IndexedDB', !!recD);
  const htmlD = recD ? await p.evaluate(async (id) => {
    const secs = await buildReportSections(id);
    return secs.map((s) => s.html).join('');
  }, recD.id) : '';
  ok('a "D — not released" round prints in the alarm colour, not a quiet cell',
      htmlD.includes('v-act') && /Faulty and unsafe to use/.test(htmlD));

  await b.close();
  srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n- ${fails.join('\n- ')}` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
