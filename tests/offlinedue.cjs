/* THE DUE LIST AND THE HISTORY ARE STILL THERE WITH NO SIGNAL.

   Reported 08.11.2026: "when they go offline the history or inspection due
   list are disappearing. When they leave the office and it says green they
   must have all the information."

   Cause: the 1C schedule copy was kept under "cm_sched_cache_v"+BUILD and the
   old copies were never deleted. The file is ~260 kB now, so a dozen updates
   filled the phone's localStorage; the new schedule could not be saved and
   histSave/teamSave dropped the history to make room. With signal everything
   showed (memory); offline, nothing did. And the readiness card never looked.

   What has to be true:
     · after an update, the old per-build copies are gone and the schedule is
       saved under one key at boot, without anybody opening Due;
     · the history is saved;
     · cold start with no network: 1C PM, the CM agenda and the history all
       have rows;
     · the readiness card has a row for it, green when it is saved, and is
       NOT green when the schedule is not on the phone.

   Run: node tests/offlinedue.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const until = require('./until.cjs');
const PORT = Number(process.argv[2] || 8093);
const B = `http://127.0.0.1:${PORT}`;
let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };
const yardRow = (p, title) => p.evaluate(tt => {
  const r = [...document.querySelectorAll('.yardrow')].find(x => (x.querySelector('b') || {}).textContent === tt);
  return r ? { k: ['ok','warn','bad'].find(c => r.classList.contains(c)) || '?', s: r.querySelector('.w span').textContent } : null;
}, title);

(async () => {
  await fetch(B + '/__seed');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { localStorage.setItem('cm_holder', JSON.stringify({ name: 'Test Holder', badge: 'T1', at: '2026-10-01T00:00:00Z' })); });
  await ctx.addInitScript(u => { if (!localStorage.getItem('up_dests')) localStorage.setItem('up_dests', JSON.stringify([
    { id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' },
    { id: 'pa', on: false, url: 'https://off.invalid/', sec: '', folder: '' },
    { id: 'post', on: false, url: 'https://off.invalid/', sec: '', folder: '' }])); }, B + '/exec');
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });

  console.log('── a phone that has been through many updates: storage full of old schedule copies');
  const filled = await p.evaluate(() => {
    const pad = 'x'.repeat(260000); let n = 0;
    ['cm_sched_cache', 'cm_team', 'cm_hist', 'cm_team_cursor', 'cm_hist_at'].forEach(k => localStorage.removeItem(k));
    for (let b = 500; b < 700; b++) {
      try { localStorage.setItem('cm_sched_cache_v' + b, JSON.stringify({ at: Date.now() - (700 - b) * 6e5, data: { byUnit: {}, rtwOpen: [], pad } })); n++; }
      catch (e) { break; }
    }
    return n;
  });
  console.log('  ....  old copies written until storage refused: ' + filled);
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });

  console.log('\n── after the update, with signal, nobody opening Due');
  const saved = await until(p, () => {
    try {
      const s = JSON.parse(localStorage.getItem('cm_sched_cache') || 'null');
      const tm = JSON.parse(localStorage.getItem('cm_team') || '[]');
      return !!(s && s.b === BUILD && s.data && s.data.rtwOpen && s.data.rtwOpen.length && tm.length >= 3);
    } catch (e) { return false; }
  }, null, { timeout: 40000 }).then(() => true, () => false);
  const st = await p.evaluate(() => ({
    legacy: Object.keys(localStorage).filter(k => /^cm_sched_cache_v/.test(k)).length,
    sched: (() => { try { const s = JSON.parse(localStorage.getItem('cm_sched_cache') || 'null'); return s ? { b: s.b, pm: (s.data.rtwOpen || []).length, units: Object.keys(s.data.byUnit || {}).length } : null; } catch (e) { return 'unreadable'; } })(),
    team: (() => { try { return JSON.parse(localStorage.getItem('cm_team') || '[]').length; } catch (e) { return -1; } })(),
    hist: (() => { try { return Object.keys(JSON.parse(localStorage.getItem('cm_hist') || '{}')).length; } catch (e) { return -1; } })() }));
  ok('the old per-build schedule copies are deleted', st.legacy === 0, st.legacy + ' left');
  ok('the 1C schedule is saved on the phone at boot', saved && st.sched && st.sched.pm > 0, JSON.stringify(st.sched));
  ok('the history is saved on the phone', st.team >= 3 && st.hist >= 3, st.team + ' rounds, ' + st.hist + ' machines');

  await p.click('#tabbar [data-pane="paneSystem"]');
  await p.waitForTimeout(6000);
  const title = await p.evaluate(() => t('rdy_dat_t'));
  const row = await yardRow(p, title);
  ok('the readiness card says the due list and history are saved', row && row.k === 'ok', row ? row.k + ' · ' + row.s : 'no row');

  console.log('\n── no signal, the app opened from cold');
  await p.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
  await p.waitForTimeout(1500);
  await ctx.setOffline(true);
  const cold = await ctx.newPage();
  cold.on('pageerror', e => errs.push('offline: ' + e.message));
  await cold.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await cold.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await cold.waitForTimeout(1200);
  await cold.click('#tabbar [data-pane="paneDue"]');
  await cold.waitForTimeout(1200);
  await cold.evaluate(() => { dueView = 'pm'; renderDue(); });
  await cold.waitForTimeout(1000);
  const pm = await cold.evaluate(() => document.querySelectorAll('#duePmList [data-wo]').length);
  ok('1C PM lists its work orders', pm > 0, pm + ' rows');
  await cold.evaluate(() => { dueView = 'cm'; dueSpan = 'all'; renderDue(); });
  await cold.waitForTimeout(1000);
  const cm = await cold.evaluate(() => ({ sched: !!(window.SCHED || (typeof SCHED !== 'undefined' && SCHED)),
    rows: document.querySelectorAll('#dueCmList .agitem').length }));
  ok('the CM agenda has its schedule', cm.sched, JSON.stringify(cm));
  const hist = await cold.evaluate(() => { renderTeam(); return { rows: teamAll().length, shown: document.querySelectorAll('#teamList > *').length }; });
  ok('the history has its rounds', hist.rows >= 3 && hist.shown > 0, JSON.stringify(hist));
  await ctx.setOffline(false);

  console.log('\n── a phone whose schedule is NOT saved is not green');
  await p.evaluate(() => { localStorage.removeItem('cm_sched_cache'); });
  await until(p, async tt => { await yardCheck();
    const r = [...document.querySelectorAll('.yardrow')].find(x => (x.querySelector('b') || {}).textContent === tt);
    return !!(r && r.classList.contains('bad')); }, title, { timeout: 30000 }).catch(() => {});
  const row2 = await yardRow(p, title);
  ok('the row is red', row2 && row2.k === 'bad', row2 ? row2.k + ' · ' + row2.s : 'no row');
  const verdict = await p.evaluate(() => ({ badge: document.getElementById('yardBadge').className,
    sum: document.getElementById('yardSum').textContent, want: t('rdy_v_data') }));
  ok('and the card is red and says the due list is not saved', /bad/.test(verdict.badge) && verdict.sum === verdict.want, verdict.sum);

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  console.log(fail ? `\nFAILED ${fail}` : '\nall passed');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
