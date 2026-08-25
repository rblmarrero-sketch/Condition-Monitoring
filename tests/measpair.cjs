/* Left and right on one row — where that is true, and only there.

   An undercarriage carries every position twice, and the reading that matters
   is the difference between the sides: uneven wear is track tension, or
   alignment, or a machine that works a camber all shift. The grid used to
   split the readings down the middle of a list, which put "Track roller — Left
   8" at the foot of one column and "Track roller — Right 1" at the head of the
   other. Which column a reading sat in said nothing.

   Three things have to hold, and the third is the one that makes this safe to
   ship:

     the sided round pairs, and the two numbers on a row are the SAME PART on
     the two sides — checked by reading the keys back out of the round, not by
     trusting the labels;

     nothing is lost or doubled in the rearranging — every millimetre the round
     captured appears on the paper exactly once;

     a round that is NOT sided keeps the running split. A dump body has
     sixty-three stations and no sides; a blade has two end bits and a centre
     edge with no twin. Inventing a pair is worse than not having one.

   Run: node tests/measpair.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL  = `http://127.0.0.1:${PORT}/mobile/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const SEED = `(async () => {
  const mk = (id, ty, unit, date, pos) => ({ id, type: ty, equip: unit, date,
    by: 'S. Volkov', sup: 'A. Sokolov', smu: '7410',
    cls: (ASSET_BY[unit] || {}).cls || '', gps: null, dev: 'PH-01', sign: null,
    positions: pos, created: date + 'T06:00:00.000Z', up: 0, upTo: {}, rev: 1 });
  const fill = (ty, unit, date, keep) => {
    type = ty; selectEquip(unit);
    const o = {}, ks = items().map(x => x.k);
    ks.forEach((k, i) => {
      if (keep && !keep(k)) return;
      const sp = (typeof ucSplit === 'function' ? ucSplit(k) : [k, '']);
      const rf = WEAR.refFor(unit, (ASSET_BY[unit] || {}).m, sp[0], sp[1], date);
      if (!rf || rf.x) { o[k] = { mm: null, reason: (WEAR.reasons[0] || {}).code || '', stood: 0, photos: [], video: null }; return; }
      const f = Math.min(1.2, 0.5 + ((i % 7) - 3) * 0.05);
      o[k] = { mm: Math.round((rf.n + (rf.c - rf.n) * f) * 10) / 10, stood: 0, reason: '', photos: [], video: null };
    });
    return o;
  };
  await dbPut(mk('mp-uc', 'UC', 'DZ004', '2026-08-09', fill('UC', 'DZ004', '2026-08-09')));
  /* The tray takes its millimetres directly: refFor keys undercarriage points,
     and a station seeded through it comes out with a reason and no reading —
     which would leave the "printed exactly once" check counting nothing and
     agreeing with itself. */
  type = 'TB'; selectEquip('TK101');
  const tb = {};
  items().forEach((x, i) => { tb[x.k] = { mm: Math.round((4 + (i % 11) * 1.3) * 10) / 10,
    stood: 0, reason: '', photos: [], video: null }; });
  await dbPut(mk('mp-tb', 'TB', 'TK101', '2026-08-10', tb));
  /* One side of one part left off entirely, so "a pair with a hole in it" is a
     case somebody has actually looked at rather than an assumption. */
  await dbPut(mk('mp-half', 'UC', 'DZ002', '2026-08-11',
    fill('UC', 'DZ002', '2026-08-11', k => k !== 'SPROCKET.R')));
  const n = {};
  for (const r of await dbAll()) n[r.id] = Object.keys(r.positions).length;
  return n;
})()`;

/* Everything the sheet printed for one round, read out of the HTML. */
const gridOf = (p, id) => p.evaluate(async (id) => {
  const secs = await buildReportSections(id);
  const html = secs.map(s => s.html).join('\n');
  /* To the end of the TABLE, not to the first </div> — the cells carry divs
     of their own (the reference line, the wear bar) and cutting there leaves
     an empty grid that every count below then agrees with. */
  const grids = html.split('<div class="meas">').slice(1)
    .map(h => { const i = h.indexOf('</table>'); return i < 0 ? h : h.slice(0, i + 8); });
  const paired = /<table class="pair"/.test(html);
  const body = grids.join(' ');
  const rows = [];
  const re = /<tr class="[^"]*">([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = re.exec(body))) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(c => c[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
    rows.push(cells);
  }
  const nums = [...body.matchAll(/<b>(\d+(?:\.\d+)?)<\/b>/g)].map(x => x[1]);
  const head = (grids[0] || '').split('</tr>')[0].replace(/<[^>]*>/g, '|').replace(/\|+/g, '|');
  return { paired, rows, nums, head, sections: secs.length };
}, id);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  const seeded = await p.evaluate(SEED);

  console.log('\n  the undercarriage prints its two sides side by side');
  const uc = await gridOf(p, 'mp-uc');
  ok('the round seeded', (seeded['mp-uc'] || 0) > 20, seeded['mp-uc'] + ' positions');
  ok('the grid is paired', uc.paired === true);
  ok('and its columns are headed left and right',
    /Left/.test(uc.head) && /Right/.test(uc.head), uc.head.slice(0, 90));

  /* The claim being tested: the two numbers on a row are the same part on the
     two sides. Verified from the round's own keys and readings, not from the
     printed labels — a label that reads "Track roller — 1" would look right
     next to any pair of numbers. */
  const truth = await p.evaluate(async () => {
    const rec = (await dbAll()).find(r => r.id === 'mp-uc');
    const by = {};
    Object.keys(rec.positions).forEach(k => {
      const m = /^([^.]+)\.([LR])([-0-9].*|)$/.exec(k);
      if (!m) return;
      const part = m[1] + '|' + m[3];
      (by[part] = by[part] || {})[m[2]] = rec.positions[k].mm;
    });
    return by;
  });
  const mism = [];
  uc.rows.forEach(cells => {
    /* name | measured | worn | bar | gutter | measured | worn | bar */
    if (cells.length < 6) return;
    const L = cells[1], R = cells[cells.length - 3];
    if (!/^\d/.test(L) || !/^\d/.test(R)) return;
    const hit = Object.keys(truth).some(k =>
      String(truth[k].L) === L && String(truth[k].R) === R);
    if (!hit) mism.push(cells[0].slice(0, 28) + ' → ' + L + ' / ' + R);
  });
  ok('every row is one part, left reading beside right reading',
    mism.length === 0, mism.slice(0, 4).join(' | ') || uc.rows.length + ' rows checked');

  const want = await p.evaluate(async () => {
    const rec = (await dbAll()).find(r => r.id === 'mp-uc');
    return Object.values(rec.positions).filter(x => x.mm != null).map(x => String(x.mm));
  });
  const counts = {};
  uc.nums.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  const wantC = {};
  want.forEach(v => { wantC[v] = (wantC[v] || 0) + 1; });
  const lost = Object.keys(wantC).filter(v => (counts[v] || 0) !== wantC[v]);
  ok('every millimetre the round captured is on the paper exactly once',
    lost.length === 0 && uc.nums.length === want.length,
    uc.nums.length + ' printed, ' + want.length + ' captured'
      + (lost.length ? ' — off: ' + lost.slice(0, 5).join(',') : ''));

  console.log('\n  a pair with a hole in it still makes a row');
  const half = await gridOf(p, 'mp-half');
  ok('a round missing one side of one part still pairs', half.paired === true);
  /* The part must survive its missing side. Counted against the round's own
     parts rather than against dashes on the page — an unreached point prints a
     dash too, and a check that cannot tell those apart passes on a sheet that
     dropped the part entirely. */
  const halfTruth = await p.evaluate(async () => {
    const rec = (await dbAll()).find(r => r.id === 'mp-half');
    const parts = {}; let read = 0;
    Object.keys(rec.positions).forEach(k => {
      const m = /^([^.]+)\.([LR])([-0-9].*|)$/.exec(k);
      if (m) parts[m[1] + '|' + m[3]] = 1;
      if (rec.positions[k].mm != null) read++;
    });
    return { parts: Object.keys(parts).length, read, has: !!rec.positions['SPROCKET.L'],
             gone: !rec.positions['SPROCKET.R'] };
  });
  ok('the seed really is missing one side', halfTruth.has && halfTruth.gone);
  ok('the part is still a row, not dropped with its missing twin',
    half.rows.length === halfTruth.parts,
    half.rows.length + ' rows for ' + halfTruth.parts + ' parts');
  ok('and every reading it does have is printed',
    half.nums.length === halfTruth.read,
    half.nums.length + ' printed, ' + halfTruth.read + ' captured');

  console.log('\n  a round with no sides keeps the running split');
  const tb = await gridOf(p, 'mp-tb');
  ok('the tray seeded', (seeded['mp-tb'] || 0) > 40, seeded['mp-tb'] + ' stations');
  ok('the tray grid is NOT paired', tb.paired === false);
  ok('and it is not headed left and right',
    !/Left|Right/.test(tb.head), tb.head.slice(0, 90));
  const tbWant = await p.evaluate(async () => {
    const rec = (await dbAll()).find(r => r.id === 'mp-tb');
    return Object.values(rec.positions).filter(x => x.mm != null).length;
  });
  ok('and every tray reading is still printed exactly once',
    tb.nums.length === tbWant, tb.nums.length + ' printed, ' + tbWant + ' captured');

  console.log('\n  and it reads the same in Russian');
  await p.evaluate(async () => { document.querySelector('.lang [data-lang="ru"]').click();
    await new Promise(r => setTimeout(r, 400)); });
  const ru = await gridOf(p, 'mp-uc');
  await p.evaluate(async () => { document.querySelector('.lang [data-lang="en"]').click();
    await new Promise(r => setTimeout(r, 300)); });
  ok('the side headings are translated, not left in English',
    /Слева/.test(ru.head) && /Справа/.test(ru.head), ru.head.slice(0, 90));
  /* Inside the heading, not in the document — the sheet is bilingual
     throughout, so "Left" appears in a hundred places that are not this. */
  ok('and Russian leads them in the heading',
    ru.head.indexOf('Слева') < ru.head.indexOf('Left'),
    ru.head.slice(0, 90));

  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
