/* You can always photograph what you are looking at.

   A number is a claim and a photograph is the evidence for it. On a liner plate
   or a roller the two are worth about the same: 232 mm says what was measured,
   the photograph says why anyone should believe it and what it looked like.

   The camera used to be two taps behind a row labelled "Photos and comment" —
   three words, no camera in them, third in a list of three grey disclosures —
   on both measurement rounds. A control you have to already know about is not
   offered. This checks the opposite of that, on every round, and it checks it
   the way a thumb would: on screen, hit-sized, and wired to something.
*/
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* Visible, big enough to hit, and connected to a file input that asks the
   phone's camera for a photograph. All three, or it is decoration. */
const CAM = () => {
  const t = document.getElementById('takeBtn'), v = document.getElementById('videoBtn');
  const live = e => {
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { on: !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' && r.height > 0,
             w: Math.round(r.width), h: Math.round(r.height), wired: !!e.onclick };
  };
  const cam = document.getElementById('camera');
  return { take: live(t), video: live(v),
           capture: cam ? cam.getAttribute('capture') : null,
           accept: cam ? cam.getAttribute('accept') : null };
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]');
    localStorage.setItem('inspector', 'R. Marrero');
    /* Closed, deliberately: the point is that the camera does not depend on it. */
    localStorage.setItem('uc_extra_open', '0'); });
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 30000 });
  await p.waitForTimeout(500);
  const T = t => p.evaluate(x => { const s = document.getElementById('typeSel'); s.value = x; s.dispatchEvent(new Event('change')); }, t);
  const openFirst = () => p.evaluate(() => {
    const k = (typeof ucOrder === 'function' ? ucOrder() : [])[0];
    if (k) { saveCur(); curItem = k; loadPos(); renderChips(); return k; }
    const n = document.querySelector('#posnav .ucmap [data-ucg],#posnav [data-l7]');
    if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const m = document.querySelector('#posnav [data-l8]');
    if (m) m.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return curItem;
  });

  console.log('the camera is on screen on every round, without opening anything');
  for (const [ty, unit, name] of [['MP', 'TK032', 'magnetic plug'],
                                  ['INSP', 'TK032', 'component inspection'],
                                  ['GET', 'EX001', 'ground engaging tools'],
                                  ['UC', 'DZ001', 'undercarriage'],
                                  ['TB', 'TK101', 'dump body liner']]) {
    await T(ty); await p.waitForTimeout(350);
    await p.evaluate(u => selectEquip(u), unit); await p.waitForTimeout(900);
    await openFirst(); await p.waitForTimeout(700);
    const r = await p.evaluate(CAM);
    ok(name + ': a photo button is on screen', !!(r.take && r.take.on),
       r.take ? r.take.w + 'x' + r.take.h : 'missing');
    ok(name + ': it is thumb-sized', !!(r.take && r.take.h >= 44),
       r.take ? r.take.h + 'px' : '-');
    ok(name + ': and it is wired to something', !!(r.take && r.take.wired));
    ok(name + ': video is beside it', !!(r.video && r.video.on));
  }

  console.log('\nand it opens the camera, not the file browser');
  const f = await p.evaluate(CAM);
  ok('the photo input asks for the rear camera', f.capture === 'environment', String(f.capture));
  ok('and for an image', /image/.test(f.accept || ''), String(f.accept));

  console.log('\non a measurement round it does not hide behind the comment row');
  /* This is the regression that prompted the change: both wear rounds put the
     camera inside the same fold as the comment, so a closed fold meant no
     camera at all. */
  for (const [ty, unit, name] of [['UC', 'DZ001', 'undercarriage'], ['TB', 'TK101', 'dump body liner']]) {
    await T(ty); await p.waitForTimeout(350);
    await p.evaluate(u => selectEquip(u), unit); await p.waitForTimeout(900);
    await openFirst(); await p.waitForTimeout(700);
    const st = await p.evaluate(() => {
      const g = id => { const e = document.getElementById(id);
        return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; };
      return { row: g('mediaRow'), inDock: !!document.getElementById('takeBtn').closest('#ucFields'),
               comment: g('commentFld'), tog: (document.getElementById('ucExtraTog').textContent || '').trim(),
               strip: g('mediastrip') };
    });
    ok(name + ': the buttons are in the dock and open', st.row && st.inDock);
    ok(name + ': the comment is still folded away', !st.comment, st.tog);
    ok(name + ': and the row now says what is behind it', /comment|комментар/i.test(st.tog), st.tog);
    /* An empty strip is 46 px of "No photos yet." on sixty-three stations. */
    ok(name + ': no empty thumbnail strip before there is anything in it', !st.strip);
    /* Take one, and it shows up beside the button without opening anything. */
    const after = await p.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = c.height = 48;
      const x = c.getContext('2d'); x.fillStyle = '#c60'; x.fillRect(0, 0, 48, 48);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7));
      const pos = draft.positions[curItem] = draft.positions[curItem] || {};
      pos.photos = [blob];
      renderMedia(); renderUCExtra(true);
      await new Promise(r => setTimeout(r, 150));
      const strip = document.getElementById('mediastrip');
      return { tiles: strip.querySelectorAll('.mtile').length,
               shown: getComputedStyle(strip).display !== 'none' && strip.getClientRects().length > 0,
               inDock: !!strip.closest('#ucFields') };
    });
    ok(name + ': and the photograph appears where it was taken', after.tiles === 1 && after.shown && after.inDock,
       JSON.stringify(after));
  }

  console.log('\nthe order in the dock: what it measured, then the evidence, then the way on');
  const order = await p.evaluate(() => {
    const y = id => { const e = document.getElementById(id);
      return (e && e.getClientRects().length) ? e.getBoundingClientRect().top : null; };
    return { mm: y('ucMM'), strip: y('mediastrip'), row: y('mediaRow'), nav: y('ucSheetNav') };
  });
  ok('the number comes first', order.mm < order.strip, JSON.stringify(order));
  ok('then the photographs, then the camera', order.strip < order.row);
  ok('and Back / Next last, so the camera is never below the way on', order.row < order.nav);

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
