/* Every number on the numbered walk lands on the machine, and no two of them
   land on each other.

   The walk is three pieces of data that have to agree with a photograph:
   LAYOUT says where a number sits as a fraction of the track frame, BOX says
   where the track frame sits inside THIS model's picture, and the picture is a
   file somebody cropped. Nothing checks that they still agree, and when they
   stop agreeing nothing breaks — the sheet prints, the key lists eleven parts,
   and "drive sprocket" is floating in the white space behind the ripper. That
   is what came back from the pit on the D275 sheet, and it had been wrong for
   every dozer in the fleet.

   So this asks the two questions a person asks when they look at the drawing:

     is the number ON the machine?   The picture is decoded and drawn into a
     canvas, and the pixel under each puck is read. Paper is near-white and
     grey; a machine is not. A number over blank paper is a number pointing at
     nothing.

     can you read it?   A puck is 26 units across in a 460-wide drawing. Two of
     them closer than that print as one number with a bite out of it, and on
     the glass the one on top eats the other one's tap.

   Both are measured on what wear-map.js actually emits — the transforms are
   read back out of the SVG — so the collision pass and the boxes are checked
   as shipped rather than as described.

   Run: node tests/ucbox.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL  = `http://127.0.0.1:${PORT}/mobile/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const CHECK = `(async () => {
  const PVB_W = 460, R = 13;
  const out = [];
  const models = Object.keys(MACHINE_PHOTOS.BY_MODEL_UC);
  for (const model of models) {
    const url = MACHINE_PHOTOS.ucUrlFor(model);
    const asp = MACHINE_PHOTOS.aspectOf(url);
    const box = UCPTS.boxFor(model);
    const html = WEAR.mapPhoto({ photo: url, box: box, aspect: asp,
                                 layout: UCPTS.layout, side: 'L' });
    /* Read the numbers back out of the drawing rather than recomputing them —
       the point is to check what is drawn. */
    const vb = /viewBox="0 0 (\\d+) (\\d+)"/.exec(html);
    const H = vb ? +vb[2] : 0;
    const pucks = [...html.matchAll(/data-ucg="(\\d+)" transform="translate\\(([-\\d.]+),([-\\d.]+)\\)"/g)]
      .map(m => ({ n: +m[1], x: +m[2], y: +m[3] }));

    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = await new Promise(r => { img.onload = () => r(true); img.onerror = () => r(false); img.src = url; });
    if (!loaded) { out.push({ model: model, err: 'photo did not load: ' + url }); continue; }
    const cv = document.createElement('canvas');
    cv.width = PVB_W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, PVB_W, H);
    /* preserveAspectRatio="none" — the drawing stretches the picture to fill,
       so the canvas must too or the samples land somewhere else. */
    cx.drawImage(img, 0, 0, PVB_W, H);
    const px = cx.getImageData(0, 0, PVB_W, H).data;
    const onMachine = (x, y) => {
      /* A puck is 26 across; call it "on the machine" if the middle of it is.
         Sampled over a small disc so one white rivet highlight is not a fail. */
      let hit = 0, seen = 0;
      for (let dy = -5; dy <= 5; dy += 5) for (let dx = -5; dx <= 5; dx += 5) {
        const ix = Math.round(x + dx), iy = Math.round(y + dy);
        if (ix < 0 || iy < 0 || ix >= PVB_W || iy >= H) continue;
        const i = (iy * PVB_W + ix) * 4;
        const r = px[i], g = px[i+1], b = px[i+2];
        seen++;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx < 246 || mx - mn > 12) hit++;
      }
      return seen ? hit / seen : 0;
    };
    const off = [], near = [];
    pucks.forEach(p => { if (onMachine(p.x, p.y) < 0.34) off.push(p.n); });
    for (let i = 0; i < pucks.length; i++) for (let j = i + 1; j < pucks.length; j++) {
      const d = Math.hypot(pucks[i].x - pucks[j].x, pucks[i].y - pucks[j].y);
      if (d < 2 * R) near.push(pucks[i].n + '/' + pucks[j].n + ' ' + d.toFixed(1));
    }
    /* The sheet that leaves the building draws this through reportUCMap, and
       by then the photograph is a data: URI — so it cannot read the shape off
       the file the way the capture screen can. It has to be told, and when it
       was not it fell back to a fixed box and squashed every machine into it.
       Compare what the report draws against the picture's real proportions. */
    const rpt = WEAR.reportUCMap({ model: model, photo: url, fam: 'dz', rollers: 8,
                                   state: function () { return ''; } });
    let rasp = 0;
    if (rpt && rpt.html) {
      const rv = /viewBox="0 0 (\d+) (\d+)"/.exec(rpt.html);
      if (rv) rasp = +rv[1] / +rv[2];
    }
    out.push({ model: model, n: pucks.length, h: H, off: off, near: near,
               asp: asp, rasp: rasp });
  }
  return out;
})()`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  const res = await p.evaluate(CHECK);

  console.log('\n  every model has a drawing with a walk on it');
  ok('there are models to check', res.length >= 25, res.length + ' models');
  const err = res.filter(r => r.err);
  ok('every photograph loaded', err.length === 0, err.map(r => r.model).join(' | ') || 'all loaded');
  const short = res.filter(r => !r.err && r.n !== 11);
  ok('and each carries all eleven numbers', short.length === 0,
    short.map(r => r.model + ':' + r.n).join(' | ') || 'eleven each');

  console.log('\n  a number points at a part, not at the paper beside it');
  const offs = res.filter(r => r.off && r.off.length);
  ok('no number is floating off the machine', offs.length === 0,
    offs.map(r => r.model + ' → ' + r.off.join(',')).slice(0, 6).join(' | ') || 'all on the machine');

  console.log('\n  the printed sheet draws the machine, not a squashed one');
  const squash = res.filter(r => !r.err && r.rasp && Math.abs(r.rasp - r.asp) / r.asp > 0.04);
  ok('the report draws every model at its own proportions', squash.length === 0,
    squash.map(r => r.model + ' ' + r.asp + '→' + r.rasp.toFixed(2)).slice(0, 5).join(' | ') || 'true to the picture');

  console.log('\n  and you can read all eleven of them');
  const cols = res.filter(r => r.near && r.near.length);
  ok('no two numbers overlap', cols.length === 0,
    cols.map(r => r.model + ' → ' + r.near.join(' ')).slice(0, 6).join(' | ') || 'clear');

  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
