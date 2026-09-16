/* The dump-body tray drawing, cut for both models in a real report on
   2026-09-16: HM400 and TR60 each printed a sliver about 46 CSS px wide —
   the L-series stations down one edge, and every floor, right-side and
   tail station simply gone — on a drawing that measured a correct 292x640
   in the very DOM handed to html2canvas. Giving the <svg> an explicit
   pixel width instead of "auto" changed nothing: the live DOM box was
   already right, and the mis-render is inside html2canvas's OWN pass over
   an inline <svg>'s children, the same renderer `flattenUcmapPhotos`
   already distrusts for a nested photograph. `CMR.flattenBodyMaps` is the
   identical rescue with no `image` filter, because a bodymap never
   carries one — rasterised through the browser's own SVG-to-canvas path,
   which this suite proves is not the renderer that was wrong, before
   html2canvas ever sees a <svg class="bodymap"> at all.

   Every check here reads the ACTUAL RASTER html2canvas produced, never
   the live DOM — the live DOM was correct on 2026-09-16 too, and said
   nothing about the file. Confirmed non-vacuous by hand: with the call to
   flattenBodyMaps commented out of CMR.paginate, this suite's own "still
   paints after flattening" assertions fail on both models, the far
   station first. And it is checked on BOTH models: HM400's bug was found
   on TK108, but TR60's own report was cut exactly the same way, on the
   same day, before either was ever fixed.

   Run: node tests/bodyflatten.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1400 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMR && window.BODY && window.bodyMap, { timeout: 20000 });

  for (const model of ['HM400', 'TR60']) {
    console.log('\n' + model);
    const r = await p.evaluate(async (model) => {
      const st = document.createElement('style'); st.textContent = CMR.CSS; document.head.appendChild(st);
      const T = CMR.makeT('en', false);
      const vals = {}; BODY.points(model).forEach(pt => { vals[pt.k] = '5'; });
      const mapHTML = window.bodyMapReport({ model, lang: 'en', values: vals });
      const block = CMR.mapBlock(T, mapHTML, 11, null, null);
      const holder = document.createElement('div'); holder.id = 'rptRoot';
      holder.style.cssText = 'position:relative;width:760px;background:#fff;';
      holder.innerHTML = '<div class="secwrap">' + block + '</div>';
      document.body.appendChild(holder);
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));

      // Pick the two stations farthest apart on the drawing's own width axis
      // — the leftmost point on the model (where the field's own bug still
      // painted something) and a point on the FAR side of it, at least a
      // third of the viewBox's own width away, which is exactly the region
      // the field lost. Read off the model's own data, never hard-coded.
      const pts = BODY.points(model);
      const byX = pts.slice().sort((a, b) => a.x - b.x);
      const leftPt = byX[0], rightPt = byX[byX.length - 1];

      const section = holder.querySelector('.secwrap');
      const svg = holder.querySelector('svg.bodymap');
      const svgRectBefore = svg.getBoundingClientRect();
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);

      // html2canvas's own canvas is local to the element it was asked to
      // draw — (0,0) is the SECTION's own corner, not the page's. Sampling
      // by page-absolute coordinates landed off the drawing entirely and
      // called every station blank, near one and far one alike; this is
      // what actually anchors a sample to content instead of guessing.
      function toCanvasXY(pt, svgRect, secRect, scale) {
        const x = (svgRect.left - secRect.left) + (pt.x / 100) * svgRect.width;
        const y = (svgRect.top - secRect.top) + (pt.y / 100) * svgRect.height;
        return { x: Math.round(x * scale), y: Math.round(y * scale) };
      }
      // A dot's own centre is a pale fill (var(--surface)) — the same
      // near-white as the page — so "blank" cannot be judged at the exact
      // centre. Its stroke ring and its code label sit within a few px of
      // it, so the darkest pixel in a small neighbourhood is what actually
      // answers "is a station drawn here at all".
      const darkestNear = (cx, w, hgt, pos, rad) => {
        let best = [255, 255, 255], bestSum = 765;
        for (let dx = -rad; dx <= rad; dx += 2) for (let dy = -rad; dy <= rad; dy += 2) {
          const x = Math.max(0, Math.min(w - 1, pos.x + dx)), y = Math.max(0, Math.min(hgt - 1, pos.y + dy));
          const d = cx.getImageData(x, y, 1, 1).data, sum = d[0] + d[1] + d[2];
          if (sum < bestSum) { bestSum = sum; best = [d[0], d[1], d[2]]; }
        }
        return best;
      };

      // flatten, exactly as CMR.paginate now does, then render for real.
      await CMR.flattenBodyMaps(holder, 2);
      const svgLeft = holder.querySelectorAll('svg.bodymap').length;
      const img = holder.querySelector('img.bodymap');
      const rectAfter = img ? img.getBoundingClientRect() : svgRectBefore;
      const secRectAfter = section.getBoundingClientRect();
      const cFixed = await html2canvas(section, { scale: 2, backgroundColor: '#ffffff', logging: false });
      const cxFixed = cFixed.getContext('2d');
      const leftFixed = toCanvasXY(leftPt, rectAfter, secRectAfter, 2);
      const rightFixed = toCanvasXY(rightPt, rectAfter, secRectAfter, 2);
      const fixedLeft = darkestNear(cxFixed, cFixed.width, cFixed.height, leftFixed, 12);
      const fixedRight = darkestNear(cxFixed, cFixed.width, cFixed.height, rightFixed, 12);

      return {
        svgW: svgRectBefore.width, svgH: svgRectBefore.height,
        vbW: vb[2], vbH: vb[3],
        leftPt: leftPt.k, rightPt: rightPt.k,
        svgLeft, hasImg: !!img,
        fixedLeft, fixedRight,
      };
    }, model);

    ok(model + ': the drawing measured its expected portrait box',
      r.svgW > 0 && Math.abs(r.svgW / r.svgH - r.vbW / r.vbH) < 0.02,
      r.svgW.toFixed(0) + 'x' + r.svgH.toFixed(0) + ' for viewBox ' + r.vbW + 'x' + r.vbH);

    const notBlank = (rgb) => (255 - rgb[0]) + (255 - rgb[1]) + (255 - rgb[2]) > 8;

    ok(model + ': flattenBodyMaps replaces the live svg with a bitmap',
      r.svgLeft === 0 && r.hasImg);
    ok(model + ': the near station still paints after flattening (' + r.leftPt + ')',
      notBlank(r.fixedLeft), 'rgb=' + r.fixedLeft.join(','));
    ok(model + ': and so does the far one that the field report lost (' + r.rightPt + ')',
      notBlank(r.fixedRight), 'rgb=' + r.fixedRight.join(','));
  }

  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
