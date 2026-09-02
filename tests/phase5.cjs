/* PHASE 5 — LUBRICATION, DATA & SYNC, REPORTS.

   Data & Sync: the decisions come first — grade review, inspections
   requiring correction, records waiting on evidence — and everything that
   answers "is this dashboard telling the truth" is one collapsed Admin
   diagnostics control. The three sentences a reader acts on are the agreed
   ones: "Grade missing. Review the inspection and select A, B, C, or X.",
   "Grade … and the previous condition … do not match. Review the grade; the
   condition will update automatically.", "Photos received; component
   assignment required."

   Lubrication: seven views as tabs, methodology on demand, and the gap lists
   page at 25 while their counts stay about the whole list.

   Reports: a guided three-step form, a searchable machine picker, a preview
   of what the PDF will contain before it is made, and a Recent reports list
   that can produce the same report again.

   Run: node tests/phase5.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = process.env.CM_BASE || 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const note = (n, d) => console.log('  ....  ' + n + (d !== undefined ? '   ' + d : ''));
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());

(async () => {
  await reset('n=40');
  await reset('keyless=TK115,2026-08-05,TB,6,have');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem('cm_drive_url', u);
    localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0');
    localStorage.setItem('cm_swap_off', '1');
    localStorage.removeItem('cm_dash_recent_reports');
  }, BASE + '/exec');
  await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 5, null, { timeout: 60000 });
  await p.waitForTimeout(2000);
  /* Two findings the review list exists for, made with the page's own rule:
     one whose grade and stored condition disagree, one with no grade at all. */
  await p.evaluate(() => {
    const a = RECS.find(x => !x._void && x.items && x.items[0] && x.items[0].grade === 'A'); if (a) a.items[0].sev = 'DEG';
    const c = RECS.find(x => !x._void && x.items && x.items[0] && x.items[0].grade === 'C'); if (c) { delete c.items[0].grade; c.items[0].sev = 'DEG'; }
    renderAll();
  });
  await p.waitForTimeout(300);

  console.log('\n1. DATA & SYNC — DECISIONS FIRST, DIAGNOSTICS COLLAPSED');
  await p.evaluate(() => showTab('sync', true)); await p.waitForTimeout(400);
  const S = await p.evaluate(() => {
    const y = id => { const e = document.getElementById(id); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; };
    const sev = [...document.querySelectorAll('#sySev li')].map(l => l.innerText.replace(/\s+/g, ' '));
    const quar = [...document.querySelectorAll('#syQuarTbl tbody tr')].map(l => l.innerText.replace(/\s+/g, ' '));
    return { sev, quar, adminOpen: document.getElementById('syAdmin').open,
      order: { sev: y('sySevBox'), quar: y('syQuarTbl'), gaps: y('syGapTbl'), admin: y('syAdmin') },
      /* checkVisibility(), not a box measurement: Chromium lays out the
         contents of a closed <details> and reports a height for them. */
      diagShown: document.getElementById('syHealth').checkVisibility(),
      tall: +(document.documentElement.scrollHeight / innerHeight).toFixed(2),
      review: sevConflicts().length,
      tile: Number((document.querySelector('#syncKpis [data-kpi="syGrade"] .v') || {}).textContent) };
  });
  ok('the review list, the correction list and the evidence list come before the diagnostics',
     S.order.sev < S.order.quar && S.order.quar < S.order.gaps && S.order.gaps < S.order.admin, JSON.stringify(S.order));
  ok('Admin diagnostics is collapsed by default', S.adminOpen === false && !S.diagShown);
  ok('the page is under two screens with it collapsed', S.tall <= 2, S.tall + ' screens');
  ok('the review list has the two findings and the tile agrees', S.sev.length === 2 && S.tile === S.review && S.review === 2,
     S.sev.length + ' rows, tile ' + S.tile);
  ok('a finding with no grade says: Grade missing. Review the inspection and select A, B, C, or X.',
     S.sev.some(x => /Grade missing\. Review the inspection and select A, B, C, or X\./.test(x)), S.sev.join(' | ').slice(0, 200));
  ok('a grade that contradicts the stored condition says so, and that the condition follows the grade',
     S.sev.some(x => /Grade [ABCX] and the previous condition \(.+\) do not match\. Review the grade; the condition will update automatically\./.test(x)),
     S.sev.join(' | ').slice(0, 200));
  ok('TK115 reads: Photos received; component assignment required',
     S.quar.some(x => /TK115/.test(x) && /Photos received; component assignment required/.test(x)), S.quar.join(' | ').slice(0, 200));
  const BANNED = [/missing evidence/i, /file missing/i, /waiting for sync/i, /have not arrived/i, /cannot be assigned/i];
  ok('  and none of the banned phrasings', !BANNED.some(re => S.quar.some(x => re.test(x))));
  await p.evaluate(() => { document.getElementById('syAdmin').open = true; }); await p.waitForTimeout(200);
  const A = await p.evaluate(() => ({ health: document.querySelectorAll('#syHealth dd').length, recon: document.querySelectorAll('#syRecon dd').length,
    pop: document.querySelectorAll('#syPop dd').length, unknown: document.querySelectorAll('#syUnknown li').length,
    shown: document.getElementById('syHealth').checkVisibility() }));
  ok('opened, the diagnostics carry the backend, the ledger, the photograph populations and the unmeasurables',
     A.shown && A.health >= 3 && A.recon >= 3 && A.pop >= 4 && A.unknown >= 4, JSON.stringify(A));
  await p.evaluate(() => { document.getElementById('syAdmin').open = false; });

  console.log('\n2. LUBRICATION — TABS, METHODOLOGY ON DEMAND, PAGED GAP LISTS');
  await p.evaluate(() => showTab('lube', true)); await p.waitForTimeout(400);
  const L = await p.evaluate(() => ({
    tabs: [...document.querySelectorAll('#lubeSub [role="tab"]')].length,
    showing: [...document.querySelectorAll('#tab-lube .lsub')].filter(d => !d.classList.contains('hidden')).length,
    method: document.querySelectorAll('#tab-lube details.method').length,
    open: document.querySelectorAll('#tab-lube details.method[open]').length,
    tall: +(document.documentElement.scrollHeight / innerHeight).toFixed(2) }));
  ok('seven views as tabs, one showing', L.tabs === 7 && L.showing === 1, L.tabs + ' tabs, ' + L.showing + ' showing');
  ok('methodology is behind a control on every view, none open by default', L.method >= 7 && L.open === 0, L.method + ' / ' + L.open);
  await p.evaluate(() => lubeGo('exc')); await p.waitForTimeout(400);
  const G = await p.evaluate(() => {
    const mrows = (() => { const miss = {}; (window.ASSETS || []).forEach(a => { if (LUBE.of(a.m || '', a.cls || '')) return;
      const k = (a.cls || '') + '|' + (a.m || ''); miss[k] = 1; }); return Object.keys(miss).length; })();
    const m = /of\s*([\d.,   ]+)/.exec((document.querySelector('#lgNoRef') && document.querySelector('#lgNoRef').parentNode.querySelector('.pager .muted') || {}).textContent || '');
    return { rows: document.querySelectorAll('#lgNoRef tbody tr').length, stated: m ? Number(m[1].replace(/\D/g, '')) : null, truth: mrows,
      note: document.getElementById('lgNote').textContent, tall: +(document.documentElement.scrollHeight / innerHeight).toFixed(2) };
  });
  ok('the "no reference" list draws a page of 15', G.rows > 0 && G.rows <= 15, String(G.rows));
  ok('  and its pager states the whole list, which equals the register\'s real gap', G.stated === G.truth, G.stated + ' vs ' + G.truth);
  ok('  the sentence beneath counts the whole list too', new RegExp('\\b' + G.truth + '\\b').test(G.note), G.note.slice(0, 80));
  ok('  and the view is at most two screens', G.tall <= 2, G.tall + ' screens');

  console.log('\n3. REPORTS — GUIDED FORM, PREVIEW, RECENT');
  await p.evaluate(() => showTab('reports', true)); await p.waitForTimeout(400);
  const R = await p.evaluate(() => ({
    steps: document.querySelectorAll('#tab-reports .rstep').length,
    title: document.querySelector('#tab-reports h1').textContent,
    search: !!document.getElementById('rTargetQ'),
    opts: document.querySelectorAll('#rTarget option').length,
    preview: document.getElementById('rPreview').innerText,
    recent: document.getElementById('rRecent').innerText,
    scope: document.getElementById('rScope').value, target: document.getElementById('rTarget').value }));
  ok('three numbered steps: what, which, options', R.steps === 3, String(R.steps));
  ok('the page is called Reports', /^Reports$/.test(R.title.trim()), R.title);
  ok('the machine picker is searchable and bounded', R.search && R.opts > 0 && R.opts <= 60, R.opts + ' options');
  ok('a preview says what the report will contain before it is made',
     new RegExp(R.target).test(R.preview) && /inspection/.test(R.preview), R.preview);
  ok('Recent reports is empty and says so', /Nothing generated yet/.test(R.recent), R.recent);
  await p.fill('#rTargetQ', 'TK12'); await p.waitForTimeout(300);
  const narrowed = await p.evaluate(() => [...document.querySelectorAll('#rTarget option')].map(o => o.value));
  ok('typing narrows the picker', narrowed.length > 0 && narrowed.filter(v => v !== 'TK101').every(v => /TK12/.test(v)), narrowed.join(',').slice(0, 60));
  await p.fill('#rTargetQ', ''); await p.waitForTimeout(200);
  /* one inspection: the preview carries the report's status */
  await p.selectOption('#rScope', 'one'); await p.waitForTimeout(300);
  const one = await p.evaluate(() => document.getElementById('rPreview').innerText);
  ok('for one inspection the preview names its status', /(Controlled final|Provisional)/.test(one), one);
  /* generate, and the report appears under Recent */
  await p.selectOption('#rScope', 'unit'); await p.waitForTimeout(300);
  const gen = await p.evaluate(async () => {
    const target = document.getElementById('rTarget').value;
    const n = await runReport('unit', target, document.getElementById('rGo'), { msg: document.getElementById('rMsg'), photos: false, scale: 1.2 });
    return { n, target, msg: document.getElementById('rMsg').textContent, recent: document.getElementById('rRecent').innerText,
      again: !!document.querySelector('#rRecent [data-ragain]') };
  });
  ok('a report generates', gen.n > 0, gen.msg);
  ok('  and is listed under Recent reports with a way to produce it again', new RegExp(gen.target).test(gen.recent) && gen.again, gen.recent.slice(0, 80));
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('cm_dash_recent_reports') || '[]').length);
  ok('  remembered for next time', kept === 1, String(kept));

  console.log('\n4. BOTH LANGUAGES');
  for (const Lg of ['ru', 'en']) {
    await p.click('.lang button[data-lang="' + Lg + '"]'); await p.waitForTimeout(500);
    const raw = await p.evaluate(() => {
      const txt = ['#tab-sync', '#tab-lube', '#tab-reports'].map(s => document.querySelector(s).innerText).join(' ');
      return (txt.match(/\b(sy|r|lg|lp|ls|lm|lr|lpo|lc)_[a-z_0-9]+\b/gi) || []).slice(0, 5);
    });
    ok(Lg + ': no raw key on the three pages', raw.length === 0, raw.join(','));
  }
  ok('no application errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nALL PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(String(e && e.stack || e).slice(0, 600)); process.exit(1); });
