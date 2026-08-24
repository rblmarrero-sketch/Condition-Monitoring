/* Two backends, one contract.

   The phone and the dashboard are not wired to Google — both build
   `url + "?action=..."` and read JSON back — so moving to Yandex is a URL, not
   a rewrite. That is only true while the JSON matches, and "matches" is not
   something to take on trust: where a field is missing the clients do not
   error, they show nothing, which is the failure this project spends most of
   its time hunting.

   So this asks BOTH endpoints the same questions and compares the SHAPE of the
   answers — the field names, not the values, which are different folders. Then
   it drives the real app against the Yandex one: capture, upload, read back,
   correct, delete.

   Run: node tests/yandex.cjs         (starts both servers itself)
*/
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const GAS = 8104, YA = 8105;
const G = `http://127.0.0.1:${GAS}`, Y = `http://127.0.0.1:${YA}`;

let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };
const note = (n, d) => console.log('  ....  ' + n + (d !== undefined ? '   ' + d : ''));

const srv = [
  spawn(process.execPath, [path.join(__dirname, 'ed-srv.cjs'), String(GAS)], { stdio: 'ignore' }),
  spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(YA)], { stdio: 'ignore' }),
];
const bye = () => srv.forEach(s => { try { s.kill(); } catch (e) {} });
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

const get = (base, q) => fetch(base + '/exec' + q).then(r => r.json());
const post = (base, body) => fetch(base + '/exec', { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

/* The field names, nested, sorted — the thing a client actually depends on.
   Values differ (different folders, different ids) and must not be compared. */
function shape(v, depth) {
  depth = depth || 0;
  if (depth > 3) return '…';
  if (Array.isArray(v)) return v.length ? '[' + shape(v[0], depth + 1) + ']' : '[]';
  if (v && typeof v === 'object')
    return '{' + Object.keys(v).sort().map(k => k + ':' + shape(v[k], depth + 1)).join(',') + '}';
  return typeof v;
}

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await get(G, ''); await get(Y, ''); break; }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }

  /* ---- 1. the same questions, the same shapes --------------------------- */
  console.log('\nthe same question, asked of both');
  const asks = [
    ['health',            ''],
    ['records',           '?action=records'],
    ['records, no index', '?action=records&index=0'],
    ['list',              '?action=list&ext=.json'],
    ['unknown action',    '?action=nonsense'],
  ];
  for (const [what, q] of asks) {
    const a = await get(G, q), b = await get(Y, q);
    const sa = shape(a), sb = shape(b);
    /* Health is allowed to differ — it describes the backend, and the clients
       read only `ok` from it. Everything else is a contract. */
    if (what === 'health') { ok('health answers on both', a.ok === true && b.ok === true); continue; }
    /* Say WHICH field, not "these two long strings differ". A shape diff that
       has to be read character by character is a diff nobody reads. */
    const only = (x, y) => x.split(/[{},[\]]/).filter(t => t && y.indexOf(t) < 0);
    ok(what + ': the reply has the same fields', sa === sb, sa === sb
      ? Object.keys(a).sort().join(' ')
      : 'google only: [' + only(sa, sb).join(' ') + ']  yandex only: [' + only(sb, sa).join(' ') + ']');
  }

  /* ---- 1b. the header without which none of it reaches the page ---------
     The app is on GitHub Pages and the endpoint is not, so every call is
     cross-origin. Apps Script gets this from Google's infrastructure and nobody
     had to think about it. A function returns exactly what it returns — and
     without the header the upload SUCCEEDS, the file lands, and the browser
     then refuses to let the page read the reply, so the phone counts it as a
     failure and sends it again for ever. */
  console.log('\nand the browser is allowed to read the answer');
  for (const [what, base] of [['google', G], ['yandex', Y]]) {
    const r = await fetch(base + '/exec?action=records');
    ok(what + ' allows a cross-origin read',
       !!r.headers.get('access-control-allow-origin'),
       r.headers.get('access-control-allow-origin') || '(no header — the page cannot read this)');
  }
  const pre = await fetch(Y + '/exec', { method: 'OPTIONS' });
  ok('and a preflight is answered, for the day something needs one',
     pre.status < 400 && !!pre.headers.get('access-control-allow-origin'), String(pre.status));

  /* ---- 2. the write probe ------------------------------------------------ */
  console.log('\nthe write probe both clients send before trusting an endpoint');
  const pg = await post(G, { op: 'ping' }), py = await post(Y, { op: 'ping' });
  ok('ping answers with the same fields', shape(pg) === shape(py),
     shape(pg) === shape(py) ? Object.keys(py).sort().join(' ')
       : '\n        google: ' + shape(pg) + '\n        yandex: ' + shape(py));
  ok('  and both say they can take a batch', pg.batch === true && py.batch === true);
  ok('  and agree how many files one media read returns', pg.media === py.media,
     pg.media + ' vs ' + py.media);

  /* ---- 3. a round, uploaded by the app, into Yandex ---------------------- */
  /* Not a hand-made request: the phone's own uploader, with its own naming, its
     own batching and its own retry, pointed at the new endpoint. */
  console.log('\nthe app itself, pointed at Yandex');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(u => localStorage.setItem('up_dests', JSON.stringify([
    { id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' },
    { id: 'pa', on: false, url: 'https://off.invalid/', sec: '', folder: '' },
    { id: 'post', on: false, url: 'https://off.invalid/', sec: '', folder: '' }])), Y + '/exec');
  const p = await ctx.newPage();
  p.on('pageerror', e => ok('page error', false, e.message));
  await p.goto(Y + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);

  const sent = await p.evaluate(async () => {
    const shot = async () => { const c = document.createElement('canvas');
      c.width = 400; c.height = 300; c.getContext('2d').fillRect(0, 0, 400, 300);
      return new Promise(r => c.toBlob(r, 'image/jpeg', 0.7)); };
    const s = document.getElementById('typeSel');
    s.value = 'MP'; s.dispatchEvent(new Event('change'));
    selectEquip('TK149');
    await new Promise(r => setTimeout(r, 500));
    const pos = {};
    for (const [i, it] of items().entries())
      pos[it.k] = { grade: i === 0 ? 'C' : 'A', sev: i === 0 ? 'DEG' : 'NOF',
                    defect: i === 0 ? 'DT14-03' : '', detect: 'VI',
                    photos: i === 0 ? [await shot(), await shot()] : [], video: null };
    await dbPut({ id: 'ya1', type: 'MP', equip: 'TK149', date: '2026-08-24', by: 'S. Volkov',
      sup: 'A. Sokolov', smu: '19004', cls: 'HT', gps: null, dev: 'PH-07', sign: null,
      positions: pos, created: '2026-08-24T06:00:00.000Z', up: 0, upTo: {}, rev: 1 });
    retryAt = RETRY_MIN;
    return syncThenArm(true);
  });
  await p.waitForFunction(() => dbAll().then(a => a.length && a.every(r => r.up)),
                          null, { timeout: 90000 }).catch(() => {});
  const up = await p.evaluate(() => dbAll().then(a => a.map(r => ({ up: r.up, to: Object.keys(r.upTo || {}) }))));
  ok('the round uploads and is marked away', up.length === 1 && up[0].up === 1, JSON.stringify(up));

  const keys = await fetch(Y + '/__keys').then(r => r.json()).then(j => j.keys);
  const mine = keys.filter(k => k.indexOf('TK149') >= 0);
  note('in the bucket', mine.join('\n                 '));
  ok('  the sidecar landed under the round\'s own folder',
     mine.some(k => /^MP\/TK149\/2026-08-24\/TK149_24\.08\.2026_MP\.json$/.test(k)),
     mine.find(k => /\.json$/.test(k)) || '(none)');
  ok('  and both photographs with it, numbered the way the office looks for them',
     mine.filter(k => /_1\.jpg$|_2\.jpg$/.test(k)).length === 2,
     mine.filter(k => /\.jpg$/.test(k)).join(' '));

  /* ---- 4. and the office reads it back ---------------------------------- */
  console.log('\nand the office reads it back');
  const back = await get(Y, '?action=records');
  const rec = (back.records || []).find(r => r.equip === 'TK149');
  ok('the round comes back through ?action=records', !!rec, rec ? rec.date : '(missing)');
  ok('  with its findings intact',
     !!rec && (rec.items || []).some(i => i.grade === 'C' && /DT14-03/.test(i.defectCode || i.defect || '')),
     rec ? JSON.stringify((rec.items || [])[0] || {}).slice(0, 80) : '');
  const idx = (back.index || []).filter(f => f.name.indexOf('TK149') === 0);
  ok('  and the photographs are in the media index, so a report can fetch them',
     idx.length === 2, idx.map(f => f.name).join(' '));
  const one = await get(Y, '?action=file&id=' + encodeURIComponent(idx[0] ? idx[0].id : ''));
  ok('  and one comes back as bytes', one.ok === true && (one.data || '').length > 8,
     one.ok ? (one.data || '').length + ' base64 chars' : one.error);

  /* ---- 5. corrections and deletion -------------------------------------- */
  console.log('\ncorrections, and the guard on deletion');
  const ed = await post(Y, { op: 'edit', key: 'TK149|2026-08-24|MP', by: 'R. Marrero',
                             void: false, reason: 'SMU corrected', fields: { smu: '19100' } });
  ok('a correction is accepted', ed.ok === true, ed.saved || ed.error);
  const after = await get(Y, '?action=records');
  ok('  and comes back beside the record, not written into it',
     (after.edits || []).some(e => e.key === 'TK149|2026-08-24|MP'),
     (after.edits || []).length + ' correction(s)');
  const noPass = await post(Y, { op: 'delete', key: 'TK149|2026-08-24|MP', by: 'x', admin: 'wrong' });
  ok('deletion refuses a wrong password', noPass.ok === false, noPass.error);
  const del = await post(Y, { op: 'delete', key: 'TK149|2026-08-24|MP', by: 'R. Marrero', admin: 'letmein' });
  ok('  and takes the round when the password is right', del.ok === true && del.deleted > 0,
     JSON.stringify(del));
  const gone = await fetch(Y + '/__keys').then(r => r.json()).then(j => j.keys.filter(k => k.indexOf('TK149') >= 0));
  ok('  leaving a marker so a phone does not simply upload it again',
     gone.length === 1 && /\.deleted\.json$/.test(gone[0]), gone.join(' '));

  await b.close();
  bye();
  console.log(fail ? `\n${fail} FAILED` : '\ntwo backends, one contract');
  process.exit(fail ? 1 : 0);
})();
