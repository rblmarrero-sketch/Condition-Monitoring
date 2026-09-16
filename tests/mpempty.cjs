/* A PLUG MERELY PASSED THROUGH ON THE WAY TO ANOTHER ONE IS NOT PART OF THE
   VISIT'S RECORD.

   TK161's MP round on 2026-09-16 printed full cards for "1 Engine" and
   "4 Differential" carrying nothing but a work order reference — no grade,
   no photograph, no comment — beside 4E/4F, which carried a real reading and
   a photograph each. loadPos() (mobile/index.html) stamps the round's own
   work order onto whichever position is on screen the instant it opens, so
   a plug an inspector only navigated past on the way to the one they were
   actually checking picked one up regardless. On the page a card like that
   is indistinguishable from a plug that WAS checked and came back clean —
   this project's signature defect, dressed as a work order instead of a
   grade. hasEvidence(p) on the phone already excludes a bare `wo` from
   counting as evidence; mpEvidence (mobile/report-core.js) now applies the
   same rule to what it prints.

   Run: node tests/mpempty.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const SEED = () => {
  const px = (w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#556'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#cda'; x.fillRect(4, 4, w - 8, h - 8);
    return c.toDataURL('image/jpeg', 0.6);
  };
  const ph = px(320, 240);
  /* TK161's own shape: two plugs opened but never read (a bare wo each), two
     plugs actually checked (a grade and a photograph each). */
  const rec = {
    equip: 'TK161', date: '2026-09-16', type: 'MP', cls: 'HT', by: 'I. Rayanov',
    smu: '7966',
    items: [
      { key: '1', label: 'Engine', wo: 'WO-016634' },
      { key: '4', label: 'Differential', wo: 'WO-016634' },
      { key: '4E', label: 'Left Rear Final Drive', grade: 1,
        action: 'Monitor / re-inspect next PM', wo: 'WO-016634', photos: [ph] },
      { key: '4F', label: 'Right Rear Final Drive', grade: 1,
        action: 'Monitor / re-inspect next PM', wo: 'WO-016634', photos: [ph] },
    ],
  };
  /* Control: an MP round with every plug actually read, none of them
     dropped — proves the filter costs nothing on a clean, ordinary round. */
  const clean = {
    equip: 'TK162', date: '2026-09-16', type: 'MP', cls: 'HT', by: 'I. Rayanov',
    smu: '8010',
    items: [
      { key: '1', label: 'Engine', grade: 1, action: 'Monitor / re-inspect next PM', wo: 'WO-016700', photos: [ph] },
      { key: '4', label: 'Differential', grade: 1, action: 'Monitor / re-inspect next PM', wo: 'WO-016700', photos: [ph] },
    ],
  };
  CMDash.importRecords([rec, clean]);
  const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(SEED); await p.waitForTimeout(300);

  console.log('a plug opened but never read carries no card');
  const html = await p.evaluate(() => {
    const secs = CMReport.sectionsFor('one', 'TK161|2026-09-16|MP', { lang: 'en', photos: true });
    return secs.map(s => s.html).join('\n');
  });
  ok('the two read plugs are on the sheet', /Left Rear Final Drive/.test(html) && /Right Rear Final Drive/.test(html), html.length + ' chars');
  ok('the two merely-opened plugs are not', !/>Engine</.test(html) && !/Differential/.test(html), '');
  ok('and their bare work order is not printed as if it were a finding', !/WO-016634/.test(html) || /4E|4F/.test(html), (html.match(/WO-016634/g) || []).length + ' occurrence(s)');

  console.log('\na plug actually read still earns its card, wo or not');
  const cleanHtml = await p.evaluate(() => {
    const secs = CMReport.sectionsFor('one', 'TK162|2026-09-16|MP', { lang: 'en', photos: true });
    return secs.map(s => s.html).join('\n');
  });
  ok('both read plugs print', /Engine/.test(cleanHtml) && /Differential/.test(cleanHtml), '');
  const cards = await p.evaluate((h) => {
    const d = document.createElement('div'); d.innerHTML = h;
    return d.querySelectorAll('.cel').length;
  }, cleanHtml);
  ok('two cards, one per plug actually read', cards === 2, cards);

  const cardsForRec = await p.evaluate((h) => {
    const d = document.createElement('div'); d.innerHTML = h;
    return d.querySelectorAll('.cel').length;
  }, html);
  ok('TK161 prints exactly the two cards with a real finding, not four', cardsForRec === 2, cardsForRec);

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
