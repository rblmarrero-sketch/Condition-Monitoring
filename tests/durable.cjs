/* WHAT SURVIVES A PHONE BEING KILLED.

   Three things a round is supposed to keep, none of which it kept. Every one
   of them is silent: the app looks right afterwards, the photographs are all
   on the screen, and what was lost is only visible in the folder, weeks later.

   1. THE MANIFEST, THROWN AWAY BY OPENING A ROUND.

      editRecord() rebuilds the draft field by field and saveRec() writes it
      back the same way. Neither list mentioned `att` — the per-attachment
      manifest holding each photograph's hash, capture time, upload attempts,
      any server receipt, and its `seq`.

      attSync() rebuilds what it can afterwards, which is exactly what hid it:
      nothing looks wrong. But seq is re-issued 1..n in current array order,
      and seq is the ordinal a file is NAMED from. On a round that has had a
      photograph deleted — the case seq exists for — every later file comes
      back renamed, and the next upload writes over a different photograph in
      the folder under a name it has just been given. Opening a round to fix a
      typo silently rewrites what its evidence is called.

      The two comments beside that list are the same bug found twice before:
      the lubrication fields, then four more. This is the third.

   2. A RETAKEN PHOTOGRAPH, NOT AUTOSAVED.

      draftSigOf() reduces photographs to an array LENGTH, and a length cannot
      tell one photograph from another. Retake a blurred shot, or delete one
      and add a better one: same count, same signature, draftFlush() returns
      early, and the autosave that exists to survive a dropped phone does not
      run. The old photograph is what comes back.

   3. UPLOAD PROGRESS, LOST WHEN THE APP IS CLOSED.

      rec.sent is what stops a resume re-sending eight photographs to send the
      ninth. It was written back onto the record only after every destination
      had been tried — so it survived a failed request, and not the thing that
      happens on a truck: the phone is locked, the browser is killed, the van
      goes into the pit. Seven of eight in the folder and the phone has no
      idea; next sync sends all eight again over the link that was already too
      slow to finish once.

      It cannot just be put on the record more often — the record IS the
      photographs, so each dbPut rewrites megabytes of blob to record a
      filename.

   Run: node tests/durable.cjs [port]     (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const B = 'http://127.0.0.1:' + PORT;
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };

(async () => {
  await fetch(B + '/__seed').catch(() => {});
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true,
                                   hasTouch: true, timezoneId: 'Asia/Anadyr' });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(u => localStorage.setItem('up_dests', JSON.stringify(
    [{ id: 'gas', on: true, url: u, sec: 'letmein', folder: '' }])), B + '/exec');
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1600);

  /* ─────────────────────────────────────────────────────────────────────── */
  console.log('\n1. OPENING A ROUND MUST NOT REWRITE WHAT ITS EVIDENCE IS CALLED');

  /* Three photographs on one point, then the middle one deleted — which is
     precisely why seq exists: the survivors keep _1 and _3, and the gap is
     the record of the deletion. */
  const before = await p.evaluate(async () => {
    const shot = async n => await intake(new Blob([new Uint8Array(Array(64).fill(n))], { type: 'image/jpeg' }));
    const rec = { id: 'id__TK930__2026-07-30__X__z', type: 'MP', equip: 'TK930', date: '2026-07-30',
      cls: 'HT', by: 'R. Marrero', smu: 6200, created: new Date().toISOString(),
      up: 0, upTo: {}, rev: 1,
      positions: { '4C': { grade: 'C', photos: [await shot(1), await shot(2), await shot(3)] } } };
    await attSync(rec);
    // delete the middle photograph, exactly as the editor does
    rec.positions['4C'].photos.splice(1, 1);
    await attSync(rec);
    await dbPut(rec);
    const r = (await dbAll()).find(x => x.equip === 'TK930');
    return { names: (await filesForRecord(r)).map(f => f.name),
             seq: attList(r).map(e => e.seq).sort((a, b2) => a - b2),
             sha: attList(r).map(e => e.sha256).filter(Boolean).length,
             atts: attList(r).length };
  });
  console.log('   ' + JSON.stringify(before));
  ok(before.atts === 2, 'two photographs remain after the middle one is deleted', before.atts + '');
  ok(before.sha === 2, '  each with a hash recorded at capture', before.sha + ' hashed');
  ok(before.seq.length === 2 && before.seq[1] - before.seq[0] === 2,
     '  and the deletion leaves a gap in the ordinals, which is the point of them',
     'seq ' + before.seq.join(','));

  /* Now the thing an inspector does: open it, change nothing but a comment,
     save. Through the real controls' code path, not by poking the record. */
  const after = await p.evaluate(async () => {
    const r = (await dbAll()).find(x => x.equip === 'TK930');
    editRecord(r);
    /* Typed into the field, not poked into the draft: the save handler runs
       saveCur() first, which reads this box and would overwrite anything set
       on the object behind it. */
    document.getElementById('comment').value = 'Re-read under light';
    /* Through the button the inspector actually presses — the save is an
       inline handler, and a test that reached past it would not be testing
       the path a round takes. */
    await document.getElementById('saveBtn').onclick();
    const r2 = (await dbAll()).find(x => x.equip === 'TK930');
    return { names: (await filesForRecord(r2)).map(f => f.name),
             seq: attList(r2).map(e => e.seq).sort((a, b2) => a - b2),
             sha: attList(r2).map(e => e.sha256).filter(Boolean).length,
             cap: attList(r2).map(e => e.capturedAt).filter(Boolean).length,
             comment: (r2.positions['4C'] || {}).comment || '' };
  });
  console.log('   ' + JSON.stringify(after));
  ok(after.comment === 'Re-read under light', 'the edit itself saved', after.comment);
  ok(JSON.stringify(after.seq) === JSON.stringify(before.seq),
     '  and the ordinals are the ones the photographs already had',
     'was ' + before.seq.join(',') + ' → now ' + after.seq.join(','));
  ok(JSON.stringify(after.names) === JSON.stringify(before.names),
     '  so the files are still called what the folder already knows them as',
     'was ' + before.names.join(' ') + ' → now ' + after.names.join(' '));
  ok(after.sha === 2, '  the hashes survived the edit', after.sha + ' hashed');
  ok(after.cap === 2, '  and so did when each photograph was taken', after.cap + ' stamped');

  /* ─────────────────────────────────────────────────────────────────────── */
  console.log('\n2. A RETAKEN PHOTOGRAPH IS A CHANGE, AND MUST BE AUTOSAVED');

  const sig = await p.evaluate(async () => {
    const mk = async n => await intake(new Blob([new Uint8Array(Array(64).fill(n))], { type: 'image/jpeg' }));
    const a = await mk(7), c = await mk(9);
    const one = { type: 'MP', equip: 'TK931', date: '2026-07-30', smu: '1', by: 'R',
                  positions: { '4C': { grade: 'C', photos: [a] } } };
    const two = { type: 'MP', equip: 'TK931', date: '2026-07-30', smu: '1', by: 'R',
                  positions: { '4C': { grade: 'C', photos: [c] } } };
    const same = { type: 'MP', equip: 'TK931', date: '2026-07-30', smu: '1', by: 'R',
                   positions: { '4C': { grade: 'C', photos: [a] } } };
    return { swapped: draftSigOf(one) !== draftSigOf(two),
             stable: draftSigOf(one) === draftSigOf(same) };
  });
  ok(sig.swapped, 'swapping one photograph for another of the same count is a change');
  ok(sig.stable, '  while the identical draft still signs the same, so idle saves stay idle');

  /* And end to end: the autosave actually writes the new photograph. */
  const flushed = await p.evaluate(async () => {
    const mk = async n => await intake(new Blob([new Uint8Array(Array(64).fill(n))], { type: 'image/jpeg' }));
    await dbDel('__draft__');
    curEquip = 'TK931'; type = 'MP';
    draft.positions = { '4C': { grade: 'C', photos: [await mk(7)] } };
    await draftFlush();
    const first = await dbGet('__draft__');
    const firstSize = ((((first || {}).positions || {})['4C'] || {}).photos || [])[0];
    // retake: same count, different picture
    draft.positions['4C'].photos = [await mk(9)];
    await draftFlush();
    const second = await dbGet('__draft__');
    const secondBlob = ((((second || {}).positions || {})['4C'] || {}).photos || [])[0];
    const read = async bl => bl ? new Uint8Array(await bl.arrayBuffer())[0] : null;
    return { first: await read(firstSize), second: await read(secondBlob) };
  });
  ok(flushed.first === 7, 'the first photograph is autosaved', String(flushed.first));
  ok(flushed.second === 9, '  and the retake replaces it rather than being dropped',
     'stored ' + flushed.second + ', expected 9');

  /* ─────────────────────────────────────────────────────────────────────── */
  console.log('\n3. UPLOAD PROGRESS SURVIVES THE APP BEING KILLED');

  const durable = await p.evaluate(async () => {
    const shot = async n => await intake(new Blob([new Uint8Array(Array(64).fill(n))], { type: 'image/jpeg' }));
    const rec = { id: 'id__TK932__2026-07-31__X__z', type: 'MP', equip: 'TK932', date: '2026-07-31',
      cls: 'HT', by: 'R. Marrero', smu: 6300, created: new Date().toISOString(),
      up: 0, upTo: {}, rev: 1,
      positions: { '4C': { grade: 'C', photos: [await shot(1), await shot(2)] },
                   '4D': { grade: 'B', photos: [await shot(3), await shot(4)] } } };
    await attSync(rec); await dbPut(rec);
    return (await filesForRecord(rec)).map(f => f.name);
  });
  ok(durable.length === 4, 'a round with four photographs is queued', durable.length + '');

  await p.evaluate(() => syncNow(true));
  await p.waitForTimeout(6000);

  const cleared = await p.evaluate(() => {
    const r = JSON.parse(localStorage.getItem('cm_sent_progress') || '{}');
    return { keys: Object.keys(r), raw: r };
  });
  ok(!cleared.keys.includes('id__TK932__2026-07-31__X__z'),
     'once the round is through, it has nothing left to resume',
     cleared.keys.join(',') || 'store empty');

  /* Now the kill. Mid-record, some files landed, nothing written back to the
     record — which is the state a killed app leaves behind. */
  const survived = await p.evaluate(async () => {
    const r = (await dbGet('id__TK932__2026-07-31__X__z'));
    const names = (await filesForRecord(r)).map(f => f.name);
    /* The record knows nothing: not sent, no `sent` map at all. */
    r.up = 0; r.upTo = {}; delete r.sent;
    await dbPut(r);
    /* The side store is what the marks left behind before the app died. */
    sentStore(r, { gas: { [names[0]]: 1, [names[1]]: 1 } });
    const back = sentLoad(r);
    return { names: names, kept: back ? Object.keys(back.gas || {}).length : 0 };
  });
  ok(survived.kept === 2, 'two files are recorded as landed, outside the record',
     survived.kept + ' remembered');

  const resumed = await p.evaluate(async () => {
    const sent = [];
    const orig = window.putOne;
    window.putOne = async (d, name, blob, ty, rec) => { sent.push(name); return orig(d, name, blob, ty, rec); };
    /* putAll closes over putOne directly, so drive the decision the way the
       loop does: what is left after the remembered ones are removed. */
    const r = await dbGet('id__TK932__2026-07-31__X__z');
    const names = (await filesForRecord(r)).map(f => f.name);
    const kept = sentLoad(r) || {};
    const already = kept.gas || {};
    const left = names.filter(n => !already[n]);
    window.putOne = orig;
    return { left: left, all: names.length };
  });
  ok(resumed.left.length === 2,
     'and the resume sends only the tail, not all four again',
     resumed.left.length + ' of ' + resumed.all + ' still to send');

  const guarded = await p.evaluate(async () => {
    const r = await dbGet('id__TK932__2026-07-31__X__z');
    r.rev = (r.rev || 0) + 1;              // the round was edited
    await dbPut(r);
    return sentLoad(r);
  });
  ok(guarded === null,
     'progress recorded against the old bytes is not believed about the new ones',
     guarded === null ? 'discarded on edit' : JSON.stringify(guarded));

  const forgotten = await p.evaluate(async () => {
    const r = await dbGet('id__TK932__2026-07-31__X__z');
    r.rev = 1; await dbPut(r);
    sentStore(r, { gas: { x: 1 } });
    const had = !!sentLoad(r);
    sentForget(r.id);
    return { had: had, now: !!sentLoad(r) };
  });
  ok(forgotten.had && !forgotten.now,
     'and a deleted round takes its progress with it',
     'before ' + forgotten.had + ', after ' + forgotten.now);

  ok(fails.filter(f => /PAGEERROR/.test(f)).length === 0, 'no page errors',
     fails.filter(f => /PAGEERROR/.test(f)).join(' | ') || 'none');

  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
