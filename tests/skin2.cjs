/* The redesign, in the other theme and at the other widths.

   A design pass done in one theme at one width is a design pass done for one
   person. Half this site's readers are on a laptop in a lit office and half
   are on a tablet in a workshop with the OS in dark; the new cards, the
   worklist rows and the sheet were all drawn against a white 1500px window
   and nothing had checked the rest.

   What this looks for is the specific way a new component fails in the second
   theme: a colour written as a literal instead of a token, a shadow tuned for
   white that vanishes on black, ink that drops under the contrast floor, and
   a row built on a fixed grid that overflows once the window narrows.
*/
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099')
        + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

const CONTRAST = `(function(){
  const lin=v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);
  const lum=c=>{const m=(c||'').match(/[\\d.]+/g)||[0,0,0];
    return 0.2126*lin(m[0]/255)+0.7152*lin(m[1]/255)+0.0722*lin(m[2]/255);};
  return (a,b)=>{const[h,l]=[lum(a),lum(b)].sort((x,y)=>y-x);return (h+0.05)/(l+0.05);};
})()`;

const SEED = () => {
  const iso = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
  const recs = [];
  ['2026-05', '2026-06', '2026-07'].forEach(m => ['TK801', 'TK802'].forEach((u, i) =>
    recs.push({ equip: u, date: `${m}-1${i}`, type: 'MP', cls: 'HT', by: 'R. Marrero',
      items: [{ key: '4C', label: 'Left Rear Final Drive', grade: i ? 'X' : 'C',
                defect: 'Ferrous debris — heavy', defectCode: 'DT14-03', cause: 'Gear wear',
                action: 'SCH', actionLabel: 'Schedule repair' }] })));
  CMDash.importRecords(recs);
  CMDrive.configured = () => true;
  CMDrive.saveEdit = () => Promise.resolve({ ok: true });
  localStorage.setItem('cm_drive_url', 'https://stub/exec');
  localStorage.setItem('cm_dash_who', 'V. Petrov');
  CMDash.setEdits([{ key: 'TK801|2026-07-10|MP', by: 'V. Petrov', at: new Date().toISOString(),
    items: { '4C': { owner: 'A. Sokolov', due: iso(-4), status: 'WIP', rca: 1,
                     whys: ['Teeth spalling', 'Oil contaminated'] } } }]);
  document.getElementById('dataOv').classList.add('hidden');
};

(async () => {
  const b = await chromium.launch();

  for (const theme of ['light', 'dark']) {
    console.log('\n' + theme);
    const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
    await ctx.addInitScript(t => localStorage.setItem('cm_dash_theme', t), theme);
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + theme + ' ' + e.message));
    await p.goto(B, { waitUntil: 'load' });
    await p.waitForTimeout(1000);
    await p.evaluate(t => { document.documentElement.setAttribute('data-theme', t); }, theme);
    await p.evaluate(SEED);
    await p.evaluate(() => showTab('actions'));
    await p.waitForTimeout(700);

    const r = await p.evaluate(C => {
      const contrast = eval(C);
      const cs = n => getComputedStyle(n);
      const page = cs(document.body).backgroundColor;
      const card = document.querySelector('.kpi') || document.querySelector('.tile');
      const row = document.querySelector('.wlr');
      const head = document.querySelector('.wlh');
      const seg = document.querySelector('.seg button.on');
      return {
        page,
        cardBg: card ? cs(card).backgroundColor : '',
        cardInk: card ? contrast(cs(card.querySelector('.v')).color, cs(card).backgroundColor) : 0,
        cardLabel: card ? contrast(cs(card.querySelector('.k')).color, cs(card).backgroundColor) : 0,
        cardShadow: card ? cs(card).boxShadow : '',
        rowBg: row ? cs(row).backgroundColor : '',
        rowInk: row ? contrast(cs(row.querySelector('.t1')).color, cs(document.querySelector('.wlu')).backgroundColor) : 0,
        rowSub: row ? contrast(cs(row.querySelector('.t2')).color, cs(document.querySelector('.wlu')).backgroundColor) : 0,
        headBg: head ? cs(head).backgroundColor : '',
        segOn: seg ? cs(seg).backgroundColor : '',
        segInk: seg ? contrast(cs(seg).color, cs(seg).backgroundColor) : 0,
        who: (() => { const i = document.querySelector('.who i');
          return i ? contrast(cs(i).color, cs(i).backgroundColor) : 0; })(),
      };
    }, CONTRAST);
    note('page', r.page);

    const dark = theme === 'dark';
    const bright = c => { const m = (c || '').match(/[\d.]+/g) || [0, 0, 0];
      return (+m[0] + +m[1] + +m[2]) / 3 > 128; };
    ok('the page is in the right theme', dark ? !bright(r.page) : bright(r.page), r.page);
    ok('cards belong to the theme, not the other one',
       dark ? !bright(r.cardBg) : bright(r.cardBg), r.cardBg);
    ok('the worklist block belongs to it too',
       dark ? !bright(r.headBg) : bright(r.headBg), r.headBg);
    /* A pressed segment is a white chip on a grey trough in light mode. If it
       is still white in dark mode it is a hole punched in the page. */
    ok('the selected filter chip is not a light chip on a dark page',
       dark ? !bright(r.segOn) : bright(r.segOn), r.segOn);

    ok('the hero number reads', r.cardInk >= 4.5, r.cardInk.toFixed(2) + ':1');
    ok('so does its label', r.cardLabel >= 3.0, r.cardLabel.toFixed(2) + ':1');
    ok('the row title reads', r.rowInk >= 4.5, r.rowInk.toFixed(2) + ':1');
    ok('and the line under it', r.rowSub >= 3.0, r.rowSub.toFixed(2) + ':1');
    ok('the owner initials read', r.who >= 3.0, r.who.toFixed(2) + ':1');
    ok('the pressed chip label reads', r.segInk >= 4.5, r.segInk.toFixed(2) + ':1');
    /* Elevation on a dark page cannot be a soft grey shadow — it disappears.
       Either the shadow is real black or the surface carries the separation. */
    ok('cards are still separated from the page', r.cardBg !== r.page || /rgba?\(/.test(r.cardShadow),
       'bg ' + r.cardBg + ' vs page ' + r.page);

    console.log('  the sheet');
    await p.evaluate(() => { const b = document.querySelector('#actionTbl .wlr[data-fu]'); if (b) b.click(); });
    await p.waitForTimeout(500);
    const sh = await p.evaluate(C => {
      const contrast = eval(C), cs = n => getComputedStyle(n);
      const s = document.querySelector('#follOv .sheet');
      if (!s) return null;
      const inp = document.getElementById('follOwner');
      const box = s.getBoundingClientRect();
      return { bg: cs(s).backgroundColor,
        inkOnSheet: contrast(cs(document.getElementById('follTitle')).color, cs(s).backgroundColor),
        inputBg: cs(inp).backgroundColor,
        inputInk: contrast(cs(inp).color, cs(inp).backgroundColor),
        fits: box.bottom <= window.innerHeight + 1 && box.top >= -1,
        wide: box.width, overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 };
    }, CONTRAST);
    ok('  the sheet opens', !!sh);
    if (sh) {
      ok('  it belongs to the theme', dark ? !bright(sh.bg) : bright(sh.bg), sh.bg);
      ok('  its title reads', sh.inkOnSheet >= 4.5, sh.inkOnSheet.toFixed(2) + ':1');
      ok('  typed text reads in the fields', sh.inputInk >= 4.5, sh.inputInk.toFixed(2) + ':1');
      ok('  and the whole sheet is on screen', sh.fits, 'w=' + Math.round(sh.wide));
      ok('  without pushing the page sideways', !sh.overflowX);
    }
    await ctx.close();
  }

  console.log('\nand at the widths people actually use');
  for (const [w, h, label] of [[1500, 1000, 'laptop'], [1024, 768, 'tablet landscape'],
                               [834, 1112, 'tablet portrait'], [768, 1024, 'narrow']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + label + ' ' + e.message));
    await p.goto(B, { waitUntil: 'load' });
    await p.waitForTimeout(900);
    await p.evaluate(SEED);
    await p.evaluate(() => showTab('actions'));
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => {
      const over = document.documentElement.scrollWidth > window.innerWidth + 1;
      /* A row that runs past its own block is the specific way a fixed grid
         fails: nothing errors, the right-hand columns are simply gone. */
      const bad = [...document.querySelectorAll('.wlr')].filter(x => {
        const rb = x.getBoundingClientRect(), pb = x.parentElement.getBoundingClientRect();
        return rb.right > pb.right + 1; }).length;
      const clipped = [...document.querySelectorAll('.kpi .v,.tile .v')]
        .filter(e => e.scrollWidth > e.clientWidth + 1).length;
      return { over, bad, clipped, cards: document.querySelectorAll('.kpi,.tile').length,
               doc: document.documentElement.scrollWidth, win: window.innerWidth };
    });
    ok(label + ': the page does not scroll sideways', !r.over, r.doc + ' vs ' + r.win);
    ok(label + ': no worklist row overflows its block', r.bad === 0, r.bad + ' row(s)');
    ok(label + ': no hero number is cut off', r.clipped === 0, r.clipped + ' clipped');
    await ctx.close();
  }

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
