/* THE LUBRICATION ROUND'S WHOLE ANSWER, AT THE MOMENT OF SAVE.

   A compartment on a lubrication round holds three facts and no others: what
   is in it, how we know, and whether a sample was drawn. Every other round
   type answers with a grade or a millimetre; this one answers with those.

   The Save handler copied the draft into the record field by field, from an
   explicit list — and the list did not mention them. Product, evidence and
   sample flag stopped existing the instant an inspector pressed Save. The
   round still saved. It still queued, still uploaded, still printed, still
   appeared on the dashboard. Empty. Every route out of the phone reads these
   off the RECORD, so all four carried an empty round and not one of them could
   tell, because nothing had failed — a real value had simply been rendered as
   nothing.

   Reopening a saved round to fix a typo had the same hole in the other
   direction: the draft was rebuilt from the same kind of list, so the edit
   screen came up blank and the next Save wrote the blanks back over the record.

   Run: node tests/lubekeep.cjs   (serves the repo itself on 8093) */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:' + (process.env.CMPORT || '8093') + '/mobile/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 412, height: 915 } });
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForTimeout(1700);

  const r = await p.evaluate(async () => {
    const unit = (window.ASSETS || []).find(a => (lubeComps(a.n) || []).length);
    if (!unit) return { err: 'no unit on the register has lube compartments' };
    const k = String(lubeComps(unit.n)[0].k);
    const prod = ((typeof lubeRegister === 'function' ? lubeRegister() : [])[0] || {}).p
      || 'Mobil Delvac 1 5W-40';
    type = 'LUBE'; curEquip = unit.n; eqClass = unit.cls || '';
    document.getElementById('date').value = '2026-08-20';
    document.getElementById('inspector').value = 'R. Marrero';
    document.getElementById('smu').value = '12000';
    draft = { positions: {} };
    draft.positions[k] = { prod, evid: 'label', samp: true };
    curItem = k;
    /* saveCur() rebuilds the position from the DOM of a screen this test never
       opened; the draft above IS the inspector's answer. */
    /* The machine overview every round now carries — see tests/overview.cjs. */
    { const bytes=new Uint8Array([0xff,0xd8,0xff,0xdb,1,2,3,4,5,6,7,8,9,0xff,0xd9]); const g=(draft.positions[GEN_KEY] ||= {});
      for(const s of machineSlots(type)) if(s.req && !genPhotos(draft,s.cat).length) addPos(g, attWrap(new File([bytes], s.cat+'.jpg',{type:'image/jpeg'})), s.cat); }
    const real = window.saveCur; window.saveCur = () => {};
    document.getElementById('saveBtn').click();
    await new Promise(r2 => setTimeout(r2, 900));
    window.saveCur = real;

    const rec = (await dbAll()).find(x => x.type === 'LUBE');
    const pos = rec ? (rec.positions[k] || {}) : {};
    /* And what leaves the phone on the wire. */
    const wire = rec ? (recToExport(rec).items || []).find(i => i.key === k) || {} : {};
    /* And what comes back when the round is reopened to be corrected. */
    let back = {};
    if (rec) { editRecord(rec); back = draft.positions[k] || {}; }
    return { unit: unit.n, key: k, prod, saved: !!rec, pos, wire, back };
  });

  ok('a machine with lubrication compartments exists', !r.err, r.err || r.unit);
  if (!r.err) {
    ok('the round saved', r.saved);
    ok('the product survives the save', r.pos.prod === r.prod, JSON.stringify(r.pos.prod));
    ok('the evidence survives the save', r.pos.evid === 'label', JSON.stringify(r.pos.evid));
    ok('the sample flag survives the save', !!r.pos.samp, JSON.stringify(r.pos.samp));

    ok('the product reaches the wire', r.wire.lubeProduct === r.prod, JSON.stringify(r.wire.lubeProduct));
    ok('the evidence reaches the wire', r.wire.lubeEvidence === 'label', JSON.stringify(r.wire.lubeEvidence));
    ok('the sample flag reaches the wire', !!r.wire.lubeSampled, JSON.stringify(r.wire.lubeSampled));

    ok('reopening the round shows the product back', r.back.prod === r.prod, JSON.stringify(r.back.prod));
    ok('reopening the round shows the evidence back', r.back.evid === 'label', JSON.stringify(r.back.evid));
    ok('reopening the round shows the sample flag back', !!r.back.samp, JSON.stringify(r.back.samp));
  }
  ok('no page errors', !errs.length, errs.slice(0, 2).join(' | '));

  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
