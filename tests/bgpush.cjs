/* WOKEN WHILE CLOSED.

   "As soon as there is internet, even if the app is not running." A closed
   web app runs nothing; on an iPhone the one thing that can start its worker
   is a push message, and the worker must answer with a notification. So the
   endpoint keeps every phone's push subscription, server.js sends when a
   build ships, when the folder changes and once a day, and the worker on the
   phone updates the build, refreshes the fleet list, counts the queue and
   says "Ready for the field" or "Not ready" — with nobody opening the app.

   What has to be true, end to end, on the real code:
     · the encryption is RFC 8291's, byte for byte against its own vector,
       and the VAPID token verifies with the public key;
     · the endpoint hands out the key, stores and drops subscriptions;
     · the three triggers send to every subscription, with the right headers,
       and a phone can decrypt what it is sent; a dead subscription is dropped;
     · a phone registers itself for wake-ups with one tap, and the worker,
       woken, puts on a new build, prefetches the fleet list and shows the
       verdict — "Not ready" when a round is still to send;
     · a fleet list the worker fetched while the app was closed is on the due
       list at the next open, even when that open is in the pit;
     · the readiness check runs itself and puts its verdict on the bar and in
       a notification, without the System screen being opened.

   Run: node tests/bgpush.cjs        (spawns tests/ya-srv.cjs on 8138) */
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const YA = 8138, YAB = 'http://127.0.0.1:' + YA, EXEC = YAB + '/exec';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const post = b => fetch(EXEC, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(b) }).then(r => r.json());
const get = q => fetch(EXEC + '?' + new URLSearchParams(q)).then(r => r.json());
const keysOnServer = () => fetch(YAB + '/__keys').then(r => r.json()).then(j => j.keys.filter(k => k.indexOf('_meta/push/') === 0 && k.indexOf('/_') < 0));
async function until(fn, ms, step) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, step || 300)); } return false; }

/* The endpoint's key pair, as cm.env would carry it. */
const VK = (() => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); return { pub: b64u(e.getPublicKey()), priv: b64u(e.getPrivateKey()) }; })();

/* A phone, as the push service sees it: a P-256 key pair and an auth secret. */
const PS = { srv: null, url: '' };
const pushed = [];
let statusFor = () => 201;
function mkPhone(id) {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  return { id, ecdh: e, pub: e.getPublicKey(), auth: crypto.randomBytes(16),
           sub() { return { endpoint: PS.url + '/push/' + this.id, keys: { p256dh: b64u(this.pub), auth: b64u(this.auth) } }; } };
}
/* RFC 8291, the receiving end — written from the RFC, not from function.js. */
function decrypt(phone, body) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const secret = phone.ecdh.computeSecret(asPub);
  const hk = (ikm, s, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, s, info, n));
  const ikm = hk(secret, phone.auth, Buffer.concat([Buffer.from('WebPush: info\0'), phone.pub, asPub]), 32);
  const cek = hk(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hk(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = plain.length; while (end > 0 && plain[end - 1] === 0) end--;
  return plain.subarray(0, end - 1).toString('utf8');          // strip the 0x02 delimiter
}
function jwtOf(auth) { return (auth.match(/t=([^,]+)/) || [])[1]; }
function jwtVerifies(tok, pubB64u) {
  const [h, b, s] = tok.split('.'); const pub = unb64u(pubB64u);
  const key = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  return crypto.verify('sha256', Buffer.from(h + '.' + b), { key, dsaEncoding: 'ieee-p1363' }, unb64u(s)) ? JSON.parse(unb64u(b).toString('utf8')) : null;
}

/* The app, served with a build number the suite can move — the same file
   server.js polls on Pages. */
let BUMP = null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const app = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname === '/' ? '/index.html' : u.pathname;
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  let body = fs.readFileSync(f);
  if (BUMP && (p.endsWith('/sw.js') || p.endsWith('/index.html')))
    body = Buffer.from(String(body).replace(/const BUILD = "\d+"/, 'const BUILD = "' + BUMP + '"').replace(/const BUILD="\d+"/, 'const BUILD="' + BUMP + '"'));
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(body);
});
const buildOf = p => p.evaluate(() => (typeof BUILD !== 'undefined' ? BUILD : null)).catch(() => null);
const swWake = (p, data) => p.evaluate(d => new Promise(res => {
  const ch = new MessageChannel(); const tm = setTimeout(() => res({ error: 'no answer' }), 60000);
  ch.port1.onmessage = e => { clearTimeout(tm); res(e.data); };
  navigator.serviceWorker.controller.postMessage({ type: 'sw-wake', data: d }, [ch.port2]);
}), data);
const notifs = p => p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return (await r.getNotifications()).map(n => ({ title: n.title, body: n.body, tag: n.tag })); });
const plant = async (unit, date, ty) => {
  const dmy = date.split('-').reverse().join('.');
  const side = JSON.stringify({ type: 'cm-inspection-entries', version: 2, records: [{ equip: unit, date, type: ty, by: 'Хасенов', cls: 'HT', dev: 'DPUSH',
    items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 1 }] }] });
  return post({ op: 'batch', dev: 'DPUSH', folder: ty + '/2026-09', files: [{ name: `${unit}_${dmy}_${ty}.json`, file: Buffer.from(side).toString('base64'), contentType: 'application/json' }] });
};
/* A phone in the browser: notifications allowed, and the browser's own push
   service replaced by one this suite runs — Chromium in a container has no
   FCM to talk to, and the plumbing under test is the app's, not Google's. */
async function phone(b, APP, opts) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.grantPermissions(['notifications'], { origin: new URL(APP).origin });
  await ctx.addInitScript(a => {
    localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url: a.exec, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' }]));
    /* One endpoint per phone, stable across reloads — a real push service
       hands the same subscription back on every getSubscription(). */
    const fake = { endpoint: a.ps + '/push/browser-' + a.p256dh.slice(-8), keys: { p256dh: a.p256dh, auth: a.auth },
                   toJSON() { return { endpoint: this.endpoint, keys: this.keys }; }, unsubscribe: async () => true };
    let have = null;
    try {
      PushManager.prototype.subscribe = async function () { have = fake; return fake; };
      PushManager.prototype.getSubscription = async function () { return have; };
    } catch (e) {}
  }, { exec: EXEC, ps: PS.url, p256dh: b64u(opts.phone.pub), auth: b64u(opts.phone.auth) });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(APP, { waitUntil: 'load' });
  await p.evaluate(() => navigator.serviceWorker.ready).catch(() => {});
  await p.waitForFunction(() => /good/.test((document.getElementById('readyBar') || {}).className || ''), null, { timeout: 30000 }).catch(() => {});
  await p.goto(APP, { waitUntil: 'load' });
  await p.waitForTimeout(4000);                         // boot check, boot pull, pushSetup at 3 s
  return { ctx, p };
}

(async () => {
  PS.srv = http.createServer((req, res) => { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => {
    pushed.push({ url: req.url, headers: req.headers, body: Buffer.concat(ch) }); const st = statusFor(req.url); res.writeHead(st); res.end(); }); });
  await new Promise(r => PS.srv.listen(0, r)); PS.url = 'http://127.0.0.1:' + PS.srv.address().port;
  await new Promise(r => app.listen(0, r));
  const APP = 'http://127.0.0.1:' + app.address().port + '/mobile/index.html';
  const ya = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(YA), 'letmein'],
    { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { VAPID_PUBLIC: VK.pub, VAPID_PRIVATE: VK.priv, VAPID_SUBJECT: 'mailto:test@example.invalid',
      CM_PUSH_TRIGGERS: '1', CM_PUSH_SW: 'http://127.0.0.1:' + app.address().port + '/mobile/sw.js', CM_PUSH_FOLDER_MS: '300', CM_PUSH_GAP_MS: '0', CM_PUSH_POLL_MS: '600000' }) });
  const yaLog = []; ya.stdout.on('data', d => yaLog.push(String(d))); ya.stderr.on('data', d => yaLog.push(String(d)));
  const bye = () => { try { ya.kill(); } catch (e) {} };
  process.on('exit', bye);
  for (let i = 0; i < 80; i++) { try { await fetch(EXEC + '?action=list&ext=.json'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }

  console.log('1. the cryptography is the RFC\'s');
  {
    process.env.VAPID_PUBLIC = VK.pub; process.env.VAPID_PRIVATE = VK.priv;
    const P = require(path.join(ROOT, 'docs/yandex/function.js'))._internals;
    const out = P.pushEncrypt('When I grow up, I want to be a watermelon',
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg',
      { privateKey: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', salt: 'DGv6ra1nlYgDCS1FRnbzlw' });
    ok('RFC 8291 Appendix A, byte for byte', b64u(out) === 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
    const auth = P.vapidAuth('https://web.push.apple.com/QAbc');
    const claims = jwtVerifies(jwtOf(auth), VK.pub);
    ok('the VAPID token verifies with the public key and names the push service', !!claims && claims.aud === 'https://web.push.apple.com' && claims.exp > Date.now() / 1000, JSON.stringify(claims));
    ok('  and the key travels with it', auth.indexOf('k=' + VK.pub) > 0);
  }

  console.log('\n2. the endpoint keeps the subscriptions');
  const A = mkPhone('A'), B = mkPhone('B'), C = mkPhone('C');
  {
    const v = await get({ action: 'vapid' });
    ok('action=vapid hands out the public key', v.ok && v.key === VK.pub, JSON.stringify(v));
    const a = await post({ op: 'subscribe', sub: A.sub(), dev: 'DAAAA', lang: 'en', ua: 'iPhone' });
    const b = await post({ op: 'subscribe', sub: B.sub(), dev: 'DBBBB', lang: 'ru', ua: 'iPhone' });
    const c = await post({ op: 'subscribe', sub: C.sub(), dev: 'DCCCC', lang: 'en' });
    ok('three phones subscribe', a.ok && b.ok && c.ok, JSON.stringify([a, b, c]).slice(0, 120));
    ok('  and are on the folder under _meta/push', (await keysOnServer()).length === 3, (await keysOnServer()).join(' '));
    const again = await post({ op: 'subscribe', sub: A.sub(), dev: 'DAAAA', lang: 'en' });
    ok('subscribing again is the same document, not a second one', again.ok && (await keysOnServer()).length === 3);
    const u = await post({ op: 'unsubscribe', endpoint: C.sub().endpoint });
    ok('a phone can withdraw', u.ok && (await keysOnServer()).length === 2);
    ok('a subscription with no keys is refused', (await post({ op: 'subscribe', sub: { endpoint: PS.url + '/x' } })).ok === false);
    ok('a push on demand is admin-only', (await post({ op: 'push', kind: 'test' })).ok === false);
  }

  console.log('\n3. the three triggers reach every phone');
  {
    const poll = () => fetch(YAB + '/__push/poll').then(r => r.json());
    pushed.length = 0;
    await poll();
    ok('the first poll only notes the build', pushed.length === 0, pushed.length + ' pushes');
    BUMP = '999';
    const r = await poll();
    ok('a new build on Pages pushes to both phones', r && r.sent === 2 && pushed.length === 2, JSON.stringify(r));
    const forA = pushed.find(x => x.url.endsWith('/push/A')), forB = pushed.find(x => x.url.endsWith('/push/B'));
    ok('  each message carries the VAPID token, aes128gcm, a TTL and the build topic', !!forA && /^vapid t=/.test(forA.headers.authorization) && forA.headers['content-encoding'] === 'aes128gcm' && forA.headers.ttl === '86400' && forA.headers.topic === 'cm-build' && forA.headers.urgency === 'high',
       forA && JSON.stringify({ ce: forA.headers['content-encoding'], ttl: forA.headers.ttl, topic: forA.headers.topic, urg: forA.headers.urgency }));
    const claims = forA && jwtVerifies(jwtOf(forA.headers.authorization), VK.pub);
    ok('  the token is for this push service', !!claims && claims.aud === PS.url, JSON.stringify(claims));
    let pa = null, pb = null; try { pa = JSON.parse(decrypt(A, forA.body)); pb = JSON.parse(decrypt(B, forB.body)); } catch (e) { fails.push('decrypt: ' + e.message); }
    ok('  phone A decrypts it: a build push naming 999, in English', pa && pa.kind === 'build' && pa.build === '999' && pa.lang === 'en', JSON.stringify(pa));
    ok('  phone B decrypts its own: in Russian', pb && pb.kind === 'build' && pb.lang === 'ru', JSON.stringify(pb));
    ok('  B cannot read A\'s', (() => { try { decrypt(B, forA.body); return false; } catch (e) { return true; } })());
    pushed.length = 0;
    await poll();
    ok('the same build again pushes nothing', pushed.length === 0, pushed.length + ' pushes');

    pushed.length = 0;
    const pl = await plant('TK171', '2026-09-05', 'MP');
    ok('a round lands on the folder', pl.ok && pl.saved.length === 1);
    ok('  and within a moment every phone is told the folder changed', await until(() => pushed.length >= 2, 5000), pushed.length + ' pushes');
    const f = pushed[0] && JSON.parse(decrypt(pushed[0].url.endsWith('/A') ? A : B, pushed[0].body));
    ok('  as a folder push, at normal urgency', f && f.kind === 'folder' && pushed[0].headers.urgency === 'normal' && pushed[0].headers.topic === 'cm-folder', JSON.stringify(f));

    pushed.length = 0;
    const d = await fetch(YAB + '/__push/daily').then(r => r.json());
    ok('the daily readiness push reaches both', d.sent === 2 && pushed.length === 2, JSON.stringify(d));
    ok('  as a daily push', JSON.parse(decrypt(A, pushed.find(x => x.url.endsWith('/A')).body)).kind === 'daily');

    statusFor = url => url.endsWith('/push/B') ? 410 : 201;
    pushed.length = 0;
    const g = await fetch(YAB + '/__push/daily').then(r => r.json());
    ok('a subscription the push service says is gone is dropped', g.sent === 1 && g.gone === 1 && (await keysOnServer()).length === 1, JSON.stringify(g) + ' left ' + (await keysOnServer()).length);
    statusFor = () => 201;
    BUMP = null;
  }

  console.log('\n4. the phone registers itself, and the worker, woken, does the work');
  const b = await chromium.launch({ channel: 'chromium' });   // the headless shell has no notifications
  const D = mkPhone('D');
  {
    const { ctx, p } = await phone(b, APP, { phone: D });
    ok('installed and in charge', await p.evaluate(() => !!navigator.serviceWorker.controller));
    const ps = await p.evaluate(() => __pushSetup());
    ok('the phone subscribed itself with the server\'s key, with nothing tapped beyond the permission', ps.k === 'on', JSON.stringify(ps));
    const onServer = await keysOnServer();
    ok('  and the endpoint holds its subscription', onServer.length === 2, onServer.length + ' subscriptions');
    const cfg = await p.evaluate(async () => { const c = await caches.open('cm_config'); const r = await c.match('__config'); return r ? r.json() : null; });
    ok('the worker has been told the backend, the cursor, the device and the language', cfg && cfg.url && cfg.dev && cfg.lang && typeof cfg.cursor === 'number', JSON.stringify(cfg));

    let w = await swWake(p, { kind: 'daily' });
    ok('a wake with nothing wrong: ready, every file, fleet list fetched, nothing queued', w.ready === true && w.have === w.need && w.fleetAt > 0 && w.pending === 0 && w.notified === true, JSON.stringify(w).slice(0, 300));
    let n = await notifs(p);
    ok('  and it says so in a notification', n.length === 1 && n[0].title === 'Ready for the field' && /build/.test(n[0].body), JSON.stringify(n));
    const pre = await p.evaluate(async () => { const c = await caches.open('cm_config'); const r = await c.match('__team-prefetch'); return r ? r.json() : null; });
    ok('  the fleet list is kept for the next open, from this phone\'s cursor', pre && pre.since === cfg.cursor && pre.reply && (pre.via === 'index' ? !!pre.reply.v : !!pre.reply.records), pre && JSON.stringify({ since: pre.since, via: pre.via }));

    await p.evaluate(async () => { await dbPut({ id: 'up__push1', equip: 'TK146', date: '2026-09-05', type: 'MP', positions: {}, created: new Date().toISOString(), up: 0, rev: 1 }); });
    w = await swWake(p, { kind: 'daily' });
    ok('a round still to send: not ready, and the count is right', w.ready === false && w.pending === 1, JSON.stringify({ ready: w.ready, pending: w.pending }));
    n = await notifs(p);
    ok('  the notification says "Not ready" and names the round to send', n.length === 1 && n[0].title === 'Not ready for the field' && /1 round/.test(n[0].body), JSON.stringify(n));
    await p.evaluate(() => dbDel('up__push1'));

    BUMP = '998';
    w = await swWake(p, { kind: 'build', build: '998' });
    ok('a build push: the worker sees 998 on the server and starts it', w.server === '998', JSON.stringify({ server: w.server, newer: w.newer, err: w.updateErr }));
    const got = await until(async () => (await buildOf(p)) === '998', 40000, 500);
    ok('  and the phone is on the new build with nothing tapped', got, String(await buildOf(p)));
    BUMP = null;
    await ctx.close();
  }

  console.log('\n5. what the worker fetched while closed is on the due list at the next open, in the pit');
  {
    const E = mkPhone('E');
    const { ctx, p } = await phone(b, APP, { phone: E });
    const before = await p.evaluate(() => teamAll().some(x => x.u === 'TK172'));
    ok('TK172 is not known yet', !before);
    ok('a round on TK172 lands on the folder while the app is closed', (await plant('TK172', '2026-09-05', 'MP')).ok);
    const w = await swWake(p, { kind: 'folder' });
    ok('the worker prefetched it', w.fleetAt > 0 && w.fleetRows >= 1, JSON.stringify({ rows: w.fleetRows, via: w.fleetVia, err: w.fleetErr }));
    const kept = await p.evaluate(async () => { const c = await caches.open('cm_config'); const r = await c.match('__team-prefetch'); return r ? r.json() : null; });
    await ctx.setOffline(true);
    await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(3000);
    const dbg = await p.evaluate(() => ({ cur: localStorage.getItem('cm_team_cursor'), short: (typeof histIsShort === 'function') ? histIsShort() : '?', n: teamAll().length, last: teamAll().map(x => x.u).slice(-5) }));
    ok('opened in the pit, TK172 is on the list', await p.evaluate(() => teamAll().some(x => x.u === 'TK172')),
       JSON.stringify(dbg) + ' prefetch since ' + (kept && kept.since) + ' via ' + (kept && kept.via) + ' records=' + JSON.stringify(kept && kept.reply && (kept.reply.records || []).map(r => r.equip)));
    ok('  and the prefetch was consumed', await p.evaluate(async () => !(await (await caches.open('cm_config')).match('__team-prefetch'))));
    await ctx.setOffline(false);
    await ctx.close();
  }

  console.log('\n6. the readiness check runs itself');
  {
    const F = mkPhone('F');
    const { ctx, p } = await phone(b, APP, { phone: F });
    const y0 = await until(() => p.evaluate(() => !!window.__yard), 15000, 500);
    ok('it ran at boot, with the System screen never opened', y0 && await p.evaluate(() => !document.getElementById('paneSystem').classList.contains('on')));
    ok('  and on a clean phone with signal every row is green', await p.evaluate(() => __yard.rows.every(r => r.k === 'ok')), await p.evaluate(() => __yard.rows.filter(r => r.k !== 'ok').map(r => r.key + ':' + r.k).join(' ')) || 'all green');
    await p.evaluate(async () => { await dbPut({ id: 'up__push2', equip: 'TK147', date: '2026-09-05', type: 'MP', positions: {}, created: new Date().toISOString(), up: 0, rev: 1 }); });
    await p.evaluate(() => yardCheck()); await p.waitForTimeout(500);
    const bar = await p.evaluate(() => (document.getElementById('readyBar') || {}).textContent || '');
    const notT = await p.evaluate(() => t('rdy_bar_not', { s: t('rdy_v_photos') }));
    ok('a round to send: the bar at the top says not ready and why, without a tap', bar === notT, bar);
    const n = await notifs(p);
    ok('  and a notification says so', n.some(x => x.title === 'Not ready for the field'), JSON.stringify(n));
    await p.evaluate(() => dbDel('up__push2'));
    await p.evaluate(() => yardCheck()); await p.waitForTimeout(500);
    ok('sent, the bar is back to the good news', await p.evaluate(() => /good/.test(document.getElementById('readyBar').className)), await p.evaluate(() => document.getElementById('readyBar').textContent));
    await ctx.close();
  }

  await b.close(); app.close(); PS.srv.close(); bye();
  if (fails.length) console.log('\nya-srv said:\n' + yaLog.join('').slice(-1500));
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
