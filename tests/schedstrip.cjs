/* THE MASTHEAD LABELS ITS OWN FACTS, AND EVERY ROUND TYPE SHOWS 1C'S PLAN.

   Read against a real EX019 General Inspection report, subtitle circled:
   "can we label the SMU/Hour Meter, Plan date, PM type (5000 Hours if
   available); P3 or P4 if available... The SMU is already there just label,
   and the date what is that Insp Date? or Plan Date? Make it Standard in all
   report" — followed by "even for Inspection remember we have PM and
   Schedule from 1C they are following that. So just put the sched Date, Ins
   Date, PM Type, etc."

   RTW already carried its own richer version of this (rtwHeaderStrip) for
   its own release checklist. This generalises the same three facts — the
   hour tier / PM type, the 1C plan date, the priority code — to every OTHER
   round type, sourced from the same schedOrdersFor() the Due list and RTW
   already trust, while also finally labelling the two figures that were
   already on the masthead unlabelled (SMU, and the date — which the
   maintainer's own question proves reads as ambiguous unlabelled).

   Two halves, proven separately:
   · the PHONE captures schedHours/schedDate/schedPriority once, at Save,
     from schedOrdersFor(equip, type).near — and PRESERVES them on an edit,
     never re-borrowing whatever the schedule says on the day of the
     correction (the same rule roundWO() already keeps for the work order
     number itself);
   · report-core.js's schedStrip() prints those three facts, labelled, on
     the masthead of a single-round report — for a non-RTW type; renders
     nothing when 1C has nothing for this round; and stays out of RTW's own
     way (RTW keeps its own richer strip untouched).

   Run: node tests/schedstrip.cjs */
const { chromium } = require(require('./pw.cjs'));
const { PHOTOS } = require('./overview.cjs');
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
const dlgTxt = p => p.evaluate(() => ((document.getElementById('dlg') || {}).textContent || '').replace(/\s+/g, ' ').trim());
const closeDlg = async p => { await p.evaluate(() => { const d = document.getElementById('dlg'); if (d && d.open) d.close(); }); await p.waitForTimeout(150); };
const SHOT = `(function(){ const bytes=new Uint8Array([0xff,0xd8,0xff,0xdb,1,2,3,4,5,6,7,8,9,0xff,0xd9]);
  const p=(draft.positions[curItem] ||= {}); addPos(p, attWrap(new File([bytes],'x.jpg',{type:'image/jpeg'})), 'COMPONENT'); renderMedia(); return (p.photos||[]).length; })()`;

const FIRST_SCHED = { byUnit: { TK147: [
  { wo: 'WO-020001', hours: 250, types: ['MP'], plan: '2026-09-25', priority: 'P3 Planned (PM)' },
] } };
const LATER_SCHED = { byUnit: { TK147: [
  { wo: 'WO-020002', hours: 500, types: ['MP'], plan: '2026-10-30', priority: 'P2 Severe' },
] } };

(async () => {
  await new Promise(r => srv.listen(0, r));
  const APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const b = await chromium.launch();

  console.log('1. captured once at Save, from schedOrdersFor(equip, type).near');
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(APP, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate((fx) => { SCHED = fx; }, FIRST_SCHED);

  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('TK147'));
  await p.waitForTimeout(500);
  await p.evaluate(() => { const k = items()[0].k; pickComponent(k); });
  await p.fill('#inspector', 'R. Marrero'); await p.fill('#smu', '6100');
  ok('one photograph on the position', (await p.evaluate(SHOT)) === 1);
  await p.evaluate(() => document.querySelector('#gradeSeg [data-g="1"]').click());
  await p.waitForTimeout(150);
  await p.evaluate(PHOTOS);
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(200); await p.click('#saveBtn'); await p.waitForTimeout(600);
  let d = await dlgTxt(p);
  ok('the round saves', /Saved|saved on this phone/i.test(d), d.slice(0, 100));
  await closeDlg(p);

  let cap = await p.evaluate(async () => {
    const r = (await dbAll()).find(x => x.equip === 'TK147' && x.type === 'MP');
    const e = recToExport(r);
    return { recHours: r.schedHours, recDate: r.schedDate, recPrio: r.schedPriority,
             expHours: e.schedHours, expDate: e.schedDate, expPrio: e.schedPriority, id: r.id };
  });
  ok('the STORED record carries the hour tier off SCHED', cap.recHours === 250, JSON.stringify(cap));
  ok('...the plan date', cap.recDate === '2026-09-25', JSON.stringify(cap));
  ok('...and the priority text', cap.recPrio === 'P3 Planned (PM)', JSON.stringify(cap));
  ok('recToExport carries all three onto the sidecar too', cap.expHours === 250 && cap.expDate === '2026-09-25' && cap.expPrio === 'P3 Planned (PM)', JSON.stringify(cap));

  console.log('\n2. an edit PRESERVES the captured facts — never re-borrows the day\'s own schedule');
  await p.evaluate((fx) => { SCHED = fx; }, LATER_SCHED);
  await p.evaluate(async id => { editRecord(await dbGet(id)); }, cap.id);
  await p.waitForTimeout(500);
  /* The identity card folds itself away once a round has been saved on this
     phone (needgrade.cjs makes the same note) — the same reason edit5.cjs
     sets a field's value directly rather than through page.fill(), which
     requires visibility. */
  await p.evaluate(() => { const e = document.getElementById('smu'); e.value = '6200';
    e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(200); await p.click('#saveBtn'); await p.waitForTimeout(600);
  d = await dlgTxt(p);
  ok('the corrected round saves', /Saved|saved on this phone/i.test(d), d.slice(0, 100));
  await closeDlg(p);

  const afterEdit = await p.evaluate(async id => {
    const r = await dbGet(id);
    return { hours: r.schedHours, date: r.schedDate, prio: r.schedPriority, rev: r.rev };
  }, cap.id);
  ok('the hour tier is untouched by the later schedule', afterEdit.hours === 250, JSON.stringify(afterEdit));
  ok('the plan date is untouched', afterEdit.date === '2026-09-25', JSON.stringify(afterEdit));
  ok('the priority text is untouched', afterEdit.prio === 'P3 Planned (PM)', JSON.stringify(afterEdit));
  ok('same record, revision bumped — not a second round', afterEdit.rev === 2, JSON.stringify(afterEdit));

  console.log('\n3. a round with nothing in SCHED carries nothing — never invented');
  // A fresh context/page — the identity card folds itself away once a round
  // has been saved on this phone (needgrade.cjs's own note), so a clean
  // slate is simpler here than fighting that fold with evaluate() sets.
  const ctx2 = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p2b = await ctx2.newPage();
  p2b.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p2b.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p2b.goto(APP, { waitUntil: 'load' });
  await p2b.waitForTimeout(1200);
  await p2b.evaluate(() => { SCHED = { byUnit: {} }; });
  await p2b.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p2b.waitForTimeout(300);
  await p2b.evaluate(() => selectEquip('TK147'));
  await p2b.waitForTimeout(500);
  await p2b.evaluate(() => { const k = items()[0].k; pickComponent(k); });
  await p2b.fill('#inspector', 'R. Marrero'); await p2b.fill('#smu', '6150');
  ok('one photograph on the position', (await p2b.evaluate(SHOT)) === 1);
  await p2b.evaluate(() => document.querySelector('#gradeSeg [data-g="1"]').click());
  await p2b.waitForTimeout(150);
  await p2b.evaluate(PHOTOS);
  await p2b.evaluate(() => goStep(3)); await p2b.waitForTimeout(200); await p2b.click('#saveBtn'); await p2b.waitForTimeout(600);
  d = await dlgTxt(p2b);
  ok('this second round saves too', /Saved|saved on this phone/i.test(d), d.slice(0, 100));
  await closeDlg(p2b);
  const bare = await p2b.evaluate(async () => {
    const r = (await dbAll()).find(x => x.equip === 'TK147' && x.type === 'MP');
    return r ? { hours: r.schedHours, date: r.schedDate, prio: r.schedPriority } : null;
  });
  ok('no hour tier is invented', bare && bare.hours == null, JSON.stringify(bare));
  ok('no plan date is invented', bare && bare.date === '', JSON.stringify(bare));
  ok('no priority is invented', bare && bare.prio === '', JSON.stringify(bare));

  await ctx.close(); await ctx2.close();

  console.log('\n4. report-core.js: the masthead labels its facts and shows 1C\'s plan');
  const p2 = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  const errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
  await p2.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p2.goto('http://127.0.0.1:' + srv.address().port + '/dashboard/index.html', { waitUntil: 'load' });
  await p2.waitForFunction(() => window.CMR && window.CMReport, { timeout: 20000 });
  await p2.waitForTimeout(500);

  const r4 = await p2.evaluate(() => {
    window.CMDash.importRecords([
      { equip: 'TK700', date: '2026-09-23', type: 'MP', cls: 'HT', by: 'Rayanov', smu: '1000',
        schedHours: 250, schedDate: '2026-09-25', schedPriority: 'P3 Planned (PM)',
        items: [{ key: 'FRD', label: 'Front Differential', grade: 1, action: 'Monitor', photos: [] }] },
      { equip: 'TK701', date: '2026-09-23', type: 'MP', cls: 'HT', by: 'Rayanov', smu: '1000',
        items: [{ key: 'FRD', label: 'Front Differential', grade: 1, action: 'Monitor', photos: [] }] },
      // RTW carries its own, richer schedule fields (rtwSchedHours/
      // rtwSchedDate/rtwWoPriority) — a separate namespace from the generic
      // schedHours/schedDate/schedPriority this feature adds for every OTHER
      // type. Deliberately not setting the generic fields here proves
      // schedStrip() stays out of RTW's own way without depending on them.
      { equip: 'TK900', date: '2026-09-23', type: 'RTW', cls: 'HT', by: 'Rayanov', smu: '1000',
        rtwWoType: '250 Hours service Planned', rtwSchedHours: 250, rtwSchedDate: '2026-09-25', rtwWoPriority: 'P3 Planned (PM)',
        rtwResult: 'S', items: [{ key: '1.1', label: '1.1', mark: 'pass', general: 0 }] },
    ]);
    const htmlFor = ek => CMReport.sectionsFor('one', ek, { lang: 'en', photos: true }).map(s => s.html).join('\n');
    return {
      withSched: htmlFor('TK700|2026-09-23|MP'),
      noSched: htmlFor('TK701|2026-09-23|MP'),
      rtw: htmlFor('TK900|2026-09-23|RTW'),
    };
  });
  // T.I() always emits the bilingual form (label plus a trailing
  // <span class="alti">/ ...</span>) regardless of the report's own
  // language — the same trap CLAUDE.md's own RTW header-strip entry warns
  // about ("a plain string in a bilingual cell") — so these check the
  // English label and the value survive, not an exact bilingual-free string.
  ok('the date is labelled — no longer bare', /Insp\. date[\s\S]{0,80}<b>2026-09-23<\/b>/.test(r4.withSched), r4.withSched.match(/<div class="msub">[\s\S]{0,200}/));
  ok('the SMU is labelled', /SMU[\s\S]{0,80}<b>1000<\/b> h/.test(r4.withSched), r4.withSched.match(/<div class="msub">[\s\S]{0,300}/));
  ok('the schedule strip prints the hour tier', /PM Service[\s\S]{0,200}250 h Service/.test(r4.withSched));
  ok('...the plan date', r4.withSched.includes('2026-09-25'));
  ok('...and the priority code/class', /Type of PM[\s\S]{0,200}P3 Planned/.test(r4.withSched));
  // statusStrip (called for EVERY type) shares the .sstrip/.sc/.sk/.sv
  // classes with schedStrip/rtwHeaderStrip — class="sstrip" alone is not
  // unique to this feature. schedStrip's own margin (added only by it,
  // right after the masthead's .msub/.note) is the specific marker.
  ok('a round with nothing in SCHED prints no strip', !r4.noSched.includes('margin-top:10px'), r4.noSched.match(/<div class="msub">[\s\S]{0,300}/));
  ok('...but its own date and SMU are still labelled', /Insp\. date[\s\S]{0,80}<b>2026-09-23<\/b>/.test(r4.noSched) && /SMU[\s\S]{0,80}<b>1000<\/b> h/.test(r4.noSched));
  ok('RTW is untouched — its own richer strip, not the generic one, still renders', /Actual date/.test(r4.rtw) && /PM Service[\s\S]{0,200}250 h Service/.test(r4.rtw) && r4.rtw.includes('2026-09-25'));
  ok('no page errors', errs2.length === 0, errs2.join(' | '));

  await p2.close();

  console.log('\n5. the office\'s own reader of the folder carries the same three facts');
  /* Mirrors tests/rtwoffice.cjs's own harness exactly — a real ed-srv (the
     Apps Script logic over an in-memory Drive) seeded with a folder sidecar,
     loaded cold through CMDrive.load(), so this proves normalizeRecs()
     itself carries schedHours/schedDate/schedPriority off a real sidecar,
     not a re-derived copy. Needs tests/ed-srv.cjs already running on 8093
     (runall.sh starts it before this suite; run standalone with
     `node ed-srv.cjs 8093 letmein &` first). */
  const EPORT = 8093;
  const EB = `http://127.0.0.1:${EPORT}`;
  const EF = 'MP/TK800/2026-09-23/';
  const eput = (name, buf) => fetch(EB + '/__put?key=' + encodeURIComponent(EF + name), { method: 'POST', body: buf });
  const esidecar = JSON.stringify({ type: 'cm-inspection-entries', version: 2, records: [{
    id: 'MP__TK800__2026-09-23__DEVYY__1', rev: 1, equip: 'TK800', date: '2026-09-23', type: 'MP', cls: 'HT',
    by: 'A. Ivanov', sup: '', smu: '5000', signed: false,
    schedHours: 250, schedDate: '2026-09-25', schedPriority: 'P3 Planned (PM)',
    items: [{ key: 'FRD', label: 'Front Differential', grade: 1, sev: 'NOF', action: 'Monitor / re-inspect next PM', photos: [] }],
  }] });
  try {
    await fetch(EB + '/__seed');
    await eput('TK800_23.09.2026_MP.json', Buffer.from(esidecar));
    const p3 = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs3 = []; p3.on('pageerror', e => errs3.push(e.message));
    await p3.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', ''); }, EB + '/exec');
    await p3.goto(EB + '/dashboard/index.html', { waitUntil: 'load' });
    await p3.waitForTimeout(2000);
    const r5 = await p3.evaluate(async () => {
      await CMDrive.load(() => {});
      const rec = RECS.find(r => r.equip === 'TK800' && r.type === 'MP');
      if (!rec) return { norec: true, n: RECS.length };
      const secs = await CMReport.sectionsFor('one', ekOf(rec), { photos: true, lang: 'en' });
      const html = (secs && secs.sections ? secs.sections : secs || []).map(s => s.html || '').join('\n');
      return {
        schedHours: rec.schedHours, schedDate: rec.schedDate, schedPriority: rec.schedPriority,
        hasStrip: html.includes('class="sstrip"'),
        hasPmService: /PM Service[\s\S]{0,200}250 h Service/.test(html),
        hasPlanDate: html.includes('2026-09-25'),
      };
    });
    ok('the record found in the folder is the one just seeded', !r5.norec, JSON.stringify(r5));
    ok('normalizeRecs() carries schedHours off the sidecar', r5.schedHours === 250, JSON.stringify(r5));
    ok('...schedDate', r5.schedDate === '2026-09-25', JSON.stringify(r5));
    ok('...and schedPriority', r5.schedPriority === 'P3 Planned (PM)', JSON.stringify(r5));
    ok('the strip actually renders on the dashboard-built report', r5.hasStrip, JSON.stringify(r5));
    ok('PM Service reaches the printed strip', r5.hasPmService);
    ok('the plan date reaches the printed strip', r5.hasPlanDate);
    ok('no page errors', errs3.length === 0, errs3.join(' | '));
    await p3.close();
  } catch (e) {
    ok('the office-side check ran (needs ed-srv.cjs on 8093)', false, e.message);
  }

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall passed');
  await b.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
