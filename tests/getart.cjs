/* A GET round always has something under its numbers.

   The bug this exists to stop: thirty of the seventy-one machines that have a
   GET round have no photograph for their model — every front loader, every
   skidsteer, both backhoes, the rock breakers, six excavators. On all of them
   the round drew eleven numbered pucks over an empty rectangle. It looked like
   a broken app, and an inspector who cannot see WHERE position 7 is cannot grade
   it, so the round quietly became eleven guesses.

   Two things are checked, and the second is the one that matters:

     1. every eligible unit gets a drawing — photograph or the drawn tool.
     2. every number LANDS ON A PART. A fallback that puts "left side cutter"
        in the white space beside the bucket is not a fallback, it is a
        different wrong answer. Point-in-fill against the real geometry, so a
        future edit to either the art or the catalog cannot float a number off
        the part it names.
*/
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* Where the numbers sit relative to the drawing, measured through screen space.
   The art lives inside a scaled group and the pucks do not, so comparing raw
   user-space coordinates compares two different frames — which is exactly how a
   clean layout once reported as a collision elsewhere in this suite. */
const OFF_PARTS = () => {
  const sv = document.querySelector('#posnav .ucmap');
  if (!sv) return { err: 'no map' };
  const paths = [...sv.querySelectorAll('.um-drawn path')];
  if (!paths.length) return { err: 'nothing drawn' };
  const out = [];
  sv.querySelectorAll('.um-num').forEach(g => {
    const b = g.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const on = paths.some(pa => {
      const m = pa.getScreenCTM(); if (!m) return false;
      const pt = sv.createSVGPoint(); pt.x = cx; pt.y = cy;
      const lp = pt.matrixTransform(m.inverse());
      try { return pa.isPointInFill(lp) || pa.isPointInStroke(lp); } catch (e) { return false; }
    });
    if (!on) out.push(g.dataset.ucg);
  });
  return { off: out, nums: sv.querySelectorAll('.um-num').length, parts: paths.length };
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 1400 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'GET'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(250);

  /* ---- how big is the hole ---------------------------------------------- */
  const scope = await p.evaluate(() => {
    const out = { total: 0, noPhoto: 0, fams: {} };
    (window.ASSETS || []).forEach(a => {
      const st = getStatus(a.n); if (!st.ok) return;
      out.total++;
      if (!st.prof.photo) { out.noPhoto++; out.fams[a.cat || a.cls] = (out.fams[a.cat || a.cls] || 0) + 1; }
    });
    return out;
  });
  console.log('\n  machines with a GET round but no photograph of their model');
  ok('there are some, and this is why the fallback exists', scope.noPhoto > 0,
     scope.noPhoto + ' of ' + scope.total + ' — ' +
     Object.entries(scope.fams).map(([k, v]) => k + ' x' + v).join(', '));

  /* ---- every eligible unit gets a drawing -------------------------------- */
  console.log('\n  nothing is left with bare numbers over an empty box');
  const units = await p.evaluate(() =>
    (window.ASSETS || []).filter(a => getStatus(a.n).ok).map(a => a.n));
  let bare = [], offAll = [];
  for (const u of units) {
    await p.evaluate(x => selectEquip(x), u);
    await p.waitForTimeout(90);
    const r = await p.evaluate(() => {
      const sv = document.querySelector('#posnav .ucmap');
      return { drawn: !!(sv && sv.querySelector('.um-drawn path')),
               photo: !!(sv && sv.querySelector('.um-photo')),
               nums: sv ? sv.querySelectorAll('.um-num').length : 0 };
    });
    if (!r.drawn || !r.nums) bare.push(u + (r.drawn ? '' : ' no art') + (r.nums ? '' : ' no numbers'));
  }
  ok('every machine with a GET round has art under its numbers',
     !bare.length, bare.length ? bare.slice(0, 6).join(', ') : units.length + ' units');

  /* ---- and every number is on the part it names -------------------------- */
  console.log('\n  and every number is on the part it names');
  /* One representative per tool, with the photograph removed so the drawing is
     what is being judged — on a unit that HAS a photo this is the 404 path, and
     on one that has none it is the everyday path. Same code either way. */
  for (const [unit, tool] of [['LD004', 'bucket'], ['DZ010', 'blade'],
                              ['LD012', 'bucket'], ['RB001', 'bucket'], ['EX013', 'bucket']]) {
    await p.evaluate(x => selectEquip(x), unit);
    await p.waitForTimeout(400);
    await p.evaluate(() => { const i = document.querySelector('.um-photo'); if (i) WEAR.photoGone(i); });
    await p.waitForTimeout(200);
    const r = await p.evaluate(OFF_PARTS);
    if (r.err) { ok(unit + ' (' + tool + '): a drawing is there', false, r.err); continue; }
    ok(unit + ' (' + tool + '): all ' + r.nums + ' numbers land on a part',
       !r.off.length, r.off.length ? 'off: ' + r.off.join(',') : r.parts + ' parts drawn');
    if (r.off.length) offAll.push(unit + ':' + r.off.join(','));
  }

  /* ---- the photograph still wins where there is one ---------------------- */
  console.log('\n  a photograph, where one exists, is still what you see');
  await p.evaluate(() => selectEquip('DZ010'));
  await p.waitForTimeout(500);
  const withPhoto = await p.evaluate(() => {
    const sv = document.querySelector('#posnav .ucmap');
    const d = sv.querySelector('.um-drawn');
    return { photo: !!sv.querySelector('.um-photo'),
             hidden: !!(d && /display:\s*none/.test(d.getAttribute('style') || '')) };
  });
  ok('the photograph is used', withPhoto.photo);
  ok('and the drawing waits behind it rather than showing through', withPhoto.hidden);

  /* ---- a track frame is still refused ------------------------------------ */
  console.log('\n  and a bucket never gets an undercarriage drawn under it');
  const wrong = await p.evaluate(() => {
    const sv = document.querySelector('#posnav .ucmap');
    return sv ? sv.querySelectorAll('.mf-roller,.mf-idler,.mf-sprocket,.mf-chain').length : -1;
  });
  ok('no track parts on a GET map', wrong === 0, String(wrong));

  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
