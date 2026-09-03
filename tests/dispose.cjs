/* TEN PHOTOGRAPHS AND NOBODY TO DECIDE ABOUT THEM.

   TK115 carries six and DZ007 four, all on a position that never got a key.
   They are real field evidence and nothing about them is wrong except that
   nobody can say which component they show. Both are still held on the live
   folder today.

   The panel could assign one to a point or keep it as general evidence. It
   could not say "this one should not be in the report", and it could not
   remove a photograph of somebody's boot, so the only answers were to leave it
   in the folder for ever or to delete the whole inspection around it.

   Four answers now, and the two new ones are the ones that need guarding:

     assign to a point      — was already here
     keep as general        — was already here
     exclude from report    — needs a REASON. The evidence stays.
     delete the file        — needs a reason, the unit typed out, and the admin
                              password. Destroys bytes. Nothing brings them back.

   And two rules that must hold whatever the buttons allow:

     a photograph nobody can display cannot be classified, excluded or deleted
     a reason is never optional on either of the two that remove something

   Run: node tests/dispose.cjs        (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const BUNDLED = require('./bundled.cjs');
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };

/* One round shaped like TK115: real readings, four photographs, and a point
   that never got a key. Two of the four have arrived; two have not. */
/* NO LABEL EITHER. A point with a label is a point somebody can name, and the
   normalizer rightly treats it as identified — this suite spent its first run
   proving that, on a fixture that was not the thing it meant to test. TK115's
   row has neither a key nor a label: real readings, four photographs, and
   nothing at all to say which component they are of. */
const REC = {
  equip: 'TK115', date: '2026-08-05', type: 'TB', cls: 'HT', by: 'S. Volkov', smu: 8100,
  items: [
    /* A named point whose photographs DID arrive. Excluding and deleting are
       about a picture somebody is looking at, so the suite needs one. */
    { key: 'F31', label: 'Front floor 31', mm: 12, stood: 1, photos: 2 },
    /* And the row TK115 actually has: readings, four photographs, and nothing
       at all to say which component they are of. */
    { grade: 'C', comment: 'plate thinning near the weld', photos: 4, video: 0 },
  ],
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(BUNDLED + '()');
  await p.waitForTimeout(400);

  /* Two of the four photographs are in the folder; two never arrived. The
     names follow the phone's own rule so nothing here is invented. */
  const setup = await p.evaluate(r => {
    try { localStorage.setItem('cm_dash_who', 'R. Marrero'); } catch (e) {}
    CMDash.importRecords([r]);
    const rec = RECS.find(x => x.equip === 'TK115' && x.type === 'TB');
    const keyed = (rec.items || []).find(i => i && i.key === 'F31');
    const base = photoBases(keyed, rec)[0];
    const here = [base + '_1.jpg', base + '_2.jpg'];
    /* A keyless point cannot have predictable file names — that is exactly why
       its photographs never matched — so its four are placeholders. */
    const gone = [];
    window.__here = here;
    CMDrive.configured = () => true;
    CMDrive.names = () => here;
    CMDrive.hasName = (n) => here.indexOf(n) >= 0;
    here.forEach((n, i) => CMDash.addPhoto(n, 'blob:fake/' + i));
    window.__saved = [];
    CMDrive.saveEdit = d => { window.__saved.push(d); return Promise.resolve({ ok: true }); };
    window.__deleted = [];
    CMDrive.deleteFile = a => { window.__deleted.push(a); return Promise.resolve({ ok: true, deleted: 1 }); };
    CMDrive.load = () => Promise.resolve({});
    return { key: ekOf(rec), base, here, gone };
  }, REC);
  console.log('   fixture: ' + setup.here.length + ' arrived, ' + setup.gone.length + ' did not');

  const open = () => p.evaluate(k => { opKey = k; opSel.clear(); $('opOv').classList.remove('hidden');
                                       renderOrphan(); }, setup.key);
  const state = () => p.evaluate(() => ({
    cards: [...document.querySelectorAll('#opGrid .opc')].map(c => ({
      name: c.dataset.op, off: c.classList.contains('off'),
      label: (c.querySelector('.st') || {}).textContent || '' })),
    next: $('opNext').textContent,
    msg: $('opMsg').textContent,
    assignDisabled: $('opAssign').disabled,
    generalDisabled: $('opGeneral').disabled,
    saved: window.__saved.length, deleted: window.__deleted.length,
  }));
  const select = (names) => p.evaluate(ns => { opSel.clear(); ns.forEach(n => opSel.add(n)); renderOrphan(); }, names);

  await open();
  console.log('\n1. THE PANEL SAYS WHAT IS OUTSTANDING AND WHOSE JOB IT IS');
  {
    const s = await state();
    /* Four photographs on a point with no key: the panel shows all four, and
       none of them can be classified, because none of them can be displayed.
       That is TK115 as it stands in the folder today. */
    ok('every photograph the keyless point claims is on the panel',
       s.cards.length === 4, s.cards.length + ' card(s)');
    ok('none of them can be acted on, because none can be seen',
       s.cards.every(c => c.off), s.cards.filter(c => !c.off).map(c => c.name).join(' ') || 'none actionable');
    ok('and the panel says whose job that is — synchronisation, not classification',
       /synchronisation|cannot see/i.test(s.next), s.next.slice(0, 70));
    ok('nothing is offered until something is chosen',
       s.assignDisabled && s.generalDisabled,
       `assign ${s.assignDisabled} general ${s.generalDisabled}`);
  }

  console.log('\n2. EXCLUDING AND DELETING LIVE ON THE PHOTOGRAPH, NOT ON THIS PANEL');
  await select([]);
  /* One place per action. Excluding a picture from the report and deleting its
     file are both decisions somebody makes while LOOKING at it, so they are in
     the lightbox and not here — a second set of buttons for a decision that
     already has a home is how two screens come to disagree about whether a
     photograph is in the report. */
  {
    const gone = await p.evaluate(() => ({
      exclude: !!document.getElementById('opExclude'),
      del: !!document.getElementById('opDelete'),
      inEditor: !!document.getElementById('pxUse') && !!document.getElementById('pxDelete'),
    }));
    ok(!gone.exclude && !gone.del, 'the orphan panel offers neither', JSON.stringify(gone));
    ok(gone.inEditor, 'and the photograph itself offers both');
  }

  const openLightbox = (name) => p.evaluate(n => {
    const rec = RECS.find(x => ekOf(x) === opKey);
    const it = (rec.items || []).find(i => i && i.key === 'F31');
    const med = mediaOf(it, rec);
    const ix = Math.max(0, med.findIndex(m => m.name === n));
    openLB(med.map(m => [m.src, m.kind]), ix, 'F31',
           { rk: ekOf(rec), ik: 'F31', name: med[ix] && med[ix].name });
    return !!lbCtx;
  }, name);

  console.log('\n3. EXCLUDING NEEDS A REASON, AND KEEPS THE EVIDENCE');
  {
    ok(await openLightbox(setup.here[0]), 'the photograph opens');
    const r = await p.evaluate(() => {
      $('pxUse').value = '0';
      $('pxUse').dispatchEvent(new Event('change', { bubbles: true }));
      $('pxWhy').value = '';
      $('pxSave').click();
      return { msg: $('pxMsg').textContent, saved: window.__saved.length };
    });
    await p.waitForTimeout(250);
    ok(/reason|why/i.test(r.msg) || r.saved === 0,
       'excluding with no reason does not go through', r.msg.slice(0, 60) + ' · writes ' + r.saved);
  }
  {
    const r = await p.evaluate(() => {
      $('pxUse').value = '0';
      $('pxUse').dispatchEvent(new Event('change', { bubbles: true }));
      $('pxWhy').value = 'out of focus, retaken on the next round';
      $('pxSave').click();
      return true;
    });
    await p.waitForTimeout(600);
    const doc = await p.evaluate(() => window.__saved[window.__saved.length - 1] || null);
    const entry = doc && (doc[Object.keys(doc).find(k => /assign|photo/i.test(k)) || ''] || {})[setup.here[0]];
    ok(!!entry, 'with a reason it writes one correction', doc ? 'written' : 'nothing');
    ok(!!(entry && entry.exclude), 'marked as excluded', JSON.stringify(entry || {}));
    ok(!!(entry && /out of focus/.test(entry.why || '')), 'carrying the reason', (entry || {}).why);
    ok(!!(entry && entry.by && entry.at), 'and who decided, and when',
       `${(entry || {}).by} ${(entry || {}).at}`);
    const shown = await p.evaluate(n => {
      const rec = RECS.find(x => ekOf(x) === opKey);
      const it = (rec.items || []).find(i => i && i.key === 'F31');
      const m = mediaOf(it, rec).find(x => x.name === n);
      return { stillOnRecord: !!m, excluded: !!(m && m.excluded), why: (m || {}).excludeWhy };
    }, setup.here[0]);
    ok(shown.stillOnRecord, 'the photograph is still on the record', JSON.stringify(shown));
    ok(shown.excluded && /out of focus/.test(shown.why || ''),
       'and marked so the report leaves it out', shown.why);
  }

  console.log('\n3b. DELETING DESTROYS A FILE, SO IT ASKS FOR EVERYTHING');
  await openLightbox(setup.here[1]);
  {
    const r = await p.evaluate(() => {
      $('pxWhy').value = ''; window.__prompts = [];
      window.prompt = m => { window.__prompts.push(m); return null; };
      $('pxDelete').click();
      return { msg: $('pxMsg').textContent, prompts: window.__prompts.length,
               deleted: window.__deleted.length };
    });
    await p.waitForTimeout(200);
    ok(/reason|cannot be told/i.test(r.msg), 'with no reason it refuses before asking anything',
       r.msg.slice(0, 60));
    ok(r.prompts === 0, 'and never reaches the confirmation');
    ok(r.deleted === 0, 'and deletes nothing');
  }
  {
    await p.evaluate(() => {
      $('pxWhy').value = 'photograph of the wrong machine';
      window.__prompts = [];
      window.prompt = m => { window.__prompts.push(m); return 'TK999'; };
      $('pxDelete').click();
    });
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => ({ msg: $('pxMsg').textContent,
      asked: window.__prompts[0] || '', deleted: window.__deleted.length }));
    ok(/TK115/.test(r.msg), 'a mistyped unit stops it', r.msg.slice(0, 60));
    ok(r.deleted === 0, 'and still deletes nothing', 'deleted ' + r.deleted);
    ok(/permanently|brings it back/i.test(r.asked),
       'the confirmation says it cannot be undone', r.asked.slice(0, 80));
    ok(/Remove from the record/i.test(r.asked),
       'and names the reversible answer beside it', 'offered');
  }
  {
    await p.evaluate(() => {
      $('pxWhy').value = 'photograph of the wrong machine';
      let n = 0;
      window.prompt = () => (n++ === 0 ? 'TK115' : 'letmein');
      $('pxDelete').click();
    });
    await p.waitForTimeout(900);
    const call = await p.evaluate(() => window.__deleted[0] || null);
    ok(!!call, 'with all three it deletes', JSON.stringify(call || {}));
    ok(call && call.name === setup.here[1], 'naming the file', (call || {}).name);
    ok(call && /wrong machine/.test(call.why || ''), 'carrying the reason', (call || {}).why);
    ok(!!(call && call.by && call.admin), 'and who, and the admin password',
       `${(call || {}).by} admin=${call && call.admin ? 'given' : 'missing'}`);
  }

  console.log('\n4. A PHOTOGRAPH NOBODY CAN SEE CANNOT BE DISPOSED OF AT ALL');
  await open();
  {
    /* Whatever a stale selection or a future caller does, the record is asked
       again before anything is written. */
    const out = await p.evaluate(() => {
      const rec = RECS.find(x => ekOf(x) === opKey);
      const ph = orphanPhotos(rec).filter(x => !photoActionable(x)).map(x => x.name);
      opSel.clear(); ph.forEach(n => opSel.add(n));
      const before = window.__saved.length;
      saveAssign({ [ph[0]]: { point: 'F31' } });
      return { wrote: window.__saved.length - before, msg: $('opMsg').textContent };
    });
    ok('filing one that never arrived writes nothing', out.wrote === 0, 'writes ' + out.wrote);
    ok('and says so plainly', /not arrived|cannot be assigned/i.test(out.msg), out.msg.slice(0, 60));
  }
  {
    const cards = await p.evaluate(() => [...document.querySelectorAll('#opGrid .opc.off')]
      .map(c => (c.querySelector('input') || {}).disabled));
    ok('their checkboxes cannot even be ticked', cards.length === 4 && cards.every(Boolean),
       JSON.stringify(cards));
  }

  console.log('\n5. AND THE READINGS ARE NEVER IN QUESTION');
  {
    const kept = await p.evaluate(() => {
      const rec = RECS.find(x => ekOf(x) === opKey);
      const meas = (rec.items || []).find(i => i && i.key === 'F31');
      const orph = (rec.items || []).find(i => i && !i.key);
      return { mm: meas && meas.mm, grade: orph && orph.grade, comment: orph && orph.comment,
               voided: !!rec._void };
    });
    ok('the millimetre survives every decision about the photographs', kept.mm === 12, String(kept.mm));
    ok('so does the grade', kept.grade === 3, String(kept.grade));
    ok('and the inspector\'s words', /thinning/.test(kept.comment || ''), kept.comment);
    ok('and the round is not withdrawn for any of it', kept.voided === false);
  }

  console.log('\n6. HUNTING A STRAY IN THE FOLDER');
  {
    const r = await p.evaluate(b2 => {
      CMDrive.names = () => [b2 + '_1.jpg', b2 + '_2.jpg',
                             'TK115.F31_05.08.2026_TB_1.jpg', 'DZ007._02.08.2026_UC_1.jpg'];
      $('opFindQ').value = 'tk115 05.08';
      $('opFindGo').click();
      return $('opFindOut').textContent;
    }, setup.base);
    ok('every word has to appear, in any order', /3 file\(s\)|3 файл/.test(r), r.slice(0, 60));
    ok('and it lists them', /TK115\.F31_05\.08\.2026_TB_1\.jpg/.test(r), 'listed');
  }
  {
    const r = await p.evaluate(() => { $('opFindQ').value = 'EX999'; $('opFindGo').click();
                                       return $('opFindOut').textContent; });
    ok('nothing matching says nothing matching', /Nothing in the folder|нет совпад/i.test(r), r.slice(0, 50));
  }
  {
    const r = await p.evaluate(() => { CMDrive.names = () => [];
                                       $('opFindQ').value = 'TK115'; $('opFindGo').click();
                                       return $('opFindOut').textContent; });
    ok('and an index that has not arrived is not an empty folder',
       /has not arrived|не получен/i.test(r), r.slice(0, 60));
  }

  ok('nothing threw throughout', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED\n` : '\nall passed\n');
  process.exit(fails.length ? 1 : 0);
})();
