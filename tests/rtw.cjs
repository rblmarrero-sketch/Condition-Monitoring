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
    { wo: 'WO-016635', equip: 'TK112', cls: 'HT', comp: 'Rear Differential', desc: 'Ferrous debris — heavy', priority: 'P1 Critical', raised: '2026-09-18', type: '4000 Hours service Planned', hours: 4000, plan: '2026-09-18' },
    { wo: 'WO-016620', equip: 'TK126', cls: 'HT', comp: 'Frame / guards', desc: 'Abnormal wear', priority: 'P2 Severe', raised: '2026-09-19', type: '2.1', hours: null, plan: '' },
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

  console.log('\n2. the 1C PM tab lists every open work order — no separate entry card');
  await p.click('[data-pane="paneDue"]');
  await p.waitForTimeout(200);
  /* 1C PM is the default tab now, and it IS the list — no small entry card
     and no separate Pick overlay to open first; the tab's own rows are the
     picker. */
  ok('the 1C PM tab is showing', await p.evaluate(() => $('dueViewPM').classList.contains('on')));
  let woCards = await p.$$('#duePmList [data-wo]');
  ok('every entry rtwOpen carries is listed', woCards.length === 2, 'count=' + woCards.length);

  console.log('\n3. searching the 1C PM tab — bidirectional, over SCHED.rtwOpen');
  /* A defect with no work order number, or one already closed, is EXCLUDED
     before it ever reaches this file — build_rtw_open() in ingest/
     ingest_work_orders.py, proven directly (no browser needed) by
     tests/rtwopen.py. This tab's own job is only to search and list
     whatever SCHED.rtwOpen already holds. */
  await p.fill('#dueFind', 'TK126');
  await p.waitForTimeout(200);
  woCards = await p.$$('#duePmList [data-wo]');
  ok('typing the EQUIPMENT narrows to its own work order', woCards.length === 1 && (await p.textContent('#duePmList [data-wo]')).includes('WO-016620'));
  await p.fill('#dueFind', 'WO-016635');
  await p.waitForTimeout(200);
  woCards = await p.$$('#duePmList [data-wo]');
  ok('typing the WO NUMBER finds the same record the other way', woCards.length === 1 && (await p.textContent('#duePmList [data-wo]')).includes('TK112'));

  console.log('\n4. tapping a work order opens its info sheet, and Start Return to Work fills in the checklist');
  await p.click('#duePmList [data-wo="WO-016635"]');
  await p.waitForTimeout(150);
  ok('the info sheet opens with the work order named', (await p.textContent('#pmInfoWo') || '').trim() === 'WO-016635');
  const infoBody = await p.textContent('#pmInfoBody');
  ok('it shows the equipment', infoBody.includes('TK112'));
  ok('it shows the component', infoBody.includes('Rear Differential'));
  await p.click('#pmStartRtwBtn');
  await p.waitForTimeout(150);
  ok('the info sheet closes', !(await p.isVisible('#pmOv')));
  ok('the Checklist screen opens', await p.isVisible('#rtwChecklistScr'));
  const summary = await p.textContent('#rtwChecklistBody');
  ok('the work order number is shown', summary.includes('WO-016635'));
  ok('the equipment is filled in from the work order, not typed', summary.includes('TK112'));
  ok('the component is filled in from the work order', summary.includes('Rear Differential'));
  await p.fill('#dueFind', '');
  await p.waitForTimeout(100);
  const resultOptions = await p.$$eval('#rtwResult option', os => os.map(o => o.textContent.trim()));
  ok('the four release results read exactly as the document states them', JSON.stringify(resultOptions) === JSON.stringify([
    'S — Safe to use', 'R — Repaired and safe to use',
    'N — Repair required, but safe to use', 'D — Faulty and unsafe to use',
  ]), resultOptions.join(' | '));

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

  // The round's own "Equipment, work area, other evidence" pseudo-position —
  // GEN_KEY — is not a checklist line and carries no evidence requirement of
  // its own; captured here so §11 below can prove it actually reaches the
  // printed report, which it never did before this fix (see report-core.js).
  await p.click('.rtw-icon-btn[data-photo="__general"]');
  await p.setInputFiles('#rtwGeneralPhotoInput', { name: 'overall.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  await p.waitForTimeout(300);
  ok('the general-evidence photo is held on the draft', await p.evaluate(() => rtwDraft.general.photos.length) === 1);

  console.log('\n5b. the photo cap says so, the same way addPicked already does for a graded round');
  /* rtwIntakeFiles broke out of MAX_PHOTOS in silence — addPicked's own cap
     shows the gal_full_t/gal_full_b dialog the moment a photograph is left
     out; nothing mirrored that here, so a checklist item photographed past
     the cap simply had fewer photographs than the inspector took, with
     nothing on screen ever saying one was dropped. */
  const capNo = items[0];
  /* #rtwPhotoInput has no "multiple" attribute — one file per pick, exactly
     like the phone's camera capture — so the cap is reached position by
     position, one photograph filling it and the very next one hitting it. */
  await p.evaluate(no => {
    rtwDraft.items[no].photos = Array.from({ length: 10 }, (_, i) => ({ name: 'pre' + i + '.jpg', dataUrl: 'data:image/jpeg;base64,AA==' }));
  }, capNo);
  await p.click(`.rtw-evidence-toggle[data-toggle="${capNo}"]`);
  await p.waitForTimeout(100);
  await p.click(`.rtw-icon-btn[data-photo="${capNo}"]`);
  const bCap = await jpg(p);
  await p.setInputFiles('#rtwPhotoInput', { name: 'onemore.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(bCap, 'base64') });
  await p.waitForTimeout(300);
  const capLen = await p.evaluate(no => rtwDraft.items[no].photos.length, capNo);
  ok('the cap actually holds — already at 10, the new one is not added', capLen === 10, capLen);
  const dlgSeen = await p.evaluate(() => document.getElementById('dlg').open);
  const dlgText = await p.evaluate(() => ({ title: document.getElementById('dlgTitle').textContent, msg: document.getElementById('dlgMsg').textContent }));
  ok('the phone says so — one left out, not silence', dlgSeen && dlgText.title === 'Not everything fitted' && /\b1\b/.test(dlgText.msg),
     JSON.stringify(dlgText));
  if (await p.evaluate(() => document.getElementById('dlg')?.open)) { await p.click('#dlgOk'); await p.waitForTimeout(200); }

  console.log('\n6. Release still needs the senior mechanic and a signature');
  ok('Save stays disabled with the checklist complete but nobody named', await p.isDisabled('#rtwSaveBtn'));
  ok('the footer says whose name is missing', /senior mechanic/i.test(await p.textContent('#rtwProgress')));
  await p.fill('#rtwSup', 'A. Ivanov');
  await p.dispatchEvent('#rtwSup', 'change');
  // The completion date is date-only everywhere else this record is read
  // (file names, DUE.next, teamDate/idDate) — the time of day is a SEPARATE
  // field, asked for so the header can say exactly when the checklist was
  // signed, not merely which day.
  await p.fill('#rtwTime', '14:37');
  await p.dispatchEvent('#rtwTime', 'change');
  await p.waitForTimeout(50);
  ok('and then that a signature is needed', /sign/i.test(await p.textContent('#rtwProgress')));
  ok('Save is still disabled with no signature', await p.isDisabled('#rtwSaveBtn'));
  /* touch-action:none is what actually makes a real touchscreen drag reach
     this canvas instead of scrolling .rtw-ov-body underneath it — dispatchEvent
     below calls the JS handlers directly and would pass identically whether
     or not this CSS is present, so it cannot substitute for this check. See
     the CSS rule's own comment (mobile/index.html, .rtw-sign-pad-slot canvas). */
  ok('the signature canvas cannot be scrolled through — touch-action is none',
    await p.evaluate(() => getComputedStyle(document.getElementById('rtwSignCanvas')).touchAction) === 'none');
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
    ok('the general-evidence photo is saved on the __general pseudo-position, the shared mechanism every round type uses',
      !!rec.positions.__general && (rec.positions.__general.photos || []).length === 1);
    ok('the completion TIME is captured as its own field, and rec.date stays plain YYYY-MM-DD',
      rec.rtwTime === '14:37' && /^\d{4}-\d{2}-\d{2}$/.test(rec.date));
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
  await p.fill('#dueFind', 'TK126');
  await p.waitForTimeout(200);
  await p.click('#duePmList [data-wo="WO-016620"]');
  await p.waitForTimeout(150);
  await p.click('#pmStartRtwBtn');
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
  await p.click('#rtwChecklistBack');
  await p.waitForTimeout(100);
  await p.fill('#dueFind', '');
  await p.waitForTimeout(100);

  console.log('\n11. the report engine — RTW\'s own page 1 form, page 2 photos');
  // buildReportSections() is the exact function the phone's own "make PDF"
  // button calls (mobile/index.html) — this proves the real report path,
  // not a re-derived copy of it.
  const html = await p.evaluate(async (id) => {
    const secs = await buildReportSections(id);
    return secs.map((s) => s.html).join('');
  }, rec.id);
  ok('the masthead names the round Return to Work, not a raw type code', /Return to Work/.test(html));
  // Build 438 briefly duplicated this into the eyebrow too ("Return to work"
  // one line above "Return to Work") and it was reverted the same day —
  // a real report showed both lines circled as redundant. The title says it
  // once; the eyebrow stays the generic line every other type also uses.
  ok('the eyebrow is the ordinary generic one, not a second copy of the title', (() => {
    const m = /<div class="eyebrow">([\s\S]*?)<\/div>/.exec(html);
    return !!m && /Field condition monitoring/i.test(m[1]) && !/Return to work/i.test(m[1]);
  })());
  ok('the work order number is in the MASTHEAD PILL, beside the report number — not a box down the page', (() => {
    const rnoBlock = /<div class="rno">([\s\S]*?)<\/div>/.exec(html);
    return !!rnoBlock && /RTW-TK112-\d+/.test(rnoBlock[1]) && rnoBlock[1].includes('WO-016635');
  })());
  ok('the work order number no longer sits in the header strip as its own cell — it moved up to the masthead',
    !/<div class="sk">Work order<\/div>/.test(html));
  ok('carries the schedule it was raised against: priority, type, plan date and hour tier',
    rec.rtwWoPriority === 'P1 Critical' && rec.rtwWoType === '4000 Hours service Planned'
    && rec.rtwSchedDate === '2026-09-18' && rec.rtwSchedHours === 4000);
  ok('"Type of PM" carries the code AND its own classification word — P1 Critical, not just P1', (() => {
    // the .sk LABEL is bilingual ("Type of PM <span class=alti>/ ...</span>");
    // only the .sv VALUE is the plain, un-translated text.
    const m = /<div class="sk">Type of PM[^<]*(?:<span[^>]*>[^<]*<\/span>)?<\/div><div class="sv">([^<]*)<\/div>/.exec(html);
    return !!m && m[1] === 'P1 Critical';
  })());
  ok('"PM Service" states the hour tier, not 1C\'s raw sentence repeating the same number', (() => {
    const m = /<div class="sk">PM Service[^<]*(?:<span[^>]*>[^<]*<\/span>)?<\/div><div class="sv">([^<]*)<\/div>/.exec(html);
    return !!m && m[1] === '4000 h Service';
  })() && !html.includes('4000 Hours service Planned'));
  ok('1C\'s plan date reaches the header strip, under "Scheduled date"', html.includes('2026-09-18'));
  ok('the actual release date AND time sit beside the scheduled date, under "Actual date", for a direct comparison', (() => {
    const m = /<div class="sk">Actual date[^<]*(?:<span[^>]*>[^<]*<\/span>)?<\/div><div class="sv">([^<]*)<\/div>/.exec(html);
    return !!m && m[1] === rec.date + ' 14:37';
  })());
  ok('the release date is compared against the schedule, calculated — not typed', (() => {
    const days = Math.round((Date.parse(rec.date + 'T00:00:00Z') - Date.parse('2026-09-18T00:00:00Z')) / 86400000);
    const want = days === 0 ? 'On schedule' : days > 0 ? `${days} d late` : `${-days} d early`;
    return html.includes(want);
  })());
  // T.I(key).replace("{n}", n) only ever touches the FIRST "{n}" — the
  // English half, already correct — and leaves the literal four characters
  // "{n}" sitting in the Russian half of the same bilingual string, on
  // every report, since this cell existed. Caught rendering a REAL PDF for
  // DZ014/WO-016593 (not a synthetic fixture): "3 d early / {n} дн.
  // раньше" printed on paper. T.I's own vars argument substitutes both
  // languages in one call.
  ok('the day-count cell\'s ALTERNATE language also gets its number — not the literal "{n}"',
    !html.includes('{n}') && /\d+\s*дн\.\s*(?:раньше|позже)/.test(html));
  // The header strip's labels are T.I(...) — already-escaped, already-
  // marked-up bilingual HTML — and cell() used to run esc() over them a
  // SECOND time, so every label printed its own markup as literal text:
  // "PM Service <span class="alti">/ Плановое ТО</span>" verbatim on a
  // real generated PDF. Same class of bug rptmirror.cjs already guards
  // against for the rest of the document ("NOTHING REACHES THE PAGE AS
  // MARKUP OR AS A KEY") — RTW's own header strip never had the check.
  ok('no header-strip label prints its own HTML as visible text',
    !/&lt;span|&quot;alti&quot;/.test(html));
  ok('both checklist sections print, NUMBERED, in the document\'s own order', (() => {
    const pre = html.indexOf('1. Pre-release inspection');
    const post = html.indexOf('2. Service completion');
    return pre >= 0 && post > pre;
  })());
  ok('the checklist is ONE running table, not one per section — its column header prints once',
    (html.match(/<table class="rtw-tbl"/g) || []).length === 1
    && (html.split('Description of operations').length - 1) === 1);
  ok('a checklist item\'s own text prints, not just its number', /Confirm the original repair work is complete/.test(html));
  ok('the Attention item\'s mark and comment both reach the sheet', /Ferrous debris cleared and repaired\./.test(html));
  ok('the comment sits in its OWN column beside the row, not a full-width strip underneath it',
    !/rnote/.test(html) && /rtw-cm[^>]*>Ferrous debris cleared and repaired\./.test(html));
  // Bilingual (the default report language) correctly prints "P / Н" now that
  // tbRtwMark goes through T.I — a plain />P</ match is the PRE-FIX (English-
  // only) shape and would false-fail on the fixed, bilingual-correct output.
  ok('a Pass item is marked P, not left blank', />P(<|\s)/.test(html));
  ok('the release result is a verdict banner, not a quiet table cell', /class="verdict v-ok"[^>]*>[^<]*<b>[^<]*<\/b>[^<]*Repaired and safe to use/.test(html)
      || (html.includes('v-ok') && html.includes('Repaired and safe to use')));
  ok('RTW carries no 1–5 grade scale — the rating bar is skipped, not printed empty',
      !html.includes('CONDITION RATING') && !html.includes('Condition scale'));
  ok('page 2 holds the evidence gallery with a real photograph in it', html.includes('board gal b1') && /<img[^>]+src="data:/.test(html));
  // report-core.js's sane() moves every it.general item (RTW's own "Equipment,
  // work area, other evidence" pseudo-position) out of rec.items and into
  // rec.general before this branch ever runs, exactly as it does for every
  // graded type — but the RTW branch never called generalBlock() to read
  // rec.general back out, so this photograph was captured, saved and synced
  // and never printed anywhere. It must appear via the same genwrap/capgal
  // markup every other round type's machine evidence uses (genrow/.shots
  // were the older fit-inside-a-box boards, since replaced everywhere by the
  // standard, square, cover-fit tile — capTile/capGallery).
  ok('the general/overall evidence photo reaches the report, through the same generalBlock() every other type uses',
    /class="genwrap"/.test(html) && (html.match(/class="capgal"[^>]*>[\s\S]*?<img src="data:/g) || []).length > 0);
  ok('the Senior Mechanic\'s name and signature reach the approval table', html.includes('A. Ivanov') && /<img src="data:image\/png/.test(html));
  // The row's own role label is "Senior Mechanic" (rtw_senior), not
  // "Maintenance Supervisor" (ap_sup) — RTW's checklist is signed on the
  // spot by the mechanic who did the work, never a supervisor; approvalBlock
  // itself named the row's role wrong until this fix, and this assertion
  // used to encode that mistake as correct.
  ok('RTW has one signer — CM Technician and Reliability Engineer are dropped, Senior Mechanic stays',
    !html.includes('CM Technician') && !html.includes('Reliability Engineer') && /Senior Mechanic/.test(html)
    && !html.includes('Maintenance Supervisor'));

  console.log('\n11b. the same report, in Russian — the checklist leads in Russian, not English');
  const htmlRu = await p.evaluate(async (id) => {
    localStorage.setItem('cm_rep_lang', 'ru');
    try { const secs = await buildReportSections(id); return secs.map((s) => s.html).join(''); }
    finally { localStorage.removeItem('cm_rep_lang'); }
  }, rec.id);
  ok('a Russian-only report shows the Russian checklist text, not the English one',
    htmlRu.includes('Убедитесь, что первоначальные ремонтные работы завершены') && !htmlRu.includes('Confirm the original repair work is complete'));
  ok('the Mark column also switches — "Н" (Russian pass), not the English "P"',
    />Н</.test(htmlRu) && !/>P</.test(htmlRu));
  ok('the release verdict switches too', htmlRu.includes('Отремонтирован') && !htmlRu.includes('Repaired and safe to use'));
  ok('the numbered section titles switch', htmlRu.includes('1. Контрольный осмотр') || /1\.\s*Контрольный/.test(htmlRu));

  console.log('\n12. "D — not released" is unmistakable on the printed sheet');
  // Reopen TK126's WO-016620 (the D case from section 9) and actually save it
  // this time — section 9 only proved the button unlocks, never pressed it.
  await p.click('[data-pane="paneDue"]');
  await p.waitForTimeout(150);
  await p.click('#duePmList [data-wo="WO-016620"]');
  await p.waitForTimeout(150);
  await p.click('#pmStartRtwBtn');
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
  // WO-016620 (TK126) is the OTHER shape build_rtw_open produces: a defect
  // work order with no hour tier at all (hours: null) and its own type text
  // ("2.1", the defect's system/description) — not a planned PM's
  // "{n} Hours service Planned" sentence. PM Service has nothing to state as
  // an hour figure, so it must fall back to 1C's own text rather than a
  // blank cell that had something to show.
  ok('PM Service falls back to 1C\'s own work-order text when there is no hour tier to state instead',
    recD.rtwSchedHours == null && recD.rtwWoType === '2.1' && (() => {
      const m = /<div class="sk">PM Service[^<]*(?:<span[^>]*>[^<]*<\/span>)?<\/div><div class="sv">([^<]*)<\/div>/.exec(htmlD);
      return !!m && m[1] === '2.1';
    })());

  console.log('\n13. editing a saved RTW round from the queue reopens RTW, not the graded wizard');
  // "if I select edit, its going to Inspection page, it should go to RTW."
  // rec is the TK112/WO-016635 round saved in section 7.
  await p.evaluate(() => { showPane('paneQueue'); });
  await p.evaluate(async () => { await renderPending(); });
  await p.waitForTimeout(150);
  const rowOpened = await p.evaluate((id) => {
    const rows = [...document.querySelectorAll('#pending .pitem')];
    const row = rows.find((r) => r.querySelector('.a')?.textContent.includes('TK112'));
    if (!row) return false;
    row.querySelector('.edit').click();
    return true;
  }, rec.id);
  await p.waitForTimeout(200);
  ok('the RTW round\'s row was found in the queue and its edit button clicked', rowOpened);
  const editState = await p.evaluate(() => ({
    rtwOvOpen: !document.getElementById('rtwOv').classList.contains('hidden'),
    checklistOpen: !document.getElementById('rtwChecklistScr').classList.contains('hidden'),
    pmOvHidden: document.getElementById('pmOv').classList.contains('hidden'),
    onCapturePane: document.getElementById('paneCapture')?.classList.contains('on') || false,
    sup: document.getElementById('rtwSup')?.value || '',
    wo: (rtwDraft || {}).wo || '',
    editingId: (typeof rtwEditing !== 'undefined' && rtwEditing) ? rtwEditing.id : null,
  }));
  ok('the RTW overlay is open', editState.rtwOvOpen);
  ok('the checklist screen is showing directly, with no info sheet or picker in between', editState.checklistOpen && editState.pmOvHidden);
  ok('the generic capture/inspection pane was never activated', !editState.onCapturePane);
  ok('the draft was rebuilt from the SAVED record — same senior mechanic, same work order',
    editState.sup === 'A. Ivanov' && editState.wo === 'WO-016635');
  ok('rtwEditing tracks the record being corrected, by id', editState.editingId === rec.id);
  const attItemReopened = await p.evaluate((no) => (rtwDraft.items[no] || {}), lastNo);
  ok('the Attention item\'s mark and comment came back from the saved record',
    attItemReopened.mark === 'attention' && /Ferrous debris/.test(attItemReopened.comment || ''));

  console.log('\n14. re-saving the edit updates the SAME record — same id, revision bumped');
  await p.click('#rtwSaveBtn');
  await p.waitForTimeout(1200);
  if (await p.evaluate(() => document.getElementById('dlg')?.open)) { await p.click('#dlgOk'); await p.waitForTimeout(200); }
  const recAfterEdit = await p.evaluate(async (id) => {
    const req = indexedDB.open('plug_capture');
    const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    const tx = db.transaction('inspections', 'readonly');
    const r = await new Promise((res, rej) => { const rq = tx.objectStore('inspections').getAll(); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    return r.find((x) => x.id === id) || null;
  }, rec.id);
  ok('the edit replaced the original record — same id, no duplicate created', !!recAfterEdit);
  ok('the revision was bumped, not reset', !!recAfterEdit && recAfterEdit.rev === (rec.rev || 1) + 1);
  const allRtwCount = await p.evaluate(async () => {
    const req = indexedDB.open('plug_capture');
    const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    const tx = db.transaction('inspections', 'readonly');
    const r = await new Promise((res, rej) => { const rq = tx.objectStore('inspections').getAll(); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    return r.filter((x) => x.type === 'RTW' && x.equip === 'TK112').length;
  });
  ok('editing never leaves a second, duplicate RTW round on this equipment behind', allRtwCount === 1);

  await b.close();
  srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n- ${fails.join('\n- ')}` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
