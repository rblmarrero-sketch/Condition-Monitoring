/* THE PHONE'S FOUR STEPS AND FOUR TABS — build 274, Phase 2.

   A technician always knows where they are: Inspect · Saved · Due · Sync at
   the bottom, and inside Inspect the four steps 1 Inspection · 2 Findings ·
   3 Review · 4 Saved across the top. What has to hold:
     · the tabs are those four, in that order, in both languages;
     · the step follows the state: no machine → 1; machine and inspector →
       2; Review asked for → 3; a round just saved → 4, with a card that says
       "Saved on this phone · … · Waiting to send" and hands over the next
       machine;
     · the review lists the machine, the round, who and when, the points,
       the highest grade, the photographs, the actions and what is still
       required — the same rules Finish applies, said before it is pressed;
     · the classification fields are behind "Additional details", closed,
       and the direct cause appears once a defect is named;
     · the connection pill and the saved list speak the dictionary's words;
     · the readiness verdict is Ready / Ready with warning / Not ready.

   Run: node tests/steps.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/mobile/index.html`;
const fs = require('fs'), path = require('path');
const T = require(path.join(__dirname, '..', 'mobile', 'terms.js'));
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'mobile', 'index.html'), 'utf8');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url: 'http://127.0.0.1:9/exec', sec: '', folder: '' }]));
    localStorage.setItem('inspector', 'R. Marrero'); localStorage.setItem('insp_type', 'MP'); localStorage.setItem('lang', 'en');
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(1800);
  const vis = id => p.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().height > 0; }, id);
  const step = () => p.evaluate(() => ({ now: stepNow(), on: (document.querySelector('#stepBar button.on') || {}).dataset && document.querySelector('#stepBar button.on').dataset.step, done: [...document.querySelectorAll('#stepBar button.done')].map(b => b.dataset.step).join('') }));

  console.log('1. FOUR TABS, IN ORDER');
  const tabs = await p.evaluate(() => [...document.querySelectorAll('#tabbar button')].map(b => ({ pane: b.dataset.pane, label: b.querySelector('[data-i18n]').textContent.trim(), h: Math.round(b.getBoundingClientRect().height) })));
  ok('Inspect · Saved · Due · Sync', tabs.map(t => t.label).join(' · ') === 'Inspect · Saved · Due · Sync', tabs.map(t => t.label).join(' · '));
  ok('  leading to the capture, queue, due and system panes', tabs.map(t => t.pane).join(',') === 'paneCapture,paneQueue,paneDue,paneSystem');
  ok('  thumb-sized', tabs.every(t => t.h >= 44), tabs.map(t => t.h).join(','));

  console.log('\n2. THE STEPS FOLLOW THE STATE');
  let s = await step();
  ok('with no machine chosen the app is on step 1', s.now === 1 && s.on === '1', JSON.stringify(s));
  ok('  the review and the saved card are out of the way', !(await vis('cardReview')) && !(await vis('savedCard')));
  await p.evaluate(() => { selectEquip('TK101'); }); await p.waitForTimeout(400);
  s = await step();
  ok('a machine and an inspector fold the header: step 2, step 1 ticked', s.now === 2 && s.on === '2' && s.done === '1', JSON.stringify(s));
  const g4 = await p.evaluate(async () => { document.querySelector('#gradeSeg .gcard[data-g="4"]').click(); await new Promise(r => setTimeout(r, 500)); saveCur(); renderReview();
    return { grade: draft.positions[curItem].grade, review: !document.getElementById('cardReview').classList.contains('hidden'), miss: (window.__review || {}).miss, top: (window.__review || {}).top }; });
  ok('a grade of 4 on a point brings the review card up', g4.grade === 4 && g4.review, JSON.stringify({ grade: g4.grade, review: g4.review }));
  ok('  which says what a 4 still requires (action, target date, comment, close-up) before Finish is pressed', Array.isArray(g4.miss) && g4.miss.some(m => /action/i.test(m)) && g4.miss.some(m => /photograph/i.test(m)), (g4.miss || []).join(' | '));
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(300);
  s = await step();
  const rv = await p.evaluate(() => [...document.querySelectorAll('#reviewList .rvrow')].map(r => r.querySelector('.k').textContent + '=' + r.querySelector('.v').textContent));
  ok('Review is step 3, with 1 and 2 ticked', s.now === 3 && s.on === '3' && s.done === '12', JSON.stringify(s));
  ok('  the review names the machine, the round, the date and inspector, the points, the highest grade, the photographs, the actions and what is still required',
     rv.length === 8 && /TK101/.test(rv[0]) && /Magnetic/.test(rv[1]) && /R\. Marrero/.test(rv[2]) && /1 of/.test(rv[3]) && /4/.test(rv[4]) && /^Photographs=0/.test(rv[5]) && /Still required=/.test(rv[7]), rv.join(' | '));
  const bad = await p.evaluate(() => !!document.querySelector('#reviewList .rvrow.bad'));
  ok('  and the missing line is marked', bad);
  await p.evaluate(() => goStep(1)); await p.waitForTimeout(200);
  s = await step();
  ok('step 1 opens the header again', s.now === 1 && (await vis('hdrBody')), JSON.stringify(s));
  await p.evaluate(() => goStep(2)); await p.waitForTimeout(200);
  ok('step 2 folds it and returns to the findings', (await step()).now === 2 && !(await vis('hdrBody')));

  console.log('\n3. THE FINISH, AND STEP 4');
  ok('the Finish button is the one save control, and says so', /Finish inspection/.test(await p.evaluate(() => document.getElementById('saveBtn').textContent)));
  ok('  Save hands the saved round to the step-4 card', /resetForm\(\); renderPending\(\); renderDue\(\); syncThenArm\(\);\s*showSaved\(rec\);/.test(SRC));
  await p.evaluate(() => showSaved({ equip: 'TK101', type: 'MP' })); await p.waitForTimeout(200);
  s = await step();
  const savedTxt = await p.evaluate(() => document.getElementById('savedText').textContent);
  ok('the saved card is step 4 with the three others ticked', s.now === 4 && s.on === '4' && s.done === '123', JSON.stringify(s));
  ok('  saying "Saved on this phone", the machine, the round and "Waiting to send"', (await vis('savedCard')) && /TK101/.test(savedTxt) && /Magnetic/.test(savedTxt) && savedTxt.indexOf(T.en.waiting) >= 0, savedTxt);
  await p.click('#savedNext'); await p.waitForTimeout(300);
  ok('"Next machine" clears the card and opens the setup', !(await vis('savedCard')) && (await vis('hdrBody')) && (await step()).now === 1);

  console.log('\n4. ADDITIONAL DETAILS');
  await p.evaluate(() => { hdrOpen = false; renderHdr(); });
  const more = await p.evaluate(() => ({ open: document.getElementById('moreDetails').open, summary: document.querySelector('#moreDetails > summary').textContent.trim(),
    inside: ['causeFld', 'detectBtn', 'particle', 'comp', 'oil', 'wo'].every(id => !!document.getElementById('moreDetails').querySelector('#' + id)),
    outside: ['defectBtn', 'comment', 'actionBtn', 'prioBtn'].every(id => !document.getElementById('moreDetails').querySelector('#' + id)),
    cause: !document.getElementById('causeFld').classList.contains('hidden') }));
  ok('the classification fields are behind "Additional details", closed', !more.open && more.summary === 'Additional details' && more.inside, JSON.stringify(more));
  ok('  the defect, the comment, the action and the priority stay in front', more.outside);
  ok('  the direct cause is not shown until a defect is named', !more.cause);
  const gated = await p.evaluate(() => { curP().defect = 'DT14-03'; causeGate(); const a = !document.getElementById('causeFld').classList.contains('hidden'); curP().defect = ''; causeGate(); return { a, b: !document.getElementById('causeFld').classList.contains('hidden') }; });
  ok('  and appears once one is, and goes again when it is cleared', gated.a && !gated.b);

  console.log('\n5. THE WORDS ON THE PILL, THE LIST AND THE READINESS CARD');
  const W = await p.evaluate(async () => { await renderNet(); return { net: document.getElementById('netStatus').textContent.trim(),
    never: I18N.en.up_never, wait: I18N.en.up_wait, sent: I18N.en.up_yes, conf: I18N.en.up_conf, verif: I18N.en.up_verif, err: I18N.en.up_err, synced: I18N.en.net_synced, sending: I18N.en.net_sending }; });
  ok('with no signal the pill says "' + T.en.offline_saved + '"', W.net === T.en.offline_saved, W.net);
  ok('the saved list speaks the dictionary: saved here · waiting · sent · confirmed · verified · attention',
     W.never === T.en.saved_here && W.wait === T.en.waiting && W.sent === T.en.sent && W.conf.indexOf(T.en.confirmed) === 0 && W.verif.indexOf(T.en.verified) === 0 && W.err === T.en.attention && W.synced === T.en.all_sent && W.sending === T.en.sending,
     [W.never, W.wait, W.sent, W.conf, W.verif, W.err].join(' | '));
  await p.evaluate(() => showPane('paneSystem')); await p.waitForTimeout(200);
  await p.evaluate(async () => { await yardCheck(); }).catch(() => {}); await p.waitForTimeout(500);
  const Y = await p.evaluate(() => ({ badge: document.getElementById('yardBadge').textContent.trim(), title: document.getElementById('yardBadge').title, sum: document.getElementById('yardSum').textContent.trim() }));
  ok('the readiness verdict is one of Ready / Ready with warning / Not ready', [T.en.ready, T.en.ready_warn, T.en.not_ready].includes(Y.badge), Y.badge + ' · ' + Y.title);
  ok('  with the reason on the line under it', Y.sum.length > 3, Y.sum);

  console.log('\n6. IN RUSSIAN');
  await p.evaluate(() => showPane('paneCapture'));
  await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(500);
  const R = await p.evaluate(() => ({ tabs: [...document.querySelectorAll('#tabbar button [data-i18n]')].map(e => e.textContent.trim()),
    steps: [...document.querySelectorAll('#stepBar button span')].map(e => e.textContent.trim()), more: document.querySelector('#moreDetails > summary').textContent.trim(),
    finish: document.getElementById('saveBtn').textContent, net: document.getElementById('netStatus').textContent.trim() }));
  const cyr = s2 => /[А-Яа-яЁё]/.test(s2);
  ok('tabs, steps, the fold, Finish and the pill are Russian', R.tabs.every(cyr) && R.steps.every(cyr) && cyr(R.more) && cyr(R.finish) && R.net === T.ru.offline_saved, [R.tabs.join('·'), R.steps.join('·'), R.more, R.finish, R.net].join(' | '));
  ok('  and the tabs are the four in the same order', R.tabs.join('·') === [T.ru.overdue && 'Осмотр', 'Сохранено', 'Срок', 'Связь'].join('·'), R.tabs.join('·'));
  await p.click('.lang button[data-lang="en"]');

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
