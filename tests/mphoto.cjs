/* THE MACHINE PHOTOGRAPH HAS TO LAND ON THE MACHINE.
 *
 * Reported from the field on build 246: tap "Take" on Equipment overview, and
 * the photograph appears under the component that happens to be selected —
 * labelled "Component" — while the checklist stays at "0 of 1 required
 * photographs taken" and Save refuses the round. The round could not be saved
 * at all, because the one photograph it demands could not be given to it.
 *
 * The overview "Take" reused #camera, whose standing onchange handler files
 * every photograph on the current component and clears the control. A listener
 * added for one shot ran second and found the control empty. Every suite that
 * captured a round planted the machine photographs straight onto the draft, so
 * nothing had ever driven the button with a file.
 *
 * This does. It goes through the real buttons and the real file chooser —
 * camera and gallery, machine and component — and checks that each photograph
 * ends up on exactly the thing that asked for it, and that the round then
 * saves.
 */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const f = path.join(ROOT, u.pathname);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(fs.readFileSync(f));
});

(async () => {
  console.log('the source: the machine photographs have controls of their own');
  {
    const src = fs.readFileSync(path.join(ROOT, 'mobile/index.html'), 'utf8');
    const a = src.indexOf('async function takeMachinePhoto'), b = src.indexOf('function dropMachinePhoto');
    const body = a >= 0 && b > a ? src.slice(a, b) : '';
    ok('takeMachinePhoto exists', body.length > 0);
    ok('and never touches #camera or #gallery, which file on the component', !/\$\("camera"\)|\$\("gallery"\)/.test(body));
    ok('#mcamera and #mgallery are in the page', /id="mcamera"/.test(src) && /id="mgallery"/.test(src));
    ok('and nothing has a standing handler on them', !/\$\("mcamera"\)\.onchange|\$\("mgallery"\)\.onchange/.test(src));
  }

  await new Promise(r => srv.listen(0, r));
  const APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(APP, { waitUntil: 'load' });
  await p.waitForTimeout(1500);

  /* A real JPEG, made by the browser, so intake() can decode and shrink it. */
  const jpg = async (tone, w, h) => {
    const b64 = await p.evaluate(({ tone, w, h }) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = tone; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(w / 4, h / 4, w / 2, h / 2);
      return c.toDataURL('image/jpeg', 0.8).split(',')[1]; }, { tone, w, h });
    return { name: 'shot.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
  };
  const state = () => p.evaluate(() => {
    const g = draft.positions[GEN_KEY] || {};
    const cat = (pp, bl) => attCat(pp, bl);
    const comp = draft.positions[curItem] || {};
    return { overview: genPhotos(draft, 'OVERVIEW').length, plate: genPhotos(draft, 'PLATE').length,
      genCats: (g.photos || []).map(bl => cat(g, bl)),
      comp: (comp.photos || []).length, compCats: (comp.photos || []).map(bl => cat(comp, bl)),
      count: (document.getElementById('mpCount') || {}).textContent || '' };
  });
  /* Tap a button that opens the file chooser, and hand the chooser a file —
     the way a thumb and a camera do it. Says which control the chooser came
     from, because that is the whole question. */
  const shoot = async (tap, file) => {
    const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 10000 }), tap()]);
    const id = await fc.element().evaluate(e => e.id);
    await fc.setFiles(file);
    return { id, multiple: fc.isMultiple() };
  };
  const via = async (btn, src) => { await btn(); await p.waitForSelector('#srcDlg[open]', { timeout: 5000 }); await p.click(src); };

  console.log('\na magnetic-plug round on TK147, component 4C selected');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('TK147'));
  await p.waitForTimeout(500);
  await p.evaluate(() => { const k = items()[0].k; pickComponent(k); });
  await p.waitForTimeout(300);
  await p.fill('#inspector', 'R. Marrero');
  await p.fill('#smu', '6100');
  const s0 = await state();
  ok('nothing photographed yet, and the checklist says 0 of 1', s0.overview === 0 && s0.comp === 0 && /0 of 1/.test(s0.count), JSON.stringify(s0));

  console.log('\nEquipment overview → Take → camera');
  {
    const r = await shoot(() => via(() => p.evaluate(() => document.querySelector('#mpRows [data-take="OVERVIEW"]').click()), '#srcLive'), await jpg('#3b4a55', 640, 480));
    ok('the chooser came from the machine camera control, not the component one', r.id === 'mcamera', r.id);
    await p.waitForFunction(() => genPhotos(draft, 'OVERVIEW').length === 1, null, { timeout: 15000 }).catch(() => {});
    const s = await state();
    ok('the photograph is on the machine, as OVERVIEW', s.overview === 1 && s.genCats[0] === 'OVERVIEW', JSON.stringify(s));
    ok('and NOT on component 4C', s.comp === 0, s.comp + ' on the component');
    ok('the checklist reads 1 of 1', /1 of 1/.test(s.count), s.count);
  }

  console.log('\nIdentification plate → Take → gallery');
  {
    const r = await shoot(() => via(() => p.evaluate(() => document.querySelector('#mpRows [data-take="PLATE"]').click()), '#srcGal'), await jpg('#6a5a3b', 480, 640));
    ok('the chooser came from the machine gallery control', r.id === 'mgallery', r.id);
    await p.waitForFunction(() => genPhotos(draft, 'PLATE').length === 1, null, { timeout: 15000 }).catch(() => {});
    const s = await state();
    ok('the photograph is on the machine, as PLATE', s.plate === 1 && s.genCats.includes('PLATE'), JSON.stringify(s));
    ok('and still nothing on the component', s.comp === 0, String(s.comp));
  }

  console.log('\nthe component\'s own Add photo → camera');
  {
    const r = await shoot(() => via(() => p.click('#takeBtn'), '#srcLive'), await jpg('#803030', 640, 480));
    ok('the chooser came from the component camera control', r.id === 'camera', r.id);
    await p.waitForFunction(() => ((draft.positions[curItem] || {}).photos || []).length === 1, null, { timeout: 15000 }).catch(() => {});
    const s = await state();
    ok('exactly one photograph on 4C, as COMPONENT — not two', s.comp === 1 && s.compCats[0] === 'COMPONENT', JSON.stringify(s));
    ok('and the machine photographs are untouched', s.overview === 1 && s.plate === 1, JSON.stringify(s));
  }

  console.log('\nthe component\'s Add photo → gallery, two at once');
  {
    const two = [await jpg('#305030', 640, 480), await jpg('#303080', 640, 480)];
    const r = await shoot(() => via(() => p.click('#takeBtn'), '#srcGal'), two);
    ok('the chooser came from the component gallery control', r.id === 'gallery', r.id);
    ok('which still takes several at once — the machine path did not narrow it', r.multiple === true, String(r.multiple));
    await p.waitForFunction(() => ((draft.positions[curItem] || {}).photos || []).length === 3, null, { timeout: 20000 }).catch(() => {});
    const s = await state();
    ok('three photographs on 4C now', s.comp === 3, String(s.comp));
    ok('the machine still has its two', s.overview === 1 && s.plate === 1, JSON.stringify(s));
  }

  console.log('\nand the round saves');
  {
    await p.evaluate(() => document.querySelector('#gradeSeg [data-g="1"]').click());
    await p.waitForTimeout(200);
    await p.click('#saveBtn');
    await p.waitForTimeout(800);
    const d = await p.evaluate(() => (document.getElementById('dlg') || {}).textContent || '');
    ok('Save goes through with the overview it asked for', /Saved|saved on this phone/i.test(d), d.replace(/\s+/g, ' ').slice(0, 120));
    const stored = await p.evaluate(async () => { const all = await dbAll(); const r = all.find(x => x.equip === 'TK147'); if (!r) return null;
      const g = r.positions['__general'] || {}; const comp = Object.entries(r.positions).find(([k]) => k !== '__general');
      return { gen: (g.photos || []).length, genCats: (g.photos || []).map(bl => attCat(g, bl)), comp: comp ? (comp[1].photos || []).length : -1 }; });
    ok('the stored round carries the machine photographs under __general with their categories',
       !!stored && stored.gen === 2 && stored.genCats.includes('OVERVIEW') && stored.genCats.includes('PLATE'), JSON.stringify(stored));
    ok('and the component its three', !!stored && stored.comp === 3, JSON.stringify(stored));
  }

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
