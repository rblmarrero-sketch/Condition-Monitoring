/* AN UPDATE MUST NOT COST SOMEBODY THEIR ROUND.

   This app updates itself. Every phone in the fleet has done it, repeatedly,
   and a technician is never asked. That is the right design — an update people
   have to remember is an update that does not happen — but it means the app
   reaches in and replaces itself underneath work that has not been sent yet.

   Nothing anywhere proved that work survives. The service worker only touches
   caches and the database version is pinned, so it SHOULD be safe; "should be"
   is not a test, and the failure it is standing in front of is the worst one
   this system has: a round captured at -40, never uploaded, destroyed by a
   background update nobody asked for and nobody saw.

   So: a phone with unsent rounds, photographs, a manifest and a half-typed
   round in progress, updated for real — a new build served, the installed
   worker replaced, the page reloaded onto it — and then every byte checked
   against what was there before.

   Run: node tests/upkeep.cjs */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* The same trick a deploy plays: hand out a different build number. */
let BUMP = null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname === '/' ? '/index.html' : u.pathname;
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end('no');
  }
  let body = fs.readFileSync(f);
  if (BUMP && (p.endsWith('/sw.js') || p.endsWith('/index.html'))) {
    body = Buffer.from(String(body)
      .replace(/const BUILD = "\d+"/, 'const BUILD = "' + BUMP + '"')
      .replace(/const BUILD="\d+"/, 'const BUILD="' + BUMP + '"'));
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
                       'Cache-Control': 'no-cache' });
  res.end(body);
});
const buildOf = p => p.evaluate(() => (typeof BUILD !== 'undefined' ? BUILD : null)).catch(() => null);
/* The page under test reloads itself, so an evaluate can be in flight when the
   navigation lands. That is the app working. Retry once; a second failure is
   real and is allowed through rather than swallowed. */
async function evalSettled(p, fn) {
  try { return await p.evaluate(fn); }
  catch (e) {
    if (!/Execution context was destroyed|Target closed|navigation/i.test(String(e && e.message))) throw e;
    await p.waitForLoadState('load').catch(() => {});
    await p.waitForTimeout(1500);
    return p.evaluate(fn);
  }
}

/* Two unsent rounds with real photographs and a manifest, plus a round being
   typed right now — the state a phone is actually in when an update lands. */
const SEED = p => p.evaluate(async () => {
  const shot = async n => await intake(new Blob([new Uint8Array(Array(64).fill(n))], { type: 'image/jpeg' }));
  const mk = async (unit, n) => {
    const rec = { id: 'up__' + unit + '__2026-07-29__X__z', type: 'MP', equip: unit,
      date: '2026-07-29', cls: 'HT', by: 'R. Marrero', smu: 6100,
      created: new Date().toISOString(), up: 0, upTo: {}, rev: 1,
      positions: { '4C': { grade: 'C', comment: 'ferrous, heavy', photos: [await shot(n), await shot(n + 1)] } } };
    await attSync(rec); await dbPut(rec); return rec.id;
  };
  const ids = [await mk('TK910', 1), await mk('TK911', 3)];
  /* The round in progress: not an inspection yet, and the thing a technician
     would be angriest to lose, because it is the one in their hands. */
  await dbPut({ id: DRAFT_ID, type: 'MP', equip: 'TK912', date: '2026-07-29',
                by: 'R. Marrero', positions: { '4C': { grade: 'X', comment: 'half typed' } } });
  return ids;
});

/* Everything that must come through untouched, hashed rather than counted. */
const FINGERPRINT = p => p.evaluate(async () => {
  const h = async b => { const d = await crypto.subtle.digest('SHA-256', await b.arrayBuffer());
    return [...new Uint8Array(d)].map(v => v.toString(16).padStart(2, '0')).join('').slice(0, 16); };
  const all = (await dbAll()).filter(r => /^up__/.test(r.id)).sort((a, b) => a.id.localeCompare(b.id));
  const out = [];
  for (const r of all) {
    const p4 = r.positions['4C'];
    out.push({ id: r.id, grade: p4.grade, comment: p4.comment, up: r.up || 0,
               atts: attList(r).map(e => e.attachmentId + ':' + e.sha256.slice(0, 12) + ':' + e.byteSize).sort(),
               bytes: await Promise.all((p4.photos || []).map(h)),
               names: (await filesForRecord(r)).map(x => x.name) });
  }
  const d = await dbGet(DRAFT_ID);
  return { recs: out, draft: d ? { equip: d.equip, grade: d.positions['4C'].grade,
                                   comment: d.positions['4C'].comment } : null };
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  /* No destination: this is about an update, not an upload. The work must
     survive precisely BECAUSE it has not gone anywhere. */
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));

  console.log('\n── a phone with unsent work, on the build it has been running');
  BUMP = null;
  await p.goto(APP, { waitUntil: 'load' });
  await p.evaluate(() => navigator.serviceWorker.ready).catch(() => {});
  await p.waitForTimeout(4000);
  const wasBuild = await buildOf(p);
  await SEED(p);
  const before = await FINGERPRINT(p);
  ok(before.recs.length === 2, 'two rounds are captured and unsent', before.recs.length + ' round(s)');
  ok(before.recs.every(r => r.atts.length === 2 && r.bytes.length === 2),
     'each with two photographs and a manifest entry for each',
     JSON.stringify(before.recs.map(r => r.atts.length)));
  ok(!!before.draft, 'and a round is half typed', JSON.stringify(before.draft));
  const controlled = await p.evaluate(() => !!navigator.serviceWorker.controller);
  ok(controlled, 'an installed worker is in charge of this page, as on a real phone');

  console.log('\n── a new build ships, and the phone takes it by itself');
  BUMP = String(Number(wasBuild) + 1);
  await p.evaluate(() => { try { checkForNewBuild(); } catch (e) {} });
  /* Give find → fetch → apply the room it needs; the page reloads in here. */
  for (let i = 0; i < 24 && (await buildOf(p)) !== BUMP; i++) await p.waitForTimeout(1000);
  const nowBuild = await buildOf(p);
  ok(nowBuild === BUMP, 'the phone is running the new build', wasBuild + ' -> ' + nowBuild);

  console.log('\n── and not one byte of the unsent work has moved');
  const after = await evalSettled(p, async () => {
    const h = async b => { const d = await crypto.subtle.digest('SHA-256', await b.arrayBuffer());
      return [...new Uint8Array(d)].map(v => v.toString(16).padStart(2, '0')).join('').slice(0, 16); };
    const all = (await dbAll()).filter(r => /^up__/.test(r.id)).sort((a, b) => a.id.localeCompare(b.id));
    const out = [];
    for (const r of all) {
      const p4 = r.positions['4C'];
      out.push({ id: r.id, grade: p4.grade, comment: p4.comment, up: r.up || 0,
                 atts: attList(r).map(e => e.attachmentId + ':' + e.sha256.slice(0, 12) + ':' + e.byteSize).sort(),
                 bytes: await Promise.all((p4.photos || []).map(h)),
                 names: (await filesForRecord(r)).map(x => x.name) });
    }
    const d = await dbGet(DRAFT_ID);
    return { recs: out, draft: d ? { equip: d.equip, grade: d.positions['4C'].grade,
                                     comment: d.positions['4C'].comment } : null };
  });
  ok(after.recs.length === before.recs.length,
     'both rounds are still there', after.recs.length + ' of ' + before.recs.length);
  ok(JSON.stringify(after.recs.map(r => r.bytes)) === JSON.stringify(before.recs.map(r => r.bytes)),
     'every photograph is the same photograph, byte for byte',
     JSON.stringify(after.recs.map(r => r.bytes)));
  ok(JSON.stringify(after.recs.map(r => r.atts)) === JSON.stringify(before.recs.map(r => r.atts)),
     'each keeps the id it was given when it was taken, and its hash',
     JSON.stringify((after.recs[0] || {}).atts));
  ok(JSON.stringify(after.recs.map(r => r.names)) === JSON.stringify(before.recs.map(r => r.names)),
     'and would still upload under the same names', JSON.stringify((after.recs[0] || {}).names));
  ok(JSON.stringify(after.recs.map(r => [r.grade, r.comment, r.up]))
     === JSON.stringify(before.recs.map(r => [r.grade, r.comment, r.up])),
     'the readings, the words and the unsent state are untouched');
  /* THE ONE A TECHNICIAN WOULD NOTICE FIRST. */
  ok(JSON.stringify(after.draft) === JSON.stringify(before.draft),
     'and the round that was half typed is still half typed', JSON.stringify(after.draft));

  console.log('\n── the queue still knows it has work to send');
  const q = await evalSettled(p, () => ({
    pending: document.querySelectorAll('#pending .pitem').length,
    unsent: 0 }));
  ok(q.pending >= 2, 'the queue lists them, so somebody can still send them',
     q.pending + ' in the queue');

  await ctx.close(); await b.close(); srv.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED\n' + fails.join('\n') : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
