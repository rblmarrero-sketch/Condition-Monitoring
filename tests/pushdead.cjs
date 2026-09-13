/* A SUBSCRIPTION THE PUSH SERVICE REFUSES IS RETIRED, AND THE PHONE CAN FIND
   OUT — WITHOUT ANYBODY BEING TOLD TO.

   Read off the VM on 2026-09-13: six of seven handsets had been refused by
   Apple with `BadJwtToken` for up to a week. Every build push, every folder
   push and every daily readiness push went nowhere on those phones, and the
   only sign of it was a line in a log nobody reads — a line that claimed the
   phone "re-subscribes by itself at its next open". It does not.

   It cannot. The phone decides whether its subscription is stale by reading
   the key it was MADE with off the subscription object; Safari does not
   expose that, so the phone falls back to what the page remembers storing,
   which matches, and it concludes all is well. From the phone's side a dead
   subscription is indistinguishable from a live one. The end that knows is
   the server, and it was doing nothing with what it knew.

   Since build 358:
   · two consecutive 401/403 refusals retire the subscription — one is not
     enough, because a push service can have a bad minute and retiring a
     healthy phone costs it every wake-up until somebody opens the app;
   · a success clears the count;
   · `op:"held"` answers the one question a phone can ask that settles it;
   · the phone acts on `held:false` only, never on silence.

   Everything here goes through the real endpoint (ya-srv.cjs over the
   in-memory bucket) with a stand-in push service, so what is measured is the
   decision. The crypto is tests/bgpush.cjs's job, against the RFC's vector.

   Run: node tests/pushdead.cjs        (spawns tests/ya-srv.cjs on 8139) */
const { spawn } = require('child_process');
const http = require('http'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const YA = Number(process.argv[2] || 8139), YAB = 'http://127.0.0.1:' + YA, EXEC = YAB + '/exec';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const post = b => fetch(EXEC, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(b) }).then(r => r.json());

const VK = (() => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); return { pub: b64u(e.getPublicKey()), priv: b64u(e.getPrivateKey()) }; })();
const PS = { srv: null, url: '' };
let statusFor = () => 201;
let sends = 0;
function mkPhone(id) {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  return { id, pub: e.getPublicKey(), auth: crypto.randomBytes(16),
           ep() { return PS.url + '/push/' + this.id; },
           sub() { return { endpoint: this.ep(), keys: { p256dh: b64u(this.pub), auth: b64u(this.auth) } }; } };
}
const held = ep => post({ op: 'held', endpoint: ep }).then(r => r.held);
const pushNow = () => post({ op: 'push', admin: 'letmein', kind: 'test' });

(async () => {
  PS.srv = http.createServer((req, res) => {
    const ch = []; req.on('data', c => ch.push(c));
    req.on('end', () => { sends++; const st = statusFor(req.url); res.writeHead(st);
                          res.end(st === 403 ? '{"reason":"BadJwtToken"}' : ''); });
  });
  await new Promise(r => PS.srv.listen(0, r));
  PS.url = 'http://127.0.0.1:' + PS.srv.address().port;

  const ya = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(YA), 'letmein'],
    { stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, { VAPID_PUBLIC: VK.pub, VAPID_PRIVATE: VK.priv,
        VAPID_SUBJECT: 'mailto:test@example.invalid' }) });
  const yaLog = []; ya.stdout.on('data', d => yaLog.push(String(d))); ya.stderr.on('data', d => yaLog.push(String(d)));
  const bye = () => { try { ya.kill(); } catch (e) {} try { PS.srv.close(); } catch (e) {} };
  process.on('exit', bye);
  for (let i = 0; i < 80; i++) { try { await fetch(EXEC + '?action=list&ext=.json'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }

  const A = mkPhone('phone-a');

  console.log('1. a phone subscribes, and can ask whether it is held');
  const s1 = await post({ op: 'subscribe', sub: A.sub(), dev: 'DAAAAA', lang: 'en' });
  ok('the subscription is accepted', s1 && s1.ok === true, JSON.stringify(s1 && s1.error || 'ok'));
  ok('  held says yes', (await held(A.ep())) === true);
  ok('  and no for an endpoint it never had', (await held(PS.url + '/push/never')) === false);

  console.log('\n2. one refusal is not a verdict');
  statusFor = () => 403;
  let r = await pushNow();
  ok('counted as failed, not gone', r.failed === 1 && r.gone === 0, JSON.stringify({ failed: r.failed, gone: r.gone }));
  ok('  the subscription is kept — a push service may have a bad minute', (await held(A.ep())) === true);
  ok('  and the reason is named, not just counted', /different key pair/.test((r.why[0] || {}).hint || ''), (r.why[0] || {}).hint || '');

  console.log('\n3. a success clears it, so one bad hour cannot retire a healthy phone');
  statusFor = () => 201;
  await pushNow();
  statusFor = () => 403;
  r = await pushNow();
  ok('the count started again from one', r.failed === 1 && r.gone === 0, JSON.stringify({ failed: r.failed, gone: r.gone }));
  ok('  and it is still held', (await held(A.ep())) === true);

  console.log('\n4. twice refused IS a verdict: retired, and said');
  r = await pushNow();
  ok('the second consecutive refusal drops it', r.gone === 1 && r.failed === 0, JSON.stringify({ failed: r.failed, gone: r.gone }));
  ok('  the server no longer holds it', (await held(A.ep())) === false);
  ok('  and the reason says what happens next', /new subscription at its next open/.test((r.why[0] || {}).hint || ''), (r.why[0] || {}).hint || '');
  sends = 0;
  r = await pushNow();
  ok('  a retired subscription is not pushed at again', r.total === 0 && sends === 0, r.total + ' subscription(s), ' + sends + ' send(s)');

  console.log('\n5. the phone makes a fresh one, and that one is live');
  const B = mkPhone('phone-b');
  statusFor = () => 201;
  await post({ op: 'subscribe', sub: B.sub(), dev: 'DAAAAA', lang: 'en' });
  ok('held says yes for the new one', (await held(B.ep())) === true);
  r = await pushNow();
  ok('  and it is pushed to', r.sent === 1 && r.gone === 0, JSON.stringify({ sent: r.sent, gone: r.gone }));

  console.log('\n6. 410 still retires at once — that one IS a verdict on its own');
  statusFor = () => 410;
  r = await pushNow();
  ok('dropped on the first answer', r.gone === 1, JSON.stringify({ gone: r.gone }));
  ok('  and no longer held', (await held(B.ep())) === false);

  console.log('\n7. a refusal for any OTHER reason retires nothing');
  const C = mkPhone('phone-c');
  await post({ op: 'subscribe', sub: C.sub(), dev: 'DCCCCC', lang: 'en' });
  statusFor = () => 500;
  await pushNow(); await pushNow(); await pushNow();
  ok('three server errors leave it alone', (await held(C.ep())) === true);
  statusFor = () => 201;
  r = await pushNow();
  ok('  and it is pushed to when the service recovers', r.sent === 1, JSON.stringify({ sent: r.sent }));

  console.log('\n8. held refuses to guess');
  const bad = await post({ op: 'held' });
  ok('no endpoint is an error, not a false', bad && bad.ok === false, JSON.stringify(bad));

  if (fails.length) console.log('\nya-srv said:\n' + yaLog.join('').slice(-1200));
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  bye();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.message || e)); process.exit(1); });
