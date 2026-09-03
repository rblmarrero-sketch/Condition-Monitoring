/* The photograph cap is per component, not per machine. Prove it is where we
   think it is: fill one position to the limit, check the next position starts
   from zero, and follow every frame through the file names, the package and the
   printed page.

   The cap itself is read out of the running app, never typed here. A literal
   makes a suite with a shelf life — it passes until somebody raises the limit
   and then reports the app as broken for doing exactly what it was asked. */
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');   // the machine photographs every round now carries
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);

  // a real one-pixel JPEG, so extOf() and the blob path behave as in the field
  const px = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  /* The app reloads itself once when a new service worker takes over, which
     wipes anything hung on window — so hand the image in with every call. */
  const shoot = n => p.evaluate(async ({ n, d }) => {
    const pos = curP(); pos.photos ||= [];
    for (let i = 0; i < n; i++) {
      const f = await fetch(d).then(r => r.blob());
      // exactly what the camera's onchange handler does
      if (pos.photos.length < MAX_PHOTOS) pos.photos.push(f);
    }
    renderMedia(); renderChips();
    return { held: pos.photos.length, btnOff: document.getElementById('takeBtn').disabled };
  }, { n, d: px });

  const CAP = await p.evaluate(() => MAX_PHOTOS);
  console.log('  the limit is ' + CAP + ', and it is per component');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(400);

  const keys = await p.evaluate(() => items().map(x => x.k));
  ok('this machine has more than one plug position', keys.length >= 3, keys.join(','));

  await p.evaluate(k => { saveCur(); curItem = k; loadPos(); }, keys[0]);
  const over = await shoot(CAP + 2);                // try to take two too many
  ok('one past the limit is refused', over.held === CAP, over.held + ' held, cap ' + CAP);
  ok('and the shutter goes flat once it is full', over.btnOff);

  // the next component starts from an empty strip — the cap did not follow it
  await p.evaluate(k => { saveCur(); curItem = k; loadPos(); }, keys[1]);
  const fresh = await p.evaluate(() => ({
    held: ((draft.positions[curItem] || {}).photos || []).length,
    btnOff: document.getElementById('takeBtn').disabled }));
  ok('the next component starts at zero, not at the machine total', fresh.held === 0);
  ok('and its shutter is live', !fresh.btnOff);
  const four2 = await shoot(CAP);
  ok('it takes its own full set', four2.held === CAP, four2.held + ' held');

  await p.evaluate(k => { saveCur(); curItem = k; loadPos(); }, keys[2]);
  const four3 = await shoot(CAP);
  ok('and so does the third', four3.held === CAP);

  const total = await p.evaluate(() => Object.values(draft.positions)
    .reduce((n, x) => n + ((x.photos || []).length), 0));
  ok('three full positions on one machine, no machine-wide cap', total === CAP*3, String(total));

  console.log('\n  a deletion frees a slot on that component only');
  await p.evaluate(() => { const pp = curP(); pp.photos.splice(0, 1); renderMedia(); });
  await p.waitForTimeout(200);
  const afterDel = await p.evaluate(() => ({
    held: curP().photos.length, btnOff: document.getElementById('takeBtn').disabled,
    others: Object.values(draft.positions).map(x => (x.photos || []).length) }));
  ok('the strip drops by one', afterDel.held === CAP-1, String(afterDel.held));
  ok('and the shutter comes back', !afterDel.btnOff);
  ok('no other component lost one', afterDel.others.filter(n => n === CAP).length === 2,
    afterDel.others.join(','));
  await shoot(1);

  console.log('\n  four survive the save and the reopen');
  await p.fill('#inspector', 'R. Marrero');
  await p.fill('#smu', '12345');
  await p.evaluate(PLANT);
  await p.click('#saveBtn'); await p.waitForTimeout(700);
  for (let i = 0; i < 3; i++) { if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgOk'); await p.waitForTimeout(250); } }

  const rec = await p.evaluate(async () => {
    const all = await dbAll();
    const r = all.filter(x => x.equip === 'TK151' && x.type === 'MP')
      .sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
    return { id: r.id, counts: Object.entries(r.positions).map(([k, v]) => [k, (v.photos || []).length]) };
  });
  ok('every component kept its full set', rec.counts.filter(c => c[1] === CAP).length === 3,
    JSON.stringify(rec.counts));

  await p.evaluate(async id => { editRecord(await dbGet(id)); }, rec.id);
  await p.waitForTimeout(600);
  const back = await p.evaluate(ks => { saveCur(); curItem = ks[0]; loadPos();
    return { held: ((draft.positions[ks[0]] || {}).photos || []).length,
      tiles: document.querySelectorAll('#mediastrip .mtile').length,
      btnOff: document.getElementById('takeBtn').disabled }; }, keys);
  ok('a reopen gives them all back', back.held === CAP, String(back.held));
  ok('and shows a tile each, not one', back.tiles === CAP, String(back.tiles));
  ok('the shutter is correctly flat again', back.btnOff);

  console.log('\n  a distinct file name each, so none overwrites another');
  const names = await p.evaluate(async id => {
    const r = await dbGet(id);
    return (await filesForRecord(r)).map(f => f.name).filter(n => /\.(jpg|png|webp)$/i.test(n));
  }, rec.id).catch(() => null);
  if (names) {
    const first = names.filter(n => n.includes(keys[0].replace(/\./g, '-')));
    ok('the first component wrote an image file each', first.length === CAP, first.length + ' files');
    ok('and every name is different', new Set(first).size === first.length);
    ok('they are numbered in order', ['_1', '_2', '_3', '_4'].every(s => first.some(n => n.includes(s + '.'))),
      first.join(' '));
    ok('an image file per photograph, none lost (plus the machine overview)', names.length === CAP*3 + 1, String(names.length));
  } else ok('the export names the photographs', false, 'recFiles() not reachable');

  console.log('\n  the count the dashboard reads');
  const exp = await p.evaluate(async id => recToExport(await dbGet(id)), rec.id);
  ok('the exported item reports the whole set, not one',
    (exp.items || []).filter(i => i.photos === CAP).length === 3,
    (exp.items || []).map(i => i.key + ':' + i.photos).join(' '));

  console.log('\n  what the printed page does with them');
  const html = await p.evaluate(async () => (await buildReportSections()).map(s => s.html).join('\n'));
  const imgs = (html.match(/<img[^>]+src="blob:|<img[^>]+src="data:/g) || []).length;
  console.log('        images printed for ' + (CAP*3) + ' captured: ' + imgs);
  ok('every photograph taken reaches the page, not the first four',
    imgs === CAP*3, imgs + ' of ' + CAP*3);
  /* ONE SIZE, IN ROWS. This used to require the opposite — a lead frame four
     times the size of the rest with the remainder in a strip beneath — and that
     hierarchy is one nobody meant: the first photograph an inspector happened to
     take is not the important one. On a filter cut, where six frames are the
     same filter from six angles, it printed one big picture and a ragged
     three-then-two strip with an empty cell in it. */
  ok('every frame is the same size, in rows',
    (html.match(/class="phg"/g) || []).length === 3 && !/class="phx"/.test(html),
    (html.match(/class="phg"/g) || []).length + ' grids, '
      + (html.match(/class="phx"/g) || []).length + ' strips');
  /* And the rows are chosen for the least waste, so a set never ends in a gap
     where a photograph should be. */
  const cols = [...html.matchAll(/grid-template-columns:repeat\((\d+),1fr\)/g)].map(m => +m[1]);
  ok('laid out with no empty cell left over',
    cols.length > 0 && cols.every(c => CAP % c === 0 || CAP % c === 0),
    CAP + ' photos into ' + [...new Set(cols)].join('/') + ' columns');
  /* The "+6" badge was the failure mode, not the fallback: it turned up on
     exactly the positions with the most photographs, which are the positions
     where something is wrong. */
  ok('and none of them is reduced to a badge', !/class="phn"/.test(html));

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
