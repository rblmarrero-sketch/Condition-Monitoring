/* The machine as the picker. Two frames, left and right, drawn to the machine
   actually in front of the inspector — and coloured so a half-finished round is
   legible at arm's length without reading a word. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

async function app(b, view) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load|404/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(v => { localStorage.setItem('up_dests', '[]');
    if (v === null) localStorage.removeItem('uc_view');
    else if (v !== undefined) localStorage.setItem('uc_view', v); }, view);
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(p);
  await p.evaluate(() => { const s = document.getElementById('typeSel');
    s.value = 'UC'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  return { ctx, p };
}
/* On a first visit the service worker installs, claims the page and the app
   reloads itself once — that is how a new build takes over without the inspector
   doing anything, and it destroys any evaluate running at the time. Wait it out,
   then wait for the startup script's own finish marker. */
async function settled(p) {
  await p.waitForTimeout(1400);
  for (let i = 0; i < 4; i++) {
    try {
      await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?',
        null, { timeout: 8000 });
      await p.waitForTimeout(250);
      await p.evaluate(() => !!document.getElementById('typeSel'));
      return;
    } catch (e) { await p.waitForTimeout(600); }
  }
  throw new Error('page never settled');
}
const cls = (p, k) => p.evaluate(x => {
  const g = document.querySelector(`.um-spot[data-uc="${x}"]`);
  return g ? g.getAttribute('class') : null; }, k);
const enter = async (p, v) => { await p.fill('#ucMM', String(v)); await p.waitForTimeout(200); };

(async () => {
  const b = await chromium.launch();
  let { ctx, p } = await app(b);                // a fresh context starts with none

  /* The map used to be two drawn track frames, one per side, with a puck for
     every one of the 36 measurements. It is now one photograph of THIS model's
     undercarriage with the client's eleven numbers on the parts they name, a
     side chosen above it, and the same eleven named underneath — which is what
     the catalog in the ute looks like. What has to stay true is unchanged:
     everything is reachable, nothing is a bare code, and a gloved thumb can
     hit it. */
  console.log('the map is what you land on');
  await p.evaluate(() => selectEquip('DZ001'));          // KOMATSU D155A.5
  await p.waitForFunction(() => !!document.querySelector('#posnav .ucgroups button'),
                          null, { timeout: 15000 });
  await p.waitForTimeout(300);
  const map = await p.evaluate(() => {
    const nav = document.getElementById('posnav');
    return { pictures: nav.querySelectorAll('.ucmap').length,
             sides: [...nav.querySelectorAll('[data-ucside]')].map(b => b.textContent.trim()),
             on: ((nav.querySelector('[data-ucside].on') || {}).textContent || '').trim(),
             nums: [...nav.querySelectorAll('.ucmap [data-ucg]')].map(g => +g.dataset.ucg),
             chips: [...nav.querySelectorAll('.ucgroups button')].map(b => b.textContent.trim()) };
  });
  ok('one picture of the machine, not a frame per side', map.pictures === 1, String(map.pictures));
  ok('with left and right offered above it',
     map.sides.length === 2 && /left/i.test(map.sides[0]) && /right/i.test(map.sides[1]),
     map.sides.join(' | '));
  ok('and one of them chosen', /left/i.test(map.on || ''), map.on);
  ok('eleven numbers on the machine', map.nums.join(',') === '1,2,3,4,5,6,7,8,9,10,11', map.nums.join(','));
  ok('and the same eleven named underneath', map.chips.length === 11, String(map.chips.length));
  ok('named in words, never a bare code',
     map.chips.every(c => /[a-z]{3}/.test(c)) && !map.chips.some(c => /^(LINKH|PITCH4|BUSH)/.test(c)),
     map.chips[7]);

  console.log('\neverything the walk defines is still reachable');
  const reach = await p.evaluate(() => {
    const want = items().map(i => i.k).filter(k => /\.L(\b|[-0-9])/.test(k));
    const got = new Set();
    for (let n = 1; n <= 11; n++) ucGroupKeys(n).forEach(k => got.add(k));
    return { want: want.length, got: got.size, missing: want.filter(k => !got.has(k)) };
  });
  ok('every left-hand position belongs to one of the numbers',
     reach.missing.length === 0, reach.missing.join(','));
  ok('and that is all 21 of them', reach.got === reach.want, reach.got + ' of ' + reach.want);

  const roll = await p.evaluate(() =>
    [5, 6, 7].reduce((n, g) => n + ucGroupKeys(g).filter(k => /^ROLLER\./.test(k)).length, 0));
  ok('eight rollers a side, split front / centre / rear', roll === 8, String(roll));
  const bands = await p.evaluate(() => ({ idler: ucGroupKeys(1), carrier: ucGroupKeys(3) }));
  ok('the idler and carrier each carry their outer and inner band',
     bands.idler.length === 2 && bands.carrier.length === 2,
     bands.idler.join(',') + ' / ' + bands.carrier.join(','));
  const chain = await p.evaluate(() => ucGroupKeys(8));
  ok('the four chain dimensions sit under one number', chain.length === 4, chain.join(','));

  console.log('\ntapping the machine');
  await p.evaluate(() => { const g = document.querySelector('.ucmap [data-ucg="4"]');
    g.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await p.waitForTimeout(500);
  ok('a number picks the measurement it covers',
     await p.evaluate(() => curItem) === 'SPROCKET.L', await p.evaluate(() => curItem));
  await p.evaluate(() => { const b = [...document.querySelectorAll('.ucgroups button')][8];
    b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await p.waitForTimeout(500);
  ok('and so does its name underneath',
     await p.evaluate(() => curItem) === 'GROUSER.L', await p.evaluate(() => curItem));

  console.log('\nthe whole frame has to fit the phone');
  await p.evaluate(() => selectEquip('DZ001'));
  await p.waitForTimeout(700);
  ok('nothing scrolls sideways', await p.evaluate(()=>
    [...document.querySelectorAll('.ucmapwrap')].every(w=>w.scrollWidth <= w.clientWidth + 2)));
  ok('so no swipe hint is shown', await p.evaluate(()=>!document.querySelector('.ucswipe')));
  ok('every number is on screen without swiping', await p.evaluate(()=>
    [...document.querySelectorAll('.ucmap [data-ucg]')].every(g=>{
      const r=g.getBoundingClientRect();
      return r.right <= window.innerWidth + 1 && r.left >= 0 && r.width > 0; })));
  /* The names used to wrap to four rows, which cost more height than the map
     they sat under. They are one row that scrolls now, so "all on screen" is no
     longer the guarantee — "all REACHABLE, and the row says there is more" is.
     A clipped row with no cue is how somebody does six of eleven and stops. */
  const names = await p.evaluate(()=>{
    const row=document.querySelector('.ucgroups.rowscroll');
    if(!row) return {err:'no scrolling row'};
    const wrap=row.closest('.rowwrap');
    const before={scrolls:row.scrollWidth>row.clientWidth+2, more:wrap.classList.contains('more')};
    row.scrollLeft=row.scrollWidth;
    const last=row.lastElementChild.getBoundingClientRect();
    return {...before, n:row.children.length,
      lastReached:last.right<=window.innerWidth+1 && last.left>=0,
      noVertClip:row.scrollHeight<=row.clientHeight+2};
  });
  ok('the names are one row, not four', names.noVertClip === true, JSON.stringify(names));
  ok('and the row admits there is more of it', !names.scrolls || names.more === true);
  ok('scrolling it reaches the last name', names.lastReached === true);
  ok('nothing makes the PAGE scroll sideways', await p.evaluate(()=>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    && window.innerWidth === 412), await p.evaluate(()=>innerWidth+' innerWidth'));

  console.log('\nkeyboard and gloves');
  await p.evaluate(() => selectEquip('DZ001'));
  await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector('.ucmap [data-ucg="8"]').focus());
  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  ok('Enter on a focused number picks what it covers',
     /^(LINKH|BUSH|PITCH4|PITCH1)\.L$/.test(await p.evaluate(() => curItem)),
     await p.evaluate(() => curItem));
  const hit = await p.evaluate(() => {
    const r=[...document.querySelectorAll('.ucgroups button, .ucmembers button, .ucsides button')]
      .map(e=>{ const b=e.getBoundingClientRect(); return Math.round(b.height); });
    return Math.min(...r); });
  ok('the smallest tap target clears 40 px', hit >= 40, hit + ' px');
  const numhit = await p.evaluate(() => {
    const r=[...document.querySelectorAll('.ucmap .um-hit')]
      .map(e=>{ const b=e.getBoundingClientRect(); return Math.round(Math.min(b.width,b.height)); });
    return Math.min(...r); });
  ok('and a number on the picture is a 38 px target at least', numhit >= 38, numhit + ' px');

  console.log('\nthe picture answers "which bit is this?"');
  await p.keyboard.press('Escape'); await p.waitForTimeout(350);   // the sheet is up from before
  await p.evaluate(() => pickComponent('SPROCKET.L'));
  await p.waitForTimeout(600);
  /* A photograph cannot be dimmed part by part and still read, so the numbers
     carry it: the one in hand stays up and the rest drop back. */
  ok('the number in hand is marked', await p.evaluate(() =>
    !!document.querySelector('.ucmap [data-ucg="4"].sel')));
  ok('and it stands out from the rest', await p.evaluate(() => {
    const on  = getComputedStyle(document.querySelector('.ucmap [data-ucg="4"].sel .um-puck'));
    const off = getComputedStyle(document.querySelector('.ucmap [data-ucg="1"] .um-puck'));
    return parseFloat(on.strokeWidth) > parseFloat(off.strokeWidth); }));
  ok('and its name below is marked too', await p.evaluate(() =>
    !!document.querySelector('.ucgroups button.on')));
  ok('a chain point marks the chain number', await p.evaluate(async () => {
    pickComponent('PITCH4.L'); await new Promise(r => setTimeout(r, 400));
    return !!document.querySelector('.ucmap [data-ucg="8"].sel'); }));
  await p.evaluate(() => { curItem=''; renderChips(); });
  await p.waitForTimeout(350);
  ok('nothing selected leaves the whole machine lit', await p.evaluate(() =>
    [...document.querySelectorAll('.ucmap')].every(s => !s.getAttribute('data-sel'))));

  console.log('\nRussian');
  await p.click('.lang button[data-lang="ru"]');
  await p.waitForTimeout(600);
  ok('the side buttons are in Russian',
    (await p.$$eval('#posnav [data-ucside]', e => e.map(x => x.textContent.trim()))).join(',') === 'ЛЕВАЯ,ПРАВАЯ',
    (await p.$$eval('#posnav [data-ucside]', e => e.map(x => x.textContent.trim()))).join(','));
  ok('so are the eleven names',
    /Направляющее колесо/.test(await p.textContent('#posnav .ucgroups')),
    (await p.textContent('#posnav .ucgroups') || '').slice(0, 60));
  ok('so is the tally', /не снято/.test(await p.textContent('#posnav .uctally')));
  ok('and the view toggle', /Нажать на машину/.test(await p.textContent('.ucviews')));

  console.log('\nstacked stays stacked, even with room to split');
  await ctx.close();
  const wide = await b.newContext({ viewport: { width: 1024, height: 800 } });
  const w = await wide.newPage();
  w.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await w.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await w.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(w);
  await w.evaluate(() => { const s = document.getElementById('typeSel');
    s.value = 'UC'; s.dispatchEvent(new Event('change')); });
  await w.waitForTimeout(350);
  await w.evaluate(() => selectEquip('DZ001'));
  await w.waitForTimeout(800);
  /* One picture now, so there is nothing to stack — what still matters on a
     wide screen is that the picture does not stretch to fill it and leave the
     numbers a thumb-span apart. */
  ok('the picture is capped, not stretched across a tablet', await w.evaluate(() => {
    const e = document.querySelector('.ucmapwrap');
    return !!e && e.getBoundingClientRect().width <= 700; }));
  ok('which is what keeps the targets over 44 px', await w.evaluate(() => {
    const h = [...document.querySelectorAll('.um-spot .um-hit')].map(e => {
      const b = e.getBoundingClientRect(); return Math.min(b.width, b.height); });
    return Math.min(...h) >= 44; }));
  ok('and nothing scrolls sideways there either', await w.evaluate(() =>
    [...document.querySelectorAll('.ucmapwrap')].every(e => e.scrollWidth <= e.clientWidth + 2)));
  await wide.close();

  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
