/* CM_WEEK_V1 (build 603, Rickie 08.11 11:19 "lets do it, implement to all"): Period -> Week on the office dashboard, as on Assets
   Down, Asset history and the WO Manager (WEEK_PER_V1, askpi-site). Proves on dashboard-next, plain and under /cm/ (the site bar):
     · the Period list has Week, named with this week's number; choosing it = Monday .. today (DUE.today), periodRange agrees;
     · filtered() keeps exactly the inspections dated inside the week (counted here from RECS);
     · the stepper: › greyed out on this week, ‹ goes to Monday .. Sunday of the week before, fWeek = YYYY-Www, the address carries wk=;
     · a reload of that address opens the same week; the week list has 12 weeks; the year / week box jumps; a future week is refused;
     · choosing Last 30 days puts the stepper away and clears the week; Russian says Нед. <n>; no sideways scroll at 390; no page errors.
   Run: node tests/cmweek.cjs   (spawns tests/mock.cjs on 8489 for data) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), MP = 8489;
let fails = 0; const ok = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '   ' + d : ''}`); if (!c) fails++; };
const mock = spawn(process.execPath, [path.join(__dirname, 'mock.cjs'), String(MP)], { stdio: 'ignore' }); process.on('exit', () => { try { mock.kill(); } catch (e) {} });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/site/std.js' || u === '/site/std.css') { r.writeHead(200, { 'Content-Type': T[path.extname(u)] }); return r.end(fs.readFileSync(path.join(__dirname, 'site_std_copy', path.basename(u)))); }
  if (u.startsWith('/site/')) { r.writeHead(404); return r.end(); }
  if (u.startsWith('/exec')) { const pr = http.request({ host: '127.0.0.1', port: MP, path: q.url, method: q.method, headers: q.headers }, x => { r.writeHead(x.statusCode, x.headers); x.pipe(r); });
    pr.on('error', () => { r.writeHead(502); r.end(); }); return q.pipe(pr); }
  let p = path.join(ROOT, u.startsWith('/cm/') ? u.slice(4) : u); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
});
const mon = d => d - (d + 3) % 7, dayOf = s => Math.round(Date.parse(s + 'T00:00:00Z') / 864e5), iso = d => new Date(d * 864e5).toISOString().slice(0, 10);
const isoW = m0 => { const th = m0 + 3, y = new Date(th * 864e5).getUTCFullYear(); return { y, w: Math.floor((th - Date.UTC(y, 0, 1) / 864e5) / 7) + 1 }; };
(async () => {
  await new Promise(r => setTimeout(r, 1500)); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch();
  for (const [prefix, W, lang] of [['', 1440, 'en'], ['/cm', 1440, 'en'], ['/cm', 1440, 'ru'], ['/cm', 390, 'en']]) {
    const tagp = `${prefix || '(plain)'} ${W} ${lang}`;
    const ctx = await b.newContext({ viewport: { width: W, height: W < 600 ? 844 : 900 }, isMobile: W < 600, hasTouch: W < 600 });
    await ctx.addInitScript(([u, l]) => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1');
      localStorage.setItem('cm_dash_window', '0'); localStorage.setItem('askpi_lang', l); localStorage.setItem('cm_dash_lang', l); }, [B + '/exec', lang]);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`${B}${prefix}/dashboard-next/index.html`);
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20, null, { timeout: 60000 });
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); showTab('actions', true); }); await p.waitForTimeout(1600);
    const today = await p.evaluate(() => DUE.today()), m0 = mon(dayOf(today)), wk = isoW(m0);
    const opt = await p.evaluate(() => { const o = [...document.getElementById('fRange').options].find(x => x.value === 'week'); return o ? o.textContent : null; });
    ok(`${tagp}: the Period list has Week ${wk.w}`, opt && new RegExp((lang === 'ru' ? 'Неделя ' : 'Week ') + wk.w + '$').test(opt.trim()), opt);
    if (prefix && W > 600) {   /* through the site bar's own Period picker */
      await p.click('#cmFbPerPk'); await p.waitForTimeout(400);
      const it = await p.$$('.std-pkpop [role="option"], .std-pkpop button, .std-pkpop label');
      let hit = null; for (const x of it) { const tx = (await x.textContent()).trim(); if (/^(Week|Неделя)(\s|$)/.test(tx)) { hit = x; break; } }
      ok(`${tagp}: the site bar's Period picker offers Week`, !!hit); if (hit) { await hit.click(); await p.waitForTimeout(800); }
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    } else { await p.evaluate(() => { const r = document.getElementById('fRange'); r.value = 'week'; r.dispatchEvent(new Event('change')); }); await p.waitForTimeout(800); }
    let pr = await p.evaluate(() => periodRange());
    ok(`${tagp}: Week = Monday .. today`, pr.from === iso(m0) && pr.to === today, JSON.stringify(pr));
    const cnt = await p.evaluate(([a, z]) => { const keep = filtered().length; const want = RECS.filter(r => !r._void && r.date >= a && r.date <= z).length; return [keep, want]; }, [pr.from, pr.to]);
    ok(`${tagp}: filtered() keeps the inspections dated in the week (${cnt[1]})`, cnt[0] === cnt[1], cnt.join(' vs '));
    ok(`${tagp}: the stepper shows beside Period, › greyed out`, await p.isVisible('#cmWk') && await p.isDisabled('#cmWk [data-d="1"]'));
    const tg = lang === 'ru' ? 'Нед. ' : 'W';
    ok(`${tagp}: the stepper names the week (${tg}${wk.w})`, (await p.textContent('#cmWk .cmwkn')).trim() === tg + wk.w);
    if (W > 600) { const near = await p.evaluate(() => { const a = document.getElementById('cmFbPerPk') || document.getElementById('fRange'), s = document.getElementById('cmWk'); const ra = a.getBoundingClientRect(), rs = s.getBoundingClientRect(); return [Math.round(rs.left - ra.right), Math.round(rs.top - ra.top)]; });
      ok(`${tagp}: right beside the Period control`, near[0] >= 0 && near[0] < 20 && Math.abs(near[1]) < 12, near.join(',')); }
    await p.click('#cmWk [data-d="-1"]'); await p.waitForTimeout(900); pr = await p.evaluate(() => periodRange());
    const pw = isoW(m0 - 7), fw = await p.evaluate(() => document.getElementById('fWeek').value);
    ok(`${tagp}: ‹ goes to Monday .. Sunday of the week before`, pr.from === iso(m0 - 7) && pr.to === iso(m0 - 1) && fw === pw.y + '-W' + String(pw.w).padStart(2, '0'), JSON.stringify(pr) + ' ' + fw);
    ok(`${tagp}: the chip says the week`, (await p.evaluate(() => periodLabel())).startsWith(tg + pw.w + ' · '), await p.evaluate(() => periodLabel()));
    const h = await p.evaluate(() => location.hash);
    ok(`${tagp}: the address carries the week`, /range=week/.test(h) && new RegExp('wk=' + pw.y + '-W' + String(pw.w).padStart(2, '0')).test(h), h);
    await p.reload(); await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20, null, { timeout: 60000 }); await p.waitForTimeout(1600);
    pr = await p.evaluate(() => periodRange()); ok(`${tagp}: a reload of that address opens the same week`, pr.from === iso(m0 - 7) && await p.isVisible('#cmWk'), JSON.stringify(pr));
    await p.click('#cmWk .cmwkn'); await p.waitForTimeout(300);
    const wl = await p.$$eval('.cmwkpop button.i', xs => xs.map(x => x.textContent.trim()));
    ok(`${tagp}: the week list has 12 weeks, newest first`, wl.length === 12 && wl[0].startsWith(tg + wk.w), wl.slice(0, 2).join(' | '));
    await p.fill('.cmwkpop input.y', String(wk.y)); await p.fill('.cmwkpop input.w', String(Math.min(wk.w + 2, 52))); await p.click('.cmwkpop button.g'); await p.waitForTimeout(500);
    ok(`${tagp}: a week that has not started is refused`, await p.isVisible('.cmwkpop') && (await p.evaluate(() => periodRange().from)) === iso(m0 - 7));
    const old = m0 - 70, ow = isoW(old); await p.fill('.cmwkpop input.y', String(ow.y)); await p.fill('.cmwkpop input.w', String(ow.w)); await p.click('.cmwkpop button.g'); await p.waitForTimeout(900);
    pr = await p.evaluate(() => periodRange()); ok(`${tagp}: the year / week box jumps to ${tg}${ow.w}`, pr.from === iso(old) && pr.to === iso(old + 6), JSON.stringify(pr));
    /* a week that HAS inspections: the newest one in the data, through the box; filtered() keeps exactly those */
    const last = await p.evaluate(() => RECS.filter(r => !r._void && r.date).map(r => r.date).sort().pop()), lm = mon(dayOf(last)), lw = isoW(lm);
    await p.click('#cmWk .cmwkn'); await p.waitForTimeout(300); await p.fill('.cmwkpop input.y', String(lw.y)); await p.fill('.cmwkpop input.w', String(lw.w)); await p.click('.cmwkpop button.g'); await p.waitForTimeout(900);
    const c2 = await p.evaluate(([a, z]) => [filtered().length, RECS.filter(r => !r._void && r.date >= a && r.date <= z).length, periodRange().from], [iso(lm), iso(lm + 6)]);
    ok(`${tagp}: the week of the newest inspection (${tg}${lw.w}) keeps exactly its ${c2[1]} inspections`, c2[2] === iso(lm) && c2[1] > 0 && c2[0] === c2[1], c2.join(' / '));
    await p.evaluate(() => { const r = document.getElementById('fRange'); r.value = '30'; r.dispatchEvent(new Event('change')); }); await p.waitForTimeout(800);
    ok(`${tagp}: Last 30 days puts the stepper away and clears the week`, !(await p.isVisible('#cmWk')) && (await p.evaluate(() => document.getElementById('fWeek').value)) === '');
    const sx = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); ok(`${tagp}: no sideways scroll`, sx <= 1, sx);
    ok(`${tagp}: no page errors`, !errs.length, errs.join(' / '));
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
