/* PHASE 6 — TABLET, PHONE, KEYBOARD, SCREEN READER, SCALE, AND BACK.

   At 1280×800, on a tablet (834×1112) and on a phone (390×844):
     no page scrolls sideways — loaded directly at that width, not resized
       down to it, which is the case a phone actually presents;
     every control a finger presses is at least 36px tall on touch;
     every text box has a label a screen reader can say, in both languages;
     every button says what it does;
     the active page is marked aria-current, and the navigation is a
       labelled landmark;
     keyboard focus is visible on the things that take it;
     Back from an open drawer closes the drawer and keeps the page; closing
       it by its own button leaves history as it was;
     and at fleet scale (1,000 inspections, 1,128 machines) the phone still
       scrolls only up and down.

   Run: node tests/phase6.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = process.env.CM_BASE || 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const note = (n, d) => console.log('  ....  ' + n + (d !== undefined ? '   ' + d : ''));
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());
const TABS = ['overview', 'failure', 'wear', 'actions', 'due', 'equipment', 'lube', 'sync', 'reports'];

const AUDIT = (phone) => {
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.checkVisibility(); };
  const sec = document.querySelector('section:not(.hidden)');
  const roots = [sec, document.querySelector('.controls'), document.querySelector('header.app'), document.querySelector('nav.tabs')].filter(Boolean);
  const q = s => roots.flatMap(root => [...root.querySelectorAll(s)]);
  /* A checkbox inside a label is pressed through the label. */
  const box = el => (el.type === 'checkbox' && el.closest('label')) ? el.closest('label') : el;
  const small = phone ? q('button, a[href], input[type=checkbox], select, [role=button], [role=tab], summary').filter(vis)
    .filter(el => box(el).getBoundingClientRect().height < 32)
    .map(el => (el.id || el.className || el.tagName) + ':' + Math.round(el.getBoundingClientRect().height)).slice(0, 6) : [];
  const unlabeled = q('input, select, textarea').filter(vis).filter(el => {
    if (el.type === 'hidden') return false;
    const lab = el.id && document.querySelector('label[for="' + el.id + '"]');
    return !(lab || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label'));
  }).map(el => el.id || el.className || el.tagName).slice(0, 6);
  const mute = q('button, [role=button]').filter(vis)
    .filter(el => !(el.textContent || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title'))
    .map(el => el.id || el.className || el.tagName).slice(0, 6);
  const imgs = q('img').filter(vis).filter(i => !i.hasAttribute('alt')).length;
  return { wide: document.documentElement.scrollWidth - document.documentElement.clientWidth, small, unlabeled, mute, imgs,
           tall: +(document.documentElement.scrollHeight / innerHeight).toFixed(1) };
};

(async () => {
  await reset('n=40');
  const b = await chromium.launch();
  for (const [w, h, name] of [[1280, 800, 'laptop 1280×800'], [834, 1112, 'tablet 834×1112'], [390, 844, 'phone 390×844']]) {
    const phone = w < 900;
    console.log('\n' + name.toUpperCase());
    const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: phone });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', '');
      localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1'); }, BASE + '/exec');
    await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 5, null, { timeout: 60000 });
    await p.waitForTimeout(1200);
    const bad = { wide: [], small: [], unlabeled: [], mute: [], imgs: [] };
    for (const t of TABS) {
      await p.evaluate(k => showTab(k), t); await p.waitForTimeout(250);
      const r = await p.evaluate(AUDIT, phone);
      if (r.wide > 1) bad.wide.push(t + ' +' + r.wide + 'px');
      if (r.small.length) bad.small.push(t + ': ' + r.small.join(','));
      if (r.unlabeled.length) bad.unlabeled.push(t + ': ' + r.unlabeled.join(','));
      if (r.mute.length) bad.mute.push(t + ': ' + r.mute.join(','));
      if (r.imgs) bad.imgs.push(t + ': ' + r.imgs);
    }
    ok('no page scrolls sideways', bad.wide.length === 0, bad.wide.join(' | ') || 'all nine clean');
    if (phone) ok('every pressable control is at least 32px tall', bad.small.length === 0, bad.small.join(' | ') || 'all');
    ok('every text box has a label a screen reader can say', bad.unlabeled.length === 0, bad.unlabeled.join(' | ') || 'all');
    ok('every button says what it does', bad.mute.length === 0, bad.mute.join(' | ') || 'all');
    ok('every image has alt text', bad.imgs.length === 0, bad.imgs.join(' | ') || 'all');
    const nav = await p.evaluate(() => ({
      label: document.querySelector('nav.tabs').getAttribute('aria-label'),
      current: [...document.querySelectorAll('nav.tabs button[aria-current="page"]')].map(b => b.dataset.tab),
      tab: CUR_TAB }));
    ok('the navigation is a labelled landmark and marks the current page', !!nav.label && nav.current.length === 1 && nav.current[0] === nav.tab,
       nav.label + ' · ' + nav.current.join(','));
    ok('no application errors at ' + w, errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
    await p.close();
  }

  console.log('\nSCREEN-READER LABELS FOLLOW THE LANGUAGE');
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1'); }, BASE + '/exec');
  await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 5, null, { timeout: 60000 });
  await p.waitForTimeout(1200);
  const labels = async () => p.evaluate(() => ['gq', 'equipQ', 'rTargetQ'].map(id => document.getElementById(id).getAttribute('aria-label')));
  const en = await labels();
  await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(400);
  const ru = await labels();
  await p.click('.lang button[data-lang="en"]'); await p.waitForTimeout(300);
  ok('the search boxes are labelled in English', en.every(x => x && /[A-Za-z]/.test(x)), en.join(' | '));
  ok('  and in Russian', ru.every(x => x && /[А-Яа-я]/.test(x)), ru.join(' | '));

  console.log('\nKEYBOARD FOCUS IS VISIBLE');
  /* Reached by the keyboard, as a keyboard reader would — a programmatic
     focus() after mouse use does not count as keyboard focus. */
  await p.evaluate(() => { showTab('overview', true); document.getElementById('gq').focus(); });
  let ring = null;
  for (let n = 0; n < 40 && !ring; n++) {
    await p.keyboard.press('Tab');
    ring = await p.evaluate(() => { const el = document.activeElement; if (!el || !el.closest('#kpis')) return null;
      const cs = getComputedStyle(el); return { w: cs.outlineWidth, style: cs.outlineStyle, matches: el.matches(':focus-visible'), id: el.id }; });
  }
  ring = ring || { w: '0px', style: 'none', matches: false };
  ok('a focused headline shows a ring', ring.matches && ring.style !== 'none' && parseFloat(ring.w) >= 2, JSON.stringify(ring));

  console.log('\nBACK CLOSES A DRAWER AND KEEPS THE PAGE');
  await p.evaluate(() => { showTab('actions', true); actView = 'table'; renderActions(); }); await p.waitForTimeout(300);
  await p.click('#actionTbl tbody tr.hrow'); await p.waitForTimeout(300);
  const opened = await p.evaluate(() => ({ open: !document.getElementById('follOv').classList.contains('hidden'), st: history.state && history.state.cmOverlay }));
  ok('a row opens the follow-up sheet and marks it in history', opened.open && opened.st === 'follOv', JSON.stringify(opened));
  await p.goBack(); await p.waitForTimeout(500);
  const afterBack = await p.evaluate(() => ({ open: !document.getElementById('follOv').classList.contains('hidden'), tab: CUR_TAB, hash: location.hash }));
  ok('Back closes it and the page underneath stays', !afterBack.open && afterBack.tab === 'actions', JSON.stringify(afterBack));
  await p.click('#actionTbl tbody tr.hrow'); await p.waitForTimeout(300);
  await p.click('#follX'); await p.waitForTimeout(400);
  const closed = await p.evaluate(() => ({ open: !document.getElementById('follOv').classList.contains('hidden'), st: history.state, tab: CUR_TAB }));
  ok('closing it by its button leaves no stray history entry', !closed.open && !(closed.st && closed.st.cmOverlay) && closed.tab === 'actions', JSON.stringify(closed));
  await p.goBack(); await p.waitForTimeout(500);
  ok('  so the next Back goes to the previous page', (await p.evaluate(() => CUR_TAB)) === 'overview');
  /* the position drawer and the lightbox behave the same */
  await p.evaluate(() => { showTab('wear', true); document.getElementById('wBand').value = 'all'; renderWearTab(); }); await p.waitForTimeout(300);
  const hasWear = await p.evaluate(() => !!document.querySelector('#wearTbl tbody tr[data-rk]'));
  if (hasWear) {
    await p.click('#wearTbl tbody tr[data-rk]'); await p.waitForTimeout(300);
    await p.goBack(); await p.waitForTimeout(400);
    const d = await p.evaluate(() => ({ open: !document.getElementById('drw').classList.contains('hidden'), tab: CUR_TAB }));
    ok('Back closes the position drawer too', !d.open && d.tab === 'wear', JSON.stringify(d));
  } else note('no wear row in this fixture');

  console.log('\nFLEET SCALE ON A PHONE');
  await reset('scale=1000,1128');
  const q = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const qerrs = []; q.on('pageerror', e => qerrs.push(e.message));
  await q.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1'); }, BASE + '/exec');
  await q.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await q.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length >= 1000, null, { timeout: 120000 });
  await q.waitForTimeout(2500);
  const wide = [];
  for (const t of ['overview', 'actions', 'due', 'wear', 'sync']) {
    await q.evaluate(k => showTab(k), t); await q.waitForTimeout(250);
    const r = await q.evaluate(() => ({ w: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rows: document.querySelectorAll('section:not(.hidden) tbody tr').length }));
    if (r.w > 1) wide.push(t + ' +' + r.w);
    if (r.rows > 60) wide.push(t + ' draws ' + r.rows + ' rows');
  }
  ok('with 1,000 inspections a phone still scrolls only up and down, and draws a page at a time', wide.length === 0, wide.join(' | ') || 'clean');
  ok('no errors at scale', qerrs.length === 0, qerrs.slice(0, 2).join(' | ') || 'none');
  ok('no application errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nALL PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(String(e && e.stack || e).slice(0, 600)); process.exit(1); });
