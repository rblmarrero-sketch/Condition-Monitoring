/* AN EDITOR NOBODY IS AFRAID OF, AND AN EDIT THAT CAN BE TRACED.

   Two gaps in the photo editor, both of the same kind — a decision that could
   not be walked back, and a decision that left no trail.

   UNDO. Somebody drags a crop across a cracked weld, decides it was better
   before, and the only way back was Reset — which throws away every other
   decision made in the same sitting. So people stop dragging, and the crop
   that would have made the defect obvious in the report never happens.

   VERSIONS. Every save overwrote the recipe. A rendition printed in a report
   last month could be silently replaced, and nothing said so: the report and
   the photograph it cited would disagree with no way to tell which had moved.

   The original is never one of the versions. It is the file, untouched — the
   editor stores a recipe and renders from it, and every version here is
   measured against the same bytes.

   Run: node tests/pxhist.cjs        (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const BUNDLED = require('./bundled.cjs');
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
/* CONDITION FIRST. The first run of this suite printed "PASS true" thirty
   times: the definition took (name, cond) and every call passed (cond, name),
   so the "condition" was a non-empty string and nothing could fail. attid.cjs
   shipped the same mistake once. A suite that cannot fail is worse than no
   suite, because it is counted. */
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };

const PX = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const REC = {
  equip: 'TK901', date: '2026-08-20', type: 'MP', cls: 'HT', by: 'S. Volkov', smu: 7000,
  items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 'C', photos: 1 }],
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(BUNDLED + '()');
  await p.waitForTimeout(300);

  const setup = await p.evaluate(a => {
    const [rec0, px] = a;
    try { localStorage.setItem('cm_dash_who', 'R. Marrero'); } catch (e) {}
    CMDash.importRecords([rec0]);
    const rec = RECS.find(x => x.equip === 'TK901');
    const it = rec.items[0];
    const name = photoBases(it, rec)[0] + '.jpg';
    CMDrive.configured = () => true;
    CMDrive.names = () => [name];
    CMDrive.hasName = n => n === name;
    CMDash.addPhoto(name, px);
    window.__saved = [];
    CMDrive.saveEdit = d => { window.__saved.push(JSON.parse(JSON.stringify(d)));
                              return Promise.resolve({ ok: true }); };
    const med = mediaOf(it, rec);
    openLB(med.map(m => [m.src, m.kind]), 0, '4C', { rk: ekOf(rec), ik: '4C', name });
    pxOpenPanel();
    return { rk: ekOf(rec), name, open: !$('pxPanel').classList.contains('hidden') };
  }, [REC, PX]);
  ok(setup.open, 'the editor opens on a photograph', setup.name);

  const draft = () => p.evaluate(() => ({
    rot: pxDraft.rot, straighten: pxDraft.straighten,
    crop: pxDraft.crop ? pxDraft.crop.ratio || 'free' : null,
    undo: pxUndo.length, redo: pxRedo.length,
    undoOff: $('pxUndo').disabled, redoOff: $('pxRedo').disabled,
    strCtl: $('pxStr').value, ratioCtl: $('pxRatio').value,
  }));

  console.log('\n1. UNDO AND REDO, ONE STEP PER DECISION');
  {
    const d0 = await draft();
    ok(d0.undoOff && d0.redoOff, 'nothing to undo before anything is done',
       `undo ${d0.undo} redo ${d0.redo}`);
  }
  await p.evaluate(() => $('pxRotR').click());
  await p.evaluate(() => $('pxRotR').click());
  {
    const d = await draft();
    ok(d.rot === 180, 'two turns to the right is 180°', String(d.rot));
    ok(d.undo === 2 && !d.undoOff, 'two steps to undo', String(d.undo));
  }
  await p.evaluate(() => $('pxUndo').click());
  {
    const d = await draft();
    ok(d.rot === 90, 'one undo takes back one turn', String(d.rot));
    ok(d.redo === 1 && !d.redoOff, 'and offers to put it back', String(d.redo));
  }
  await p.evaluate(() => $('pxRedo').click());
  ok((await draft()).rot === 180, 'redo puts it back');
  await p.evaluate(() => { $('pxUndo').click(); $('pxUndo').click(); });
  {
    const d = await draft();
    ok(d.rot === 0, 'undoing everything returns the original framing', String(d.rot));
    ok(d.undoOff, 'and there is nothing further to undo');
  }

  console.log('\n2. THE CONTROLS FOLLOW, OR THE PICTURE AND THE NUMBER DISAGREE');
  await p.evaluate(() => { $('pxStr').dispatchEvent(new Event('pointerdown', { bubbles: true }));
                           $('pxStr').value = '4';
                           $('pxStr').dispatchEvent(new Event('input', { bubbles: true })); });
  {
    const d = await draft();
    ok(d.straighten === 4, 'the slider straightens the picture', String(d.straighten));
    ok(d.undo === 1, 'and a whole drag is one step, not one per pixel', String(d.undo));
  }
  await p.evaluate(() => $('pxUndo').click());
  {
    const d = await draft();
    ok(d.straighten === 0, 'undo takes the straighten back', String(d.straighten));
    ok(String(d.strCtl) === '0', 'AND THE SLIDER MOVES WITH IT', String(d.strCtl));
  }
  await p.evaluate(() => { $('pxRatio').value = '1'; $('pxRatio').dispatchEvent(new Event('change', { bubbles: true })); });
  {
    const d = await draft();
    ok(d.crop === '1', 'a ratio sets a crop', String(d.crop));
    await p.evaluate(() => $('pxUndo').click());
    const d2 = await draft();
    ok(d2.crop === null, 'undo removes it', String(d2.crop));
    ok(d2.ratioCtl === '', 'and the ratio control follows too', `"${d2.ratioCtl}"`);
  }

  console.log('\n3. A DIFFERENT PHOTOGRAPH IS A DIFFERENT HISTORY');
  await p.evaluate(() => { $('pxRotR').click(); });
  ok((await draft()).undo === 1, 'one step on this frame');
  /* pxSync() is what the lightbox calls when the frame changes. Calling
     pxUndoClear() here instead would be the test asking the thing it is testing
     to prove itself. */
  await p.evaluate(() => pxSync());
  ok((await draft()).undo === 0, 'and it does not survive onto another frame');

  console.log('\n4. EVERY SAVE KEEPS THE ONE BEFORE IT');
  const save = (turns) => p.evaluate(n => {
    for (let i = 0; i < n; i++) $('pxRotR').click();
    $('pxSave').click();
  }, turns);
  await save(1);
  await p.waitForTimeout(500);
  {
    const m = await p.evaluate(a => (pxAll(a[0])[a[1]] || null), [setup.rk, setup.name]);
    ok(!!m, 'the first edit is stored', m ? 'stored' : 'nothing');
    ok(m && m.v === 1, 'as version 1', String((m || {}).v));
    ok(m && Array.isArray(m.hist) && m.hist.length === 0,
       'with no earlier version behind it', JSON.stringify((m || {}).hist));
    ok(!!(m && m.by && m.at), 'carrying who edited it and when', `${(m||{}).by} ${(m||{}).at}`);
  }
  await save(1);
  await p.waitForTimeout(500);
  {
    const m = await p.evaluate(a => (pxAll(a[0])[a[1]] || null), [setup.rk, setup.name]);
    ok(m && m.v === 2, 'the second edit is version 2', String((m || {}).v));
    ok(m && m.hist.length === 1, 'and the first is kept behind it', String((m || {}).hist.length));
    const h = m && m.hist[0];
    ok(!!(h && h.by && h.at), 'with its own editor and timestamp', `${(h||{}).by} ${(h||{}).at}`);
    ok(!!(h && typeof h.rot === 'number'), 'and the recipe it used', JSON.stringify(h || {}));
    ok(h && h.rot !== m.rot, 'which is not the same as the current one',
       `${(h||{}).rot} then, ${(m||{}).rot} now`);
  }

  console.log('\n5. AND THE ORIGINAL IS NEVER ONE OF THE VERSIONS');
  {
    const orig = await p.evaluate(a => {
      const [rk, name] = a;
      const m = pxAll(rk)[name];
      return { recipeOnly: !!m && !m.data && !m.bytes && !m.blob,
               src: m && m.src,
               fileUntouched: (() => { try { return !!(folderPhotos || {})[name]; } catch (e) { return false; } })(),
               compare: !!document.getElementById('pxCompare') };
    }, [setup.rk, setup.name]);
    ok(orig.recipeOnly, 'what is stored is a recipe, never a second copy of the picture',
       JSON.stringify(orig));
    ok(orig.src === setup.name, 'pointing at the file it renders from', orig.src);
    ok(orig.fileUntouched, 'and the file itself is still there, unedited');
    ok(orig.compare, 'with Show original one press away');
  }

  ok(errs.length === 0, 'nothing threw throughout', errs.slice(0, 2).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED\n` : '\nall passed\n');
  process.exit(fails.length ? 1 : 0);
})();
