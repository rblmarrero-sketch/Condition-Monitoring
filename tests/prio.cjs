/* The 1C stoppage priority — P1 Breakdown / P2 Defect / P3 PM / P4 Planned
   Repair. A planner raising the work request needs it on the finding, in the
   same words 1C uses, from whichever end they are looking at. Follow one from
   the picker on the phone through the file, the register, the CSV and the
   printed page. */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs');
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const settled = async p => {
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(400);
};
const setType = async (p, ty) => {
  await p.evaluate(t => { const s = document.getElementById('typeSel'); s.value = t; s.dispatchEvent(new Event('change')); }, ty);
  await p.waitForTimeout(300);
};
const dismiss = async p => { for (let i = 0; i < 3; i++) {
  if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgOk'); await p.waitForTimeout(250); } else break; } };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(p);

  console.log('  the four 1C priorities, exactly as the planners see them');
  const list = await p.evaluate(() => PRIORITIES.map(x => [x.k, x.en, x.ru]));
  ok('there are four', list.length === 4, list.map(x => x[0]).join(','));
  ok('P1 is the breakdown', list[0][1] === 'P1 Breakdown' && /авари/.test(list[0][2]), list[0][2]);
  ok('P2 is the defect', list[1][1] === 'P2 Defect' && /неисправност/.test(list[1][2]), list[1][2]);
  ok('P3 is the PM', list[2][1] === 'P3 PM' && /ППТО/.test(list[2][2]), list[2][2]);
  ok('P4 is the planned repair', list[3][1] === 'P4 Planned Repair' && /плановый/.test(list[3][2]), list[3][2]);

  console.log('\n  the field only exists once there is a job to raise');
  await setType(p, 'MP');
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(400);
  const hiddenAtFirst = await p.evaluate(() => document.getElementById('prioFld').classList.contains('hidden'));
  ok('nothing to raise, nothing to prioritise', hiddenAtFirst);

  // grade it, choose an action through the picker exactly as a thumb would
  await p.evaluate(() => document.querySelector('#gradeSeg [data-g="X"]').click());
  await p.waitForTimeout(250);
  await p.click('#actionBtn');
  await p.waitForTimeout(350);
  const picked = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#pickList [data-k]')].filter(r => r.dataset.k);
    rows[0].click(); return rows[0].dataset.k;
  });
  await p.waitForTimeout(350);
  const afterAction = await p.evaluate(() => ({
    shown: !document.getElementById('prioFld').classList.contains('hidden'),
    btn: document.getElementById('prioBtn').textContent,
    prio: (draft.positions[curItem] || {}).prio || '',
    sev: effSev(draft.positions[curItem] || {}),
  }));
  ok('choosing an action reveals the priority', afterAction.shown, picked);
  ok('and a critical finding is suggested as P1', afterAction.prio === 'P1', afterAction.prio + ' for ' + afterAction.sev);
  ok('the button says so, it is not a blank control', /P1/.test(afterAction.btn), afterAction.btn);

  console.log('\n  the picker leads with the one that fits');
  await p.click('#prioBtn');
  await p.waitForTimeout(350);
  const opts = await p.evaluate(() => [...document.querySelectorAll('#pickList [data-k]')].map(r => r.dataset.k));
  ok('all four are offered, plus "not set"', opts.filter(Boolean).length === 4 && opts.includes(''), opts.join('|'));
  ok('the suggested one is first', opts.filter(Boolean)[0] === 'P1', opts.join('|'));
  // override it — the person standing there decides, not the matrix
  await p.evaluate(() => { const r = [...document.querySelectorAll('#pickList [data-k]')].find(x => x.dataset.k === 'P3'); r.click(); });
  await p.waitForTimeout(300);
  const over = await p.evaluate(() => ({ prio: (draft.positions[curItem] || {}).prio, btn: document.getElementById('prioBtn').textContent }));
  ok('an override sticks', over.prio === 'P3', over.prio);
  ok('and shows', /P3/.test(over.btn), over.btn);

  console.log('\n  clearing the action clears the priority with it');
  const key = await p.evaluate(() => curItem);
  await p.click('#actionBtn'); await p.waitForTimeout(300);
  await p.evaluate(() => { const r = [...document.querySelectorAll('#pickList [data-k]')].find(x => x.dataset.k === ''); r.click(); });
  await p.waitForTimeout(300);
  const cleared = await p.evaluate(() => ({
    prio: (draft.positions[curItem] || {}).prio,
    hidden: document.getElementById('prioFld').classList.contains('hidden') }));
  ok('no action, no priority left behind', !cleared.prio, String(cleared.prio));
  ok('and the field goes away again', cleared.hidden);

  console.log('\n  a saved round carries it, and gives it back on a reopen');
  await p.evaluate(k => {
    curItem = k; loadPos();
    const pp = draft.positions[k] || (draft.positions[k] = {});
    pp.grade = 'X'; pp.sev = 'CRI'; pp.defect = 'DT14-03'; pp.cause = 'CA-WEAR';
    pp.action = 'REP'; pp.prio = 'P2'; pp.wo = 'WR-9001';
    saveCur();
  }, key);
  await p.fill('#inspector', 'R. Marrero');
  await p.fill('#smu', '12345');
  await p.click('#saveBtn'); await p.waitForTimeout(600); await dismiss(p);

  const stored = await p.evaluate(async k => {
    const all = await dbAll();
    const rec = all.filter(r => r.equip === 'TK151' && r.type === 'MP')
      .sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
    return rec ? { id: rec.id, prio: (rec.positions[k] || {}).prio } : null;
  }, key);
  ok('the record holds the code', stored && stored.prio === 'P2', stored && stored.prio);

  await p.evaluate(async id => { const r = await dbGet(id); editRecord(r); }, stored.id);
  await p.waitForTimeout(500);
  const reopened = await p.evaluate(k => {
    saveCur(); curItem = k; loadPos();
    return { prio: (draft.positions[k] || {}).prio, btn: document.getElementById('prioBtn').textContent,
      shown: !document.getElementById('prioFld').classList.contains('hidden') };
  }, key);
  ok('a reopen brings it back in the draft', reopened.prio === 'P2', reopened.prio);
  ok('and in the control, not blank', /P2/.test(reopened.btn) && reopened.shown, reopened.btn);

  console.log('\n  the file the dashboard reads');
  const ex = await p.evaluate(async () => {
    const all = (await dbAll()).filter(r => r.equip === 'TK151' && r.type === 'MP');
    return { rec: recToExport(all[all.length - 1]) };
  });
  const exIt = (ex.rec.items || []).find(i => i.key === key) || {};
  ok('the exported item carries the code', exIt.prio === 'P2', exIt.prio);
  ok('and the words a planner reads', exIt.prioLabel === 'P2 Defect', exIt.prioLabel);

  console.log('\n  the printed page tags it');
  const html = await p.evaluate(async () => (await buildReportSections()).map(s => s.html).join('\n'));
  ok('the page shows the priority tag', /class="prio"/.test(html) && />P2</.test(html));

  console.log('\n  the dashboard, same vocabulary');
  const dash = await ctx.newPage();
  dash.on('pageerror', e => fails.push('DASH ' + e.message));
  await dash.setViewportSize({ width: 1440, height: 960 });
  await dash.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await dash.waitForTimeout(1800);
  await dash.evaluate(r => window.CMDash.importRecords([r]), ex.rec);
  await dash.waitForTimeout(900);

  /* The register is a grouped worklist now, not a table, so the old check —
     "is there a <th> called Priority" — describes a structure that no longer
     exists. What has to stay true is unchanged and is what this asks: a planner
     scanning the register can see the 1C stoppage priority on the row, in their
     own language. The redesign dropped it for space and this caught it. */
  const reg = await dash.evaluate(() => {
    showTab('actions');
    /* Any row's chip, not the first row's. The register is sorted worst-first
       now, so which row leads depends on the fixture's severities — and the
       guarantee this file is about is "a planner scanning the register sees
       the 1C priority on the row", not "on row one". */
    const chip = document.querySelector('#actionTbl [data-fu] .prio');
    return { rows: document.querySelectorAll('#actionTbl [data-fu]').length,
             chip: chip ? chip.textContent.trim() : null,
             title: chip ? chip.getAttribute('title') : null };
  });
  ok('the register has rows', reg.rows > 0, reg.rows + '');
  ok('the 1C priority is on the row', reg.chip === 'P2', String(reg.chip));
  ok('and names itself in full on hover', /\w/.test(reg.title || ''), String(reg.title));

  await dash.click('button[data-lang="ru"]'); await dash.waitForTimeout(600);
  const ruT = await dash.evaluate(() => {
    const c = document.querySelector('#actionTbl [data-fu] .prio');
    return c ? c.getAttribute('title') : ''; });
  ok('Russian names it too', /[А-Яа-я]/.test(ruT || ''), String(ruT));
  await dash.click('button[data-lang="en"]'); await dash.waitForTimeout(600);

  console.log('\n  the CSV a planner pastes into 1C');
  const [dl] = await Promise.all([
    dash.waitForEvent('download', { timeout: 30000 }),
    dash.evaluate(() => document.getElementById('csvBtn').click()),
  ]);
  const out = '/tmp/claude-0/-home-user-Condition-Monitoring/1f3ebdba-c3da-5675-b557-e45dfee4b57e/scratchpad/prio.csv';
  await dl.saveAs(out);
  const csv = fs.readFileSync(out, 'utf8');
  const head = csv.split('\r\n')[0].split(',').map(s => s.replace(/^"|"$/g, ''));
  const row = csv.split('\r\n')[1].split(',').map(s => s.replace(/^"|"$/g, ''));
  ok('the CSV names both columns', head.includes('Priority') && head.includes('PriorityLabel'), head.join(' '));
  ok('every row has one field per column', head.length === row.length, head.length + ' vs ' + row.length);
  ok('the code is where the header says', row[head.indexOf('Priority')] === 'P2', row[head.indexOf('Priority')]);
  ok('and the label beside it', row[head.indexOf('PriorityLabel')] === 'P2 Defect', row[head.indexOf('PriorityLabel')]);

  console.log('\n  a planner can set one from the dashboard');
  const ed = await dash.evaluate(() => {
    const r = window.CMDash.allRecs().find(x => x.equip === 'TK151');
    openEdit(`${r.equip}|${r.date}|${r.type}`);
    const sel = document.querySelector('#edItems select[data-f="prio"]');
    if (!sel) return { err: 'no priority control' };
    const opts = [...sel.options].map(o => o.value);
    const was = sel.value;
    sel.value = 'P1';
    return { opts, was, now: sel.value, derived: collectEdit() };
  });
  ok('the correction panel offers the four', !ed.err && ed.opts.filter(Boolean).length === 4,
    ed.err || ed.opts.join('|'));
  ok('it opens on what the phone chose', !ed.err && ed.was === 'P2', ed.was);
  ok('a change is collected with its label', !ed.err && ed.derived &&
    Object.values(ed.derived).some(v => v.prio === 'P1' && v.prioLabel === 'P1 Breakdown'),
    JSON.stringify(ed.derived || {}).slice(0, 120));

  console.log('\n  the two ends print the same tag');
  const dashHtml = await dash.evaluate(() => {
    document.getElementById('edClose').click();
    const recs = window.CMReport.recsForScope('unit', 'TK151');
    return CMR.sections({ lang, title: 'x', stamp: new Date(), sevLabel: s => (SEV[s] ? SEV[s].l : s),
      records: window.CMReport.normalise(recs, { photos: false }) }).map(s => s.html).join('\n');
  });
  ok('the dashboard page tags it as well', /class="prio"/.test(dashHtml) && />P2</.test(dashHtml));

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
