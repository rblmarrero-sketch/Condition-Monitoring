/* What happened about it, and why it happened at all.

   The register listed eighty-two things that needed work and stopped. Nobody
   owned any of them, none had a date, and there was no state — so the only
   question a weekly reliability meeting actually asks, "of what we found, what
   got done?", had no answer anywhere in the system. A list that cannot answer
   that stops being read, and once it stops being read the rounds stop being
   walked, because nothing visibly follows from them.

   And separately: the inspection codes a DIRECT cause — "seal worn" — which is
   what the inspector could see. It is not the reason the seal wore. Without
   somewhere to write the reason behind the reason, a fleet replaces the same
   part for ever and calls it maintenance.

   Guarded here:
     · owner, due date and state ride the correction sidecar, attributed, so
       they sync through a path that already exists and nothing new is deployed
     · overdue means past the date AND still open — a job finished late is
       finished, and permanent red teaches people to ignore red
     · the tracker's arithmetic matches the rows it is counting
     · the five whys keep their order and drop trailing blanks
     · the direct cause is shown, never re-asked — retyping a coded taxonomy
       from an office is how it fills with near-duplicates
     · all of it reaches the CSV, because that is where planning reads
*/
const { chromium } = require(require('./pw.cjs'));
const B = process.env.CMPORT ? 'http://127.0.0.1:'+process.env.CMPORT : 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

const iso = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

/* Four findings that need work, on three machines. */
const RECS = [
  { equip: 'TK801', date: '2026-05-02', type: 'MP', cls: 'HT', by: 'R. Marrero',
    items: [{ key: '4C', label: 'LR Final Drive', grade: 'X', defect: 'Ferrous debris — heavy',
              defectCode: 'DT14-03', cause: 'Gear wear', causeCode: 'CS7-01',
              action: 'REP', actionLabel: 'Repair now' }] },
  { equip: 'TK802', date: '2026-06-11', type: 'MP', cls: 'HT', by: 'R. Marrero',
    items: [{ key: '4C', label: 'LR Final Drive', grade: 'C', defect: 'External leakage — oil',
              defectCode: 'DT1-05', cause: 'Seal worn', action: 'SCH', actionLabel: 'Schedule repair' }] },
  { equip: 'TK803', date: '2026-07-01', type: 'MP', cls: 'HT', by: 'B. Ivanov',
    items: [{ key: '4C', label: 'LR Final Drive', grade: 'C', defect: 'Cut / gouge',
              defectCode: 'DT8-02', cause: 'Poor roads', action: 'SCH', actionLabel: 'Schedule repair' },
            { key: '4D', label: 'RR Final Drive', grade: 'X', defect: 'Overheating',
              defectCode: 'DT3-01', cause: 'Blocked cooler', action: 'REP', actionLabel: 'Repair now' }] },
];

const kpis = () => [...document.querySelectorAll('#actKpis .kpi')]
  .map(k => k.querySelector('.k').textContent + '=' + k.querySelector('.v').textContent);
/* The register is a grouped worklist now, not a table: one block per machine,
   and the row itself is the button. A row carries its unit in the block header
   above it, so a row's text is joined with its group's for matching. */
const rowsOf = () => [...document.querySelectorAll('#actionTbl .wlu')].flatMap(u => {
  const head = (u.querySelector('.wlh') || {}).innerText || '';
  return [...u.querySelectorAll('.wlr')].map(r => ({
    txt: (head + ' ' + r.innerText).replace(/\s+/g, ' ').trim(),
    over: !!r.querySelector('.due.late') }));
});

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(700);
  await p.evaluate(recs => {
    window.__writes = [];
    CMDrive.configured = () => true;
    CMDrive.saveEdit = d => { window.__writes.push(d); return Promise.resolve({ ok: true }); };
    localStorage.setItem('cm_drive_url', 'https://stub/exec');
    localStorage.removeItem('cm_dash_who');
    CMDash.importRecords(recs);
    document.getElementById('dataOv').classList.add('hidden');
    /* The page ships with bundled demo data. Without narrowing to this
       fixture the tracker counts sixty-eight findings and "the first row" is
       somebody else's machine — the first run of this suite planned work
       against a bundled record and then looked for it on TK801. */
    const q = document.getElementById('fQ'); q.value = 'TK80';
    q.dispatchEvent(new Event('input'));
    (actView='unit', renderActions(), showTab('actions'));
  }, RECS);
  await p.waitForTimeout(900);

  console.log('a list of findings, none of them owned');
  let k = await p.evaluate(kpis);
  note('tracker', k.join('  '));
  ok('it counts what is still open', /STILL OPEN=4/.test(k.join(' ')), k[0]);
  /* The card strip gained a Needs triage headline ahead of the unowned count:
     an exception nobody can plan is worse news than an exception nobody owns,
     and owner is only one of the four things it can be missing. Both numbers
     are still there — this reads whichever card carries the unowned figure
     rather than the slot it happens to sit in. */
  /* The label, from the app: it has been "NOBODY OWNS IT" and is now
     "Unassigned actions"; what must hold is the count under the app's word. */
  const unLbl = await p.evaluate(() => I18N.en.a_k_unowned);
  const unRe = n => new RegExp(unLbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=' + n, 'i');
  ok('and says how many have nobody against them', unRe(4).test(k.join(' ')), k.join(' | '));
  /* The label, from the app. This matched the literal "NEEDS TRIAGE" — a
     hospital word on a screen shared by a reliability engineer, a planner and a
     fitter, none of whom use it. What must be true is that the count of
     findings nobody can act on yet is on the strip, under whatever name the app
     has settled on. */
  const planLbl = (await p.evaluate(() => I18N.en.a_k_triage)).toUpperCase();
  ok('and how many cannot be planned at all yet',
     new RegExp(planLbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=4', 'i').test(k.join(' ')),
     k.join(' | '));
  ok('nothing is overdue before anything has a date',
     /OVERDUE=0/.test(k.join(' ')), k[1]);
  ok('the oldest open finding is aged from the day it was found',
     /OLDEST OPEN=\d+ d/.test(k.join(' ')), k[3]);

  console.log('\nthe plan gets an owner and a date');
  const planBtn = async unit => {
    const sel = await p.evaluateHandle(u => {
      const blk = [...document.querySelectorAll('#actionTbl .wlu')]
        .find(x => (x.querySelector('.wlh') || {}).innerText.indexOf(u) >= 0);
      return blk && blk.querySelector('.wlr[data-fu]');
    }, unit);
    const el = sel.asElement();
    if (!el) throw new Error('no Plan button on a row for ' + unit);
    await el.click();
  };
  await planBtn('TK801');
  await p.waitForTimeout(300);
  ok('the panel opens on the finding that was clicked',
     /TK801/.test(await p.evaluate(() => $('follTitle').textContent)),
     await p.evaluate(() => $('follTitle').textContent));
  ok('and shows the direct cause the inspection already coded, to be read not retyped',
     /Gear wear/.test(await p.evaluate(() => $('follDirect').textContent)),
     await p.evaluate(() => $('follDirect').textContent));
  ok('the five whys are offered', (await p.evaluate(() =>
     document.querySelectorAll('#follWhys input').length)) === 5);

  await p.fill('#follOwner', 'A. Sokolov');
  await p.fill('#follDue', iso(-3));                 // three days ago: overdue
  await p.selectOption('#follStatus', 'WIP');
  await p.fill('#follPlan', 'Drain, cut the filter, change the final drive oil');
  await p.fill('#follWhy0', 'The gear teeth are spalling');
  await p.fill('#follWhy1', 'The oil was contaminated');
  await p.fill('#follWhy2', 'The breather was blocked with mud');
  await p.fill('#follRoot', 'Breather is not on the wash-down checklist');
  await p.fill('#follCorr', 'Replace the final drive on TK801');
  await p.fill('#follPrev', 'Add breather to the wash-down card for all 44 trucks');

  console.log('\nit will not save without a name against it');
  await p.click('#follSave'); await p.waitForTimeout(300);
  ok('an unsigned plan is refused',
     !!(await p.evaluate(() => $('follMsg').textContent)).trim() &&
     (await p.evaluate(() => !$('follOv').classList.contains('hidden'))),
     await p.evaluate(() => $('follMsg').textContent));

  await p.fill('#follBy', 'V. Petrov');
  await p.click('#follSave'); await p.waitForTimeout(900);

  console.log('\nand then it is a plan');
  const w = await p.evaluate(() => window.__writes.slice(-1)[0]);
  ok('one correction was written, attributed', w && w.by === 'V. Petrov', w && w.by);
  const it = w && w.items && w.items['4C'];
  ok('carrying the owner', it && it.owner === 'A. Sokolov', it && it.owner);
  ok('the due date', it && it.due === iso(-3), it && it.due);
  ok('the state', it && it.status === 'WIP', it && it.status);
  ok('the whys, in order', it && Array.isArray(it.whys) && it.whys.length === 3 &&
     /spalling/.test(it.whys[0]) && /breather/i.test(it.whys[2]), JSON.stringify(it && it.whys));
  ok('trailing blanks are dropped rather than stored as empty whys',
     it && it.whys.length === 3, it && it.whys.length);
  ok('the root cause', it && /wash-down/.test(it.root || ''), it && it.root);
  ok('corrective and preventive kept apart',
     it && /TK801/.test(it.corrective || '') && /44 trucks/.test(it.preventive || ''));
  ok('and a flag the register can read without unpacking it', it && it.rca === 1);
  note('stored', JSON.stringify({ owner: it.owner, due: it.due, status: it.status, rca: it.rca }));

  console.log('\nthe tracker moves');
  await p.waitForTimeout(400);
  k = await p.evaluate(kpis);
  note('tracker', k.join('  '));
  ok('the overdue count picks it up', /OVERDUE=1/.test(k.join(' ')), k[1]);
  ok('and the unowned count drops', unRe(3).test(k.join(' ')), k.join(' | '));
  /* The single green nub became a bar segmented by state, because "planned"
     and "nobody has looked at it" are different kinds of not-done and one bar
     hid which of them you had. */
  const bar = await p.evaluate(() => ({
    segs: [...document.querySelectorAll('#actBar .segbar i')].map(i => i.className),
    key: (document.querySelector('#actBar .segkey') || {}).innerText || '' }));
  ok('a bar says how much is closed out', bar.segs.length > 0, bar.segs.join(' '));
  ok('and breaks not-done into its real states',
     bar.segs.some(c => /s-open/.test(c)) && /%/.test(bar.key), bar.key.replace(/\s+/g, ' ').slice(0, 90));

  console.log('\nthe row shows it, and shows it is late');
  let rows = await p.evaluate(rowsOf);
  const r801 = rows.find(x => /TK801/.test(x.txt));
  ok('the owner is on the row', /A\. Sokolov/.test(r801.txt));
  ok('so is the state', /In progress/i.test(r801.txt), r801.txt.slice(0, 100));
  ok('the row is marked overdue', r801.over === true);
  ok('and the RCA is flagged', /RCA/.test(r801.txt));

  console.log('\nfinishing it stops it being late');
  await planBtn('TK801'); await p.waitForTimeout(300);
  await p.selectOption('#follStatus', 'DONE');
  await p.click('#follSave'); await p.waitForTimeout(900);
  k = await p.evaluate(kpis);
  ok('a job finished late is not still overdue', /OVERDUE=0/.test(k.join(' ')), k[1]);
  ok('and it counts as closed out', /CLOSED OUT=1/.test(k.join(' ')), k[4]);
  ok('the open count drops', /STILL OPEN=3/.test(k.join(' ')), k[0]);

  console.log('\nthe filter follows the work');
  await p.click('#aSeg [data-af="open"]'); await p.waitForTimeout(400);
  rows = await p.evaluate(rowsOf);
  ok('a closed finding leaves the open list', !rows.some(x => /TK801/.test(x.txt)),
     rows.length + ' row(s)');
  await p.click('#aSeg [data-af="all"]'); await p.waitForTimeout(400);
  rows = await p.evaluate(rowsOf);
  ok('and is still there under Everything', rows.some(x => /TK801/.test(x.txt)),
     rows.length + ' row(s)');

  console.log('\nplanning reads the CSV, so the plan has to be in it');
  const csv = await p.evaluate(() => {
    let out = '';
    const rc = URL.createObjectURL, rk = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = b => { out = b; return 'blob:stub'; };
    HTMLAnchorElement.prototype.click = function () {};
    document.getElementById('csvBtn').click();
    URL.createObjectURL = rc; HTMLAnchorElement.prototype.click = rk;
    return out ? out.text() : '';
  });
  [['owner', /Owner/], ['due date', /Due/], ['status', /Status/], ['overdue', /Overdue/],
   ['root cause', /RootCause/], ['the whys', /Why1/], ['corrective', /Corrective/],
   ['preventive', /Preventive/], ['who planned it', /PlanBy/]].forEach(([n, re]) =>
     ok('the CSV has a column for ' + n, re.test(csv)));
  ok('and the values are in the row',
     /A\. Sokolov/.test(csv) && /wash-down/.test(csv) && /spalling/.test(csv),
     (csv.split('\r\n').find(l => /TK801/.test(l)) || '').slice(-140));

  console.log('\nand it survives a reload, because it is a correction like any other');
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const back = await p.evaluate(() => {
    actView='unit'; renderActions(); showTab('actions');
    const q = document.getElementById('fQ'); q.value = 'TK80'; q.dispatchEvent(new Event('input'));
    setAFilt('all');
    return document.getElementById('actionTbl').innerText.replace(/\s+/g, ' ');
  });
  ok('the owner is still there tomorrow', /A\. Sokolov/.test(back));
  ok('so is the state', /Done/i.test(back));

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
