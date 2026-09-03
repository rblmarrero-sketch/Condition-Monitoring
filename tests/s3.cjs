/* Stage 3 — one job per screen, tablet and landscape layouts, and the trend at
   the point of capture. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8094';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };
const seed = () => fetch(B + '/__seed').then(r => r.text());
const b64 = s => Buffer.from(s, 'utf8').toString('base64');

/* A run of rounds on one unit, so there is something to draw a trend from. */
const round = (unit, date, grade, dev) => fetch(B + '/exec', { method: 'POST',
  headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({
    name: `${unit}_${date.split('-').reverse().join('.')}_MP.json`, folder: 'MP/' + date.slice(0, 7),
    contentType: 'application/json', dev: dev || 'DSEED',
    file: b64(JSON.stringify({ type: 'cm-inspection-entries', version: 2,
      records: [{ equip: unit, date, type: 'MP', by: 'B. Ivanov', dev: dev || 'DSEED',
                  items: [{ key: '4C', grade }] }] })) }) }).then(r => r.json());

async function app(b, vp, lang) {
  const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] },
    isMobile: vp[2] !== false, hasTouch: vp[2] !== false });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(([u, l]) => { localStorage.setItem('up_dests', JSON.stringify(
    [{ id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{YYYY-MM}' }]));
    if (l) localStorage.setItem('lang', l); }, [B + '/exec', lang || '']);
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  return { ctx, p };
}
/* offsetParent is null for anything position:fixed, which is half of what this
   suite checks — measure the box instead. */
const vis = (p, sel) => p.evaluate(s => { const e = document.querySelector(s);
  if (!e) return false;
  const cs = getComputedStyle(e);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0; }, sel);
const overflows = p => p.evaluate(() =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
const pane = p => p.evaluate(() => [...document.querySelectorAll('main > .pane')]
  .filter(x => getComputedStyle(x).display !== 'none').map(x => x.id));

(async () => {
  const b = await chromium.launch();
  await seed();
  // TK146 already has one 09.03 round from the seed. Add a deteriorating run.
  for (const [d, g] of [['2026-03-09', 'C'], ['2026-04-06', 'A'], ['2026-05-04', 'B'],
                        ['2026-06-01', 'B'], ['2026-06-29', 'X']])
    await round('TK151', d, g);
  for (const [d, g] of [['2026-04-06', 'X'], ['2026-05-04', 'C'], ['2026-06-01', 'A']])
    await round('TK149', d, g);
  await round('TK150', '2026-06-01', 'B');            // a single round — nothing to trend

  console.log('one job per screen');
  let { ctx, p } = await app(b, [412, 915]);
  /* Four. The due list used to sit at the bottom of System, under every round
     the team had ever uploaded; it is its own screen now. */
  ok('four panes exist', (await p.$$eval('main > .pane', e => e.length)) === 4,
    String(await p.$$eval('main > .pane', e => e.map(x => x.id).join(' '))));
  ok('only the capture pane is showing', JSON.stringify(await pane(p)) === '["paneCapture"]',
    JSON.stringify(await pane(p)));
  ok('the tab bar is there', await vis(p, '#tabbar'));
  ok('capture is the marked tab',
    await p.evaluate(() => document.querySelector('#tabbar button.on').dataset.pane === 'paneCapture'));

  await p.click('#tabbar [data-pane="paneQueue"]');
  await p.waitForTimeout(200);
  ok('the queue pane takes over', JSON.stringify(await pane(p)) === '["paneQueue"]', JSON.stringify(await pane(p)));
  ok('the pending list is reachable', await vis(p, '#pending'));
  ok('and the capture form is not in the way', !(await vis(p, '#cardInspection')));
  /* Share, Export and the PDF are all ways of taking THIS PHONE's work
     somewhere by hand, so they need work to be here. With an empty phone all
     three could only answer a tap with "nothing to export". */
  ok('the hand-off row waits until there is something to hand off',
    !(await vis(p, '#shareBtn')), 'hidden while the phone is empty');

  await p.click('#tabbar [data-pane="paneDue"]');
  await p.waitForTimeout(200);
  ok('the due list is a screen of its own now', await vis(p, '#dueList'));
  ok('and nothing else is on it', JSON.stringify(await pane(p)) === '["paneDue"]');

  await p.click('#tabbar [data-pane="paneSystem"]');
  await p.waitForTimeout(400);
  ok('the system pane shows what the team did', await vis(p, '#teamList'));
  /* "Is this phone fit to work" is System's question, not the queue's — and
     with the due list gone System was one card above a screen of blank. */
  ok('and whether this phone is fit to work', await vis(p, '#yardCard'));
  ok('nothing else is on screen', JSON.stringify(await pane(p)) === '["paneSystem"]');

  console.log('\n  a half-finished round survives the trip');
  await p.click('#tabbar [data-pane="paneCapture"]'); await p.waitForTimeout(200);
  await p.evaluate(() => selectEquip('TK146'));
  await p.fill('#inspector', 'R. Marrero');
  await p.fill('#smu', '18422');
  const k = await p.evaluate(() => items()[0].k);
  await p.evaluate(k => { saveCur(); curItem = k; loadPos(); renderChips(); }, k);
  await p.evaluate(() => document.querySelector('#gradeSeg [data-g="3"]').click());
  await p.evaluate(() => { draft.positions[curItem].comment = 'fine swarf, ~2 mm chips'; });
  await p.click('#tabbar [data-pane="paneSystem"]'); await p.waitForTimeout(200);
  await p.click('#tabbar [data-pane="paneQueue"]'); await p.waitForTimeout(200);
  await p.click('#tabbar [data-pane="paneCapture"]'); await p.waitForTimeout(300);
  ok('the unit is still selected', (await p.evaluate(() => curEquip)) === 'TK146');
  ok('the inspector is still there', (await p.inputValue('#inspector')) === 'R. Marrero');
  ok('so are the machine hours', (await p.inputValue('#smu')) === '18422');
  ok('the grade held', await p.evaluate(k => draft.positions[k] && draft.positions[k].grade === 3, k));
  ok('and the comment held',
    await p.evaluate(k => (draft.positions[k] || {}).comment === 'fine swarf, ~2 mm chips', k));
  ok('the signature pad has real height after the switch',
    (await p.evaluate(() => document.getElementById('signPad').height)) > 20,
    String(await p.evaluate(() => document.getElementById('signPad').height)));

  console.log('\n  the badges say where to go');
  const badge = (p, id) => p.evaluate(i => { const e = document.getElementById(i);
    return e.classList.contains('hidden') ? '' : e.textContent; }, id);
  ok('nothing waiting, no queue badge', (await badge(p, 'tabQ')) === '', await badge(p, 'tabQ'));
  await p.evaluate(() => { document.querySelector('#gradeSeg [data-g="3"]'); });
  await p.evaluate(() => { draft.positions[curItem].defect = 'DT14-03'; draft.positions[curItem].action = 'MON'; });
  /* Offline for the save, deliberately.

     The badge counts rounds that have NOT gone. This suite talks to a real
     endpoint on localhost, so saving online uploads inside the same second and
     the badge is correctly empty — the check was reading the app's speed as a
     missing badge and had been red for a long time for that reason. What it
     exists to prove is that a round with nowhere to go SAYS SO on the tab bar,
     which is the state an inspector is actually in: in the pit, with no signal.
     So take the signal away first. */
  await ctx.setOffline(true);
  await p.click('#saveBtn'); await p.waitForTimeout(600);
  if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgOk'); await p.waitForTimeout(200); }
  await p.waitForTimeout(400);
  ok('a round saved with no signal shows on the queue tab', (await badge(p, 'tabQ')) === '1', await badge(p, 'tabQ'));
  /* And it stops saying so once the round is away — a badge that never clears
     is a badge nobody looks at. */
  await ctx.setOffline(false);
  await p.evaluate(() => { retryAt = RETRY_MIN; return syncThenArm(true); });
  await p.waitForFunction(() => dbAll().then(a => a.every(r => r.up)), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(300);
  ok('  and clears once the signal comes back and it goes', (await badge(p, 'tabQ')) === '',
     await badge(p, 'tabQ') || '(no badge)');
  /* Overdue moved to the tab that shows it. System's badge answers a different
     question now — a round two phones both sent, which is the only thing in an
     archive that needs somebody to decide. */
  ok('overdue units show on the due tab', /^[1-9]/.test(await badge(p, 'tabD')), await badge(p, 'tabD'));

  console.log('\n  the two lists on that tab go to two different places');
  await p.click('#tabbar [data-pane="paneSystem"]'); await p.waitForTimeout(300);

  /* "In the system" is a record of what has been DONE. Pressing one used to
     start a new round on that machine — silently, so an inspector looking at
     "TK149, 4 days ago" got a blank form instead of the round they asked for.
     It opens that round now, read-only, and stays on this tab. */
  const teamRow = await p.$('#teamList [data-k]');
  ok('the system list offers a round to open', !!teamRow);
  if (teamRow) {
    await teamRow.click(); await p.waitForTimeout(900);
    const r = await p.evaluate(() => ({
      open: !document.getElementById('roundOv').classList.contains('hidden'),
      dlg: !!(document.getElementById('dlg') || {}).open,
      rows: document.querySelectorAll('#roundBody .rdrow').length }));
    ok('  it opens that round rather than starting a new one',
       r.open || r.dlg, JSON.stringify(r));
    ok('  and does not land on the capture form',
       JSON.stringify(await pane(p)) !== '["paneCapture"]', JSON.stringify(await pane(p)));
    if (r.open) { await p.click('#roundClose'); await p.waitForTimeout(300); }
    if (r.dlg) { await p.click('#dlgOk'); await p.waitForTimeout(200); }
  }

  /* "Inspection due" is the list of work still to do, so its rows DO take you
     to the machine with the form open — on its own tab now, beside the archive
     rather than buried under it. */
  await p.click('#tabbar [data-pane="paneDue"]'); await p.waitForTimeout(300);
  const dueRow = await p.$('#dueList [data-u]');
  ok('the due list offers a unit to go and inspect', !!dueRow);
  if (dueRow) {
    const want = await dueRow.getAttribute('data-u');
    await dueRow.click(); await p.waitForTimeout(400);
    ok('back on capture', JSON.stringify(await pane(p)) === '["paneCapture"]', JSON.stringify(await pane(p)));
    ok('with that unit picked', (await p.evaluate(() => curEquip)) === want, want);
  }

  console.log('\n  editing a queued round jumps to the form');
  await p.click('#tabbar [data-pane="paneQueue"]'); await p.waitForTimeout(300);
  await p.click('.pitem .edit'); await p.waitForTimeout(400);
  ok('back on capture again', JSON.stringify(await pane(p)) === '["paneCapture"]', JSON.stringify(await pane(p)));
  ok('with the round loaded', (await p.evaluate(() => curEquip)) === 'TK146');
  ok('and the editing banner up', await vis(p, '#editBanner'));

  console.log('\n  the ZIP and the PDF still come out of the queue screen');
  await p.click('#tabbar [data-pane="paneQueue"]'); await p.waitForTimeout(300);
  const zip = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#exportBtn')])
    .then(([d]) => d.suggestedFilename()).catch(e => 'FAILED: ' + e.message);
  ok('Export ZIP downloads', /\.zip$/i.test(zip), zip);
  // the "exported" confirmation is a modal <dialog> — it swallows the next click
  await p.waitForTimeout(400);
  if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgOk'); await p.waitForTimeout(200); }
  const pdf = await Promise.all([p.waitForEvent('download', { timeout: 40000 }), p.click('#reportBtn')])
    .then(([d]) => d.suggestedFilename()).catch(e => 'FAILED: ' + e.message);
  ok('PDF report downloads', /\.pdf$/i.test(pdf), pdf);
  await ctx.close();

  console.log('\nthe trend at the point of capture');
  ({ ctx, p } = await app(b, [412, 915]));
  await p.evaluate(() => selectEquip('TK150')); await p.waitForTimeout(400);
  ok('one round alone draws nothing', !(await vis(p, '#trend')));

  await p.evaluate(() => selectEquip('TK151')); await p.waitForTimeout(400);
  ok('a run of rounds draws a trend', await vis(p, '#trend'));
  ok('one bar per round', (await p.$$eval('#trend .bars i', e => e.length)) === 5,
    String(await p.$$eval('#trend .bars i', e => e.length)));
  ok('and it says how many', /5/.test(await p.textContent('#trend')), await p.textContent('#trend'));
  ok('a unit that ended on X reads as getting worse',
    /getting worse/.test(await p.textContent('#trend')), await p.textContent('#trend'));
  ok('the newest round is on the right', await p.evaluate(() => {
    const b = [...document.querySelectorAll('#trend .bars i')];
    return /2026-06-29/.test(b[b.length - 1].title); }),
    await p.evaluate(() => [...document.querySelectorAll('#trend .bars i')].map(x => x.title).join(' | ')));

  await p.evaluate(() => selectEquip('TK149')); await p.waitForTimeout(400);
  ok('a unit that recovered reads as improving',
    /improving/.test(await p.textContent('#trend')), await p.textContent('#trend'));

  console.log('\n  a round saved on this phone counts before it is uploaded');
  await p.evaluate(() => selectEquip('TK150')); await p.waitForTimeout(300);
  await p.fill('#inspector', 'R. Marrero');
  await p.evaluate(() => { const k = items()[0].k; saveCur(); curItem = k; loadPos(); renderChips(); });
  await p.evaluate(() => document.querySelector('#gradeSeg [data-g="5"]').click());
  await p.evaluate(() => { draft.positions[curItem].defect = 'DT14-03'; draft.positions[curItem].action = 'REP'; });
  await p.click('#saveBtn'); await p.waitForTimeout(700);
  if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgOk'); await p.waitForTimeout(200); }
  await p.evaluate(() => selectEquip('TK150')); await p.waitForTimeout(500);
  ok('the unsent round is in the trend', await vis(p, '#trend'));
  ok('two rounds now', (await p.$$eval('#trend .bars i', e => e.length)) === 2,
    String(await p.$$eval('#trend .bars i', e => e.length)));
  ok('and it is called out', /getting worse/.test(await p.textContent('#trend')), await p.textContent('#trend'));
  await ctx.close();

  console.log('\n  in Russian');
  ({ ctx, p } = await app(b, [412, 915], 'ru'));
  await p.evaluate(() => selectEquip('TK151')); await p.waitForTimeout(400);
  const ru = await p.textContent('#trend');
  ok('the trend is translated', /ухудшается/.test(ru), ru);
  ok('no English left', !/getting worse|Last \d+ rounds/.test(ru), ru);
  await ctx.close();

  console.log('\ntablet');
  for (const [name, vp] of [['portrait', [834, 1112, false]], ['landscape', [1194, 834, false]]]) {
    ({ ctx, p } = await app(b, vp));
    ok(`iPad ${name}: no tab bar`, !(await vis(p, '#tabbar')));
    /* All four, and the ORDER is the DOM's, not the tab bar's — the due pane
       is written after System in the markup and placed by the grid. On a
       tablet there is room for everything, so nothing is behind a tab. */
    ok(`iPad ${name}: every pane at once`,
      (await pane(p)).slice().sort().join() ===
        ['paneCapture','paneDue','paneQueue','paneSystem'].join(),
      JSON.stringify(await pane(p)));
    ok(`iPad ${name}: two columns`, await p.evaluate(() => {
      const a = document.getElementById('cardInspection').getBoundingClientRect();
      const q = document.getElementById('pending').getBoundingClientRect();
      return q.left > a.right - 2; }));
    ok(`iPad ${name}: no sideways scroll`, !(await overflows(p)));
    // The F5 complaint was 150-character lines. Roughly 80 characters at 16 px is
    // about 640 px of text, so cap the form column near that and well under half
    // the screen — the point is that it stopped stretching to fit.
    ok(`iPad ${name}: the column is capped, not stretched`, await p.evaluate(() => {
      const w = document.getElementById('cardInspection').getBoundingClientRect().width;
      return w < 700 && w < innerWidth * 0.62; }),
      String(await p.evaluate(() => Math.round(document.getElementById('cardInspection').getBoundingClientRect().width))));
    await ctx.close();
  }

  /* ---- nothing may make the page wider than the phone --------------------
     This is the check that would have caught the floating tab bar, and it is
     worth stating what the failure actually was because it is not obvious.

     A chip row was given overflow-x:auto but left as a flex item of .posnav,
     where min-width defaults to auto — so it refused to shrink below its
     content and grew to 1042 px inside a 412 px screen. The DOCUMENT widened to
     match. iOS then zooms out to fit the document, which makes the LAYOUT
     viewport 1074x2386, and everything pinned to bottom:0 goes to the bottom of
     THAT — which on a real screen is up the middle of the page, with content
     visible below it. It looks like a broken tab bar; it is a horizontal
     overflow three cards away.

     So: every round, no sideways overflow, and innerWidth must still be the
     phone's width. The second half matters — a page can avoid a scrollbar by
     being zoomed out, which is the failure, not the fix. */
  console.log('\nno round makes the page wider than the phone');
  ({ ctx, p } = await app(b, [412, 915]));
  for (const [ty, unit] of [['MP','TK146'], ['UC','DZ010'], ['TB','TK146'],
                            ['GET','LD004'], ['INSP','TK146'], ['TEMP','TK146']]) {
    await p.evaluate(x => { const s = document.getElementById('typeSel');
      s.value = x; s.dispatchEvent(new Event('change')); }, ty);
    await p.waitForTimeout(200);
    await p.evaluate(u => selectEquip(u), unit);
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const de = document.documentElement;
      const t = document.getElementById('tabbar').getBoundingClientRect();
      const wide = [];
      document.querySelectorAll('*').forEach(el => {
        const q = el.getBoundingClientRect();
        if (q.width > de.clientWidth + 2 && q.height > 0)
          wide.push((el.id || el.className || el.tagName).toString().slice(0, 28));
      });
      return { over: de.scrollWidth - de.clientWidth, innerW: innerWidth,
               pinned: Math.abs(t.bottom - innerHeight) < 2, wide: wide.slice(0, 4) };
    });
    ok(ty + ': nothing overflows sideways', r.over === 0 && r.innerW === 412,
      r.over ? 'over by ' + r.over + ' px — ' + r.wide.join(', ') : 'innerWidth ' + r.innerW);
    ok(ty + ': so the tab bar is at the bottom of the screen', r.pinned);
  }
  await ctx.close();

  /* ---- the bottom chrome stays at the bottom of what you can SEE --------
     Reported from the pit twice: the tab bar and Save floating up the page with
     content below them. position:fixed is measured against the LAYOUT viewport,
     and on iOS the visual viewport is a different thing — pinch zoom, the
     keyboard, Safari's collapsing bars, a web view that is not full height. The
     CSS was doing exactly what it was told; what was missing was the gap
     between the two. Not reproducible in this browser, where the two always
     agree, so the divergence is simulated. */
  console.log('\nthe bottom bar follows the visible viewport, not the layout one');
  ({ ctx, p } = await app(b, [440, 956]));
  await p.evaluate(() => selectEquip('TK146'));
  await p.waitForTimeout(300);
  ok('with the two viewports agreeing, nothing moves', await p.evaluate(() => {
    const t = document.getElementById('tabbar').getBoundingClientRect();
    return getComputedStyle(document.documentElement).getPropertyValue('--vvb').trim() === '0px'
        && Math.abs(t.bottom - window.innerHeight) < 2;
  }));
  const moved = await p.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height',
      { get: () => window.innerHeight - 260, configurable: true });
    window.visualViewport.dispatchEvent(new Event('resize'));
    const t = document.getElementById('tabbar').getBoundingClientRect();
    const s = document.getElementById('saveBtn').getBoundingClientRect();
    return { tab: Math.round(t.bottom), visible: Math.round(window.visualViewport.height),
             saveAbove: s.bottom < t.top + 1 };
  });
  ok('when 260 px of it goes away, the tab bar comes with it',
    Math.abs(moved.tab - moved.visible) < 2, 'bar bottom ' + moved.tab + ', visible bottom ' + moved.visible);
  ok('and Save is still above it, not under it', moved.saveAbove);
  await ctx.close();

  console.log('\nphone, turned sideways mid-inspection');
  ({ ctx, p } = await app(b, [412, 915]));
  await p.evaluate(() => selectEquip('TK146'));
  await p.fill('#inspector', 'R. Marrero');
  await p.evaluate(() => { const k = items()[0].k; saveCur(); curItem = k; loadPos(); renderChips(); });
  await p.evaluate(() => document.querySelector('#gradeSeg [data-g="2"]').click());
  await p.evaluate(() => { draft.positions[curItem].comment = 'typed sideways'; });
  await p.setViewportSize({ width: 844, height: 390 });
  await p.waitForTimeout(400);
  ok('nothing was lost turning it', await p.evaluate(() =>
    curEquip === 'TK146' && document.getElementById('inspector').value === 'R. Marrero' &&
    Object.values(draft.positions).some(x => x.comment === 'typed sideways')));
  ok('the tab bar is still there — this is a phone, not a tablet', await vis(p, '#tabbar'));
  ok('still one pane at a time', JSON.stringify(await pane(p)) === '["paneCapture"]', JSON.stringify(await pane(p)));
  ok('the two halves of the form sit side by side', await p.evaluate(() => {
    const a = document.getElementById('cardInspection').getBoundingClientRect();
    const c = document.getElementById('cardComponent').getBoundingClientRect();
    return c.left > a.right - 2; }));
  ok('Save is reachable without hunting', await p.evaluate(() => {
    const r = document.getElementById('saveBtn').getBoundingClientRect();
    return r.width > 0 && r.top < 900; }));
  ok('no sideways scroll', !(await overflows(p)));
  /* Two rules that pull against each other, so they are checked together: the
     header must not eat a landscape screen, and its controls must still be big
     enough for a glove. 44 px of control plus its border is 46, which makes ~51
     the floor — anything under that is a tap target that was quietly shrunk to
     make the number look better, which is the trade this pair exists to catch. */
  const hdr = await p.evaluate(() => {
    const h = document.querySelector('header');
    return { h: Math.round(h.getBoundingClientRect().height),
             ctl: [...h.children].filter(e => e.className !== 't')
                    .map(e => Math.round(e.getBoundingClientRect().height)) };
  });
  ok('the header gave up its height', hdr.h <= 54, String(hdr.h));
  ok('and not by shrinking anything a thumb has to hit',
    hdr.ctl.length > 0 && hdr.ctl.every(v => v >= 44), hdr.ctl.join(' / '));
  await p.setViewportSize({ width: 412, height: 915 });
  await p.waitForTimeout(300);
  ok('and turning it back loses nothing either', await p.evaluate(() =>
    curEquip === 'TK146' && Object.values(draft.positions).some(x => x.comment === 'typed sideways')));
  ok('back to one column', await p.evaluate(() => {
    const a = document.getElementById('cardInspection').getBoundingClientRect();
    const c = document.getElementById('cardComponent').getBoundingClientRect();
    return c.top > a.bottom - 2; }));
  ok('no sideways scroll in portrait either', !(await overflows(p)));
  await ctx.close();

  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
