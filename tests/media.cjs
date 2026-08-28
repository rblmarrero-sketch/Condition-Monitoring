const REPO = require('path').join(__dirname, '..');
/* Every photograph the round took, and the office's right to fix the set.

   An inspector takes five or six pictures of a cracked idler because one of
   them will be the one that shows it. The dashboard showed the first and
   silently dropped the rest — `photoSrc()` searched two suffixes out of eleven
   and returned the first hit — so five sixths of the evidence existed on Drive
   and nowhere a person would ever look. Videos were unreachable entirely: no
   code path could display one.

   Then the other half of the ask: the office has to be able to add the shot
   somebody forgot and take down the one that came out as a thumb over the
   lens. Two acts, two mechanisms, and the difference matters:

     ADD writes a real file to Drive, under the next free _N, through the same
     batch op the phones use — nothing new to deploy.

     REMOVE writes nothing to Drive. It records the file name in the correction
     sidecar with who and when, the picture stops being shown and stops
     reaching the reports, and the bytes stay where the inspector put them. An
     office that can quietly erase evidence from a mine's condition record is
     not what "remove if it is not good" has to mean, and this guards that it
     stays reversible.
*/
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

const BASE = 'TK900_4C_23.07.2026_MP';
const state = () => ({
  strip: document.querySelectorAll('#history .pos .strip .th').length,
  badge: (document.querySelector('#history .pos .shotn') || {}).textContent || '',
  editItems: document.querySelectorAll('#history .medit .mitem').length,
  off: document.querySelectorAll('#history .medit .mitem.off').length,
  vid: document.querySelectorAll('#history .pos .strip .th.vid').length,
});

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(700);

  /* Ten photographs and a clip, named the way the phone uploads them. Each is
     a DIFFERENT colour, so a set that collapses to one is visible as a count
     and not hidden behind identical URLs. */
  await p.evaluate(B => {
    window.__writes = []; window.__idx = {};
    const px = c => 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"><rect width="9" height="9" fill="${c}"/></svg>`);
    ['#c33','#3c3','#33c','#cc3','#c3c','#3cc','#777','#f80','#08f','#8f0']
      .forEach((c, i) => { const n = `${B}_${i + 1}.jpg`;
        CMDash.addPhoto(n, px(c)); window.__idx[n] = 1; });
    CMDash.addPhoto(`${B}.mp4`, 'data:video/mp4;base64,AAAA'); window.__idx[`${B}.mp4`] = 1;
    /* Only the two methods under test are replaced; the rest of the real Drive
       client stays, or this becomes a test of the stub. */
    CMDrive.configured = () => true;
    CMDrive.hasName = n => !!window.__idx[n];
    CMDrive.saveEdit = d => { window.__writes.push(['edit', d]); return Promise.resolve({ ok: true }); };
    CMDrive.putMedia = (name, file) => {
      window.__writes.push(['put', name, file.type]);
      window.__idx[name] = 1;
      CMDash.addPhoto(name, px('#0a0') + '#' + name);   // unique per file
      return Promise.resolve({ name });
    };
    localStorage.setItem('cm_dash_who', 'V. Petrov');
    localStorage.setItem('cm_drive_url', 'https://stub/exec');
    CMDash.importRecords([{ equip: 'TK900', date: '2026-07-23', type: 'MP', cls: 'HT', by: 'R. Marrero',
      items: [{ key: '4C', label: 'LR Final Drive', grade: 'C' }] }]);
    document.getElementById('dataOv').classList.add('hidden');
    showTab('equipment');
    const s = document.getElementById('equipSel'); s.value = 'TK900';
    s.dispatchEvent(new Event('change'));
    /* This file is about the photo VIEW — every frame on the card, the clip
       marked as a clip, the strip that shows there are ten. History opens on
       the list now, which is a table of findings and deliberately carries a
       count rather than the frames themselves. Ask for the view under test. */
    document.querySelector('#histView button[data-hv="photo"]').click();
  }, BASE);
  await p.waitForTimeout(900);

  console.log('ten photographs and a clip all arrive');
  let s = await p.evaluate(state);
  ok('every frame is on the card, not just the first', s.strip === 11, s.strip + ' of 11');
  ok('the count says so', s.badge === '11', s.badge);
  ok('the clip is there and marked as one', s.vid === 1, s.vid + ' video thumbnail(s)');
  note('shown', s.strip + ' frames, badge "' + s.badge + '"');

  console.log('\nthe viewer walks the whole set');
  await p.click('#history .pos .strip .th:nth-child(4)');
  await p.waitForTimeout(250);
  ok('it opens on the frame that was clicked',
     /4 \/ 11/.test(await p.evaluate(() => $('lbcap').textContent)),
     await p.evaluate(() => $('lbcap').textContent));
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
  ok('and steps through', /5 \/ 11/.test(await p.evaluate(() => $('lbcap').textContent)));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);

  console.log('\nthe office takes one down — and has to say why');
  await p.click('#history .medit .mtog'); await p.waitForTimeout(200);
  await p.click('#history .medit .mitem:nth-child(2) .mx'); await p.waitForTimeout(400);
  /* One click used to remove field evidence outright: no reason, no
     confirmation, nothing in the audit trail beyond a file name. It now arms
     and asks, and the photograph is still on the card while it does. */
  s = await p.evaluate(state);
  ok('the first press removes nothing', s.strip === 11, s.strip + ' still shown');
  ok('it asks for a reason instead',
     await p.evaluate(() => !$('history').querySelector('.medit .mwhy').classList.contains('hidden')));
  await p.click('#history .medit .mgo'); await p.waitForTimeout(500);
  s = await p.evaluate(state);
  ok('and will not proceed on an empty one', s.strip === 11, s.strip + ' still shown');
  ok('saying so rather than doing nothing quietly',
     /\S/.test(await p.evaluate(() => $('history').querySelector('.medit .mmsg').textContent)));
  await p.fill('#history .medit .mwhyi', 'thumb over the lens');
  await p.click('#history .medit .mgo'); await p.waitForTimeout(700);
  s = await p.evaluate(state);
  ok('it stops being shown', s.strip === 10, s.strip + ' left');
  ok('the count follows', s.badge === '10', s.badge);
  ok('but it is still listed in the editor, greyed, so it can come back',
     s.editItems === 11 && s.off === 1, s.editItems + ' listed, ' + s.off + ' off');

  const w = await p.evaluate(() => window.__writes.filter(x => x[0] === 'edit')
    .map(x => ({ by: x[1].by, items: x[1].items })));
  ok('nothing was deleted from Drive',
     !(await p.evaluate(() => window.__writes.some(x => x[0] === 'delete'))));
  ok('the removal is a correction, with a name on it',
     w.length === 1 && w[0].by === 'V. Petrov', JSON.stringify(w[0] && w[0].by));
  ok('and it names the exact file',
     !!(w[0] && w[0].items['4C'] && w[0].items['4C'].hidden || []).length &&
     w[0].items['4C'].hidden[0] === BASE + '_2.jpg',
     JSON.stringify(w[0] && w[0].items));
  /* The reason is the point of asking for one. It has to reach the sidecar,
     keyed by the file it is about, with the name and the moment beside it —
     otherwise this is a confirmation dialogue and not an audit trail. */
  const aud = await p.evaluate(() => (window.__writes.filter(x => x[0] === 'edit').pop() || [])[1]);
  const rec2 = aud && aud.assign && aud.assign[BASE + '_2.jpg'];
  ok('the reason is stored against that photograph',
     !!rec2 && rec2.off === 1 && rec2.offWhy === 'thumb over the lens',
     JSON.stringify(rec2));
  ok('with who and when', !!(rec2 && rec2.by && rec2.at), JSON.stringify(rec2 && [rec2.by, rec2.at]));

  console.log('\nand can put it back — in one press, because that costs nothing');
  await p.click('#history .medit .mtog'); await p.waitForTimeout(200);
  await p.click('#history .medit .mitem.off .mx'); await p.waitForTimeout(700);
  s = await p.evaluate(state);
  ok('the photograph returns', s.strip === 11 && s.off === 0, s.strip + ' shown, ' + s.off + ' off');

  console.log('\nand adds what the round missed');
  await p.click('#history .medit .mtog'); await p.waitForTimeout(200);
  await p.setInputFiles('#history .medit .madd input', [
    { name: 'a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8]) },
    { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50]) }]);
  await p.waitForTimeout(1400);
  s = await p.evaluate(state);
  ok('both land on the card', s.strip === 13, s.strip + ' of 13');
  const names = await p.evaluate(() => window.__writes.filter(x => x[0] === 'put').map(x => x[1]));
  ok('under the next free numbers, so nothing is overwritten',
     names[0] === BASE + '_11.jpg' && names[1] === BASE + '_12.png', names.join(' '));
  note('uploaded', names.join('  '));

  console.log('\na removed photograph never reaches a report');
  const rep = await p.evaluate(B => {
    const rec = CMDash.allRecs().find(r => r.equip === 'TK900');
    const it = rec.items[0];
    const before = (CMDash.mediaOf(it, rec) || []).length;
    /* Hide one through the same path the button uses, then ask the report
       builder what it would print. */
    const withHidden = Object.assign({}, it, { hidden: [B + '_3.jpg'] });
    const after = (CMDash.mediaOf(withHidden, rec) || []).length;
    return { before, after };
  }, BASE);
  ok('the shared list drops it', rep.after === rep.before - 1,
     rep.before + ' → ' + rep.after);
  const reportSrc = require('fs').readFileSync(
    REPO + '/dashboard/report.js', 'utf8');
  ok('and the report asks that same list rather than rebuilding names',
     /CMDash\.mediaOf/.test(reportSrc) && !/"_1", "_2", "_3", "_4"/.test(reportSrc));

  console.log('\nnothing to edit where there is nothing to write to');
  await p.evaluate(() => { CMDrive.configured = () => false;
    localStorage.removeItem('cm_drive_url'); renderHistory(); });
  await p.waitForTimeout(400);
  ok('no photo controls without a configured Drive',
     (await p.evaluate(() => document.querySelectorAll('#history .medit').length)) === 0);

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
