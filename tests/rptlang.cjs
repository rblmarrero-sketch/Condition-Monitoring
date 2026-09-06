/* THE REPORT'S LANGUAGE IS CHOSEN, NOT IMPOSED — Phase 5.

   English, Russian, or both on one sheet, on the dashboard and on the phone;
   a single-language document carries no second rendering anywhere; the
   screen's own language is untouched by making one; and the dashboard says
   what a PDF will cost — pages, size, time — before it is made.

   Run: node tests/rptlang.cjs   (needs tests/mock.cjs on 8099 and tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const D = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const M = 'http://127.0.0.1:8093/mobile/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const cyr = x => /[А-Яа-яЁё]/.test(x);
const alts = h => (h.match(/class="alt[l2i]?"/g) || []).length;

(async () => {
  const b = await chromium.launch();

  console.log('1. THE DASHBOARD');
  {
    const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('cm_dash_lang', 'en'); localStorage.removeItem('cm_dash_rlang'); });
    await p.goto(D, { waitUntil: 'load' }); await p.waitForTimeout(1000);
    await p.evaluate(() => {
      const it = (o) => Object.assign({ key: '4C', label: 'Left Rear Final Drive', defect: 'Ferrous debris', defectCode: 'DT14-03', action: 'SCH', actionLabel: 'Schedule repair' }, o);
      CMDash.importRecords([
        { equip: 'TK101', date: '2026-08-20', type: 'MP', cls: 'HT', by: 'Ivanov', smu: '1200', items: [it({ grade: 3, owner: 'A', due: '2026-12-01' }), { key: '4D', label: 'Right Rear Final Drive', grade: 1 }] },
        { equip: 'TK101', date: '2026-07-20', type: 'MP', cls: 'HT', by: 'Ivanov', smu: '900', items: [it({ grade: 2 })] },
        { equip: 'TK102', date: '2026-08-21', type: 'MP', cls: 'HT', by: 'Petrov', smu: '300', items: [it({ grade: 5, owner: 'B', due: '2026-09-01' })] },
      ]);
      const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
    });
    await p.waitForTimeout(300);
    const U = await p.evaluate(() => { showTab('reports', true);
      return { opts: [...document.querySelectorAll('#rLang option')].map(o => o.value).join(','), def: $('rLang').value,
               sub: (document.querySelector('#tab-reports .pgsub') || {}).textContent || '',
               scales: [...document.querySelectorAll('#rScale option')].map(o => o.value).join(',') }; });
    ok('a Language choice: English, Russian, both — defaulting to the screen\'s language', U.opts === 'en,ru,both' && U.def === 'en', U.opts + ' · ' + U.def);
    ok('  the page no longer promises a forced bilingual sheet', /or both/.test(U.sub) && !/Bilingual/.test(U.sub), U.sub);
    ok('  and a small-file quality point beside Standard and High', U.scales === '1.8,2.4,1.4', U.scales);

    const S = await p.evaluate(() => {
      const out = {};
      const html = o => CMReport.sectionsFor('unit', 'TK101', Object.assign({ photos: false }, o)).map(s => s.html).join('\n');
      out.en = html({ lang: 'en', bi: false });
      out.ru = html({ lang: 'ru', bi: false });
      out.both = html({ lang: 'en', bi: true });
      out.ruBoth = html({ lang: 'ru', bi: true });
      out.langAfter = lang; out.titleAfter = t('r_title');
      out.n = ['en', 'ru'].map(l => [false, true].map(bi => CMReport.sectionsFor('unit', 'TK101', { lang: l, bi, photos: false }).length)).flat();
      return out; });
    ok('English only: no second rendering anywhere, no Cyrillic', alts(S.en) === 0 && !cyr(S.en.replace(/<[^>]+>/g, ' ')), alts(S.en) + ' alt spans');
    ok('Russian only: the document leads in Russian and carries no second rendering', alts(S.ru) === 0 && /Мониторинг состояния/.test(S.ru), alts(S.ru) + ' alt spans');
    ok('Both: every label carries its translation', alts(S.both) > 20 && cyr(S.both), alts(S.both) + ' alt spans');
    ok('  and a Russian bilingual sheet leads in Russian', alts(S.ruBoth) > 20 && /<div class="eyebrow">[^<]*[А-Яа-я]/.test(S.ruBoth), '');
    ok('the screen\'s own language is untouched afterwards', S.langAfter === 'en' && S.titleAfter === 'Reports', S.langAfter + ' · ' + S.titleAfter);
    ok('the sections are the same document whichever language', S.n[0] > 0 && S.n.every(x => x === S.n[0]), S.n.join(','));

    const E = await p.evaluate(async () => {
      const e = await CMReport.estimate('unit', 'TK101', { lang: 'en', bi: false, photos: false, scale: 1.8 });
      const e2 = await CMReport.estimate('unit', 'TK101', { lang: 'en', bi: true, photos: false, scale: 2.4 });
      return { e, e2, root: !!document.getElementById('rptRoot') }; });
    ok('an estimate: pages, size and time, with nothing left behind', E.e && E.e.pages >= 1 && E.e.bytes > 10000 && E.e.seconds >= 2 && !E.root, JSON.stringify(E.e));
    ok('  a higher quality costs more bytes', E.e2 && E.e2.bytes > E.e.bytes, E.e.bytes + ' → ' + E.e2.bytes);

    /* THE MATRIX: every round type this fixture holds × English · Russian ·
       both — the single-language sheets carry no second rendering, the
       bilingual ones do, and none of the twenty-four throws. */
    const MX = await p.evaluate(() => {
      const one = { MP: 'TK101' };
      const mk = (u, ty, i) => ({ equip: u, date: '2026-08-0' + (1 + i), type: ty, cls: 'HT', by: 'Ivanov', smu: '1200', items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 3, defect: 'Ferrous debris', action: 'SCH', actionLabel: 'Schedule repair' }] });
      const types = ['MP', 'FC', 'INSP', 'TEMP', 'UC', 'GET', 'TB', 'LUBE'];
      CMDash.importRecords(types.map((ty, i) => mk('TK19' + i, ty, i)));
      const out = [];
      types.forEach((ty, i) => { const key = 'TK19' + i + '|2026-08-0' + (1 + i) + '|' + ty;
        [['en', false], ['ru', false], ['en', true]].forEach(([l, bi]) => {
          try { const h = CMReport.sectionsFor('one', key, { lang: l, bi, photos: false }).map(x => x.html).join('');
                const n = (h.match(/class="alt[l2i]?"/g) || []).length;
                out.push({ ty, l, bi, secs: h.length > 200, alts: n, ok: bi ? n > 0 : n === 0 }); }
          catch (e) { out.push({ ty, l, bi, err: String(e.message || e) }); } }); });
      return { out, lang }; });
    ok('the matrix: eight round types × EN · RU · both, all built, single-language sheets clean', MX.out.length === 24 && MX.out.every(x => x.ok && x.secs) && MX.lang === 'en',
       MX.out.filter(x => !(x.ok && x.secs)).map(x => x.ty + '/' + x.l + (x.bi ? '+' : '') + (x.err ? ' ' + x.err : ' alts=' + x.alts)).join(' | ') || '24 of 24');
    await p.evaluate(() => { $('rScope').value = 'unit'; refreshReportTargets(); cmbSet('rTarget', 'TK101'); renderReportPreview(); });
    await p.waitForTimeout(900);
    const P = await p.evaluate(() => ({ est: ($('rEst') || {}).textContent || '', prev: $('rPreview').textContent }));
    ok('the preview says what the PDF will cost before the button is pressed', /About \d+ page/.test(P.est) && /MB/.test(P.est) && /\d+ s/.test(P.est), P.est);

    const O = await p.evaluate(() => { const r = {};
      $('rLang').value = 'ru'; $('rLang').dispatchEvent(new Event('change')); r.ru = reportOpts(); r.saved = localStorage.getItem('cm_dash_rlang');
      $('rLang').value = 'both'; $('rLang').dispatchEvent(new Event('change')); r.both = reportOpts();
      $('rScale').value = '1.4'; r.small = reportOpts(); $('rScale').value = '1.8';
      $('rLang').value = 'en'; $('rLang').dispatchEvent(new Event('change'));
      return r; });
    ok('the choice reaches the generator: Russian only', O.ru.lang === 'ru' && O.ru.bi === false && O.saved === 'ru', JSON.stringify({ lang: O.ru.lang, bi: O.ru.bi }));
    ok('  both: the screen\'s language leads, the other follows', O.both.lang === 'en' && O.both.bi === true);
    ok('  small file: a lower scale and a tighter JPEG', O.small.scale === 1.4 && O.small.jpeg === 0.8, JSON.stringify({ scale: O.small.scale, jpeg: O.small.jpeg }));
    await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
    ok('  and it is remembered', (await p.evaluate(() => $('rLang').value)) === 'en');

    await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(400);
    const R = await p.evaluate(() => { showTab('reports', true); renderReportPreview();
      return { label: (document.querySelector('label[for="rLang"]') || {}).textContent || '', both: [...document.querySelectorAll('#rLang option')].map(o => o.textContent).join('|'),
               scales: [...document.querySelectorAll('#rScale option')].map(o => o.textContent).join('|') }; });
    await p.waitForTimeout(900);
    const R2 = await p.evaluate(() => ($('rEst') || {}).textContent || '');
    ok('in Russian: the label, the options and the estimate', cyr(R.label) && cyr(R.both) && cyr(R.scales) && cyr(R2), [R.label, R.both, R2].join(' · '));
    ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
    await p.close();
  }

  console.log('\n2. THE PHONE');
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', url: 'http://127.0.0.1:9/exec', on: 1 }])); localStorage.setItem('cm_lang', 'en'); localStorage.removeItem('cm_rep_lang'); });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(M, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    await p.evaluate(`(async () => {
      const mk=(id,type,equip,date,by,sup,positions,smu)=>({id,type,equip,date,by,sup,smu,
        cls:(ASSET_BY[equip]||{}).cls||'', gps:{lat:68.0421,lon:167.3318,acc:6},
        dev:'PH-01', sign:null, positions, created:date+'T06:00:00.000Z', up:0, upTo:{}, rev:1});
      type='MP'; selectEquip('TK146');
      const mp=items().map(x=>x.k).slice(0,4);
      const o={}; mp.forEach((k,i)=>{ o[k]={grade:i===1?3:1, defect:i===1?'DT14-03':'', action:i===1?'RA-02':'', detect:'VI', photos:[], video:null}; });
      await dbPut(mk('rl1','MP','TK146','2026-08-28','I. Petrov','A. Sokolov',o,'18422'));
    })()`);
    const H = await p.evaluate(() => ({ opts: [...document.querySelectorAll('#repLang option')].map(o => o.value).join(','), def: $('repLang').value, inSaved: !!document.querySelector('#paneQueue #repLang') }));
    ok('a Report language choice on the Saved screen: both (as it always was), English, Russian', H.opts === 'both,en,ru' && H.def === 'both' && H.inSaved, H.opts + ' · ' + H.def);
    const T = await p.evaluate(async () => {
      const out = {};
      const html = async () => (await buildReportSections()).map(s => s.html).join('\n');
      out.both = await html();
      localStorage.setItem('cm_rep_lang', 'en'); out.en = await html();
      localStorage.setItem('cm_rep_lang', 'ru'); out.ru = await html(); out.langAfter = lang; out.btn = $('reportBtn').textContent;
      localStorage.removeItem('cm_rep_lang');
      return out; });
    ok('both: every label carries its translation', alts(T.both) > 10 && cyr(T.both), alts(T.both) + ' alt spans');
    ok('English only: no second rendering, no Cyrillic', alts(T.en) === 0 && !cyr(T.en.replace(/<[^>]+>/g, ' ')), alts(T.en) + ' alt spans');
    ok('Russian only: leads in Russian, no second rendering', alts(T.ru) === 0 && /Мониторинг состояния/.test(T.ru), alts(T.ru) + ' alt spans');
    ok('the phone\'s own language is untouched afterwards', T.langAfter === 'en' && /PDF/.test(T.btn) && !cyr(T.btn), T.langAfter + ' · ' + T.btn);
    await p.evaluate(() => { showPane('paneQueue'); $('repLang').value = 'ru'; $('repLang').dispatchEvent(new Event('change')); }); await p.waitForTimeout(100);
    ok('the choice is kept', (await p.evaluate(() => localStorage.getItem('cm_rep_lang'))) === 'ru');
    ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
    await ctx.close();
  }
  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
