/* Reading the folder without walking it.

   Every read used to answer its question by opening the folder and then opening
   every inspection in it. Measured against a season of Baimskaya — 900 rounds,
   2700 photographs — one full read cost 1236 Drive round trips, came back at
   1.6 MB, and was still truncated; the second page cost 634 more. Two round
   trips per record, paid again by every phone, every browser and every refresh.

   The script now keeps an index as rounds arrive, so a read is a read of that.
   This suite proves the three things that makes true, and the two it must not
   break:

     · the phone lists what the team has done without downloading a single round
     · "anything new?" is answered without touching Drive when nothing is
     · opening one round is one request, by an id the row already carries
     · a deployment that has NOT been redeployed still works, unchanged
     · and the summary the script builds is the one the app would have built —
       two copies of "which grade is worst" is two copies that drift
*/
const { chromium } = require(require('./pw.cjs'));
const PORT = process.env.IDXPORT || 8101;          // current script
const OLDPORT = process.env.OLDPORT || 8102;       // the deployment before it
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);
const get = async (port, qs) => {
  const r = await fetch('http://127.0.0.1:' + port + '/exec?' + qs);
  return JSON.parse(await r.text());
};
const settled = async p => {
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForFunction(() => typeof window.WEAR === 'object', null, { timeout: 20000 });
  await p.waitForTimeout(300);
};
const PHONE = o => {
  localStorage.setItem('up_dests', JSON.stringify(
    [{ id: 'gas', name: 'Drive', url: 'http://127.0.0.1:' + o.port + '/exec', sec: '' }]));
};

(async () => {
  /* Both fakes hold their Drive in memory, so a second run would find the
     index this suite built on the first. Start each one from nothing. */
  await fetch('http://127.0.0.1:' + PORT + '/__seed');
  await fetch('http://127.0.0.1:' + OLDPORT + '/__seed');

  const b = await chromium.launch();

  console.log('the script builds its own index, from what is already there');
  {
    const before = await get(PORT, 'action=index&slim=1');
    note('before', JSON.stringify(before).slice(0, 120));
    ok('an unindexed folder says so instead of answering "no rounds"',
       before.needsRebuild === true && (before.rows || []).length === 0);
    /* The one thing a client must never do with that answer is believe it. */
    ok('  and does not claim to be up to date', !before.upToDate);

    let after = 0, calls = 0, done = 0;
    for (;;) { const r = await get(PORT, 'action=index&rebuild=1&after=' + after);
      calls++; done += r.done || 0; after = r.cursor; if (!r.building || calls > 20) break; }
    note('built', done + ' rounds in ' + calls + ' call(s)');
    ok('it builds', done > 0, done + '');
    /* 900 rounds is more Drive work than one execution is allowed. */
    ok('  resumably, so a big folder is not a dead end', typeof after === 'number');

    const idx = await get(PORT, 'action=index&slim=1');
    ok('and then the folder answers from it', (idx.rows || []).length === done, (idx.rows || []).length + '');
    ok('  with the id of each round on its row', (idx.rows || []).every(r => r.f),
       JSON.stringify((idx.rows || [])[0] || {}));
    /* The whole point: a list is a list, not every inspection in the folder. */
    const slimBytes = JSON.stringify(idx).length;
    const fullBytes = JSON.stringify(await get(PORT, 'action=records&after=0&index=0')).length;
    note('reply size', slimBytes + ' B slim vs ' + fullBytes + ' B reading every record');
    ok('  and it is a fraction of the size of reading the rounds',
       slimBytes < fullBytes / 2, Math.round(100 * slimBytes / fullBytes) + '%');

    const upto = await get(PORT, 'action=index&slim=1&since=' + idx.at);
    ok('"anything new?" is answered without reading anything', upto.upToDate === true);
    ok('  and carries nothing', (upto.rows || []).length === 0 && (upto.records || []).length === 0);
  }

  console.log('\nthe phone lists the team\'s work without downloading it');
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(PHONE, { port: String(PORT) });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    const asked = [];
    p.on('request', r => { const u = r.url();
      if (u.indexOf('/exec') > 0) asked.push((u.match(/action=(\w+)/) || [, '?'])[1] +
        (/slim=1/.test(u) ? ':slim' : '')); });
    await p.goto('http://127.0.0.1:' + PORT + '/mobile/index.html', { waitUntil: 'load' });
    await settled(p);
    await p.evaluate(() => teamPull(true));
    await p.waitForTimeout(900);

    const st = await p.evaluate(async () => ({ rows: teamAll().length, kept: (await dbTeam()).length,
                                               row: teamAll()[0] || null }));
    note('after one pull', JSON.stringify(st));
    note('requests', JSON.stringify(asked));
    ok('the list is populated', st.rows > 0, st.rows + ' rows');
    ok('  from the index, not by reading every record',
       asked.some(a => a === 'index:slim') && !asked.includes('records'), asked.join(','));
    /* Rows, not rounds. The rounds are one request away when somebody opens one
       — which is the cost being removed, not deferred badly. */
    ok('  and not one inspection was downloaded to draw it', st.kept === 0, st.kept + ' stored');
    ok('  though each row knows which file it is', !!(st.row && st.row.f), JSON.stringify(st.row));

    /* And asking again, with nothing changed, is free. */
    asked.length = 0;
    await p.evaluate(() => teamPull(true));
    await p.waitForTimeout(700);
    const msg = await p.evaluate(() => document.getElementById('teamMsg').textContent);
    note('second check', JSON.stringify(asked) + '  "' + msg + '"');
    ok('checking again asks once and reads nothing',
       asked.length === 1 && asked[0] === 'index:slim', asked.join(','));
    ok('  and says it is up to date', /up to date|актуал/i.test(msg), msg);

    /* Opening a round: one request, by id. */
    await p.evaluate(() => { showPane('paneSystem'); const s = document.getElementById('typeSel');
      s.value = 'MP'; s.dispatchEvent(new Event('change')); renderTeam(); });
    await p.waitForTimeout(300);
    asked.length = 0;
    const rows = await p.$$('#teamList [data-k]');
    ok('the list offers a round to open', rows.length > 0, rows.length + '');
    if (rows.length) {
      await rows[0].click();
      await p.waitForFunction(() => !document.getElementById('roundOv').classList.contains('hidden'),
        null, { timeout: 15000 }).catch(() => {});
      const v = await p.evaluate(() => ({
        open: !document.getElementById('roundOv').classList.contains('hidden'),
        rows: document.querySelectorAll('#roundBody .rdrow').length }));
      note('opened', JSON.stringify(v) + '  ' + JSON.stringify(asked));
      ok('it opens, with its findings', v.open && v.rows > 0, JSON.stringify(v));
      ok('  for one request', asked.length === 1, asked.join(','));
      ok('  and that request is the file itself, not a search',
         asked[0] === 'file', asked.join(','));
    }
    await ctx.close();
  }

  console.log('\ntwo inspectors, and the second one does not wait for a folder walk');
  {
    /* The reason any of this matters. One phone finishes a round; the other is
       standing at a machine wanting to know whether it has just been done.
       Nothing walks the folder in between — the round went into the index on
       the way in, and the second phone learns of it from a property read. */
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(PHONE, { port: String(PORT) });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.goto('http://127.0.0.1:' + PORT + '/mobile/index.html', { waitUntil: 'load' });
    await settled(p);
    await p.evaluate(() => teamPull(true));
    await p.waitForTimeout(800);
    const before = await p.evaluate(() => teamAll().length);

    /* The other phone uploads, exactly as the queue does. */
    const body = JSON.stringify({ type: 'cm-inspection-entries', version: 2, records: [{
      equip: 'DZ044', date: '2026-08-14', type: 'UC', by: 'Хасенов', cls: 'DZ', smu: '6018',
      items: [{ key: 'IDLER.L-OUT', mm: 22, grade: 'X' }] }] });
    const up = await (await fetch('http://127.0.0.1:' + PORT + '/exec', { method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ name: 'DZ044_14.08.2026_UC.json', folder: 'UC/2026-08',
        contentType: 'application/json', dev: 'DOTHER',
        file: Buffer.from(body, 'utf8').toString('base64') }) })).json();
    ok('the other phone\'s round lands', up.ok === true, JSON.stringify(up).slice(0, 80));

    /* No rebuild, no walk, no reload — just the ordinary check. */
    await p.evaluate(() => teamPull(true));
    await p.waitForTimeout(900);
    const after = await p.evaluate(() => ({ n: teamAll().length,
      hit: teamAll().find(r => r.u === 'DZ044') || null }));
    note('second phone', JSON.stringify(after));
    ok('and the next check on this phone has it', after.n === before + 1, before + ' -> ' + after.n);
    ok('  named, dated, and graded', after.hit && after.hit.by === 'Хасенов' && after.hit.g === 'X',
       JSON.stringify(after.hit));
    ok('  with the id that opens it', !!(after.hit && after.hit.f), JSON.stringify(after.hit));

    /* And the round it points at is the round that was uploaded. */
    await p.evaluate(() => { showPane('paneSystem'); const s = document.getElementById('typeSel');
      s.value = 'UC'; s.dispatchEvent(new Event('change')); renderTeam(); });
    await p.waitForTimeout(300);
    const row = await p.$('#teamList [data-k="DZ044|2026-08-14|UC"]');
    ok('  and it is on the screen to press', !!row);
    if (row) {
      await row.click();
      await p.waitForFunction(() => !document.getElementById('roundOv').classList.contains('hidden'),
        null, { timeout: 15000 }).catch(() => {});
      const v = await p.evaluate(() => ({
        open: !document.getElementById('roundOv').classList.contains('hidden'),
        title: (document.getElementById('roundTitle') || {}).textContent || '',
        rows: document.querySelectorAll('#roundBody .rdrow').length }));
      note('opened', JSON.stringify(v));
      ok('  and opens with the other inspector\'s measurements',
         v.open && v.rows > 0 && /DZ044/.test(v.title), JSON.stringify(v));
    }
    await ctx.close();
  }

  console.log('\nand the summary the script builds is the one the app would build');
  {
    /* Two implementations of "which grade is worst, and what baselines were
       set" — one in Apps Script, one in the app. Feed both the same rounds. */
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:' + PORT + '/mobile/index.html', { waitUntil: 'load' });
    await settled(p);
    const idx = await get(PORT, 'action=index');           // whole records
    const rows = await get(PORT, 'action=index&slim=1');   // the script's summary
    const mine = await p.evaluate(recs => recs.map(r => teamRow(r)), idx.records || []);
    const theirs = (rows.rows || []).map(r => { const c = Object.assign({}, r); delete c.f; return c; });
    const norm = a => JSON.stringify(a.slice().sort((x, y) =>
      (x.u + x.d + x.t).localeCompare(y.u + y.d + y.t)));
    note('app', norm(mine).slice(0, 150));
    note('script', norm(theirs).slice(0, 150));
    ok('they agree, round for round', norm(mine) === norm(theirs),
       mine.length + ' vs ' + theirs.length);
    await ctx.close();
  }

  console.log('\nand a deployment nobody has redeployed still works');
  {
    const older = await get(OLDPORT, 'action=index&slim=1');
    ok('the old script does not understand the fast read',
       older.ok === false && /unknown action/i.test(older.error || ''), JSON.stringify(older).slice(0, 80));

    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(PHONE, { port: String(OLDPORT) });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    const asked = [];
    p.on('request', r => { const u = r.url();
      if (u.indexOf('/exec') > 0) asked.push((u.match(/action=(\w+)/) || [, '?'])[1]); });
    await p.goto('http://127.0.0.1:' + OLDPORT + '/mobile/index.html', { waitUntil: 'load' });
    await settled(p);
    await p.evaluate(() => teamPull(true));
    await p.waitForTimeout(900);
    const st = await p.evaluate(async () => ({ rows: teamAll().length, kept: (await dbTeam()).length }));
    note('on the old deployment', JSON.stringify(st) + '  ' + JSON.stringify(asked));
    ok('the phone falls back and still gets the list', st.rows > 0, st.rows + ' rows');
    ok('  by reading the records, the way it always did', asked.includes('records'), asked.join(','));

    /* And it asks once, not on every pull for ever. */
    asked.length = 0;
    await p.evaluate(() => teamPull(true));
    await p.waitForTimeout(700);
    ok('  and does not keep asking for something that is not there',
       !asked.includes('index'), asked.join(','));
    await ctx.close();
  }

  console.log('\nand the dashboard says which reader is deployed');
  {
    /* Somebody who has just pasted a new script has no way to see whether the
       deploy took — "Version: New version" is one dropdown in a dialog, and
       saving alone changes nothing. The difference is a thousand Drive round
       trips per refresh, so it has to be visible where they are already
       standing. */
    for (const [what, port, want] of [
      ['a current deployment', PORT, /fast index/i],
      ['one nobody redeployed', OLDPORT, /does not have the fast index/i],
    ]) {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
      const p = await ctx.newPage();
      p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
      await p.goto('http://127.0.0.1:' + port + '/dashboard/index.html', { waitUntil: 'load' });
      await p.waitForFunction(() => window.CMDash && window.CMDrive, null, { timeout: 25000 });
      await p.evaluate(u => { openData();
        document.getElementById('drvUrl').value = u;
        document.getElementById('drvSec').value = ''; }, 'http://127.0.0.1:' + port + '/exec');
      await p.click('#drvTest');
      await p.waitForFunction(() => /^(✅|❌|⚠)/.test(
        document.getElementById('drvMsg').textContent.trim()), null, { timeout: 25000 }).catch(() => {});
      const msg = (await p.textContent('#drvMsg')).trim();
      note(what, msg.slice(0, 150));
      ok('Test connection names the reader on ' + what, want.test(msg), msg.slice(0, 90));
      /* And it still says the thing it always said. */
      ok('  alongside the folder it is connected to', /Connected|folder/i.test(msg));
      await ctx.close();
    }
  }

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
