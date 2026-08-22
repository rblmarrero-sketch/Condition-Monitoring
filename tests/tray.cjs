/* The dump body liner round, end to end, on both models.

   What is being protected here is not "the feature works" but four specific
   ways it could quietly be wrong, each of which produces a survey that looks
   complete and is not:

   1. A verdict with nothing behind it. No new or condemn thickness has been
      supplied for either tray, so no reading may come back green — an amber
      puck backed by a guess gets acted on, and that is worse than no colour.
   2. A zone reported by its mean. TK-125's tail averages 6.24 mm and its worst
      station reads 3.50. The average is the number that lets a body through.
   3. A half-repainted map. This file has already had that bug twice on the
      undercarriage round, so the in-place repaint is compared byte for byte
      against a full re-render.
   4. The wrong reference. A tray station falling through to the undercarriage
      table produces a confident, completely wrong percentage.
*/
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* TK-125's real tail readings, off the client's own filled-in HM400 sheet.
   Chosen because the mean and the worst are far enough apart to catch a rollup
   that averages. */
const REAL = { F62:3.5, F61:4.07, F71:4.8, F74:5.05, F72:6.44, F95:6.46, F73:7.02,
               F81:8.1, F82:7.9, F91:7.6, F92:8.9, F93:9.1, F94:8.7 };

async function boot(ctx){
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('dialog', d => d.accept());
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(400);
  return p;
}
async function openTray(p, unit){
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'TB'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(200);
  await p.evaluate(u => selectEquip(u), unit);
  await p.waitForTimeout(500);
}
const put = (p, k, v) => p.evaluate(a => { pickComponent(a[0]);
  const e = document.getElementById('ucMM'); e.value = String(a[1]); e.dispatchEvent(new Event('input')); }, [k, v]);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });

  /* ---- 1. both models are offered, and only to trucks that have one ------ */
  console.log('\nwhich machines have a tray');
  let p = await boot(ctx);
  ok('the round is in the list', await p.evaluate(() =>
    [...document.getElementById('typeSel').options].some(o => o.value === 'TB')));
  for (const [unit, model, n] of [['TK143','HM400',63], ['TK146','TR60',44]]) {
    await openTray(p, unit);
    const st = await p.evaluate(() => ucStatus(curEquip));
    ok(unit + ': the register names the tray', st.ok && st.model === model, JSON.stringify(st));
    ok(unit + ': every station is on the map', await p.locator('[data-pt]').count() === n, String(n));
    ok(unit + ': the route visits each one once', await p.evaluate(x =>
      ucOrder().length === x && new Set(ucOrder()).size === x, n));
  }
  /* An excavator has no tray, and an empty round that looks walkable is worse
     than one that is not offered. */
  await openTray(p, 'EX001');
  ok('an excavator is turned away', await p.evaluate(() => !ucStatus(curEquip).ok));
  ok('and told why', (await p.textContent('#posnav')).length > 20,
    (await p.textContent('#posnav')).trim().slice(0, 52));
  /* 27 of the 28 articulated trucks have no model in the register. The round
     runs on the HM400 sheet and SAYS SO — the alternative is either refusing 27
     machines or assuming silently. */
  await openTray(p, 'TK125');
  const guessed = await p.evaluate(() => ucStatus(curEquip));
  ok('a truck with no model recorded still gets a round', guessed.ok && guessed.model === 'HM400');
  ok('and the screen says the model is a guess', guessed.sure === false &&
    /register/i.test(await p.textContent('.tbnote')), (await p.textContent('.tbnote')).trim().slice(0, 52));
  /* The note is one line by default and the whole of it is one tap away — a
     warning worth 74 px on every paint of the map is not, but it must still be
     reachable and it must still name the sheet being assumed. */
  await p.locator('.tbnote button').first().click();
  await p.waitForTimeout(300);
  ok('and tapping it names which sheet', /HM400|Komatsu/i.test(await p.textContent('.tbnote')),
    (await p.textContent('.tbnote')).trim().slice(0, 64));

  /* ---- 2. the floor is graded; the structure is not ---------------------- */
  /* The site has supplied one figure — every liner on 20 mm, off at 8 mm — and
     it applies to the FLOOR. The side skins and front wall are structural
     plate, thinner than 20 mm from new, and a 20/8 limit on them would condemn
     the whole register the first time anybody measured one. So half this body
     grades and half does not, and the half that does not has to say so. */
  console.log('\nthe floor gets a verdict, the structure gets a record');
  await openTray(p, 'TK143');
  const noteTxt = () => p.$$eval('.tbnote', a => a.map(e => e.textContent).join(' '));
  ok('the round says which parts are not graded, above the map',
    /not graded|structural/i.test(await noteTxt()),
    (await noteTxt()).trim().slice(0, 52));
  /* Short by default, whole on tap — and the short form has to carry the point
     on its own, because that is the one most inspectors will ever read. */
  await p.locator('.tbnote button').first().click();
  await p.waitForTimeout(300);
  ok('and naming them is one tap away',
    /Left side|Right side|Front wall/i.test(await noteTxt()),
    (await noteTxt()).trim().slice(0, 72));
  await p.locator('.tbnote button').first().click();
  await p.waitForTimeout(300);

  await put(p, 'F62', 3.5);
  await p.waitForTimeout(250);
  /* 3.5 mm of a 20 mm liner is past condemn and must never read as fine. This
     is the assertion the whole section exists for. */
  ok('a floor liner worn past condemn comes back red, not green', await p.evaluate(() =>
    bodyState('F62') === 'act' && Math.round(BODY.wear('HM400','F62',3.5)) === 138),
    await p.evaluate(() => document.getElementById('ucRead').textContent));
  ok('and the reference line states the figure it judged against',
    /20/.test(await p.textContent('#ucRefLine')) && /8/.test(await p.textContent('#ucRefLine')),
    (await p.textContent('#ucRefLine')).slice(0, 48));
  ok('the exported row carries the percentage and the band', await p.evaluate(() => {
    const w = wearOut({ type:'TB', equip:'TK143', date:'2026-08-03' }, 'F62', { mm:3.5 });
    return w.band === 'act' && String(w.newMM) === '20' && String(w.condemnMM) === '8'
        && w.wearPct !== '';
  }));
  ok('and still carries which sheet, and the zone', await p.evaluate(() => {
    const w = wearOut({ type:'TB', equip:'TK143' }, 'F62', { mm:3.5 });
    return w.refSrc === 'tray:HM400' && w.zone === 'TAIL';
  }));

  /* The other half. A side skin has no thickness supplied, so a reading on it
     gets recorded and compared with last time and gets NO verdict — and the
     absence has to be visible, not silent. */
  await put(p, 'L21', 3.5);
  await p.waitForTimeout(250);
  ok('the same 3.5 mm on a side skin gets no verdict, because none is known',
    await p.evaluate(() => BODY.band('HM400','L21',3.5) === null
                        && BODY.limitFor('HM400','L21') === null));
  ok('and the export carries no invented numbers for it', await p.evaluate(() => {
    const w = wearOut({ type:'TB', equip:'TK143' }, 'L21', { mm:3.5 });
    return w.wearPct === '' && w.band === '' && w.newMM === '' && w.condemnMM === '';
  }));

  /* Station beats zone, so one odd plate can be named without restating the
     rest — the mechanism the reference comment promises. */
  ok('a station-level figure overrides the zone it sits in', await p.evaluate(() => {
    BODY.limits.HM400.F62 = { n:25, c:10 };
    const pct = Math.round(BODY.wear('HM400','F62',3.5));
    delete BODY.limits.HM400.F62;
    const back = Math.round(BODY.wear('HM400','F62',3.5));
    return pct === 143 && back === 138;     // (25-3.5)/15 then (20-3.5)/12
  }));

  /* ---- 3. the questions a round can ask without a reference table ------- */
  console.log('\nthe checks that need no limits at all');
  const warn = () => p.evaluate(() => document.getElementById('ucWarn').classList.contains('hidden')
    ? '' : document.getElementById('ucWarnText').textContent);
  for (const [k, v] of Object.entries({ F81:8.1, F82:7.9, F91:7.6, F92:8.9, F93:9.1 })) await put(p, k, v);
  await put(p, 'F94', 85);
  await p.waitForTimeout(250);
  const odd = await warn();
  ok('85 next to a column of 8s is questioned', /decimal|8\.\d/.test(odd), odd.slice(0, 76));
  await put(p, 'F94', 8.7);
  await p.waitForTimeout(200);
  ok('and a sane reading is not', (await warn()) === '', await warn());
  await put(p, 'F94', 0.02);
  await p.waitForTimeout(200);
  ok('so is a misplaced decimal the other way', (await warn()) !== '');
  await put(p, 'F94', 8.7);
  await p.waitForTimeout(200);
  ok('nothing was ever blocked — the reading stands',
    await p.evaluate(() => draft.positions.F94.mm === '8.7' || Number(draft.positions.F94.mm) === 8.7),
    await p.evaluate(() => String(draft.positions.F94.mm)));

  /* ---- 4. the zone is its thinnest station, never its mean -------------- */
  console.log('\na zone is reported by its worst station');
  for (const [k, v] of Object.entries(REAL)) await put(p, k, v);
  await p.waitForTimeout(300);
  const mean = Object.values(REAL).reduce((a, x) => a + x, 0) / Object.keys(REAL).length;
  const worst = await p.evaluate(r => BODY.worst('HM400','TAIL', r), REAL);
  ok('the tail is named by F62, not by its average',
    worst.k === 'F62' && worst.mm === 3.5, worst.k + ' ' + worst.mm + ' mm (mean is ' + mean.toFixed(2) + ')');
  ok('and the two are far enough apart to matter', mean - worst.mm > 1.5, (mean - worst.mm).toFixed(2) + ' mm apart');

  /* ---- 4b. the map can be used, and cannot be buried -------------------- */
  console.log('\nthe map is a control, and it stays on screen');
  /* A dot is not a button. Sixty-three stations across a phone puts them about
     seven pixels apart — a quarter of what a bare fingertip needs, let alone a
     glove — so the tap target is the SURFACE, and the chips pick the band and
     the station. Three levels, each at a size that works. */
  ok('a station dot is an indicator, not a button', await p.evaluate(() =>
    [...document.querySelectorAll('[data-pt]')].every(g =>
      g.getAttribute('pointer-events') === 'none' && !g.hasAttribute('tabindex'))));
  const hits = await p.evaluate(() =>
    [...document.querySelectorAll('.bm-hit[data-zone]')].map(z => {
      const r = z.getBoundingClientRect();
      return { z: z.dataset.zone, min: Math.round(Math.min(r.width, r.height)) };
    }));
  ok('the map offers five surfaces instead', hits.length === 5,
    hits.map(h => h.z).join(' '));
  ok('and every one of them clears the 44 px floor',
    hits.every(h => h.min >= 44), hits.map(h => h.z + ':' + h.min).join(' '));
  const chips = await p.evaluate(() =>
    [...document.querySelectorAll('#posnav .ucgroups button,#posnav .ucmembers button')]
      .map(b => { const r = b.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); }));
  ok('so do the band and station chips', chips.length > 0 && chips.every(v => v >= 44),
    Math.min.apply(null, chips) + ' px smallest of ' + chips.length);
  /* Tapping a surface used to bury the drawing under the sheet. The map now
     gives way instead of being covered — whole, and never scrolled half off. */
  await p.evaluate(() => { const z = document.querySelector('.bm-hit[data-zone]'); if (z) z.onclick(); });
  await p.waitForTimeout(1100);
  const lay = await p.evaluate(() => {
    const w = document.querySelector('.tbwrap').getBoundingClientRect();
    const sh = document.getElementById('ucFields').getBoundingClientRect();
    return { covered: w.bottom > sh.top + 1, offTop: w.top < 0, h: Math.round(w.height),
             reading: document.body.classList.contains('tbreading') };
  });
  ok('taking a reading does not cover the map', !lay.covered && !lay.offTop,
    'map ' + lay.h + ' px, sheet starts below it');
  ok('and the whole tray is still on screen, not scrolled half off', lay.h > 120, lay.h + ' px');
  ok('the round knows it is in reading mode', lay.reading);

  /* ---- 4c. nothing on the drawing sits on top of anything else ---------- */
  console.log('\nthe drawing stays legible');
  /* Captions ran under the station grid — "LEFT SIDE" rendered as "LEFT S(o)E"
     — and the Russian is longer than the English, so this is checked in BOTH
     languages on BOTH models. Sizing the lanes by eye in one language is how it
     came back the second time. */
  for (const lg of ['en', 'ru']) {
    await p.click('.lang button[data-lang="' + lg + '"]');
    await p.waitForTimeout(300);
    const bad = await p.evaluate(() => {
      const sv = document.querySelector('.tbwrap svg');
      const dots = [...sv.querySelectorAll('.bm-dot')].map(d => d.getBoundingClientRect());
      const out = [];
      /* Captions only. The selection chip is a different thing judged by a
         different rule below: it is transient, it belongs to the station you
         are on, and on the head strip — four columns across seventy-eight
         units — there is nowhere to put a fifty-unit chip that touches nothing.
         What it must never do is cover its OWN dot or leave the drawing. */
      sv.querySelectorAll('.bm-face,.bm-way').forEach(t => {
        const r = t.getBoundingClientRect();
        if (dots.some(d => !(d.right < r.left || d.left > r.right ||
                             d.bottom < r.top || d.top > r.bottom))) out.push(t.textContent.trim());
      });
      return out;
    });
    ok(lg + ': no caption sits on a station', !bad.length, bad.length ? bad.join(', ') : 'clear');
    const chip = await p.evaluate(() => {
      const sv = document.querySelector('.tbwrap svg');
      const box = sv.querySelector('.bm-tag rect'); if (!box) return { none: true };
      const r = box.getBoundingClientRect(), s = sv.getBoundingClientRect();
      const own = sv.querySelector('.bm-p.sel .bm-dot').getBoundingClientRect();
      const over = d => !(d.right < r.left || d.left > r.right || d.bottom < r.top || d.top > r.bottom);
      return { coversOwn: over(own),
               inside: r.left >= s.left - 1 && r.right <= s.right + 1
                    && r.top >= s.top - 1 && r.bottom <= s.bottom + 1 };
    });
    ok(lg + ': the selection chip never hides the dot it names', chip.coversOwn === false);
    ok(lg + ': and never leaves the drawing', chip.inside === true);
  }
  await p.click('.lang button[data-lang="en"]');
  await p.waitForTimeout(300);

  /* ---- 4d. the map follows the chips, and a station has no grade -------- */
  console.log('\nthe map keeps up with the chips');
  /* Reported from the pit: tapping L12 left "L11" on the tray. The in-place
     repaint declines when the selection moves — the name label beside the dot
     cannot be patched, it has to be drawn somewhere else — and the caller was
     falling through to a partial button pass that never touched the map. */
  await p.evaluate(() => { const z = document.querySelectorAll('.bm-hit[data-zone]')[1];
    if (z && z.onclick) z.onclick(); });
  await p.waitForTimeout(500);
  const walkChips = [];
  for (let i = 0; i < 3; i++) {
    await p.evaluate(n => { const b = document.querySelectorAll('#posnav .ucmembers button')[n];
      if (b) b.click(); }, i);
    await p.waitForTimeout(400);
    walkChips.push(await p.evaluate(() => ({
      cur: curItem,
      tag: (document.querySelector('.bm-tag text') || {}).textContent || null,
      members: document.querySelectorAll('#posnav .ucmembers button').length,
      zoneLit: !!document.querySelector('#posnav .ucgroups button.on'),
    })));
  }
  ok('the name on the map is the station you picked',
    walkChips.every(x => x.tag === x.cur), walkChips.map(x => x.cur + '/' + x.tag).join(' '));
  ok('the station row does not vanish under you',
    walkChips.every(x => x.members > 0), walkChips.map(x => x.members).join(' '));
  ok('and the zone stays lit', walkChips.every(x => x.zoneLit));
  /* A measured station's answer is a number. Offering A/B/C/X beside it invites
     two answers to one question, which then disagree in the report. */
  ok('a tray station is not offered a grade', await p.evaluate(() => {
    const g = document.getElementById('gradeFld');
    return !!g && g.getClientRects().length === 0;
  }));

  /* ---- 5. the map says the same thing the chips say --------------------- */
  console.log('\nthe map and the chips cannot disagree');
  const cmp = await p.evaluate(() => {
    const before = document.getElementById('posnav').innerHTML;
    renderChips();
    const after = document.getElementById('posnav').innerHTML;
    if (before.replace(/\s+/g,' ') === after.replace(/\s+/g,' ')) return 'identical';
    const A = before.split('><'), C = after.split('><');
    for (let i = 0; i < Math.max(A.length, C.length); i++)
      if (A[i] !== C[i]) return 'first difference at ' + i + ': ' + (A[i]||'').slice(0,70) + ' VS ' + (C[i]||'').slice(0,70);
    return 'differs';
  });
  ok('the in-place repaint matches a full re-render exactly', cmp === 'identical', cmp);
  ok('the tail chip counts every station it holds',
    /13\/13/.test(await p.textContent('[data-bz="TAIL"]')), await p.textContent('[data-bz="TAIL"]'));
  /* Moving the selection moves the name label, which classes cannot do — so it
     must force a redraw rather than be patched. */
  ok('a moved selection is redrawn, not patched', await p.evaluate(() => {
    /* Any station BUT the one on screen — naming a fixed code here made the
       check pass or fail on whatever the tests above happened to leave selected. */
    const other = ucOrder().find(k => k !== curItem);
    curItem = other;
    return repaintMap() === false;
  }));

  /* ---- 6. the sheet, and how to take the reading ------------------------ */
  console.log('\nwhat the inspector is told at the station');
  await p.evaluate(() => pickComponent('F62'));
  await p.waitForTimeout(300);
  ok('the sheet names the station and what it is',
    /F62/.test(await p.textContent('#ucSheetTitle')) && (await p.textContent('#ucSheetTitle')).length > 6,
    await p.textContent('#ucSheetTitle'));
  await p.evaluate(() => { guideOpen = true; renderUCGuide(); });
  await p.waitForTimeout(150);
  const guide = await p.textContent('#ucGuide');
  ok('the method is on the screen, not in somebody\'s memory',
    /[Uu]ltrasonic/.test(guide) && /lowest|LOWEST/.test(guide), guide.slice(30, 96));
  ok('and it is a tray method, not a track one', !/roller|caliper across the tread/i.test(guide));
  ok('the reasons are the ones a tray has',
    /frozen ore/i.test(await p.textContent('#ucReasons')) && /doubler|weld/i.test(await p.textContent('#ucReasons')),
    (await p.textContent('#ucReasons')).slice(0, 60));
  ok('no drawing is offered, because the map above IS the drawing',
    await p.evaluate(() => document.getElementById('ucFig').innerHTML === '' &&
      getComputedStyle(document.getElementById('ucFigTog')).display === 'none'));
  ok('and every station id in the document is unique',
    await p.evaluate(() => { const ks = [...document.querySelectorAll('[data-pt]')].map(g => g.dataset.pt);
      return ks.length === new Set(ks).size; }),
    String(await p.locator('[data-pt]').count()));

  /* ---- 7. Russian ------------------------------------------------------- */
  console.log('\nand it speaks Russian');
  await p.click('.lang button[data-lang="ru"]');
  await p.waitForTimeout(500);
  ok('the round is named in Russian', /кузов/i.test(await p.evaluate(() =>
    [...document.getElementById('typeSel').options].find(o => o.value === 'TB').textContent)));
  ok('so are the zones', /разгруз|пол/i.test(await p.textContent('[data-bz="TAIL"]')),
    (await p.textContent('[data-bz="TAIL"]')).slice(0, 40));
  await p.evaluate(() => { pickComponent('F62'); guideOpen = true; renderUCGuide(); });
  await p.waitForTimeout(200);
  ok('and the method', /толщиномер/i.test(await p.textContent('#ucGuide')),
    (await p.textContent('#ucGuide')).slice(20, 70));
  /* The short form is the one most inspectors read, so it is the one checked.
     "оцениваем" is the word that carries the point — recorded, not graded. */
  ok('the not-graded warning too',
    /оценива|предел|толщин/i.test(await p.textContent('.tbnote')),
    (await p.textContent('.tbnote')).slice(0, 50));
  await p.click('.lang button[data-lang="en"]');
  await p.waitForTimeout(400);

  /* ---- 8. it survives the round being saved ----------------------------- */
  console.log('\nsaved, reported, and still right');
  await p.fill('#inspector', 'R. Marrero');
  await p.evaluate(() => { saveCur(); ucCloseSheet(); });
  await p.waitForTimeout(200);
  await p.click('#saveBtn');
  await p.waitForTimeout(1200);
  const saved = await p.evaluate(async () => {
    const all = await dbAll(), rec = all.find(r => r.type === 'TB');
    return rec ? { n: Object.keys(rec.positions).length, id: !!rec.id, label: itemLabelFor(rec, 'F62') } : null;
  });
  ok('the round is in the store', saved && saved.n >= 13, saved ? saved.n + ' stations' : 'missing');
  ok('with a stable id on it', saved && saved.id);
  ok('and each station keeps its name for Drive and the CSV',
    saved && /F62/.test(saved.label) && saved.label.length > 6, saved && saved.label);
  const rpt = await p.evaluate(async () => {
    const r = (await rptRecords()).find(x => x.type === 'TB');
    if (!r) return null;
    const m = r.mapHTML || '';
    const row = (m.match(/<tr><td>Floor — tail<\/td>[\s\S]*?<\/tr>/) || [''])[0].replace(/<[^>]+>/g, '|');
    return { map: /bodymap/.test(m), table: /tbzone/.test(m), row };
  });
  ok('the report draws the tray', rpt && rpt.map);
  ok('and tables every zone beside it', rpt && rpt.table);
  ok('naming the tail by its thinnest station', rpt && /3\.5/.test(rpt.row) && /F62/.test(rpt.row),
    rpt && rpt.row.replace(/\|+/g, ' ').trim());

  /* ---- 9. history is per round, not per machine ------------------------- */
  console.log('\nlast time means last time on THIS round');
  ok('a tray round does not read an undercarriage round as its own history',
    await p.evaluate(async () => {
      const rows = await ucPrevReadings('TK143');
      return Object.keys(rows).every(k => k.indexOf('.') < 0);   // UC keys carry a dot
    }));

  /* ---- 10. offline is the normal state ---------------------------------- */
  console.log('\nand none of it needs a signal');
  await ctx.setOffline(true);
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => fails.push('PAGEERROR(offline) ' + e.message));
  await p2.goto(B + '/mobile/index.html', { waitUntil: 'load' }).catch(() => {});
  await p2.waitForTimeout(1500);
  const off = await p2.evaluate(() => {
    try {
      const s = document.getElementById('typeSel'); s.value = 'TB'; s.dispatchEvent(new Event('change'));
      selectEquip('TK146');
      return { ok: ucStatus('TK146').ok, n: ucOrder().length };
    } catch (e) { return { err: String(e) }; }
  }).catch(e => ({ err: String(e) }));
  ok('the tray round opens with the network gone', off.ok === true && off.n === 44, JSON.stringify(off));
  await ctx.setOffline(false);

  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
