/* A round with photographs on it, reported from the phone.

   The question this answers is the one an inspector asks standing at the
   machine: press Report, does anything happen, and how long before the PDF is
   in my hand. It is not a question about correctness — the pages are checked
   elsewhere — it is about the seconds between the tap and the file, on a
   handset, with real camera frames in the record.

   The frames here are 2048x1536 JPEGs, which is what a phone camera hands over
   after the app's own upload shrink, and they are put into the record as Blobs
   exactly as capture stores them. Anything smaller would measure a report with
   no photographs in it and call the result reassuring.

   Run: node tests/rptphoto.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL  = `http://127.0.0.1:${PORT}/mobile/index.html`;

let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };
const note = (n, d) => console.log('  ....  ' + n + (d !== undefined ? '   ' + d : ''));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 },
    isMobile: true, hasTouch: true, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => ok('page error', false, e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);

  /* ---- a shift's worth of work, with the camera used on all of it ------- */
  /* Not one round: what an inspector actually has in the phone at the end of a
     shift. A magnetic plug round, an undercarriage round and a tray round, and
     a photograph on every finding worth photographing. The report button
     prints the lot, so the lot is what has to come out in a usable time. */
  console.log('\na shift of rounds with photographs on them');
  const seed = await p.evaluate(async () => {
    /* A camera frame, not a 1x1 pixel: noise at 2048x1536 so the JPEG weighs
       what a real one weighs and the decode costs what a real one costs. */
    const frame = async (seedN) => {
      const c = document.createElement('canvas');
      c.width = 2048; c.height = 1536;
      const x = c.getContext('2d');
      const img = x.createImageData(c.width, c.height);
      let s = seedN * 9301 + 49297;
      for (let i = 0; i < img.data.length; i += 4) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        img.data[i] = s & 255; img.data[i + 1] = (s >> 8) & 255;
        img.data[i + 2] = (s >> 16) & 255; img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      return new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    };
    let bytes = 0, shots = 0;
    const shoot = async () => { const f = await frame(++shots); bytes += f.size; return [f]; };
    const put = (o) => dbPut(Object.assign({ by:'S. Volkov', sup:'A. Sokolov',
      gps:null, dev:'PH-01', sign:null, up:0, upTo:{}, rev:1,
      created:'2026-08-22T06:00:00.000Z' }, o));

    /* the plug round — a photograph on every point, which is what a plug round
       is for */
    type = 'MP'; selectEquip('TK149');
    await new Promise(r => setTimeout(r, 400));
    const mp = {};
    for (const [i, k] of items().map(x => x.k).entries())
      mp[k] = { grade: i === 1 ? 'C' : 'A', sev: i === 1 ? 'DEG' : 'NOF',
        defect: i === 1 ? 'DT14-03' : '', cause:'', action:'', wo:'', comment:'',
        particle:'', comp:'3120', oil:'250', detect:'VI',
        /* Three frames on the first point: the phone allows ten per position
           and "the first one" is what a report quietly settles for. */
        photos: i === 0 ? [...await shoot(), ...await shoot(), ...await shoot()]
                        : await shoot(), video: null };
    await put({ id:'r-ph-mp', type:'MP', equip:'TK149', date:'2026-08-22',
      smu:'19004', cls:(ASSET_BY['TK149']||{}).cls||'', positions:mp });

    /* the undercarriage round — measured throughout, photographed where it is
       worn */
    const s2 = document.getElementById('typeSel');
    s2.value = 'UC'; s2.dispatchEvent(new Event('change'));
    selectEquip('DZ002');
    await new Promise(r => setTimeout(r, 500));
    const uc = {}; let shotUC = 0;
    for (const [i, k] of items().map(x => x.k).entries()) {
      const [pt, pos] = ucSplit(k);
      const ref = WEAR.refFor('DZ002', (ASSET_BY['DZ002']||{}).m, pt, pos, '2026-08-22');
      if (!ref || ref.x) { uc[k] = { mm:null, reason:'', stood:0, photos:[], video:null }; continue; }
      const mm = Math.round((ref.n + (ref.c - ref.n) * Math.min(1.1, 0.6 + (i % 7) * 0.06)) * 10) / 10;
      /* All six on ONE position, which is what a worn roller looks like in the
         field and what the printed sheet has to lay out — six frames of one
         thing, not six positions with one frame each. */
      const many = [];
      if (shotUC === 0) { for (let q = 0; q < 6; q++) many.push(...await shoot()); shotUC = 6; }
      uc[k] = { mm, stood:0, reason:'', photos: many, video:null };
    }
    await put({ id:'r-ph-uc', type:'UC', equip:'DZ002', date:'2026-08-22',
      smu:'7410', cls:(ASSET_BY['DZ002']||{}).cls||'', positions:uc });

    /* the tray round — sixty-three stations and the drawing that goes with it */
    s2.value = 'TB'; s2.dispatchEvent(new Event('change'));
    selectEquip('TK143');
    await new Promise(r => setTimeout(r, 500));
    const tb = {}; let shotTB = 0;
    for (const [i, k] of items().map(x => x.k).entries())
      tb[k] = { mm: Math.round((4 + (i % 11) * 1.3) * 10) / 10, stood:0, reason:'',
                photos: (shotTB < 4 && i % 15 === 0) ? (shotTB++, await shoot()) : [], video:null };
    await put({ id:'r-ph-tb', type:'TB', equip:'TK143', date:'2026-08-22',
      smu:'7000', cls:(ASSET_BY['TK143']||{}).cls||'', positions:tb });

    return { n: shots, mb: +(bytes / 1048576).toFixed(2),
             rounds: (await dbAll()).length };
  });
  note(seed.rounds + ' rounds, ' + seed.n + ' photographs', seed.mb + ' MB of camera frames');

  /* ---- press the button the inspector presses ---------------------------- */
  /* Not CMR.paginate directly: the thing being timed is the tap, which also
     pays for reading the blobs back out of the store and shrinking each one. */
  console.log('\nfrom the tap to the file');
  await p.click('#tabbar [data-pane="paneQueue"]');
  await p.waitForTimeout(400);
  const t0 = Date.now();
  let done = false;
  const dl = p.waitForEvent('download', { timeout: 180000 }).then(d => { done = true; return d; });
  await p.click('#reportBtn');
  /* The dialog has to be up before the work starts, or the inspector taps a
     button and watches a still screen wondering whether it took. */
  await p.waitForTimeout(120);
  const said = await p.evaluate(() => {
    const d = document.getElementById('dlg');
    return { open: !!(d && d.open), text: (d ? d.textContent : '').trim().slice(0, 80) };
  });
  ok('the phone says something the moment it is tapped', said.open && said.text.length > 5,
     said.text || '(nothing)');
  /* Watch what the screen says while it works. A message that never changes
     is indistinguishable from a frozen one, and this report is not fast. */
  const seen = new Set();
  while (!done) {
    const txt = await p.evaluate(() => ((document.getElementById('dlgMsg') || {}).textContent || '').trim())
      .catch(() => '');
    if (txt) seen.add(txt);
    await p.waitForTimeout(100);
  }
  const file = await dl;
  const secs = (Date.now() - t0) / 1000;
  ok('the message moves while it works, so a wait cannot read as a hang',
     seen.size > 1, seen.size + ' different messages');
  ok('  and it says how far along it is, not just that it is busy',
     [...seen].some(x => /\d+\s*(of|из)\s*\d+/i.test(x)),
     [...seen].slice(-1)[0] || '(none)');
  const path = await file.path();
  const size = require('fs').statSync(path).size;
  ok('the PDF arrives', !!path && size > 20000, (size / 1024).toFixed(0) + ' KB');
  note('time from tap to file', secs.toFixed(1) + ' s on a desktop CPU');
  /* A phone is slower than this machine. The bar is set where a wait stops
     being a wait and starts looking like a hang - if the desktop needs this
     long, the handset needs several times it. */
  ok('and it does not take longer than a person will wait', secs < 30, secs.toFixed(1) + ' s');

  /* ---- the photographs are actually on it -------------------------------- */
  /* A fast report with no pictures in it is not a fast report, it is a
     different document. */
  console.log('\nand the pictures are on the pages');
  const imgs = await p.evaluate(async () => {
    const secs = await buildReportSections();
    const html = secs.map(s => s.html).join('');
    const m = html.match(/<img[^>]+src="data:image\/jpeg;base64,([^"]{100,})"/g) || [];
    return { n: m.length, longest: Math.max(0, ...m.map(x => x.length)) };
  });
  ok('every photograph reaches the paper', imgs.n === seed.n, imgs.n + ' of ' + seed.n);
  ok('  and each is carried as bytes, not a link a printer cannot follow',
     imgs.longest > 2000, imgs.longest + ' chars');

  /* ---- one round out of five, which is the actual ask -------------------
     A shift ends with several rounds in the queue and the office wants ONE of
     them — this undercarriage, on this machine. The whole-queue button prints
     all five, and the only per-round sheet the app had was the team overlay's,
     which reads a round back from Drive and carries no photographs on purpose.
     Neither is what was asked for, so this is: the round is on the phone and so
     are its pictures, and it prints on its own with no signal in the way. */
  console.log('\none round out of the five, with its own photographs');
  await ctx.setOffline(true);
  /* The rounds were put straight into the store, which is how they get there
     from a merge or an import as well — the list is drawn from the store, so
     ask it to draw. */
  await p.evaluate(() => renderPending());
  await p.waitForTimeout(400);
  const rows = await p.evaluate(() => [...document.querySelectorAll('#pending .pitem')]
    .map(r => (r.querySelector('.meta .a') || {}).textContent || ''));
  const ucRow = rows.findIndex(x => /UC/.test(x));
  ok('the queue lists the rounds, undercarriage among them', ucRow >= 0, rows.join(' | '));
  const one = p.waitForEvent('download', { timeout: 180000 });
  await p.locator('#pending .pitem').nth(ucRow).locator('.rpt1').click();
  const oneFile = await one;
  const oneSize = require('fs').statSync(await oneFile.path()).size;
  ok('it prints on its own, with the network gone', oneSize > 20000,
     (oneSize / 1024).toFixed(0) + ' KB');
  ok('  and the file is named for that round, not for the day',
     /^CM_DZ002_UC_2026-08-22\.pdf$/.test(oneFile.suggestedFilename()),
     oneFile.suggestedFilename());
  await ctx.setOffline(false);

  /* The sheet is that round and nothing else, and the photographs on it are
     that round's. A one-round report that quietly printed all five would still
     download, still weigh something, and still be wrong. */
  const solo = await p.evaluate(async () => {
    const all = await dbAll();
    const uc = all.find(r => r.type === 'UC');
    const secs = await buildReportSections(uc.id);
    const html = secs.map(s => s.html).join('');
    const shot = r => Object.values(r.positions || {})
      .reduce((n, q) => n + ((q.photos || []).length), 0);
    return { imgs: (html.match(/<img[^>]+src="data:image\/jpeg;base64,/g) || []).length,
             mine: shot(uc), unit: uc.equip,
             /* Named, not matched on a class: a report that renamed its machine
                heading would make a class-based check pass by finding nothing,
                which is the check that cannot fail. Count the machines. */
             onIt: (html.match(new RegExp(uc.equip, 'g')) || []).length,
             strays: all.filter(r => r.id !== uc.id).map(r => r.equip)
               .map(e => e + ':' + (html.match(new RegExp(e, 'g')) || []).length) };
  });
  ok('the sheet carries that round\'s photographs', solo.imgs === solo.mine,
     solo.imgs + ' of ' + solo.mine);
  ok('  the machine it is about is named on it', solo.onIt > 0,
     solo.unit + ' appears ' + solo.onIt + ' times');
  ok('  and no other machine in the queue is',
     solo.strays.every(x => /:0$/.test(x)), solo.strays.join(' | '));

  /* ---- and they are laid out like a sheet, not like an afterthought ------
     One position with photographs came out as a 340 px column in the corner of
     an empty page, with the first frame four times the size of the rest and a
     ragged last row. The 340 px cap is right on a findings board — a card of
     text should not stretch across A4 — and wrong on a page that is nothing but
     pictures. */
  console.log('\nthe photographs are laid out across the sheet');
  const grid = await p.evaluate(async () => {
    const all = await dbAll();
    /* The undercarriage round: a measured round puts its photographs on their
       own sheet, which is the layout that was wrong. A plug round prints them
       inside the findings board, which is a different thing and still right. */
    const uc = all.find(r => r.type === 'UC');
    const secs = await buildReportSections(uc.id);
    const st = document.createElement('style'); st.textContent = CMR.CSS;
    const host = document.createElement('div');
    host.id = 'rptRoot';
    host.style.cssText = 'position:absolute;left:-4000px;top:0;width:760px;background:#fff';
    document.head.appendChild(st); document.body.appendChild(host);
    host.innerHTML = secs.map(x => x.html).join('');
    const board = host.querySelector('.board.gal');
    const cel = board && board.querySelector('.cel');
    const imgs = [...host.querySelectorAll('.board.gal .cel img')]
      .map(i => i.getBoundingClientRect());
    const w = imgs.map(r => Math.round(r.width)), h = imgs.map(r => Math.round(r.height));
    /* how many sit on the first row — the grid's real column count */
    const tops = imgs.map(r => Math.round(r.top));
    const cols = tops.filter(t => t === tops[0]).length;
    const out = { sheet: host.clientWidth, board: board ? Math.round(board.getBoundingClientRect().width) : 0,
                  cel: cel ? Math.round(cel.getBoundingClientRect().width) : 0,
                  n: imgs.length, sameW: new Set(w).size, sameH: new Set(h).size,
                  cols, one: w[0] || 0, orphans: imgs.length % (cols || 1) };
    host.remove(); st.remove();
    return out;
  });
  ok('the photographs take the width of the sheet, not a column in the corner',
     grid.board / grid.sheet > 0.9, grid.board + ' px of ' + grid.sheet);
  ok('  every frame the same size, so none of them reads as the important one',
     grid.n > 3 && grid.sameW === 1 && grid.sameH === 1,
     grid.n + ' frames, ' + grid.sameW + ' width(s), ' + grid.sameH + ' height(s)');
  ok('  and the last row is full, not one picture and a hole',
     grid.n > 3 && grid.cols > 1 && grid.orphans === 0,
     grid.n + ' across ' + grid.cols + ' columns');

  /* ---- and it gives the memory back -------------------------------------
     A blob URL pins its blob until it is released. blobToThumb() made one per
     photograph on every report build and released none, so a thirty-frame
     export pinned thirty full-size camera frames, and an inspector who built
     the report twice pinned them twice — on the device least able to spare it,
     during the operation that already needs the most. The capture screen has
     had urlPool() for this since it shipped; this path never used it, because
     it converts once and throws the URL away. It just never threw it.

     Counted rather than reasoned about: wrap both halves of the API and check
     the books balance after a build with photographs in it. */
  console.log('\nand it gives the memory back');
  const urls = await p.evaluate(async () => {
    const mk = URL.createObjectURL, rv = URL.revokeObjectURL;
    let made = 0, freed = 0;
    URL.createObjectURL = function (b) { made++; return mk.call(URL, b); };
    URL.revokeObjectURL = function (u) { freed++; return rv.call(URL, u); };
    try {
      const all = await dbAll();
      const uc = all.find(r => r.type === 'UC');
      await buildReportSections(uc.id);              // reads every photo out of the store
      await buildReportSections(uc.id);              // twice, because inspectors do
    } finally {
      URL.createObjectURL = mk; URL.revokeObjectURL = rv;
    }
    return { made, freed };
  });
  ok('every blob URL the report opens is closed again',
     urls.made > 0 && urls.freed >= urls.made,
     urls.made + ' opened, ' + urls.freed + ' closed');

  /* ---- the screen is not left in a dialog -------------------------------- */
  const after = await p.evaluate(() => !!(document.getElementById('dlg') || {}).open);
  ok('the dialog closes when the file is saved', !after);

  await b.close();
  console.log(fail ? `\n${fail} FAILED` : '\nphotographs and all, the report comes out');
  process.exit(fail ? 1 : 0);
})();
