/* Build 300 shrank the undercarriage drawing so it could share page one with
   the Condition summary. html2canvas has its own renderer for an <svg>'s
   children and does not apply the outer element's CSS shrink to a nested
   raster <image> the way it does to every vector child — a puck and the
   track frame scale down correctly with .ucmap's max-height, but the
   photograph under them kept its native, un-shrunk size, and whatever fell
   past the smaller frame's edge painted off the page. It reached the field:
   DZ003's real UC report printed a drawing with the drive sprocket, the rear
   roller and the ONE CRITICAL finding on the machine all missing, cut off the
   right edge — the drawing was correct, only the copy handed to html2canvas
   was not.

   CMR.flattenUcmapPhotos rasterises the composite (photo + drawn frame +
   pucks) through the BROWSER's own SVG-to-canvas path before html2canvas
   ever sees it — proven correct, since that is exactly what a plain
   screenshot of the same markup already does — and swaps in a plain <img>.
   This asks the question the field report was actually about: after a real
   shrink to the v3 size, is the far side of the photograph still there.

   Run: node tests/ucflatten.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

// A real-shaped photograph (wider than tall, like the field's own machine
// shots) with an unmissable stripe down its far right edge — 87% to 100% of
// the width — standing in for the drive sprocket, the rear roller and puck 8,
// the parts DZ003's real report lost off the right of the frame.
const PHOTO = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="920" height="400">' +
  '<rect width="920" height="400" fill="#e8b23c"/>' +
  '<rect x="800" y="0" width="120" height="400" fill="#1a4fa0"/></svg>');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1200 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMR && window.WEAR, { timeout: 20000 });

  // Puck 8 sits at box[0]+0.98*box[2] — hard against the right edge of the
  // frame, exactly where the field's puck 8 was lost — and the drawing is
  // forced to the actual v3 shrunk height (.ucmap's own max-height, 175px)
  // rather than relying on which CSS context happens to apply.
  const setup = await p.evaluate((photo) => {
    const st = document.createElement('style'); st.textContent = CMR.CSS; document.head.appendChild(st);
    const html = WEAR.mapPhoto({
      photo, box: [4, 20, 92, 60],
      layout: [['8', 0.98, 0.5], ['1', 0.05, 0.5]],
      state: n => n === '8' ? 'act' : 'done',
    });
    const holder = document.createElement('div'); holder.id = 'rptRoot';
    holder.style.cssText = 'position:relative;width:760px;background:#fff;';
    holder.innerHTML = html;
    document.body.appendChild(holder);
    const svg = holder.querySelector('svg.ucmap');
    svg.style.maxHeight = '175px';                    // the v3 shrunk size
    const r = svg.getBoundingClientRect();
    return { w: r.width, h: r.height, hasImage: !!svg.querySelector('image') };
  }, PHOTO);
  ok('the drawing has a raster photograph', setup.hasImage);
  ok('the frame is actually shrunk to the v3 size', setup.h <= 176 && setup.h > 0, 'h=' + setup.h);

  const after = await p.evaluate(async () => {
    const holder = document.getElementById('rptRoot');
    await CMR.flattenUcmapPhotos(holder, 2);
    const img = holder.querySelector('img.ucmap');
    const svgLeft = holder.querySelectorAll('svg.ucmap').length;
    if (!img) return { img: false, svgLeft };
    const c = await html2canvas(holder, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const cx = c.getContext('2d');
    const hr = holder.getBoundingClientRect(), r = img.getBoundingClientRect();
    // Sample well inside the blue stripe (87%-100% of the photo's width) at
    // 95% across, mid-height — the far side of the machine.
    const px = Math.round((r.left - hr.left + r.width * 0.95) * 2);
    const py = Math.round((r.top - hr.top + r.height * 0.5) * 2);
    const d = cx.getImageData(px, py, 1, 1).data;
    return { img: true, svgLeft, w: r.width, h: r.height, sample: [d[0], d[1], d[2]] };
  });
  ok('the live svg is replaced by a flattened <img>', after.img);
  ok('no svg.ucmap with a raster photo is left behind', after.svgLeft === 0, 'left=' + after.svgLeft);
  // A cropped render leaves this spot showing the page's own white
  // background; either the photo's stripe or puck 8's own red ring proves
  // there is real content there instead. (The sample landed on puck 8's ring
  // itself, #d03b3b — which is its own proof: the one CRITICAL finding on
  // the far side of the machine is exactly what the field report lost.)
  const [rr, gg, bbv] = after.sample || [255, 255, 255];
  const notBlank = (255 - rr) + (255 - gg) + (255 - bbv) > 60;
  ok('the far edge of the frame — where puck 8 lived — is still painted',
    notBlank, 'rgb=' + (after.sample || []).join(','));

  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
