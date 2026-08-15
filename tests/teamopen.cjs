/* A round somebody else did, opened on this phone.

   "In the system" listed what the team had uploaded and then threw the
   measurements away, keeping one line per round. Tapping a row started a NEW
   round on that machine — the one thing an inspector looking at "TK152, 4 days
   ago" does not want.

   The point of this suite is that it presses the button a thumb presses. A test
   that calls openRound() directly cannot see that nothing reaches openRound —
   which is exactly how the Wear & life tab shipped unreachable for five builds.
*/
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:' + (process.env.CMPORT || 8098) + '/mobile/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

const settled = async p => {
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForFunction(() => typeof window.WEAR === 'object' && typeof window.CMR === 'object', null, { timeout: 20000 });
  await p.waitForTimeout(300);
};

/* Exactly what Apps Script hands back: whole records, not summaries. */
const FEED = () => {
  const walk = ['IDLER.L-OUT', 'IDLER.R-OUT', 'CARRIER.L-OUT', 'ROLLER.L1', 'ROLLER.L2', 'ROLLER.R1'];
  return [{
    equip: 'DZ007', date: '2026-08-12', type: 'UC', cls: 'DZ',
    by: 'Хасенов', sup: 'V. Petrov', smu: '6018',
    items: walk.map((k, i) => ({ key: k, mm: [35.9, 31, 178, 208, 219, 236][i],
      comment: i === 3 ? 'Seal weeping' : '' })),
  }, {
    equip: 'TK152', date: '2026-08-04', type: 'MP', cls: 'HT', by: 'Хасенов',
    items: [{ key: '1A', label: 'Transmission', grade: 'B', comment: 'Light fuzz.' }],
  }];
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B, { waitUntil: 'load' });
  await settled(p);

  console.log('the round arrives whole, not as a line about itself');
  const stored = await p.evaluate(async F => {
    const recs = eval('(' + F + ')')();
    teamMerge(recs, true);
    await new Promise(r => setTimeout(r, 400));      // teamStash is fire-and-forget
    const full = await dbTeam();
    const mine = await dbAll();
    return { kept: full.length,
             withItems: full.filter(r => (r.items || []).length).length,
             /* The one thing this must never do. */
             leakedIntoQueue: mine.length };
  }, FEED.toString());
  note('stored', JSON.stringify(stored));
  ok('both rounds are kept whole', stored.kept === 2, stored.kept + '');
  ok('  with their measurements', stored.withItems === 2, stored.withItems + '');
  /* A team round is not this phone's work. If it reached dbAll() it would be in
     the queue, in the ZIP, in the unsent count and on its way back to Drive as
     though this inspector had done it. */
  ok('and none of it reaches this phone\'s own queue', stored.leakedIntoQueue === 0,
     stored.leakedIntoQueue + ' in dbAll()');

  console.log('\npressing the row opens THAT round, not a new one');
  await p.evaluate(() => { showPane('paneSystem'); const s = document.getElementById('typeSel');
    s.value = 'UC'; s.dispatchEvent(new Event('change')); renderTeam(); });
  await p.waitForTimeout(400);
  const rows = await p.$$('#teamList [data-k]');
  ok('the list offers a row to press', rows.length > 0, rows.length + ' rows');
  if (rows.length) {
    await rows[0].click();
    await p.waitForTimeout(600);
    const v = await p.evaluate(() => {
      const ov = document.getElementById('roundOv');
      return { open: ov && !ov.classList.contains('hidden'),
               /* Did it fall through to "start a new round on that machine"?
                  The panes do not hide on a wide layout, so ask the thing that
                  actually changes: which tab the app considers current. */
               onTab: (document.querySelector('#tabbar button.on') || {}).dataset?.pane || '',
               title: (document.getElementById('roundTitle') || {}).textContent || '',
               sub: (document.getElementById('roundSub') || {}).textContent || '',
               rows: document.querySelectorAll('#roundBody .rdrow').length,
               owned: (document.querySelector('#roundBody .rdown') || {}).textContent || '',
               worn: [...document.querySelectorAll('#roundBody .rdrow .rp')]
                 .map(e => e.textContent).filter(Boolean).slice(0, 4),
               flagged: document.querySelectorAll('#roundBody .rdrow.act,#roundBody .rdrow.watch').length };
    });
    note('view', JSON.stringify(v));
    ok('the round opens', v.open);
    ok('  and it did not start a new one instead', v.onTab === 'paneSystem', v.onTab);
    ok('  headed with the machine and the type', /DZ007/.test(v.title), v.title);
    ok('  and who did it, when', /2026-08-12/.test(v.sub) && /Хасенов/.test(v.sub), v.sub);
    ok('every position is listed', v.rows === 6, v.rows + '');
    /* The measurements are the point. A screen that opens and shows nothing is
       the same as one that does not open. */
    ok('  with wear worked out from the model, not trusted from the file',
       v.worn.length >= 3, v.worn.join(' '));
    ok('  and the ones past their limit stand out', v.flagged > 0, v.flagged + ' flagged');
    ok('it says whose round it is', /Хасенов/.test(v.owned), v.owned.slice(0, 60));
    ok('  and that this phone cannot change it', /cannot be changed/i.test(v.owned));
  }

  console.log('\nthe header holds the three things it has to, side by side');
  /* .btn is display:block;width:100% — right for a form, fatal in a flex row.
     The report button claimed the whole header, refused to shrink, and left the
     title a few pixels to wrap in: the machine name came down the screen one
     word per line with the button laid across it. Nothing errors; it is only
     visible by measuring, so measure. */
  const head = await p.evaluate(() => {
    const r = i => { const e = document.getElementById(i); if (!e) return null;
      const q = e.getBoundingClientRect();
      return { l: q.left, r: q.right, w: q.width, h: q.height }; };
    const bar = document.querySelector('#roundOv .pickhead').getBoundingClientRect();
    const t = document.getElementById('roundTitle');
    return { bar: { w: bar.width }, back: r('roundClose'), title: r('roundTitle'), rpt: r('roundRpt'),
             lines: Math.round(t.getBoundingClientRect().height /
                               parseFloat(getComputedStyle(t).lineHeight)) };
  });
  note('header', JSON.stringify(head));
  const gap = (a, c) => c.l - a.r;
  ok('the button is the size of its own label, not the width of the phone',
     head.rpt.w < head.bar.w * 0.4, Math.round(head.rpt.w) + ' of ' + Math.round(head.bar.w) + 'px');
  ok('  and still big enough to hit', head.rpt.w >= 44 && head.rpt.h >= 44,
     Math.round(head.rpt.w) + 'x' + Math.round(head.rpt.h));
  ok('the back button, the title and the button do not overlap',
     gap(head.back, head.title) >= 0 && gap(head.title, head.rpt) >= 0,
     Math.round(gap(head.back, head.title)) + ' / ' + Math.round(gap(head.title, head.rpt)));
  ok('  and none of it hangs off the edge',
     head.back.l >= 0 && head.rpt.r <= head.bar.w + 0.5,
     Math.round(head.back.l) + ' .. ' + Math.round(head.rpt.r) + '/' + Math.round(head.bar.w));
  ok('the machine and the round read on one line', head.lines === 1, head.lines + ' lines');
  ok('  with room left for it', head.title.w > head.bar.w * 0.4, Math.round(head.title.w) + 'px');

  console.log('\nand the phone can print it, with no dashboard anywhere');
  const pdf = await p.evaluate(async () => {
    const rec = await dbGet(TEAM_ID + 'DZ007|2026-08-12|UC');
    const norm = teamRecToReport(rec);
    const secs = CMR.sections({ lang, mode: 'unit', title: t('rep_title'),
      stamp: new Date(), sevLabel: s => t('sev_' + s), records: [norm] });
    const html = secs.map(s => s.html).join('');
    return { sections: secs.length,
             named: norm.items[0] && norm.items[0].name,
             scored: norm.items.filter(i => i.w && i.w.pct != null).length,
             limits: norm.items.filter(i => i.w && i.w.newMM != null).length,
             hasMeasurements: /class="meas"/.test(html),
             hasMasthead: /class="mast"/.test(html),
             /* Their name on it, not this phone's. */
             inspector: /Хасенов/.test(html) };
  });
  note('pdf source', JSON.stringify(pdf));
  ok('the report builds from their round', pdf.sections > 0, pdf.sections + ' sections');
  ok('  points are named, not coded', /[a-z]{3}/.test(pdf.named || ''), pdf.named);
  ok('  limits come from the model reference', pdf.limits >= 3, pdf.limits + ' with limits');
  ok('  and are scored here, so a corrected limit shows corrected',
     pdf.scored >= 3, pdf.scored + ' scored');
  ok('  the measurement grid is on the page', pdf.hasMeasurements);
  ok('  under the round\'s own masthead', pdf.hasMasthead);
  ok('  carrying THEIR name, not this phone\'s', pdf.inspector);

  /* A button that exists but is wired to nothing is the failure this project
     has shipped most often. */
  const wired = await p.evaluate(() => {
    const b2 = document.getElementById('roundRpt');
    return !!(b2 && typeof b2.onclick === 'function');
  });
  ok('the report button on that screen is connected', wired);

  console.log('\nand it is encoded for a satellite link, not for an office');
  /* A phone in Chukotka sends this over a link an office never touches. The
     numbers below were measured on a one-round undercarriage report, not
     assumed: 2.0@0.92 was 490 KB, 1.8@0.82 is 313 KB, and 0.72 starts to ring
     on the type. The dashboard keeps its own Standard/High selector — High is
     the office's to choose. */
  const q = await p.evaluate(() => {
    const src = String(document.documentElement.innerHTML);
    return { scale: PHONE_PDF.scale, jpeg: PHONE_PDF.jpeg,
             uses: (src.match(/scale:PHONE_PDF\.scale/g) || []).length };
  });
  note('phone pdf', JSON.stringify(q));
  ok('the phone encodes at Standard, not the office setting', q.scale === 1.8, String(q.scale));
  ok('  and at the quality measured to hold the type', q.jpeg === 0.82, String(q.jpeg));
  ok('  on both report paths, not one', q.uses === 2, q.uses + ' call sites');

  console.log('\nclosing it puts the phone back where it was');
  await p.click('#roundClose');
  await p.waitForTimeout(300);
  const shut = await p.evaluate(() => document.getElementById('roundOv').classList.contains('hidden'));
  ok('it closes', shut);

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
