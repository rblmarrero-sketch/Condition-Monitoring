/* ONE VOCABULARY, TWO SURFACES, THE REPORTS — build 273.

   mobile/terms.js is the controlled dictionary: every maintenance word the
   phone, the dashboard and the report engine use, in English and Russian.
   What has to hold:
     · both languages carry every key, non-empty, and no term is a software
       word (the dictionary's own banned list applies to itself);
     · the phone's and the dashboard's tables POINT AT the dictionary for the
       schedule and work words, so "Overdue", "Deferred", "Never inspected",
       "Owner", "Operating hours/day", "Owner not assigned" cannot drift;
     · no visible string in either application's dictionary, in either
       language, and none in the report engine's, carries an internal word:
       held back, on hold, point with no key, triage, cannot be trusted, not
       measurable from here, nobody owns, needs a plan, walked, put off,
       never done.

   Run: node tests/terms.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const path = require('path');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const B = 'http://127.0.0.1:' + (process.env.CMPORT || '8099');

const T = require(path.join(__dirname, '..', 'mobile', 'terms.js'));

(async () => {
  console.log('1. THE DICTIONARY ITSELF');
  const en = Object.keys(T.en), ru = Object.keys(T.ru);
  ok('every English term has a Russian one and no Russian term is orphaned (' + en.length + ' terms)',
     en.every(k => T.ru[k] != null) && ru.every(k => T.en[k] != null), en.filter(k => T.ru[k] == null).concat(ru.filter(k => T.en[k] == null)).join(', ') || 'in step');
  ok('no term is empty and every Russian term is Russian', en.every(k => T.en[k].trim() && T.ru[k].trim() && /[А-Яа-яЁё]/.test(T.ru[k])),
     en.filter(k => !/[А-Яа-яЁё]/.test(T.ru[k])).join(', ') || 'all Cyrillic');
  ok('the dictionary does not offend its own banned list', en.every(k => !T.offends(T.en[k]) && !T.offends(T.ru[k])),
     en.filter(k => T.offends(T.en[k]) || T.offends(T.ru[k])).join(', ') || 'clean');
  ok('t() substitutes and falls back', T.t('ru', 'deferred_to', { d: '12.09' }) === 'Отложено до 12.09' && T.t('xx', 'owner') === 'Owner' && T.t('en', 'no_such') === 'no_such');
  ok('the words the brief fixed are the words in the dictionary',
     T.en.overdue === 'Overdue' && T.en.deferred === 'Deferred' && T.en.never_inspected === 'Never inspected' && T.en.hours_per_day === 'Operating hours/day'
     && T.en.defer_reason === 'Reason inspection was not completed' && T.en.owner_unassigned === 'Owner not assigned' && T.en.grade === 'Condition Grade');

  const b = await chromium.launch();
  const scan = (I) => { const bad = []; ['en', 'ru'].forEach(L => Object.keys(I[L] || {}).forEach(k => { const v = I[L][k]; if (typeof v !== 'string') return; const re = TERMS.offends(v); if (re) bad.push(L + '.' + k + ' ' + String(re)); })); return bad; };

  console.log('\n2. THE DASHBOARD');
  {
    const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('cm_dash_lang', 'en'); });
    await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' }); await p.waitForTimeout(1000);
    const D = await p.evaluate(scanSrc => {
      const scan = eval('(' + scanSrc + ')');
      return { has: typeof TERMS === 'object' && TERMS.t('en', 'owner') === 'Owner',
        wired: I18N.en.dd_missed === TERMS.en.overdue && I18N.ru.dd_missed === TERMS.ru.overdue && I18N.en.dd_put === TERMS.en.deferred
          && I18N.en.dd_c_rate === TERMS.en.hours_per_day && I18N.en.dd_c_why === TERMS.en.defer_reason && I18N.en.dq_owner === TERMS.en.owner_unassigned
          && I18N.en.th_owner === TERMS.en.owner && I18N.ru.th_owner === TERMS.ru.owner && I18N.en.sy_sev === TERMS.en.grade_review,
        bad: scan(I18N), rpt: scan(CMR.dict), n: Object.keys(I18N.en).length,
        keysMissingRu: Object.keys(I18N.en).filter(k => I18N.ru[k] == null).length };
    }, scan.toString());
    ok('the dashboard loads the dictionary', D.has);
    ok('  and its schedule and work words come from it', D.wired);
    ok('  no internal word in ' + D.n + ' dashboard strings, either language', D.bad.length === 0, D.bad.slice(0, 8).join(' | ') || 'clean');
    ok('  nor in the report engine\'s dictionary', D.rpt.length === 0, D.rpt.slice(0, 8).join(' | ') || 'clean');
    ok('  every English key has a Russian one', D.keysMissingRu === 0, D.keysMissingRu + ' missing');
    /* On screen, in Russian: the schedule's column heads and the unassigned owner. */
    await p.evaluate(() => { CMDash.importRecords([{ equip: 'TK101', date: '2026-06-01', type: 'MP', cls: 'HT', by: 'R', smu: '100', items: [{ key: '4C', label: 'x', grade: 4, defect: 'Ferrous debris', action: 'SCH', actionLabel: 'Schedule repair' }] }]);
      const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); });
    await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(400);
    const R = await p.evaluate(() => { showTab('due', true); const heads = [...document.querySelectorAll('#ddList th')].map(x => x.textContent.trim());
      showTab('actions', true); actView = 'table'; renderActions(); const none = (document.querySelector('#actionTbl .who.none span') || {}).textContent;
      return { heads, none, tabs: [...document.querySelectorAll('#ddSeg button')].map(x => x.textContent.replace(/\d+$/, '').trim()) }; });
    ok('Russian on screen: the schedule tabs and heads are the dictionary\'s words', R.tabs.includes(T.ru.overdue) && R.tabs.includes(T.ru.deferred) && R.heads.includes(T.ru.hours_per_day) && R.heads.includes(T.ru.defer_reason), R.tabs.join(',') + ' · ' + R.heads.join(','));
    ok('  and an unassigned action says "' + T.ru.owner_unassigned + '"', R.none === T.ru.owner_unassigned, R.none);
    ok('  no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
    await p.close();
  }

  console.log('\n3. THE PHONE');
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await ctx.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(B + '/mobile/index.html', { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const M = await p.evaluate(scanSrc => {
      const scan = eval('(' + scanSrc + ')');
      return { has: typeof TERMS === 'object' && TERMS.t('ru', 'overdue') === 'Просрочено',
        wired: I18N.en.due_missed === TERMS.en.overdue && I18N.ru.due_missed === TERMS.ru.overdue && I18N.en.due_putoff === TERMS.en.deferred
          && I18N.en.due_never_p === TERMS.en.never_inspected && I18N.ru.due_never_p === TERMS.ru.never_inspected && I18N.en.due_soon === TERMS.en.due_soon,
        bad: scan(I18N), n: Object.keys(I18N.en).length, keysMissingRu: Object.keys(I18N.en).filter(k => I18N.ru[k] == null).length,
        sw: (typeof CACHE_FILES !== 'undefined') ? null : 'n/a' };
    }, scan.toString());
    ok('the phone loads the dictionary', M.has);
    ok('  and its schedule words come from it', M.wired);
    ok('  no internal word in ' + M.n + ' phone strings, either language', M.bad.length === 0, M.bad.slice(0, 8).join(' | ') || 'clean');
    ok('  every English key has a Russian one', M.keysMissingRu === 0, M.keysMissingRu + ' missing');
    const sw = require('fs').readFileSync(path.join(__dirname, '..', 'mobile', 'sw.js'), 'utf8');
    ok('  the worker precaches the dictionary, so it is there offline', /"\.\/terms\.js\?v=" \+ BUILD/.test(sw));
    ok('  no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
    await ctx.close();
  }
  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
