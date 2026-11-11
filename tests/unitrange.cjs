/* CM_UREP_V1 — "One machine — its history and trend" by inspection type and date range (Rickie 11.11.2026:
   "generate report for 1 equipment for one type of inspection on date range"). Both office pages: the type list
   offers the machine's own types, From / To narrow the rounds, the preview counts what will print, the PDF's
   subtitle names the type and range, "Make again" restores the choice, a plain unit (Equipment History's own
   button) is the whole history as before, and an empty match is said rather than printing an empty report. */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
const rec = (type, date, g) => ({ equip: 'ZZ950', date, type, by: 'Test Inspector', dev: 'DTEST1',
  items: [{ key: type === 'MP' ? '1' : 'HS.MP', grade: g, comment: type + ' ' + date }] });
const RECS = [rec('MP', '2026-09-05', 1), rec('MP', '2026-10-03', 2), rec('MP', '2026-10-20', 3), rec('INSP', '2026-10-10', 1), rec('FC', '2026-11-01', 1)];

(async () => {
  await new Promise(r => srv.listen(0, r));
  const BASE = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  for (const page of ['dashboard', 'dashboard-next']) {
    console.log('\n== ' + page);
    const ctx = await b.newContext({ viewport: { width: 1440, height: 960 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('cm_dash_lang', 'en'); } catch (e) {} });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/' + page + '/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); });
    await p.evaluate(r => window.CMDash.importRecords(r), RECS);
    await p.waitForTimeout(500);
    await p.evaluate(() => { try { localStorage.setItem('cm_rpt_view', 'pdf'); } catch (e) {} showTab('reports'); if (window.cmViews) window.cmViews('reports'); });
    await p.evaluate(() => { $('rScope').value = 'unit'; refreshReportTargets(); selectReportTarget('ZZ950'); });
    await p.waitForTimeout(200);
    ok('the type and date fields show for one machine', await p.evaluate(() => !$('rUnitFilt').hidden));
    ok('the type list is "All types" and the machine\'s own types', JSON.stringify(await p.$$eval('#rUType option', o => o.map(x => x.value).sort())) === JSON.stringify(['', 'FC', 'INSP', 'MP']));
    ok('with nothing chosen the target is the unit alone (whole history, as before)', await p.evaluate(() => rTargetFull() === 'ZZ950' && CMReport.recsForScope('unit', rTargetFull()).length === 5));
    await p.selectOption('#rUType', 'MP');
    await p.fill('#rUFrom', '2026-10-01'); await p.dispatchEvent('#rUFrom', 'change');
    await p.fill('#rUTo', '2026-10-31'); await p.dispatchEvent('#rUTo', 'change');
    const tgt = await p.evaluate(() => rTargetFull());
    ok('type and dates travel in the target', tgt === 'ZZ950|MP|2026-10-01|2026-10-31', tgt);
    const got = await p.evaluate(t => CMReport.recsForScope('unit', t).map(r => r.date), tgt);
    ok('only that type inside the range, both ends included', JSON.stringify(got) === JSON.stringify(['2026-10-03', '2026-10-20']), got.join(','));
    ok('the preview counts what will print and names the range', await p.evaluate(() => /2 inspection/.test($('rPreview').textContent) && /Magnetic Plug/.test($('rPreview').textContent) && /01\.10\.2026/.test($('rPreview').textContent)), await p.evaluate(() => $('rPreview').textContent.slice(0, 120)));
    const sub = await p.evaluate(t => { const s = CMReport.sectionsFor('unit', t, { photos: false }); return s.map(x => x.html).join(' '); }, tgt);
    const txt = sub.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    ok('the report says what it covers under its masthead', /Report covers: Magnetic Plug · 01\.10\.2026 – 31\.10\.2026/.test(txt), (txt.match(/Report covers[^/]{0,60}/) || [''])[0]);
    ok('and in Russian beside it', /Отчёт охватывает: Осмотр магнитной пробки|Отчёт охватывает: Магнитн/.test(txt) || /Отчёт охватывает:/.test(txt));
    ok('the report holds only those rounds', !/INSP 2026-10-10|FC 2026-11-01|MP 2026-09-05/.test(txt) && await p.evaluate(t => CMReport.ctxFor(CMReport.recsForScope('unit', t), { scope: 'unit', target: t, photos: false }).records.length === 2, tgt));
    ok('the types left out are not called "never inspected"', !/General Inspection|Filter Cut/.test(txt.split('Report covers')[1] ? txt.slice(0, txt.indexOf('Equipment and component') > 0 ? txt.indexOf('Equipment and component') : 3000) : txt));
    const whole = await p.evaluate(() => CMReport.sectionsFor('unit', 'ZZ950', { photos: false }).map(x => x.html).join(' ').replace(/<[^>]+>/g, ' '));
    ok('the whole history (plain unit) has no "covers" line', !/Report covers/.test(whole));
    await p.fill('#rUFrom', '2027-01-01'); await p.dispatchEvent('#rUFrom', 'change'); await p.fill('#rUTo', ''); await p.dispatchEvent('#rUTo', 'change');
    ok('no match is said, not printed', await p.evaluate(() => /No inspections of this machine/.test($('rPreview').textContent)));
    const n = await p.evaluate(() => runReport('unit', rTargetFull(), $('rGo'), reportOpts()));
    ok('Generate on no match makes no PDF and says why', n === 0 && /No inspections of this machine/.test(await p.textContent('#rGo') + (await p.evaluate(() => (document.getElementById('rMsg') || {}).textContent || ''))));
    await p.evaluate(() => { $('rUType').value = ''; $('rUFrom').value = ''; $('rUTo').value = ''; selectReportTarget('ZZ950|INSP|2026-10-01|'); });
    ok('"Make again" restores the type and dates', await p.evaluate(() => $('rTarget').value === 'ZZ950' && $('rUType').value === 'INSP' && $('rUFrom').value === '2026-10-01' && rTargetFull() === 'ZZ950|INSP|2026-10-01|'));
    await p.evaluate(() => { $('rScope').value = 'round'; refreshReportTargets(); });
    ok('hidden for the other kinds of report', await p.evaluate(() => $('rUnitFilt').hidden && rTargetFull().indexOf('|') < 0));
    ok('Russian labels', await p.evaluate(() => { const k = I18N.ru; return k.r_u_type === 'Вид осмотра' && k.r_u_from === 'С' && k.r_u_to === 'По' && !!k.r_u_none; }));
    ok('no page error', errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails.length ? '\nFAIL ' + fails.length + '\n  ' + fails.join('\n  ') : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('CRASH ' + e.stack); process.exit(1); });
