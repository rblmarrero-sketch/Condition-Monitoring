/* EVERY GET ROUND'S OWN DIAGRAM WAS NAMED "Right undercarriage" — WHATEVER
   TOOL THE MACHINE ACTUALLY CARRIES.

   W.mapPhoto (mobile/wear-map.js) is the one SVG both UC and GET round
   diagrams are built from, and its aria-label was hard-coded to
   (o.side === 'L' ? 'Left' : 'Right') + ' undercarriage'. reportUCMap
   always passes a side ('L'/'R'), so that was correct there — but
   reportGETMap never passed o.side at all, and a GET round is not the
   undercarriage in the first place: it is a bucket or a blade. So
   o.side === 'L' was always false for a GET diagram (o.side undefined),
   and every one of them — bucket or blade, on any machine — announced
   itself as "Right undercarriage" to anything reading the label rather
   than looking at the picture, on every report and on the capture screen
   alike.

   Fixed by letting a caller state what the drawing actually is (o.label),
   with the side-based undercarriage phrasing kept as the fallback for a
   caller that doesn't (reportUCMap, unchanged). reportGETMap now passes
   the tool's own name from GT.profileFor (prof.en / prof.ru).

   Run: node tests/getlabel.cjs [port]   (needs tests/ed-srv.cjs on the port) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.WEAR && window.GET && window.UCPTS, { timeout: 20000 });

  const r = await p.evaluate(() => {
    const out = {};
    // an excavator (bucket) and a dozer (blade) — the two GET tools.
    const bucketProf = GET.profileFor('EX013', '', 'Hitachi ZX 1200');
    const bladeProf = GET.profileFor('DZ010', '', 'CAT D9R');
    const bucket = WEAR.reportGETMap({ unit: 'EX013', model: 'Hitachi ZX 1200', lang: 'en' });
    const blade = WEAR.reportGETMap({ unit: 'DZ010', model: 'CAT D9R', lang: 'en' });
    const bucketRu = WEAR.reportGETMap({ unit: 'EX013', model: 'Hitachi ZX 1200', lang: 'ru' });
    // only the <svg role="group" aria-label="..."> — a puck's own
    // aria-label="<number>" (role="button") matches a bare attribute regex
    // too, which is not what this is checking.
    const grab = (html, re) => { const m = html && html.match(re); return m ? m[1] : null; };
    const SVGLABEL = /<svg[^>]*role="group"[^>]*aria-label="([^"]*)"/;
    out.bucketProfEn = bucketProf && bucketProf.en;
    out.bladeProfEn = bladeProf && bladeProf.en;
    out.bucketLabel = grab(bucket && bucket.html, SVGLABEL);
    out.bladeLabel = grab(blade && blade.html, SVGLABEL);
    out.bucketLabelRu = grab(bucketRu && bucketRu.html, SVGLABEL);

    // UC's own side-based labelling must be untouched.
    const uc = WEAR.reportUCMap({
      model: 'CAT D9R', lang: 'en', sides: ['L', 'R'],
      state: () => '',
    });
    const labels = uc ? [...uc.html.matchAll(/<svg[^>]*role="group"[^>]*aria-label="([^"]*)"/g)].map(m => m[1]) : [];
    out.ucLabels = labels;
    return out;
  });

  ok('a bucket profile resolves to "Bucket"', r.bucketProfEn === 'Bucket', r.bucketProfEn);
  ok('a blade profile resolves to "Blade & ripper"', r.bladeProfEn === 'Blade & ripper', r.bladeProfEn);
  ok('THE FIX: an excavator\'s GET diagram is named for its own tool, not "Right undercarriage"',
     r.bucketLabel === 'Bucket', r.bucketLabel);
  ok('  and a dozer\'s GET diagram is named for ITS tool, not "Right undercarriage" either',
     r.bladeLabel === 'Blade &amp; ripper', r.bladeLabel);
  ok('  in Russian too, not just English', r.bucketLabelRu === 'Ковш', r.bucketLabelRu);
  ok('the UC diagram\'s own Left/Right labelling is untouched',
     r.ucLabels.length === 2 && r.ucLabels[0] === 'Left undercarriage' && r.ucLabels[1] === 'Right undercarriage',
     JSON.stringify(r.ucLabels));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
