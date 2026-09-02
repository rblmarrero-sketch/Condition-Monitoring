/* PHASE 4 — WEAR & REMAINING LIFE, FAILURE ANALYSIS.

   Wear: five headlines that each lead to the set they count — at or past
   limit, over 80% worn, under 1,000 h, planning required, second reading —
   checked against wearRows()/actionRequired(), the page's own rules; 25 a
   page; a row opens the position drawer with the reading, the reference and
   the forecast, and a button to the machine's history; the page is two to
   three screens at 1366×768.

   Failure Analysis: charts side by side; a bar filters, and every bar says
   what it counts; a Reset on the page appears with a filter and clears it;
   an affected-equipment table under the charts lists exactly the machines
   the charts are counting, narrowed by the pressed bar, and opens a machine.

   Run: node tests/phase4.cjs        (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs');
const B = 'http://127.0.0.1:' + (process.env.CMPORT || '8093');
const FLEET = JSON.parse(fs.readFileSync(__dirname + '/fleet-fixture.json', 'utf8'));
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const note = (n, d) => console.log('  ....  ' + n + (d !== undefined ? '   ' + d : ''));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.evaluate(f => { window.CMDash.setDriveRecords(f);
    const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await p.waitForTimeout(1200);

  console.log('\n1. WEAR & REMAINING LIFE — FIVE HEADLINES THAT LEAD SOMEWHERE');
  await p.evaluate(() => { showTab('wear', true); document.getElementById('wBand').value = 'due'; renderWearTab(); });
  await p.waitForTimeout(400);
  const W = await p.evaluate(() => {
    const all = wearRows(filtered());
    const truth = { act: all.filter(r => r.band === 'act').length,
      watch: all.filter(r => r.pct != null && r.pct >= 80).length,
      soon: all.filter(r => r.hours != null && r.hours < W_SOON).length,
      plan: all.filter(r => wearDue(r) && actionRequired(r.rec, r.it)).length,
      second: all.filter(r => r.hours == null).length };
    const tiles = [...document.querySelectorAll('#wearKpis [data-wgo]')].map(x => ({ k: x.dataset.wgo, v: Number(x.querySelector('.v').textContent) }));
    return { tiles, truth, all: all.length, lead: document.getElementById('wearLead').textContent,
      rows: document.querySelectorAll('#wearTbl tbody tr').length,
      rowH: (() => { const tr = document.querySelector('#wearTbl tbody tr'); return tr ? Math.round(tr.getBoundingClientRect().height) : 0; })(),
      tall: +(document.documentElement.scrollHeight / innerHeight).toFixed(2),
      strip: Math.round(document.getElementById('wearKpis').getBoundingClientRect().height) };
  });
  note('tiles', W.tiles.map(x => x.k + ' ' + x.v).join(' · ') + '   (' + W.all + ' measured)');
  ok('five tiles: at limit, >80%, <1,000 h, planning required, second reading',
     W.tiles.map(x => x.k).join(',') === 'act,watch,soon,plan,second', W.tiles.map(x => x.k).join(','));
  W.tiles.forEach(x => ok('  ' + x.k.padEnd(7) + ' equals the page\'s own rule', x.v === W.truth[x.k], x.v + ' vs ' + W.truth[x.k]));
  ok('the header says how many positions are measured', new RegExp('\\b' + W.all + '\\b').test(W.lead), W.lead);
  ok('one page is at most 25 rows', W.rows > 0 && W.rows <= 25, String(W.rows));
  ok('a row is one line', W.rowH > 0 && W.rowH <= 44, W.rowH + 'px');
  ok('the page is at most three screens at 1366', W.tall <= 3, W.tall + ' screens');
  ok('  and the strip is one row', W.strip <= 120, W.strip + 'px');

  for (const k of ['plan', 'second', 'act']) {
    await p.click('#wearKpis [data-wgo="' + k + '"]'); await p.waitForTimeout(300);
    const r = await p.evaluate(x => {
      const m = /(\d[\d\s, ]*)\D+(\d[\d\s, ]*)/.exec(document.getElementById('wearShown').textContent || '');
      return { mode: document.getElementById('wBand').value, shown: m ? Number(m[1].replace(/\D/g, '')) : null,
               tile: Number(document.querySelector('#wearKpis [data-wgo="' + x + '"] .v').textContent),
               on: (document.querySelector('#wearKpis .kpi.on') || {}).dataset.wgo }; }, k);
    ok('pressing "' + k + '" shows exactly what it counted', r.mode === k && r.on === k && r.shown === r.tile, JSON.stringify(r));
  }

  console.log('\n2. A WEAR ROW OPENS THE POSITION DRAWER');
  await p.click('#wearKpis [data-wgo="act"]'); await p.waitForTimeout(300);
  const first = await p.evaluate(() => { const tr = document.querySelector('#wearTbl tbody tr'); return tr ? { u: tr.dataset.unit, rk: tr.dataset.rk, ik: tr.dataset.ik } : null; });
  ok('the first row names its record and point', !!first && !!first.rk && !!first.ik, JSON.stringify(first));
  await p.click('#wearTbl tbody tr'); await p.waitForTimeout(350);
  const D = await p.evaluate(() => {
    const drw = document.getElementById('drw');
    const txt = drw.innerText.replace(/\s+/g, ' ');
    return { open: !drw.classList.contains('hidden'), title: document.getElementById('drwTitle').textContent, txt: txt.slice(0, 400),
      hasWear: /mm/.test(txt) && /(Worn|Износ)/.test(txt) && /(Life left|Остаток)/.test(txt),
      hist: !!document.getElementById('drwHist'), stillWear: CUR_TAB === 'wear' };
  });
  ok('the drawer opens on the wear page, not another tab', D.open && D.stillWear, D.title);
  ok('  with the reading, the wear and the remaining life', D.hasWear, D.txt.slice(0, 160));
  ok('  and a button to the machine\'s history', D.hist);
  await p.click('#drwHist'); await p.waitForTimeout(400);
  const went = await p.evaluate(() => ({ tab: CUR_TAB, sel: document.getElementById('equipSel').value, closed: document.getElementById('drw').classList.contains('hidden') }));
  ok('  which opens that machine\'s history', went.tab === 'equipment' && went.sel === first.u && went.closed, JSON.stringify(went));

  console.log('\n3. FAILURE ANALYSIS — TWO COLUMNS, CLICK TO FILTER, RESET, AFFECTED EQUIPMENT');
  await p.evaluate(() => { showTab('failure', true); clearDrill(); });
  await p.waitForTimeout(400);
  const F = await p.evaluate(() => {
    const y = s => Math.round(document.querySelector(s).getBoundingClientRect().top);
    const f = findings(filtered());
    const units = new Set(f.map(x => x.r.equip)).size;
    const rows = [...document.querySelectorAll('#failAffTbl tbody tr')];
    const m = /of\s*([\d.,  ]+)/.exec((document.querySelector('#failAffShown') || {}).textContent || '');
    return { side: Math.abs(y('#paretoDefect') - y('#paretoCause')) < 80,
      reset: document.getElementById('failReset').hidden,
      tips: [...document.querySelectorAll('#paretoDefect .prow')].every(r => /\d+ finding|находок: \d+/.test(r.title) && /%/.test(r.title)),
      bars: document.querySelectorAll('#paretoDefect .prow[data-drill]').length,
      affRows: rows.length, affTotal: m ? Number(m[1].replace(/\D/g, '')) : rows.length, units,
      firstUnit: rows[0] ? rows[0].dataset.u : null,
      tall: +(document.documentElement.scrollHeight / innerHeight).toFixed(2) };
  });
  ok('defects and causes sit side by side', F.side);
  ok('Reset is hidden while nothing is filtered', F.reset === true);
  ok('every bar says what it counts and its cumulative share', F.tips && F.bars > 0, F.bars + ' bars');
  ok('the affected-equipment table lists every machine with a coded finding', F.affTotal === F.units, F.affTotal + ' vs ' + F.units);
  ok('  at most a page of them', F.affRows <= 25 && F.affRows > 0, String(F.affRows));
  ok('the page is at most three screens', F.tall <= 3, F.tall + ' screens');

  await p.click('#paretoDefect .prow[data-drill]'); await p.waitForTimeout(400);
  const G = await p.evaluate(() => {
    /* filtered() keeps whole rounds; the machines that carry the pressed
       defect are the ones with a point that names it. */
    const f = findings(filtered()), mine = f.filter(x => x.i.defect === drill.defect);
    const units = new Set(mine.map(x => x.r.equip)).size;
    const rows = [...document.querySelectorAll('#failAffTbl tbody tr')];
    const m = /of\s*([\d.,\u00a0\u202f ]+)/.exec((document.querySelector('#failAffShown') || {}).textContent || '');
    const cells = rows.map(tr => Number(tr.children[4].textContent));
    const perUnit = {}; mine.forEach(x => { perUnit[x.r.equip] = (perUnit[x.r.equip] || 0) + 1; });
    return { defect: drill.defect, reset: document.getElementById('failReset').hidden, hash: location.hash,
      affTotal: m ? Number(m[1].replace(/\D/g, '')) : rows.length, units,
      allCarry: mine.length > 0 && filtered().every(r => r.items.some(i => i.defect === drill.defect)),
      countsRight: rows.every((tr, n) => cells[n] === perUnit[tr.dataset.u]),
      lead: document.getElementById('failAffLead').textContent };
  });
  ok('pressing a bar filters the page to that defect', !!G.defect && G.allCarry, G.defect);
  ok('  and each machine\'s count is of that defect, not of everything on the round', G.countsRight);
  ok('  the address carries it', /defect=/.test(G.hash), G.hash);
  ok('  Reset appears', G.reset === false);
  ok('  and the affected table narrows to the machines with that defect', G.affTotal === G.units, G.affTotal + ' vs ' + G.units + ' · ' + G.lead);
  await p.click('#failAffTbl tbody tr'); await p.waitForTimeout(350);
  const U = await p.evaluate(() => ({ open: !document.getElementById('drw').classList.contains('hidden'), title: document.getElementById('drwTitle').textContent, tab: CUR_TAB }));
  ok('a machine row opens the machine drawer, on this page', U.open && U.tab === 'failure' && /[A-Z]{2}\d+/.test(U.title), U.title);
  await p.evaluate(() => drwClose());
  await p.click('#failReset'); await p.waitForTimeout(400);
  const R = await p.evaluate(() => ({ defect: drill.defect, reset: document.getElementById('failReset').hidden,
    total: (() => { const m = /of\s*([\d.,  ]+)/.exec((document.querySelector('#failAffShown') || {}).textContent || ''); return m ? Number(m[1].replace(/\D/g, '')) : document.querySelectorAll('#failAffTbl tbody tr').length; })() }));
  ok('Reset clears the filter and hides itself', !R.defect && R.reset === true, JSON.stringify(R));
  ok('  and the table is whole again', R.total === F.affTotal, R.total + ' vs ' + F.affTotal);

  console.log('\n4. BOTH LANGUAGES');
  for (const L of ['ru', 'en']) {
    await p.click('.lang button[data-lang="' + L + '"]'); await p.waitForTimeout(500);
    const raw = await p.evaluate(() => {
      const txt = ['#tab-wear', '#tab-failure'].map(s => document.querySelector(s).innerText).join(' ');
      return (txt.match(/\b(w|fa|p|s|th|drw)_[a-z_0-9]+\b/gi) || []).slice(0, 5);
    });
    ok(L + ': no raw key on either page', raw.length === 0, raw.join(','));
  }
  ok('no application errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nALL PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(String(e && e.stack || e).slice(0, 600)); process.exit(1); });
