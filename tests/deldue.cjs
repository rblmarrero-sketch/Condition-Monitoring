/* A round deleted in the dashboard has to leave the due list.

   It did not. The office deletes a round — the sidecar, the photographs, the
   lot — and one marker is left behind saying so. Both backends read that marker
   off the folder and then threw it away: it was neither a record nor a
   correction, so it fell through every branch. The only thing that ever changed
   on a phone was that the summary row stopped coming back on a full re-read.
   The last-done date, which is what the due list actually runs on, stayed
   exactly where it was — so a test unit deleted in the office sat on the due
   list for ever, getting later every day. That is what came back from the pit
   about unit 1111.

   A VOID always worked, because a void writes an edit marker and edits were
   already being carried. The two look the same from the inspector's side and
   were a world apart in the code.

   Run: node tests/deldue.cjs   (needs tests/ed-srv.cjs on 8093 with an admin
   secret, since deletion is off without one) */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:' + (process.argv[2] || 8093);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const post = body => fetch(B + '/exec', { method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(r => r.json());

(async () => {
  await fetch(B + '/__seed').then(r => r.text());
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(u => localStorage.setItem('up_dests', JSON.stringify(
    [{ id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{YYYY-MM}' }])), B + '/exec');
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(1500);

  console.log('\n  the phone knows what the folder holds');
  const seen = await p.evaluate(() => ({ rows: teamAll().length,
    tk146: histDate(histAll()['MP|TK146']) }));
  ok('it pulled the team rounds', seen.rows >= 3, seen.rows + ' rows');
  ok('and TK146 counts as inspected', seen.tk146 === '2026-03-09', String(seen.tk146));

  console.log('\n  the office deletes the round');
  const del = await post({ op: 'delete', key: 'TK146|2026-03-09|MP',
    by: 'R. Marrero', admin: 'letmein', confirm: 'TK146' });
  ok('the delete goes through', del.ok === true, JSON.stringify(del).slice(0, 90));

  /* The marker is the whole point: the files are gone, so nothing else can
     ever tell a phone the round existed or that it stopped existing. */
  const files = await fetch(B + '/__files').then(r => r.json());
  ok('and leaves a marker where the round was',
    files.files.some(f => /TK146_09\.03\.2026_MP\.deleted\.json$/.test(f)),
    files.files.filter(f => /TK146/.test(f)).join(' | ') || 'none');
  ok('with the round itself actually gone',
    !files.files.some(f => /MP\/2026-03\/TK146_09\.03\.2026_MP\.json$/.test(f)));

  console.log('\n  and the phone hears about it');
  const reply = await fetch(B + '/exec?action=records&index=0').then(r => r.json());
  ok('the read carries the deletion, not just the corrections',
    Array.isArray(reply.deleted) && reply.deleted.some(d => d.key === 'TK146|2026-03-09|MP'),
    JSON.stringify(reply.deleted || null));
  /* And the fast read, which is the one a phone in the pit actually uses.
     Built first, because an index nobody has built yet honestly answers
     "rebuild me" and sends the client back to the slow path. */
  await fetch(B + '/exec?action=index&rebuild=1').then(r => r.json());
  const idx = await fetch(B + '/exec?action=index&slim=1').then(r => r.json());
  ok('and so does the fast read the phone actually uses',
    Array.isArray(idx.deleted) && idx.deleted.some(d => d.key === 'TK146|2026-03-09|MP'),
    JSON.stringify(idx.deleted || null).slice(0, 120));

  /* The button lives on the system pane, which is not the pane the app opens
     on. Shown first, the way a thumb would. */
  await p.evaluate(() => { localStorage.removeItem('cm_team_cursor'); showPane('paneSystem'); });
  await p.waitForTimeout(200);
  await p.click('#teamRefresh');
  await p.waitForFunction(() => { const s = document.getElementById('teamMsg').textContent.trim();
    return s && !/^Checking/.test(s); }, null, { timeout: 20000 });
  await p.waitForTimeout(400);

  const after = await p.evaluate(() => ({
    msg: document.getElementById('teamMsg').textContent.trim(),
    rows: teamAll().length,
    tk146: histDate(histAll()['MP|TK146']),
    other: histDate(histAll()['MP|TK147']),
  }));
  ok('it drops the round from the team list', after.rows < seen.rows,
    after.rows + ' rows, was ' + seen.rows);
  ok('and says the office deleted it', /deleted by the office/.test(after.msg), after.msg);
  /* The one that matters. Everything above was already true of a void. */
  ok('TK146 stops counting as inspected', !after.tk146, String(after.tk146));
  ok('and the other units are untouched', after.other === '2026-03-10', String(after.other));

  console.log('\n  so the machine comes back onto the due list');
  const due = await p.evaluate(async () => {
    const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 300));
    dueScope = 'all';
    showPane('paneDue'); renderDue();
    await new Promise(r => setTimeout(r, 200));
    return document.getElementById('dueList').textContent.replace(/\s+/g, ' ').trim();
  });
  /* This section is headed "so the machine comes back onto the due list", and
     it used to assert the opposite — that TK146 VANISHED. That was the only
     way to express it at the time: a machine with no last-done date produced
     no row at all, so the best available proof that the date was gone was the
     machine being gone with it.

     A machine that has never been inspected is now a row of its own, so the
     heading can finally be checked as written. Deleting a round does not
     remove a haul truck from the fleet; it puts it back on the list with
     nothing on record, which is where somebody can act on it. */
  ok('TK146 is back on the list rather than vanishing from it',
    /TK146/.test(due), due.slice(0, 140));
  const never = await p.evaluate(() => neverRows('MP').some(r => r.unit === 'TK146'));
  ok('  as a machine with no plug round on record', never);

  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
