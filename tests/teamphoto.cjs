/* A round somebody ELSE walked, printed on your phone.

   The readings arrive with the round; the photographs do not — they are in the
   shared folder under names this record only references. That was deliberate
   for the round SCREEN, which has to open with no signal. It was never a
   decision about the REPORT, and the report inherited it: an office printing a
   colleague's round got a sheet of findings and no pictures, and no sheet ever
   said the pictures existed.

   Two phones here, both against the same in-memory Drive. The first captures a
   round with photographs and uploads it the way the app uploads. The second has
   never seen that round, pulls it, and prints it.

   Run: node tests/teamphoto.cjs [port]   (needs tests/ed-srv.cjs on that port) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs');
const { spawn } = require('child_process');
/* Its own /exec on its own port, started and stopped here.

   This suite UPLOADS, and the shared servers keep what they are given for as
   long as they run. On the second pass the script found a file of that name
   already there and kept both copies under "~DEVICE" — exactly as it should —
   and the round then had eight photographs instead of four. The failure was
   the test's, not the app's, which is the worst kind to leave lying around. */
const PORT = Number(process.argv[2] || 8117);
const B = `http://127.0.0.1:${PORT}`;
const EXEC = `${B}/exec`;
const srv = spawn(process.execPath, [__dirname + '/ed-srv.cjs', String(PORT)],
                  { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };
const note = (n, d) => console.log('  ....  ' + n + (d !== undefined ? '   ' + d : ''));

const dests = u => JSON.stringify([{ id:'gas', on:true, url:u, sec:'', folder:'{TYPE}/{UNIT}/{YYYY-MM-DD}' }]);

async function phone(b, withDrive) {
  const ctx = await b.newContext({ viewport:{ width:412, height:915 },
    isMobile:true, hasTouch:true, acceptDownloads:true, serviceWorkers:'block' });
  await ctx.addInitScript(d => localStorage.setItem('up_dests', d), withDrive ? dests(EXEC) : '[]');
  const p = await ctx.newPage();
  p.on('pageerror', e => ok('page error', false, e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil:'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout:20000 });
  await p.waitForTimeout(600);
  return { ctx, p };
}

(async () => {
  for (let i = 0; i < 40; i++) {                       // wait for it to answer
    try { await fetch(EXEC + '?action=list&ext=.json'); break; }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  const b = await chromium.launch();

  /* ---- phone one: walk it, photograph it, send it ----------------------- */
  console.log('\none phone walks the round and sends it');
  const A = await phone(b, true);
  const sent = await A.p.evaluate(async () => {
    const s = document.getElementById('typeSel');
    s.value = 'MP'; s.dispatchEvent(new Event('change'));
    selectEquip('TK151');
    await new Promise(r => setTimeout(r, 500));
    document.getElementById('inspector').value = 'S. Volkov';
    const shot = async (tag) => { const c = document.createElement('canvas');
      c.width = 900; c.height = 675; const x = c.getContext('2d');
      x.fillStyle = '#4b4136'; x.fillRect(0, 0, 900, 675);
      x.fillStyle = '#fff'; x.font = '90px sans-serif'; x.fillText(tag, 60, 300);
      return new Promise(r => c.toBlob(r, 'image/jpeg', 0.75)); };
    const ks = items().map(i => i.k);
    /* three on one position and one on another: "the first photograph" is what
       a report quietly settles for, and one per position never shows it */
    pickComponent(ks[0]);
    let pos = curP(); pos.photos = [await shot('A'), await shot('B'), await shot('C')]; pos.grade = 'B';
    pickComponent(ks[1]);
    pos = curP(); pos.photos = [await shot('D')]; pos.grade = 'A';
    renderMedia(); renderChips();
    return { unit:'TK151', keys:[ks[0], ks[1]] };
  });
  await A.p.click('#saveBtn');
  await A.p.waitForTimeout(7000);
  const onDrive = await (await fetch(`${EXEC}?action=list&ext=.jpg`)).json();
  /* The folder is not empty to begin with — the fixture has other machines in
     it, which is the point: the round has to find ITS pictures among them. */
  const mineOnDrive = (onDrive.files || []).filter(f => /^TK151_/.test(f.name));
  note('in the folder', mineOnDrive.map(f => f.name).join('  '));
  ok('the four photographs are in the shared folder, among everyone else\'s',
     mineOnDrive.length === 4, mineOnDrive.length + ' of ' + (onDrive.files || []).length + ' files');
  await A.ctx.close();

  /* ---- phone two: never saw it, prints it ------------------------------- */
  console.log('\nanother phone pulls it and prints it');
  const C = await phone(b, true);
  const pulled = await C.p.evaluate(async () => {
    await teamPull(true, true);
    await new Promise(r => setTimeout(r, 800));
    const rows = teamAll().filter(r => r.u === 'TK151');
    if (!rows.length) return { err:'no row' };
    const k = rows[0].u + '|' + rows[0].d + '|' + rows[0].t;
    await openTeamRow(k);
    await new Promise(r => setTimeout(r, 700));
    return { k, open: !document.getElementById('roundOv').classList.contains('hidden'),
             mine: (await dbAll()).length };
  });
  ok('the round opens on a phone that never walked it', pulled.open === true, JSON.stringify(pulled));
  ok("  and it is not in that phone's own queue", pulled.mine === 0, pulled.mine + ' local rounds');

  /* The readings came over; the pictures are still in the folder. That is the
     state this whole suite is about. */
  const bare = await C.p.evaluate(() => {
    const r = roundRec, n = teamRecToReport(r);
    return n.items.reduce((s, it) => s + (it.photos || []).length, 0);
  });
  ok('the round as it arrives carries no photographs at all', bare === 0, bare + '');

  /* ---- what the report does about that ---------------------------------- */
  console.log('\nthe report goes and gets them');
  const got = await C.p.evaluate(async () => {
    const g = loadDests().find(d => d.id === 'gas' && d.url);
    /* How many times it goes to the folder is the whole of "will this take
       long" on a satellite link — the bytes are small, the round trips are not.
       One listing of the round's own folder, then the pictures eight at a
       time, which is what the script hands back in one reply. */
    const real = window.teamAsk; const asked = [];
    window.teamAsk = (gg, params, ms) => { asked.push(params.action); return real(gg, params, ms); };
    const t0 = performance.now();
    const map = await teamPhotosFor(g, roundRec, null);
    window.teamAsk = real;
    return { ms: Math.round(performance.now() - t0), asked,
             keys: map ? Object.keys(map).length : -1,
             n: map ? Object.values(map).reduce((s, a) => s + a.length, 0) : -1,
             data: map ? Object.values(map).flat().every(u => /^data:image\//.test(u)) : false };
  });
  note('fetch took', got.ms + ' ms for ' + got.n + ' photographs');
  ok('every photograph on the round is fetched', got.n === 4, got.n + ' of 4');
  ok('  onto the positions they were taken at', got.keys === 2, got.keys + ' positions');
  ok('  and as bytes the report can draw', got.data);
  note('what it asked the folder for', (got.asked || []).join(' '));
  ok('  without walking the whole folder to find them',
     (got.asked || []).filter(a => a === 'list').length === 1,
     (got.asked || []).filter(a => a === 'list').length + ' listings');
  ok('  and it collects them in batches, not one request each',
     (got.asked || []).filter(a => a === 'files').length === 1,
     (got.asked || []).filter(a => a === 'files').length + ' fetches for 4 photographs');

  /* The pictures have to be ON the sheet, not merely fetched. Count them where
     they are drawn — a PDF that weighs about the same either way is the tell
     that the fetch went nowhere. */
  const drawn = await C.p.evaluate(async () => {
    const g = loadDests().find(d => d.id === 'gas' && d.url);
    const map = await teamPhotosFor(g, roundRec, null);
    const n = teamRecToReport(roundRec);
    n.items.forEach(it => { if (map[it.key] && map[it.key].length) it.photos = map[it.key]; });
    const html = CMR.sections({ lang, mode:'unit', title:'x', titleAlt:'x', stamp:new Date(),
      sevLabel:s => s, sevLabelAlt:s => s, records:[n] }).map(s => s.html).join('');
    return { imgs: (html.match(/<img[^>]+src="data:image/g) || []).length,
             note: /offline|офлайн|could not be fetched/i.test(html) };
  });
  ok('all four are drawn on the pages', drawn.imgs === 4, drawn.imgs + ' images');
  ok('  and the sheet says nothing about missing pictures, because none are',
     !drawn.note);
  /* Everything above drives teamPhotosFor. None of it can see whether the
     BUTTON reaches it — which is the failure this project has shipped more than
     any other, and it passes a suite like this one silently. So watch the wire
     and the dialog while the button is pressed. */
  await C.p.evaluate(() => {
    window.__asked = []; window.__said = [];
    const real = window.teamAsk;
    window.teamAsk = (g, params, ms) => { window.__asked.push(params.action); return real(g, params, ms); };
    const el = document.getElementById('dlgMsg');
    new MutationObserver(() => window.__said.push(el.textContent)).observe(el,
      { childList:true, characterData:true, subtree:true });
  });
  const [dlOn] = await Promise.all([
    C.p.waitForEvent('download', { timeout:180000 }),
    C.p.click('#roundRpt'),
  ]);
  const wire = await C.p.evaluate(() => ({ asked: window.__asked, said: window.__said }));
  ok('pressing the round\u2019s own PDF button is what fetches them',
     wire.asked.indexOf('files') >= 0, wire.asked.join(' ') || '(the folder was never asked)');
  ok('  and the phone says so while it waits',
     wire.said.some(x => /Fetching photograph|Загрузка фотографии/.test(x)),
     (wire.said.find(x => /photograph|фотограф/i.test(x)) || '(nothing)').slice(0, 40));
  const onSize = fs.statSync(await dlOn.path()).size;
  ok("the round's own PDF button produces a file", onSize > 20000, (onSize / 1024).toFixed(0) + ' KB');

  /* ---- filed under the other name, and still found ----------------------
     The uploader picks between "UNIT.KEY" and "UNIT_KEY" on whether the round
     walks the register AND whether that unit has components. The phone asking
     for the pictures is not the phone that filed them, and may not be on the
     build that had that rule. Here the sending phone is made to answer the
     second question the other way — an older rule, or a unit the register did
     not know that day — and the receiving phone still has to find its work. */
  console.log('\nfiled under the other rule, and still found');
  const A2 = await phone(b, true);
  await A2.p.evaluate(async () => {
    /* the register says this unit has no components, so the flat name is used */
    window.componentsForUnit = () => null;
    const s = document.getElementById('typeSel');
    s.value = 'UC'; s.dispatchEvent(new Event('change'));
    selectEquip('DZ002');
    await new Promise(r => setTimeout(r, 600));
    document.getElementById('inspector').value = 'S. Volkov';
    const shot = async () => { const c = document.createElement('canvas');
      c.width = 600; c.height = 450; const x = c.getContext('2d');
      x.fillStyle = '#3b4a55'; x.fillRect(0, 0, 600, 450);
      return new Promise(r => c.toBlob(r, 'image/jpeg', 0.7)); };
    const ks = items().map(i => i.k);
    pickComponent(ks[0]);
    const pos = curP(); pos.mm = 30; pos.photos = [await shot(), await shot()];
    renderMedia(); renderChips();
  });
  await A2.p.click('#saveBtn');
  await A2.p.waitForTimeout(7000);
  const filed = await (await fetch(`${EXEC}?action=list&ext=.jpg`)).json();
  const flat = (filed.files || []).filter(f => /^DZ002_/.test(f.name));
  note('filed as', flat.map(f => f.name).join('  ') || '(nothing)');
  ok('the sending phone filed them under the flat name', flat.length === 2,
     flat.length + ' files');
  await A2.ctx.close();

  const C2 = await phone(b, true);
  const found = await C2.p.evaluate(async () => {
    await teamPull(true, true);
    await new Promise(r => setTimeout(r, 900));
    const row = teamAll().find(r => r.u === 'DZ002');
    if (!row) return { err:'no row' };
    await openTeamRow(row.u + '|' + row.d + '|' + row.t);
    await new Promise(r => setTimeout(r, 700));
    const g = loadDests().find(d => d.id === 'gas' && d.url);
    const map = await teamPhotosFor(g, roundRec, null);
    return { n: map ? Object.values(map).reduce((s, a) => s + a.length, 0) : -1 };
  });
  ok('and the receiving phone finds them anyway', found.n === 2,
     found.n + ' of 2' + (found.err ? '  ' + found.err : ''));

  /* This one is an undercarriage round, so it HAS a drawing — and the drawing
     is built from files this phone already holds. Cut the link and it must
     still be there: layout on a weak connection, pictures too on a good one,
     in that order. The handler builds it before it asks the folder for
     anything, which is what makes that order true rather than lucky. */
  await C2.ctx.setOffline(true);
  const dark = await C2.p.evaluate(async () => {
    await needMap();
    const n = teamRecToReport(roundRec);
    const m = rptMap(roundRec, n.items, "");
    n.mapHTML = m.html; n.mapKey = m.key;
    const html = CMR.sections({ lang, mode:'unit', title:'x', titleAlt:'x', stamp:new Date(),
      sevLabel:s => s, sevLabelAlt:s => s, records:[n] }).map(s => s.html).join('');
    return { built: (m.html || '').length, why: m.why || '', on: /class="ucmap/.test(html) };
  });
  ok('with the link cut the machine is still drawn', dark.built > 1000 && dark.on,
     dark.built + ' chars' + (dark.why ? '  why=' + dark.why : ''));
  await C2.ctx.setOffline(false);
  await C2.ctx.close();

  /* ---- and when there is no signal, it SAYS so --------------------------- */
  /* The failure that matters is not a missing photograph, it is a sheet that
     looks exactly like a round where nobody took one. */
  console.log('\nand with no signal it says the pictures are missing, not that there are none');
  await C.ctx.setOffline(true);
  const [dlOff] = await Promise.all([
    C.p.waitForEvent('download', { timeout:180000 }),
    C.p.click('#roundRpt'),
  ]);
  const offSize = fs.statSync(await dlOff.path()).size;
  ok('it still prints with the network gone', offSize > 15000, (offSize / 1024).toFixed(0) + ' KB');
  note('two sheets', (onSize / 1024).toFixed(0) + ' KB with pictures, '
       + (offSize / 1024).toFixed(0) + ' KB without');
  /* Counted where they are drawn rather than weighed as a file: these frames
     are flat colour, they land INSIDE a rasterised page, and JPEG makes four of
     them cost almost nothing. A size comparison here passed and failed for
     reasons that had nothing to do with whether a picture was on the page. */
  const gone = await C.p.evaluate(async () => {
    const g = loadDests().find(d => d.id === 'gas' && d.url);
    const n = teamRecToReport(roundRec);
    /* The drawing first and offline, which is the order the handler uses: it is
       built from files this phone already holds, so it must not wait on — or be
       lost to — a folder that never answers. */
    await needMap();
    const drawn = rptMap(roundRec, n.items, "");
    n.mapHTML = drawn.html; n.mapKey = drawn.key;
    const map = await teamPhotosFor(g, roundRec, null);      // offline: no answer
    if (map) n.items.forEach(it => { if (map[it.key]) it.photos = map[it.key]; });
    else { n.note = t('rep_nophoto_off'); n.noteAlt = inOtherLang(() => t('rep_nophoto_off')); }
    const html = CMR.sections({ lang, mode:'unit', title:'x', titleAlt:'x', stamp:new Date(),
      sevLabel:s => s, sevLabelAlt:s => s, records:[n] }).map(s => s.html).join('');
    return { reached: map !== null, imgs: (html.match(/<img[^>]+src="data:image/g) || []).length,
             /* The drawing is built from files this phone already holds. It has
                no business waiting on a folder, and it must survive one that
                never answers — layout on a weak link, pictures too on a good
                one, in that order. */
             en: /offline/i.test(html), ru: /офлайн/.test(html) };
  });
  ok('with no signal the folder simply does not answer', gone.reached === false);
  ok('  so the sheet carries no photographs', gone.imgs === 0, gone.imgs + ' images');
  ok('  and says why, instead of looking like a round nobody photographed',
     gone.en, 'note present');
  ok('  in both languages, like everything else on it', gone.en && gone.ru);
  await C.ctx.setOffline(false);

  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\na colleague's round prints with the pictures on it");
  process.exit(fail ? 1 : 0);
})();
