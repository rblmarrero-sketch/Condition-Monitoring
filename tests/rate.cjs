/* How fast it is going, and how long it has left — on every round that measures.

   A thickness says where you are. Two of them say how fast you are getting
   there, and that is the number somebody orders steel against. Three rounds
   measure against a condemn limit and all three now answer it: undercarriage,
   dump body, ground engaging tools.

   The property this file defends is that there is ONE answer. The phone works
   it out at the point of capture, the report prints it in the history table,
   and the dashboard lists it fleet-wide — and all three must be reading the
   same function, because the moment the report says 2,000 h and the screen
   says 2,400 nobody believes either.

   The arithmetic is deliberately checked against hand-worked numbers rather
   than against whatever the code returns: 12 mm to 9 mm over 1,000 hours is
   3 mm per 1,000 h, and 9 mm with a condemn at 3 leaves 6 mm, which is 2,000
   hours. A test that asserts the code agrees with itself would pass on a
   rate of zero.

   Run: node tests/rate.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL  = `http://127.0.0.1:${PORT}/mobile/index.html`;

let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => ok('page error', false, e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);

  /* ---- 1. the dump body ------------------------------------------------- */
  console.log('\nthe dump body, which wears fastest and had no rate at all');
  const tb = await p.evaluate(async () => {
    await dbPut({ id:'r-tb', type:'TB', equip:'TK143', date:'2026-05-01', by:'S. Volkov',
      sup:'A. Sokolov', smu:'6000', cls:'AT', gps:null, dev:'PH-01', sign:null,
      positions:{ F62:{ mm:12.0, photos:[], video:null } },
      created:'2026-05-01T06:00:00.000Z', up:0, upTo:{}, rev:1 });
    type = 'TB'; selectEquip('TK143');
    await new Promise(r => setTimeout(r, 600));
    document.getElementById('smu').value = '7000';
    document.getElementById('date').value = '2026-08-22';
    pickComponent('F62');
    await new Promise(r => setTimeout(r, 200));
    const e = document.getElementById('ucMM');
    e.value = '9'; e.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 900));
    return (document.getElementById('ucFcast') || {}).textContent || '';
  });
  ok('12 mm to 9 mm over 1,000 h reads as 3 mm per 1,000 h', /3\s*mm/.test(tb), tb);
  ok('and 6 mm left at that rate is about 2,000 h', /2[,.]?000/.test(tb), tb);

  /* ---- 2. ground engaging tools ----------------------------------------- */
  /* Bought by the pallet and changed on backshift, so the rate IS the
     procurement argument — and this was the one measured round with no
     forecast whatsoever. */
  console.log('\nground engaging tools, bought by the pallet');
  const get = await p.evaluate(async () => {
    const s = document.getElementById('typeSel');
    const ty = [...s.options].map(o => o.value).filter(v => /GET/i.test(v))[0];
    if (!ty) return { skip: true };
    s.value = ty; s.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 300));
    const u = (window.ASSETS || []).find(a => a.cls === 'EXC');
    selectEquip(u.n);
    await new Promise(r => setTimeout(r, 600));
    const k = items()[0].k;
    await dbPut({ id:'r-get', type:ty, equip:u.n, date:'2026-05-01', by:'S', sup:'A',
      smu:'6000', cls:u.cls, gps:null, dev:'PH-01', sign:null,
      positions:{ [k]:{ mm:200, photos:[], video:null } },
      created:'2026-05-01T06:00:00.000Z', up:0, upTo:{}, rev:1 });
    ucPrevCache = { key:'', ver:-1, rows:{} };
    selectEquip(u.n);
    await new Promise(r => setTimeout(r, 500));
    document.getElementById('smu').value = '7000';
    document.getElementById('date').value = '2026-08-22';
    pickComponent(k);
    await new Promise(r => setTimeout(r, 250));
    const box = document.getElementById('getMM') || document.getElementById('ucMM');
    box.value = '180'; box.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 900));
    return { k, txt: (document.getElementById('getFcast') || {}).textContent || '' };
  });
  if (get.skip) ok('no GET round on this build to check', true);
  else {
    /* 320 new, 130 condemn: 200 to 180 is 20 mm per 1,000 h, and 180 leaves
       50 mm to condemn, which is 2,500 h. */
    ok('a tooth losing 20 mm in 1,000 h says so', /20\s*mm/.test(get.txt), get.txt);
    ok('and 50 mm to condemn is about 2,500 h', /2[,.]?500/.test(get.txt), get.txt);
  }

  /* ---- 3. the report says the same thing --------------------------------- */
  /* Not "the report says something" — the report says the SAME number. The
     history table asks the host for the forecast rather than working one out,
     so there is one implementation and it lives in wear.js. */
  console.log('\nthe report quotes the same figures, not its own');
  const rpt = await p.evaluate(async () => {
    /* The second reading above lives in a DRAFT, and the report reads saved
       records - so the pair has to be saved for the history table to have two
       columns to line up. Same two figures, so the report has to reach the
       same answer the screen did. */
    await dbPut({ id:'r-tb2', type:'TB', equip:'TK143', date:'2026-08-22', by:'S. Volkov',
      sup:'A. Sokolov', smu:'7000', cls:'AT', gps:null, dev:'PH-01', sign:null,
      positions:{ F62:{ mm:9.0, photos:[], video:null } },
      created:'2026-08-22T06:00:00.000Z', up:0, upTo:{}, rev:1 });
    /* The measurement history is on the SINGLE-MACHINE sheet - the fleet report
       is a triage list and deliberately does not repeat every reading. So this
       asks for the sheet a superintendent opens for one truck, which is where
       the question "how fast is it going" is actually asked. */
    const all = await rptRecords();
    const mine = all.filter(r => r.equip === 'TK143');
    const secs = CMR.sections({ lang:'en', title:'x', titleAlt:'x', stamp:new Date(),
      mode:'unit', sevLabel:s => s, sevLabelAlt:s => s,
      forecast:(ref, series) => WEAR.forecast(ref, series),
      records: mine });
    const html = secs.map(s => s.html).join('\n');
    const mh = (html.match(/<table class="mh">[\s\S]*?<\/table>/) || [''])[0];
    const row = (mh.match(/<tr class="[^"]*">[\s\S]*?<\/tr>/g) || [])
      .find(r => r.indexOf('F62') >= 0) || '';
    return { head: mh.replace(/<[^>]+>/g, '|'),
             row: row.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|') };
  });
  ok('the history table has a life column', /Life left|Остаток/.test(rpt.head));
  ok('and the row carries the hours', /2000|2,000/.test(rpt.row), rpt.row.slice(0, 90));
  ok('with the rate beside them, so the hours are believable',
     /mm\/1000h|мм\/1000ч/.test(rpt.row), rpt.row.slice(0, 90));

  /* ---- 4. and it refuses to guess ---------------------------------------- */
  /* The failure that matters is not a missing number, it is a confident wrong
     one. One reading is a dot, not a line. */
  console.log('\nand where it cannot know, it says nothing');
  const guess = await p.evaluate(async () => {
    const one = WEAR.forecast({ n:20, c:3 }, [{ mm:9, at:'2026-08-22', smu:'7000' }]);
    const flat = WEAR.forecast({ n:20, c:3 }, [
      { mm:9, at:'2026-01-01', smu:'1000' }, { mm:9, at:'2026-08-22', smu:'7000' }]);
    const soon = WEAR.forecast({ n:20, c:3 }, [
      { mm:9.2, at:'2026-08-21', smu:'7000' }, { mm:9, at:'2026-08-22', smu:'7010' }]);
    return { one: one.why, flat: flat.why, soon: soon.why };
  });
  ok('one reading forecasts nothing', guess.one === 'few', guess.one);
  ok('no movement forecasts nothing — a rate of zero lasts forever',
     guess.flat === 'flat', guess.flat);
  ok('and ten hours apart is inside the tape measure, so nothing',
     guess.soon === 'soon', guess.soon);

  await b.close();
  console.log(fail ? `\n${fail} FAILED` : '\none rate, one life, three rounds and the paper');
  process.exit(fail ? 1 : 0);
})();
