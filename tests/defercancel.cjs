/* "CANCEL THE DEFERRAL" PUTS THE MACHINE BACK ON THE LIST, ON EVERY SURFACE.

   The office writes a cancellation as {until:null, why:"", cleared:1}. Google
   (and Yandex before it) hands deferrals on with only u/t/until/why/whyKey/by/at,
   so `cleared` never arrived and every other reader stored "put off, no end
   date": DUE.status 'off', the machine taken OFF every list — the opposite of
   the button (deep scan, 2026-10-27, build 566). A marker with no date and no
   reason is a cancellation: no real deferral has neither, because the office
   and the phone refuse one without a reason.

   Run: node tests/defercancel.cjs   (needs the app on 8093, as tests/runall.sh starts it) */
const { chromium } = require(require('./pw.cjs'));
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };
const B = 'http://127.0.0.1:8093';
const OFF = { u: 'TK146', t: 'INSP', until: null, why: 'Machine parked for the winter', whyKey: 'parked', by: 'Planner', at: '2026-10-26T08:00:00.000Z' };
// What Google delivers for the office's cancel: `cleared` gone.
const CANCEL = { u: 'TK146', t: 'INSP', until: null, why: '', whyKey: '', by: 'Planner', at: '2026-10-27T08:00:00.000Z' };
const OLDCANCEL = Object.assign({}, CANCEL, { at: '2026-10-25T08:00:00.000Z' });

(async () => {
  const b = await chromium.launch();
  { // the phone
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    await p.goto(B + '/mobile/index.html');
    await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?');
    const r = await p.evaluate(({ OFF, CANCEL, OLDCANCEL }) => {
      teamDefer([OFF]); const a = !!deferOf('INSP', 'TK146');
      teamDefer([OLDCANCEL]); const b = !!deferOf('INSP', 'TK146');
      teamDefer([CANCEL]); const c = deferOf('INSP', 'TK146');
      teamDefer([Object.assign({}, OFF, { at: '2026-10-28T08:00:00.000Z' })]); const d = !!deferOf('INSP', 'TK146');
      return { a, b, c, d };
    }, { OFF, CANCEL, OLDCANCEL });
    ok('phone: a real "not being done" with a reason is held', r.a === true, JSON.stringify(r));
    ok('phone: an OLDER cancel does not undo it', r.b === true, JSON.stringify(r));
    ok('phone: the cancel as Google delivers it (no `cleared`) removes it', r.c === null, JSON.stringify(r.c));
    ok('phone: and a later real deferral holds again', r.d === true, JSON.stringify(r));
    await p.context().close();
  }
  for (const page of ['dashboard', 'dashboard-next']) {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await p.goto(B + '/' + page + '/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => window.CMDash && CMDash.setDeferrals);
    const r = await p.evaluate(({ OFF, CANCEL, OLDCANCEL }) => {
      const has = () => !!CMDash.deferrals()['INSP|TK146'];
      CMDash.setDeferrals([OFF]); const a = has();
      CMDash.setDeferrals([OLDCANCEL]); const b = has();
      CMDash.setDeferrals([CANCEL]); const c = has();
      CMDash.setDeferrals([OFF, CANCEL], { replace: true }); const d = has();
      return { a, b, c, d };
    }, { OFF, CANCEL, OLDCANCEL });
    ok(page + ': a real "not being done" is held', r.a === true, JSON.stringify(r));
    ok(page + ': an older cancel does not undo it', r.b === true, JSON.stringify(r));
    ok(page + ': the cancel as Google delivers it removes it', r.c === false, JSON.stringify(r));
    ok(page + ': on a full read the later cancel wins over the earlier deferral', r.d === false, JSON.stringify(r));
    await p.context().close();
  }
  await b.close();
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
