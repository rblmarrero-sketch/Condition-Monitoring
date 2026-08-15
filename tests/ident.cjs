/* Phase 0 — stable identity on the wire.

   The phone has always issued every round an id at save and kept it across
   edits. It just never wrote it down: the sidecar that goes to Drive carried
   equip, date, type and nothing that identifies the record itself. Everything
   downstream therefore keyed on equip|date|type, which is neither unique — two
   phones on one unit on one day is the exact clash the conflict machinery
   exists for — nor stable, since correcting a mistyped date silently makes it
   a different record.

   Nothing here changes a file name. recKey stays the storage key because the
   sidecars, the photographs, the correction markers and the script's delete
   matcher are all named after it, and a person reads it in the Drive folder.
   The id rides alongside as the thing that answers "is this the same round?" */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const settled = async p => {
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(400);
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

  console.log('  a round is issued an identity at save');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(400);
  await p.fill('#inspector', 'R. Marrero');
  await p.fill('#smu', '6100');
  await p.evaluate(() => {
    const k = items()[0].k; curItem = k; loadPos();
    const pp = curP(); pp.grade = 'C'; pp.sev = 'DEG'; pp.defect = 'DT14-03';
    pp.cause = 'CA-WEAR'; pp.action = 'RA-04'; pp.prio = 'P2'; saveCur();
  });
  await p.click('#saveBtn'); await p.waitForTimeout(700); await dismiss(p);

  const first = await p.evaluate(async () => {
    const r = (await dbAll()).filter(x => x.equip === 'TK151' && x.type === 'MP')
      .sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
    return { id: r.id, rev: r.rev, exp: recToExport(r) };
  });
  ok('the stored round has an id', !!first.id, first.id);
  ok('and a revision', first.rev >= 1, String(first.rev));
  ok('the exported record carries the id', first.exp.id === first.id, first.exp.id);
  ok('and the revision', first.exp.rev === first.rev, String(first.exp.rev));

  console.log('\n  entries.json — the file the dashboard reads');
  const ent = await p.evaluate(async () => {
    const { files } = await buildPackage();
    const f = files.find(x => x.name === 'entries.json');
    const j = JSON.parse(new TextDecoder().decode(f.data));
    const r = (j.records || []).find(x => x.equip === 'TK151' && x.type === 'MP');
    return { has: !!r, id: r && r.id, rev: r && r.rev, keys: r && Object.keys(r).slice(0, 4) };
  }).catch(e => ({ err: String(e) }));
  ok('the sidecar carries the id, which it never used to', !ent.err && !!ent.id, ent.err || String(ent.id));
  ok('and the revision', !ent.err && ent.rev >= 1, String(ent.rev));

  console.log('\n  an edit keeps the identity and moves the revision');
  await p.evaluate(async id => { editRecord(await dbGet(id)); }, first.id);
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const k = items()[0].k; saveCur(); curItem = k; loadPos();
    const e = document.getElementById('comment'); e.value = 'corrected'; e.dispatchEvent(new Event('input', { bubbles: true }));
    saveCur();
  });
  await p.click('#saveBtn'); await p.waitForTimeout(700); await dismiss(p);
  const after = await p.evaluate(async id => {
    const r = await dbGet(id);
    const all = (await dbAll()).filter(x => x.equip === 'TK151' && x.type === 'MP');
    return { found: !!r, id: r && r.id, rev: r && r.rev, n: all.length };
  }, first.id);
  ok('the id is the same round it always was', after.found && after.id === first.id, String(after.id));
  ok('the revision went up', after.rev === first.rev + 1, first.rev + ' → ' + after.rev);
  ok('and no second record was created', after.n === 1, String(after.n));

  console.log('\n  the dashboard can tell one round from another');
  const dash = await ctx.newPage();
  dash.on('pageerror', e => fails.push('DASH ' + e.message));
  await dash.setViewportSize({ width: 1440, height: 960 });
  await dash.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await dash.waitForTimeout(1600);

  const shape = await dash.evaluate(() => ({
    hasId: typeof recId === 'function', hasRev: typeof recRev === 'function',
    keyUnchanged: recKey({ equip: 'TK151', date: '2026-08-02', type: 'MP' }) === 'TK151|2026-08-02|MP',
  }));
  ok('the storage key is untouched — no file has to be renamed', shape.keyUnchanged);
  ok('and the identity is available beside it', shape.hasId && shape.hasRev);

  /* Two situations that used to look identical and are not.

     One phone sending a round twice is a CORRECTION: same id, higher rev, and
     the later one is simply right. Two phones sending the same unit on the
     same day is a CLASH: two ids, and only a person can say which stands. */
  const c2 = await dash.evaluate(() => {
    const mk = (dev, rev, id, by) => ({ id, rev, equip: 'DZ099', date: '2026-08-02', type: 'MP',
      cls: 'DOZ', dev, by, items: [{ key: '4C', label: 'x', grade: 'C', sev: 'DEG' }] });
    window.CMDash.setDriveRecords([
      mk('PH-01', 1, 'MP__DZ099__2026-08-02__PH-01__1', 'A. First'),
      mk('PH-01', 2, 'MP__DZ099__2026-08-02__PH-01__1', 'A. First'),
    ], { replace: true });
    const r = window.CMDash.allRecs().find(x => x.equip === 'DZ099');
    return { rev: r && r.rev, conflict: !!(r && r._conflict), n: (r && r._rivals || []).length };
  });
  ok('one phone sending twice shows the corrected revision', c2.rev === 2, 'rev ' + c2.rev);
  ok('and it is not called a conflict, because it is not one', c2.conflict === false);
  ok('with nothing left over to ask about', c2.n === 0, c2.n + ' rival(s)');

  const clash = await dash.evaluate(() => {
    const mk = (dev, rev, id, by) => ({ id, rev, equip: 'DZ098', date: '2026-08-02', type: 'MP',
      cls: 'DOZ', dev, by, items: [{ key: '4C', label: 'x', grade: 'C', sev: 'DEG' }] });
    window.CMDash.setDriveRecords([
      mk('PH-01', 1, 'MP__DZ098__2026-08-02__PH-01__1', 'A. First'),
      mk('PH-01', 2, 'MP__DZ098__2026-08-02__PH-01__1', 'A. First'),   // corrected
      mk('PH-02', 1, 'MP__DZ098__2026-08-02__PH-02__9', 'B. Second'),  // another phone
    ], { replace: true });
    const r = window.CMDash.allRecs().find(x => x.equip === 'DZ098');
    return { conflict: !!(r && r._conflict), n: (r && r._rivals || []).length,
      devs: (r && r._devs || []) };
  });
  ok('a second phone still raises a real conflict', clash.conflict === true);
  ok('and the panel is asked about two devices, not three copies',
    clash.n === 1 && clash.devs.length === 2, clash.n + ' rival, devices ' + clash.devs.join('+'));

  console.log('\n  and it reaches the CSV a planner hands to 1C');
  await dash.evaluate(() => showTab('actions'));
  await dash.waitForTimeout(400);
  const [dl] = await Promise.all([
    dash.waitForEvent('download', { timeout: 30000 }),
    dash.evaluate(() => document.getElementById('csvBtn').click()),
  ]);
  const out = '/tmp/claude-0/-home-user-Condition-Monitoring/1f3ebdba-c3da-5675-b557-e45dfee4b57e/scratchpad/ident.csv';
  await dl.saveAs(out);
  const csv = require('fs').readFileSync(out, 'utf8');
  // the file leads with a BOM so Excel opens UTF-8 correctly — not part of the header
  const head = csv.replace(/^\ufeff/, '').split('\r\n')[0].split(',').map(x => x.replace(/^"|"$/g, ''));
  const rows = csv.replace(/^\ufeff/, '').split('\r\n').slice(1).filter(Boolean).map(l => l.split(',').map(x => x.replace(/^"|"$/g, '')));
  ok('the CSV leads with the record id', head[0] === 'RecordId' && head[1] === 'Rev', head.slice(0, 4).join(' '));
  ok('every row is as wide as the header', rows.every(r => r.length === head.length),
    head.length + ' vs ' + [...new Set(rows.map(r => r.length))].join('/'));
  const dz = rows.find(r => /^DZ09/.test(r[head.indexOf('Unit')] || ''));
  ok('and the id is filled in, not blank', dz && /PH-0/.test(dz[0]), dz && dz[0]);

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
