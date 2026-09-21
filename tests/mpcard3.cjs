/* THREE POSITIONS SHARING mpEvidence's OWN BOARD ARE NOT SQUEEZED EITHER —
   THE CURRENT VISIT, NOT ONLY ITS HISTORY.

   histpair.cjs proved boardCols' fix for earlierRoundSections (an older
   round's card). This is the SAME defect, on the board a technician's own
   round actually prints through: mpEvidence(), called for exactly the
   report the complaint came from — CM_one_TK156_2026-09-13_MP_2026-09-21_1.pdf,
   a single MP round, three positions (4 Differential, 4E Left Rear Final
   Drive, 4F Right Rear Final Drive), each with its own photograph pair.
   "looks like my instruction wasn't clear regarding photo, this looks like
   a bad photo in a report to me."

   Read off that report: mpEvidence's own `cols` was a plain count (its.
   length>=4?4:...===3?3:...) with no multi-photo check at all — unlike
   earlierRoundSections, which had already grown a narrower version of this
   rule for exactly two items. Packed at cols=3, a 243px card, a natural
   ~198x182 / ~129x182 photo pair does not shrink proportionally under CSS
   grid's own `auto` column sizing when squeezed — it splits the available
   width EQUALLY between the two columns instead, so a near-square photo
   and a narrow portrait one came out the identical ~122px, both roughly
   40% smaller than the same pair renders at, unsqueezed, for a lone
   position on the same sheet.

   boardCols (by mpEvidence, report-core.js) is the one rule now: three
   items, any of them carrying more than one photograph, and the board
   collapses to one full-width column exactly the way a single multi-photo
   item already did.

   Run: node tests/mpcard3.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 1200 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMR, { timeout: 20000 });

  const r = await p.evaluate(async () => {
    const solid = (w, h, rgb, label) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = 'rgb(' + rgb.join(',') + ')'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff'; x.font = Math.round(Math.min(w, h) / 5) + 'px sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, w / 2, h / 2);
      return c.toDataURL('image/png');
    };
    // TK156's own real shape: a squarish overview close-up + a narrower
    // threaded-plug close-up, per position.
    const pair = (label) => [solid(500, 460, [70, 70, 75], label + '1'), solid(340, 480, [50, 50, 55], label + '2')];
    const buildRec = (items) => ({ equip: 'TK156', clsLabel: 'HT', model: 'X', type: 'MP', typeLabel: 'MP',
      date: '2026-09-13', by: 'Rayanov', smu: '8047', items });

    async function renderAndMeasure(items) {
      const secs = window.CMR.sections({ lang: 'en', bi: false, mode: 'unit', title: 'x', titleAlt: 'y', stamp: new Date(),
        sevLabel: s => s, sevLabelAlt: s => s, records: [buildRec(items)] });
      const st = document.getElementById('mpc3css') || (() => { const s = document.createElement('style'); s.id = 'mpc3css'; s.textContent = CMR.CSS; document.head.appendChild(s); return s; })();
      const old = document.getElementById('rptRoot'); if (old) old.remove();
      const d = document.createElement('div'); d.id = 'rptRoot';
      d.style.cssText = 'position:fixed;left:0;top:0;width:760px;background:#fff;';
      d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
      document.body.appendChild(d);
      const imgs = [...d.querySelectorAll('.cel .phg img')];
      await Promise.all(imgs.map(im => im.complete ? null : new Promise(res => { im.onload = im.onerror = res; })));
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const board = d.querySelector('.board');
      const cels = [...d.querySelectorAll('.cel')];
      const out = {
        boardClass: board ? board.className : null,
        cels: cels.map(cel => ({
          cardWidth: Math.round(cel.getBoundingClientRect().width),
          imgs: [...cel.querySelectorAll('.phg img')].map(im => {
            const rc = im.getBoundingClientRect();
            return { w: Math.round(rc.width), h: Math.round(rc.height) };
          }),
        })),
      };
      d.remove();
      return out;
    }

    const three = await renderAndMeasure([
      { key: '4', name: 'Differential', grade: 1, action: 'Monitor / re-inspect next PM', photos: pair('D') },
      { key: '4E', name: 'Left Rear Final Drive', grade: 1, defect: 'Ferrous debris — light', action: 'Monitor / re-inspect next PM', photos: pair('E') },
      { key: '4F', name: 'Right Rear Final Drive', grade: 2, defect: 'Ferrous debris — light', action: 'Monitor / re-inspect next PM', photos: pair('F') },
    ]);
    const one = await renderAndMeasure([
      { key: '4', name: 'Differential', grade: 1, action: 'Monitor / re-inspect next PM', photos: pair('D') },
    ]);
    // Control: a lone, single-photo position (no multi-photo item) never
    // needed and never gets the wide escape hatch — this fix must not
    // widen every mpEvidence board indiscriminately.
    const twoSinglePhoto = await renderAndMeasure([
      { key: '4', name: 'Differential', grade: 1, photos: [solid(500, 460, [70, 70, 75], 'D')] },
      { key: '4E', name: 'Left Rear Final Drive', grade: 1, defect: 'wear', photos: [solid(500, 460, [70, 70, 75], 'E')] },
    ]);
    return { three, one, twoSinglePhoto };
  });

  console.log('TK156\'s own MP round: three positions, each with a photo pair, sharing mpEvidence\'s board');
  ok('THE FIX: the board carries the wide class', /(^| )wide( |$)/.test(r.three.boardClass || ''), r.three.boardClass);
  ok('  three cards, each spanning the full sheet width', r.three.cels.length === 3 && r.three.cels.every(c => c.cardWidth > 700),
     JSON.stringify(r.three.cels.map(c => c.cardWidth)));
  const threeWidths = r.three.cels.map(c => c.imgs.map(i => i.w));
  const oneWidths = r.one.cels[0].imgs.map(i => i.w);
  ok('  THE FIX: every position\'s photo pair is the SAME size as the same pair rendered alone',
     threeWidths.every(ws => ws.length === 2 && ws.every((w, i) => Math.abs(w - oneWidths[i]) <= 1)),
     JSON.stringify({ three: threeWidths, one: oneWidths }));
  ok('  and the pair keeps its own two different widths (nothing squeezed to an equal share)',
     threeWidths.every(ws => ws[0] !== ws[1]), JSON.stringify(threeWidths));

  console.log('\n(control: two positions, one photograph each — no multi-photo item, board stays packed)');
  ok('two cards, packed at the ordinary 2-column width, not widened',
     r.twoSinglePhoto.cels.length === 2 && r.twoSinglePhoto.cels.every(c => c.cardWidth < 450) &&
     !/(^| )wide( |$)/.test(r.twoSinglePhoto.boardClass || ''),
     JSON.stringify({ cls: r.twoSinglePhoto.boardClass, w: r.twoSinglePhoto.cels.map(c => c.cardWidth) }));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
