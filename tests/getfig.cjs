/* The machine at the top of the screen, and the round that walks its teeth.

   Two things are being checked. That the figure is one figure — the ask was
   explicitly not two copies of the machine, one per track — and that it says
   which round you are on. And that a GET round is a real round: it comes from
   the machine, it refuses machines that have no ground engaging tools, it is
   complete on grades alone, and a millimetre is accepted anywhere somebody had
   a tape without ever being demanded. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8085';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const settled = async p => {
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForFunction(() => typeof window.MFIG === 'object' && typeof window.GET === 'object',
                          null, { timeout: 20000 });
  await p.waitForTimeout(300);
};
const dismiss = async p => { for (let i = 0; i < 3; i++) {
  if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgOk'); await p.waitForTimeout(250); } else break; } };
const setType = async (p, ty) => {
  await p.evaluate(t => { const s = document.getElementById('typeSel'); s.value = t; s.dispatchEvent(new Event('change')); }, ty);
  await p.waitForTimeout(350);
};
/* selectEquip re-renders the picker asynchronously and the undercarriage map
   measures itself afterwards. Waiting a fixed number of milliseconds is how a
   suite passes on a quiet machine and fails on a busy one — wait for the thing
   being asserted on. */
const pick = async (p, u, want) => {
  await p.evaluate(x => selectEquip(x), u);
  if (want) await p.waitForFunction(sel => !!document.querySelector(sel), want, { timeout: 15000 })
                   .catch(e => { fails.push('never rendered ' + want + ' for ' + u); });
  await p.waitForTimeout(350);
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  /* The fallback test deliberately asks for artwork that is not in the repo, so
     one 404 is the thing being proved rather than a fault. */
  let expect404 = false;
  p.on('console', m => { if (m.type() !== 'error') return;
    const x = m.text();
    if (/ERR_|TUNNEL/.test(x)) return;
    if (expect404 && /404/.test(x)) return;
    fails.push('CONSOLE ' + x); });
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(p);

  /* --------------------------------------------- 1. the undercarriage map */
  console.log('the map is this model, numbered the way the catalog numbers it');
  await setType(p, 'UC');
  await pick(p, 'DZ010', '#posnav .ucgroups button');          // D9R, elevated sprocket
  const uc = await p.evaluate(() => {
    const nav = document.getElementById('posnav');
    return { thumbs: nav.querySelectorAll('.mfig').length,
             frames: nav.querySelectorAll('.ucmapwrap').length,
             sides: nav.querySelectorAll('[data-ucside]').length,
             onSide: (nav.querySelector('[data-ucside].on') || {}).dataset,
             nums: [...nav.querySelectorAll('.ucmap [data-ucg]')].map(g => +g.dataset.ucg),
             chips: [...nav.querySelectorAll('.ucgroups button')].map(b => b.textContent.trim()),
             photo: (nav.querySelector('.ucmap image') || {}).getAttribute
                  ? nav.querySelector('.ucmap image').getAttribute('href') : '' };
  });
  ok('no small drawing above it — the picture IS the machine', uc.thumbs === 0, String(uc.thumbs));
  ok('one picture, not the same photograph twice', uc.frames === 1, uc.frames + ' frames');
  ok('with Left and Right as a choice instead', uc.sides === 2 && uc.onSide.ucside === 'L');
  ok('a D9R shows a D9R', /caterpillar-d9r/.test(uc.photo || ''), uc.photo);
  ok('eleven numbers, 1 to 11, the catalog\'s own',
     uc.nums.join(',') === '1,2,3,4,5,6,7,8,9,10,11', uc.nums.join(','));
  ok('and the same eleven named underneath', uc.chips.length === 11, String(uc.chips.length));
  ok('named in words, not codes',
     /Front idler/.test(uc.chips[0]) && /Track sag/.test(uc.chips[10]), uc.chips[0] + ' … ' + uc.chips[10]);

  console.log('\nthe numbers sit on the parts they name');
  const at = await p.evaluate(() => {
    const m = document.querySelector('#posnav .ucmap');
    const vb = m.viewBox.baseVal, out = {};
    m.querySelectorAll('[data-ucg]').forEach(g => {
      const t = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute('transform'));
      out[g.dataset.ucg] = { x: +t[1] / vb.width, y: +t[2] / vb.height };
    });
    return out;
  });
  ok('the idler is at the front and the sprocket at the back', at['1'].x < at['4'].x,
     'idler ' + at['1'].x.toFixed(2) + ' vs sprocket ' + at['4'].x.toFixed(2));
  ok('front, centre and rear rollers run in that order',
     at['5'].x < at['6'].x && at['6'].x < at['7'].x);
  ok('the top chain is above the shoes', at['11'].y < at['9'].y,
     'sag ' + at['11'].y.toFixed(2) + ' vs shoe ' + at['9'].y.toFixed(2));
  ok('and every number is inside the picture',
     Object.values(at).every(q => q.x > 0 && q.x < 1 && q.y > 0 && q.y < 1));

  console.log('\na number opens the measurements it covers');
  await p.evaluate(() => document.querySelector('.ucgroups [data-pos], .ucgroups button').click());
  await p.waitForTimeout(400);
  const g1 = await p.evaluate(() => ({ item: curItem,
    members: [...document.querySelectorAll('#posnav .ucmembers button')].map(b => b.textContent.trim()) }));
  ok('number 1 lands on a real measurement', /^IDLER\./.test(g1.item), g1.item);
  ok('and offers both bands, because the idler has two',
     g1.members.length === 2, g1.members.join(' / '));

  const six = await p.evaluate(() => {
    const b = [...document.querySelectorAll('#posnav .ucgroups button')][5]; b.click();
    return new Promise(r => setTimeout(() => r({ item: curItem,
      members: [...document.querySelectorAll('#posnav .ucmembers button')].map(x => x.textContent.trim()) }), 400));
  });
  ok('number 6 is the centre rollers, all of them', six.members.length === 6, six.members.join(','));
  ok('and it starts on the first one not yet taken', six.item === 'ROLLER.L2', six.item);

  console.log('\nthe side is a choice, and it changes what is being measured');
  await p.evaluate(() => document.querySelector('[data-ucside="R"]').click());
  await p.waitForTimeout(400);
  const right = await p.evaluate(() => ({ item: curItem,
    on: (document.querySelector('[data-ucside].on') || {}).dataset.ucside }));
  ok('picking RIGHT moves the round to the right-hand track',
     right.on === 'R' && /\.R/.test(right.item), right.item);
  await p.evaluate(() => document.querySelector('[data-ucside="L"]').click());
  await p.waitForTimeout(300);

  console.log('\nthe three the catalog has and the measured table never did');
  const extra = await p.evaluate(() => {
    const out = {};
    ['ADJUST.L', 'FRAME.L', 'SAG.L'].forEach(k => { out[k] = items().some(i => i.k === k); });
    return out;
  });
  ok('track adjuster / recoil is in the walk', extra['ADJUST.L']);
  ok('track frame / guards is in the walk', extra['FRAME.L']);
  ok('track sag / top chain is in the walk', extra['SAG.L']);

  console.log('\na model with no photograph still gets the same screen');
  const drawn = await p.evaluate(() => {
    const h = WEAR.mapPhoto({ photo: '', fam: 'ex', high: false, rollers: 8, side: 'L',
                              state: () => '', sel: 0 });
    return { img: /<image/.test(h), nums: (h.match(/data-ucg=/g) || []).length,
             frame: /data-part="SPROCKET"/.test(h) };
  });
  ok('no photograph means no broken image', !drawn.img);
  ok('the frame is drawn instead', drawn.frame);
  ok('and it carries the same eleven numbers', drawn.nums === 11, String(drawn.nums));

  /* ---------------------------------------------------- 2. the GET round */
  console.log('\na GET round is the catalog\'s eleven too');
  await setType(p, 'GET');
  await pick(p, 'DZ005', '#posnav .ucgroups button');           // D375A, a blade
  const blade = await p.evaluate(() => {
    const nav = document.getElementById('posnav');
    return { photo: (nav.querySelector('.ucmap image') || {}).getAttribute
                  ? nav.querySelector('.ucmap image').getAttribute('href') : '',
             nums: nav.querySelectorAll('.ucmap [data-ucg]').length,
             chips: [...nav.querySelectorAll('.ucgroups button')].map(b => b.textContent.trim()),
             walk: getWalk('DZ005').map(w => w.k) };
  });
  ok('a dozer is shown its blade, not its bucket',
     /komatsu-d375a-6/.test(blade.photo || ''), blade.photo);
  ok('eleven numbers on it', blade.nums === 11, String(blade.nums));
  ok('cutting edges, end bits and the ripper',
     ['ENDL', 'EDGEC', 'ENDR', 'RTIP', 'RSHANK'].every(k => blade.walk.includes(k)), blade.walk.join(','));
  ok('named in words', /Left end bit/.test(blade.chips[0]), blade.chips[0]);

  await pick(p, 'EX001', '#posnav .ucgroups button');           // EX1200, a bucket
  const bucket = await p.evaluate(() => ({
    photo: (document.querySelector('#posnav .ucmap image') || {}).getAttribute
         ? document.querySelector('#posnav .ucmap image').getAttribute('href') : '',
    walk: getWalk('EX001').map(w => w.k),
  }));
  ok('an excavator is shown its bucket', /hitachi-ex1200-6bh/.test(bucket.photo || ''), bucket.photo);
  ok('teeth, adapters, lip and the wear plates',
     ['TOOTH', 'ADAPTER', 'LIP', 'FLOOR', 'CRACK'].every(k => bucket.walk.includes(k)), bucket.walk.join(','));
  ok('and it is not the blade list', !bucket.walk.includes('RTIP'));

  console.log('\nand refuses a machine with no tool at all');
  await pick(p, 'TK151', '#posnav .ucblock');
  const truck = await p.evaluate(() => ({
    txt: (document.getElementById('posnav').textContent || '').trim(),
    has: window.GET.has('TK151', (ASSET_BY.TK151 || {}).cat, (ASSET_BY.TK151 || {}).m),
    item: curItem }));
  ok('a haul truck has no ground engaging tools', truck.has === false);
  ok('and is told so', /no ground engaging tools/i.test(truck.txt), truck.txt.slice(0, 50));
  ok('with nothing left selected behind the message', truck.item === '', truck.item);

  console.log('\ngrade first, a millimetre only where somebody had a tape');
  await pick(p, 'EX001', '#posnav .ucgroups button');
  await p.fill('#inspector', 'R. Marrero');
  await p.fill('#smu', '7400');
  const shown = await p.evaluate(() => {
    curItem = 'TOOTH'; loadPos();
    return { row: !document.getElementById('getFields').classList.contains('novalue'),
             lbl: document.getElementById('getLbl').textContent,
             ref: document.getElementById('getRefLine').textContent,
             head: document.getElementById('posLabel').textContent };
  });
  ok('the measurement is offered and says it is optional', shown.row && /optional/i.test(shown.lbl), shown.lbl);
  ok('the limits are stated before anything is typed', /New 320 mm/.test(shown.ref), shown.ref);
  ok('and a generic limit says so', /generic limit/i.test(shown.ref), shown.ref);
  ok('the heading is words, not a code', /Tooth points/.test(shown.head), shown.head);

  const visual = await p.evaluate(() => {
    curItem = 'CRACK'; loadPos();
    return { hidden: document.getElementById('getFields').classList.contains('novalue'),
             head: document.getElementById('posLabel').textContent };
  });
  ok('a visual check is not offered a number box to invent a figure into', visual.hidden, visual.head);

  const measured = await p.evaluate(async () => {
    curItem = 'TOOTH'; loadPos();
    const el = document.getElementById('getMM');
    el.value = '200'; el.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    return { read: document.getElementById('getRead').textContent, mm: draft.positions.TOOTH.mm };
  });
  ok('320 new and 130 condemn puts 200 mm at 63% worn', /63%/.test(measured.read), measured.read);
  ok('and the millimetre is stored', measured.mm === 200, String(measured.mm));

  const out = await p.evaluate(() => wearOut(
    { equip: 'EX001', date: '2026-08-02', type: 'GET', positions: draft.positions },
    'TOOTH', draft.positions.TOOTH));
  ok('the record carries the reading, the limits and the band',
     out && out.mm === 200 && out.newMM === 320 && out.condemnMM === 130 && out.band === 'ok',
     JSON.stringify(out && { mm: out.mm, n: out.newMM, c: out.condemnMM, b: out.band }));
  ok('and says the limit was generic', /generic/.test((out && out.refSrc) || ''), out && out.refSrc);

  /* --------------------------------- 3. only the machines it applies to */
  console.log('\nthe unit list only offers machines the round applies to');
  const counts = await p.evaluate(() => {
    const n = {};
    ['MP', 'UC', 'GET'].forEach(ty => {
      const s = document.getElementById('typeSel'); s.value = ty; s.dispatchEvent(new Event('change'));
      n[ty] = ASSETS.filter(a => eligible(a.n, a)).length;
    });
    return n;
  });
  ok('a magnetic plug round still offers the whole fleet', counts.MP === 1128 || counts.MP > 1000,
     String(counts.MP));
  ok('an undercarriage round offers only machines with tracks it can measure',
     counts.UC > 0 && counts.UC < 100, String(counts.UC));
  ok('a GET round offers only machines with a bucket or a blade',
     counts.GET > 0 && counts.GET < 200, String(counts.GET));
  ok('and neither is the whole fleet', counts.UC < counts.MP && counts.GET < counts.MP);

  /* ------------------------------------------------- 5. the artwork seam */
  console.log('\nartwork, when there is any');
  const off = await p.evaluate(() => ({
    on: MACHINE_PHOTOS.ON,
    url: MACHINE_PHOTOS.urlFor('HITACHI ZX330-5G RB', 'ex'),
    all: MACHINE_PHOTOS.all().length,
  }));
  /* Whole-machine artwork is off until somebody adds the files; the 29
     undercarriage crops ship with the app, so the worker always has those. */
  ok('whole-machine artwork stays off until its files exist',
     off.on === false && off.url === '', JSON.stringify(off));
  ok('the undercarriage crops are shipped and cached', off.all === 29, String(off.all));

  const on = await p.evaluate(() => {
    MACHINE_PHOTOS.ON = true;
    const r = {
      model: MACHINE_PHOTOS.urlFor('HITACHI ZX330-5G RB', 'ex'),
      punct: MACHINE_PHOTOS.urlFor('KOMATSU D155A.5', 'dz'),
      dash:  MACHINE_PHOTOS.urlFor('Komatsu D155A-5', 'dz'),
      alias: MACHINE_PHOTOS.urlFor('KOMATSU D275.5D', 'dz'),
      alias2: MACHINE_PHOTOS.urlFor('Komatsu D275A-5D', 'dz'),
      none:  MACHINE_PHOTOS.urlFor('HITACHI ZX210W-5A', 'ex'),
      all:   MACHINE_PHOTOS.all().length,
    };
    return r;
  });
  ok('a model with artwork resolves to its own file',
     on.model === 'machine/hitachi-zx330-5g-rb.png', on.model);
  ok('the register spelling and the maker spelling find one file',
     on.punct === on.dash && on.punct === 'machine/komatsu-d155a-5.png', on.punct + ' | ' + on.dash);
  ok('and the one model the two genuinely disagree on is aliased, not fudged',
     on.alias === on.alias2 && on.alias === 'machine/komatsu-d275a-5d.png', on.alias + ' | ' + on.alias2);
  ok('a model with no artwork keeps its drawing rather than borrowing one',
     on.none === '', on.none);
  ok('turning the artwork on adds it to what the worker caches', on.all === 29 + 29, String(on.all));

  expect404 = true;
  const rendered = await p.evaluate(() => {
    const h = MFIG.svg('ex', { model: 'HITACHI ZX330-5G RB', part: 'GET', label: 'X' });
    return { img: /<img /.test(h), src: (h.match(/src="([^"]+)"/) || [])[1],
             tpl: /<template>[\s\S]*<svg/.test(h), err: /onerror=/.test(h) };
  });
  ok('the figure renders the photograph', rendered.img && /zx330/.test(rendered.src || ''), rendered.src);
  ok('carrying the drawing with it as a fallback', rendered.tpl && rendered.err);

  /* The file does not exist in the repo — that is the point. The <img> fails,
     and what an inspector sees has to be the machine, not a broken icon. */
  const fell = await p.evaluate(async () => {
    const box = document.createElement('div');
    box.innerHTML = MFIG.svg('ex', { model: 'HITACHI ZX330-5G RB', part: 'UC', label: 'X' });
    document.body.appendChild(box);
    for (let i = 0; i < 40 && box.querySelector('img'); i++) await new Promise(r => setTimeout(r, 100));
    const fig = box.querySelector('figure');
    const r = { img: !!box.querySelector('img'), svg: !!box.querySelector('svg'),
                cls: fig ? fig.className : '' };
    box.remove(); MACHINE_PHOTOS.ON = false;
    return r;
  });
  ok('a missing file falls back to the drawing, not a broken image', !fell.img && fell.svg,
     JSON.stringify(fell));
  ok('and the highlight works again once it has', /hi-uc/.test(fell.cls) && !/mfig-photo/.test(fell.cls), fell.cls);

  expect404 = false;
  console.log('\nevery model in the artwork table is a model the fleet actually has');
  const orphans = await p.evaluate(() => {
    const have = new Set((window.ASSETS || []).map(a => a.m).filter(Boolean).map(MACHINE_PHOTOS.slug));
    return Object.keys(MACHINE_PHOTOS.BY_MODEL).filter(k => !have.has(MACHINE_PHOTOS.slug(k)));
  });
  ok('no artwork is named for a machine that is not in the register',
     orphans.length === 0, orphans.join(', '));

  const crush = await p.evaluate(() => MFIG.familyFor('CR001', 'CRUSHER, MOBILE JAW'));
  ok('a tracked crusher is drawn as tracked plant, not as a plant box', crush === 'cp', crush);

  await b.close();
  console.log(fails.length ? '\nFAILURES:\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})();
