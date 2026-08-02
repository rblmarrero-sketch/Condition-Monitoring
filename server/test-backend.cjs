/* Phase 3 — the backend, against a real Postgres.
 *
 * Not a mock. The whole point of this layer is what happens when the network
 * misbehaves — a push that times out after the server committed, two phones
 * racing, a correction arriving before the round it corrects — and none of
 * those are interesting against an in-memory fake that cannot roll back.
 */
const { Pool } = require('pg');
const { createApp, sha256 } = require('./api.js');
const fs = require('fs');

const DSN = process.env.DATABASE_URL || 'postgresql://cm@/cm?host=/tmp&port=55432';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const TOKEN = 'test-device-token-PH-07';
const TOKEN2 = 'test-device-token-PH-09';

const round = (o) => Object.assign({
  id: 'MP__TK151__2026-08-02__PH-07__1', rev: 1, equip: 'TK151', type: 'MP',
  date: '2026-08-02', cls: 'HT', smu: '6100', by: 'I. Petrov', dev: 'PH-07',
  items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 'C', sev: 'DEG',
            defectCode: 'DT14-03', action: 'RA-04', prio: 'P2' }],
}, o);

(async () => {
  const pool = new Pool({ connectionString: DSN, max: 6 });
  const app = createApp({ pool });
  await new Promise(r => app.server.listen(0, r));
  const port = app.server.address().port;
  const B = 'http://127.0.0.1:' + port;

  // clean slate, then two devices at one site
  await pool.query(`TRUNCATE round, marker, photo, audit, device, unit, inspector, site CASCADE`);
  await pool.query(`INSERT INTO site (id,name,tz) VALUES ('baim','Baimskaya','Asia/Kamchatka')`);
  await pool.query(`INSERT INTO device (id,site_id,label,token_hash) VALUES
      ('PH-07','baim','Petrov',$1), ('PH-09','baim','Sokolov',$2)`,
    [sha256(TOKEN), sha256(TOKEN2)]);

  /* opts last, THEN the merged headers — assigning opts over a headers key
     replaces it wholesale and silently drops the authorization. */
  const call = (path, opts = {}, tok = TOKEN) => fetch(B + path, Object.assign({}, opts, {
    headers: Object.assign({ authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, opts.headers || {}),
  }));
  const push = (body, tok) => call('/v1/push', { method: 'POST', body: JSON.stringify(body) }, tok).then(r => r.json());
  const pull = (cursor, tok) => call('/v1/pull?cursor=' + (cursor || 0), {}, tok).then(r => r.json());

  console.log('  nothing happens without a token');
  ok('an unauthenticated push is refused',
    (await fetch(B + '/v1/push', { method: 'POST', body: '{}' })).status === 401);
  ok('a wrong token is refused',
    (await call('/v1/pull', {}, 'not-a-real-token')).status === 401);
  ok('health needs no token', (await fetch(B + '/v1/health')).status === 200);
  ok('and the refusal is recorded',
    Number((await pool.query(`SELECT count(*) c FROM audit WHERE action='auth' AND NOT ok`)).rows[0].c) >= 2);

  console.log('\n  a round lands once, however many times it is sent');
  const a = await push({ rounds: [round()] });
  ok('the first push is accepted', a.accepted.length === 1, JSON.stringify(a.accepted));
  /* The case that matters: the server committed, the reply never arrived, the
     phone retries. It must not create a second round. */
  const b2 = await push({ rounds: [round()] });
  ok('an identical retry is not a second round', b2.accepted.length === 0 && b2.stale.length === 1,
    JSON.stringify({ acc: b2.accepted, stale: b2.stale }));
  ok('and the database holds exactly one',
    Number((await pool.query(`SELECT count(*) c FROM round WHERE id=$1`, [round().id])).rows[0].c) === 1);

  console.log('\n  a correction supersedes, it does not overwrite');
  const c3 = await push({ rounds: [round({ rev: 2, smu: '6150' })] });
  ok('a higher revision is accepted', c3.accepted.length === 1 && c3.superseded.length === 1,
    JSON.stringify(c3.superseded));
  const hist = await pool.query(
    `SELECT rev, smu, superseded_at IS NOT NULL AS old FROM round WHERE id=$1 ORDER BY rev`, [round().id]);
  ok('both revisions are on disk', hist.rows.length === 2, JSON.stringify(hist.rows.map(x => x.rev)));
  ok('the old one is marked superseded, not deleted', hist.rows[0].old === true && hist.rows[1].old === false);
  ok('what the phone actually sent first is still readable', hist.rows[0].smu === '6100');

  /* An older revision arriving late — the phone retried an early attempt after
     the correction already got through. It must not undo the correction. */
  const late = await push({ rounds: [round({ rev: 1, smu: 'STALE' })] });
  ok('a late older revision is refused, not applied', late.stale.length === 1 && late.accepted.length === 0,
    JSON.stringify(late.stale));
  ok('and the current revision is untouched',
    (await pool.query(`SELECT smu FROM round WHERE id=$1 AND superseded_at IS NULL`, [round().id])).rows[0].smu === '6150');

  console.log('\n  two phones, one unit, one day — both survive');
  await push({ rounds: [round({ id: 'MP__TK151__2026-08-02__PH-09__9', dev: 'PH-09', by: 'A. Sokolov' })] }, TOKEN2);
  const both = await pool.query(
    `SELECT count(*) c FROM round WHERE unit_code='TK151' AND insp_date='2026-08-02' AND superseded_at IS NULL`);
  ok('the clash is kept for a person to settle, not collapsed', Number(both.rows[0].c) === 2, both.rows[0].c);

  console.log('\n  the cursor walks forward and never repeats');
  const p1 = await pull(0);
  /* Three rows: TK151 rev 1 (superseded), TK151 rev 2, and PH-09's. The two
     refused pushes wrote nothing, which is the point of refusing them. */
  ok('a pull from zero returns every revision, superseded ones included',
    p1.rounds.length === 3, p1.rounds.length + ' rounds');
  ok('and says which are no longer current',
    p1.rounds.filter(r => r.superseded).length === 1,
    p1.rounds.filter(r => r.superseded).length + ' superseded');
  ok('and a cursor to resume from', p1.cursor > 0, String(p1.cursor));
  const p2 = await pull(p1.cursor);
  ok('pulling again from that cursor returns nothing', p2.rounds.length === 0 && p2.markers.length === 0);
  await push({ rounds: [round({ id: 'UC__DZ002__2026-08-02__PH-07__5', equip: 'DZ002', type: 'UC' })] });
  const p3 = await pull(p1.cursor);
  ok('but a new round appears at that cursor', p3.rounds.length === 1, p3.rounds[0] && p3.rounds[0].equip);
  ok('and only that one', p3.rounds.every(r => r.equip === 'DZ002'));

  console.log('\n  a marker can arrive before the round it describes');
  await push({ markers: [{ roundId: 'MP__TK999__2026-08-02__PH-07__1', kind: 'void',
                           reason: 'wrong unit', by: 'R. Marrero' }] });
  ok('it is stored rather than rejected',
    Number((await pool.query(`SELECT count(*) c FROM marker WHERE round_id='MP__TK999__2026-08-02__PH-07__1'`)).rows[0].c) === 1);
  const pm = await pull(p3.cursor);
  ok('and it comes down the same cursor', pm.markers.length === 1 && pm.markers[0].kind === 'void',
    JSON.stringify(pm.markers.map(m => m.kind)));

  console.log('\n  the record goes first, the photographs follow');
  const PH = 'ph-tk151-4c-1';
  await push({ rounds: [round({ id: 'MP__TK152__2026-08-02__PH-07__7', equip: 'TK152' })],
               photos: [{ id: PH, roundId: 'MP__TK152__2026-08-02__PH-07__7', itemKey: '4C', ord: 1,
                          filename: 'TK152_4C_02.08.2026_MP.jpg', bytes: 3 }] });
  const announced = await pull(0);
  const rec = announced.rounds.find(r => r.equip === 'TK152');
  ok('the round is readable before any image exists', !!rec, rec && rec.id);
  const slot = announced.photos.find(p => p.id === PH);
  ok('the photograph is announced', !!slot, JSON.stringify(slot));
  ok('and honestly marked as not yet here', slot && slot.ready === false);

  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const up = await call('/v1/photos/' + PH, { method: 'POST', body: jpg,
    headers: { 'content-type': 'image/jpeg' } }).then(r => r.json());
  ok('the bytes upload', up.ok === true && up.bytes === jpg.length, JSON.stringify(up));
  const again = await call('/v1/photos/' + PH, { method: 'POST', body: jpg,
    headers: { 'content-type': 'image/jpeg' } }).then(r => r.json());
  ok('a re-upload overwrites its own slot rather than duplicating', again.ok === true,
    String((await pool.query(`SELECT count(*) c FROM photo WHERE id=$1`, [PH])).rows[0].c));
  const back = await call('/v1/photos/' + PH);
  ok('and it reads back byte for byte',
    Buffer.compare(Buffer.from(await back.arrayBuffer()), jpg) === 0);
  ok('now it says it is ready', (await pull(0)).photos.find(p => p.id === PH).ready === true);
  const unknown = await call('/v1/photos/never-announced', { method: 'POST', body: jpg }).then(r => r.json());
  ok('bytes for a photograph nobody announced are refused', unknown.ok === false, unknown.error);

  console.log('\n  one site cannot see another');
  await pool.query(`INSERT INTO site (id,name) VALUES ('other','Other Mine')`);
  await pool.query(`INSERT INTO device (id,site_id,label,token_hash) VALUES ('OTH-1','other','x',$1)`,
    [sha256('other-token')]);
  const oth = await pull(0, 'other-token');
  ok('a device at another site pulls nothing of ours', oth.rounds.length === 0, String(oth.rounds.length));
  const stealing = await call('/v1/photos/' + PH, {}, 'other-token');
  ok('and cannot fetch our photographs', stealing.status === 404, String(stealing.status));

  console.log('\n  a revoked phone stops working immediately');
  await pool.query(`UPDATE device SET revoked_at=now() WHERE id='PH-09'`);
  ok('its token is refused', (await call('/v1/pull', {}, TOKEN2)).status === 401);
  ok('the other phone is unaffected', (await call('/v1/pull', {}, TOKEN)).status === 200);

  console.log('\n  the dashboard is told, rather than asking every three minutes');
  const es = await fetch(B + '/v1/events', { headers: { authorization: 'Bearer ' + TOKEN } });
  const reader = es.body.getReader();
  const seen = [];
  (async () => { try { for (;;) { const { done, value } = await reader.read(); if (done) break;
    seen.push(Buffer.from(value).toString('utf8')); } } catch (e) {} })();
  await new Promise(r => setTimeout(r, 300));
  ok('the stream opens', es.status === 200 && /event-stream/.test(es.headers.get('content-type')));
  await push({ rounds: [round({ id: 'MP__TK153__2026-08-02__PH-07__3', equip: 'TK153' })] });
  await new Promise(r => setTimeout(r, 500));
  const text = seen.join('');
  ok('and a push wakes it within a moment', /"type":"changed"/.test(text), text.replace(/\n/g, '|').slice(0, 90));
  reader.cancel().catch(() => {});
  await new Promise(r => setTimeout(r, 200));

  console.log('\n  a bad batch changes nothing at all');
  const beforeN = Number((await pool.query(`SELECT count(*) c FROM round`)).rows[0].c);
  const bad = await push({ rounds: [
    round({ id: 'MP__TK154__2026-08-02__PH-07__4', equip: 'TK154' }),
    round({ id: 'MP__TK155__2026-08-02__PH-07__4', equip: 'TK155', date: 'not-a-date' }),
  ] }).catch(e => ({ threw: String(e) }));
  const afterN = Number((await pool.query(`SELECT count(*) c FROM round`)).rows[0].c);
  ok('the good record is rolled back with the bad one', afterN === beforeN,
    beforeN + ' → ' + afterN);
  ok('and the phone is told, so it can retry the whole batch',
    !!bad.threw || bad.ok === false || (bad.errors || []).length > 0, JSON.stringify(bad).slice(0, 90));
  ok('nothing is left half-written',
    Number((await pool.query(`SELECT count(*) c FROM round WHERE unit_code IN ('TK154','TK155')`)).rows[0].c) === 0);

  console.log('\n  and it survives being hammered');
  const N = 40;
  const t0 = Date.now();
  const many = await Promise.all(Array.from({ length: N }, (_, i) =>
    push({ rounds: [round({ id: 'MP__BULK' + i + '__2026-08-02__PH-07__' + i, equip: 'TK1' + (50 + i % 9) })] })));
  const ms = Date.now() - t0;
  ok(N + ' concurrent pushes all land', many.every(x => x.accepted.length === 1), ms + ' ms');
  ok('and the cursor is still strictly ordered', await (async () => {
    const r = await pool.query(`SELECT seq FROM round ORDER BY seq`);
    const s = r.rows.map(x => Number(x.seq));
    return s.every((v, i) => i === 0 || v > s[i - 1]);
  })());

  await new Promise(r => app.server.close(r));
  await pool.end();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
