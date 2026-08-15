/* Three things a user asked about on the same afternoon.

   1. "It says nothing was found, but still in the system." Delete permanently
      trashes files in Drive. A round that is not in Drive cannot be, and the
      request came back "Nothing found for DZ004|2026-08-02|UC" — true, useless,
      and the row stayed on the screen, which reads as the delete having failed.

   2. "Do I need to Load from Drive every time?" No. A page in a browser cannot
      be pushed to, but it can ask on its own, and now does.

   3. "Are the units up to date — DR011?" DR011 is genuinely not in the
      register; the app falls back to the DR-prefix class so a drill arriving
      before the paperwork still gets a drill's component tree. Eight units WERE
      in the register under a mangled number. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const boot = async (p, url) => {
  await p.evaluate(u => {
    if (u) { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', ''); }
    /* An empty string, not a removal. Removing it means "this browser has
       never been set up", which now takes the shared default from
       upload-defaults.js — the state under test is "somebody turned Drive
       off here", and that is what an empty value means. */
    else { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('cm_drive_sec', ''); }
    localStorage.removeItem('cm_dash_drive'); localStorage.removeItem('cm_drive_cursor');
    localStorage.removeItem('cm_dash_records'); localStorage.removeItem('cm_dash_edits');
  }, url);
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1500);
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1500);

  console.log('  a round that only ever existed here, on a dashboard with no Drive');
  await boot(p, null);
  await p.evaluate(() => window.CMDash.importRecords([{
    equip: 'DZ004', date: '2026-08-02', type: 'UC', cls: 'DOZ', by: 'R. Marrero',
    items: [{ key: 'IDLER.L', label: 'Idler — Left', sev: 'CRI', mm: 81 }] }]));
  await p.waitForTimeout(600);
  const before = await p.evaluate(() => window.CMDash.allRecs().filter(r => r.equip === 'DZ004').length);
  ok('it is on the screen to begin with', before === 1, String(before));

  const del = await p.evaluate(async () => {
    openEdit('DZ004|2026-08-02|UC');
    document.getElementById('edBy').value = 'R. Marrero';
    document.getElementById('edConfirm').value = 'DZ004';
    document.getElementById('edDelete').click();
    await new Promise(r => setTimeout(r, 800));
    return { msg: document.getElementById('edMsg').textContent,
      left: window.CMDash.allRecs().filter(x => x.equip === 'DZ004').length };
  });
  ok('it is gone from the dashboard', del.left === 0, del.left + ' left');
  ok('and it says why there was nothing else to delete', /No Google Drive is set up|only in this browser/i.test(del.msg),
    del.msg.trim().slice(0, 110));
  ok('no "Nothing found" left staring at the reader', !/nothing found/i.test(del.msg));

  console.log('\n  with Drive configured, the script is asked even about an imported round');
  await boot(p, B + '/exec');
  await p.evaluate(() => window.CMDash.importRecords([{
    equip: 'DZ004', date: '2026-08-02', type: 'UC', cls: 'DOZ', by: 'R. Marrero',
    items: [{ key: 'IDLER.L', label: 'Idler — Left', sev: 'CRI', mm: 81 }] }]));
  await p.waitForTimeout(500);
  const asked = await p.evaluate(async () => {
    let sent = null;
    const real = window.CMDrive.remove;
    window.CMDrive.remove = (...a) => { sent = a[0]; return real.apply(null, a); };
    openEdit('DZ004|2026-08-02|UC');
    document.getElementById('edBy').value = 'R. Marrero';
    document.getElementById('edConfirm').value = 'DZ004';
    document.getElementById('edDelete').click();
    await new Promise(r => setTimeout(r, 1200));
    return { sent, msg: document.getElementById('edMsg').textContent };
  });
  /* The dashboard holding it as "imported" does not mean Drive does not have it:
     the phone uploads, and this end may simply not have pulled yet. Answering
     for Drive from a cache would tell somebody their files are gone while they
     sit in the folder. */
  ok('the request goes to the script, not to a guess here', asked.sent === 'DZ004|2026-08-02|UC',
    String(asked.sent));

  console.log('\n  the same round, but Drive really has no file for it');
  await boot(p, B + '/exec');
  await p.evaluate(() => window.CMDash.setDriveRecords([{
    equip: 'DZ009', date: '2026-08-02', type: 'UC', cls: 'DOZ', by: 'R. Marrero',
    items: [{ key: 'IDLER.L', label: 'Idler — Left', sev: 'CRI', mm: 81 }] }]));
  await p.waitForTimeout(500);
  const gone = await p.evaluate(async () => {
    // the mock has no such file, so the script answers "Nothing found"
    window.CMDrive.remove = () => Promise.reject(new Error('Nothing found for DZ009|2026-08-02|UC'));
    openEdit('DZ009|2026-08-02|UC');
    document.getElementById('edBy').value = 'R. Marrero';
    document.getElementById('edConfirm').value = 'DZ009';
    document.getElementById('edDelete').click();
    await new Promise(r => setTimeout(r, 800));
    return { msg: document.getElementById('edMsg').textContent,
      left: window.CMDash.allRecs().filter(x => x.equip === 'DZ009').length };
  });
  ok('the leftover row is cleared, after a typed confirmation', gone.left === 0, gone.left + ' left');
  ok('and it says Drive was not touched', /nothing there was touched|Reload everything/i.test(gone.msg),
    gone.msg.trim().slice(0, 120));

  console.log('\n  a typo in the unit box still stops everything');
  await boot(p, null);
  await p.evaluate(() => window.CMDash.importRecords([{
    equip: 'DZ004', date: '2026-08-02', type: 'UC', cls: 'DOZ', by: 'x',
    items: [{ key: 'IDLER.L', label: 'Idler', sev: 'CRI' }] }]));
  await p.waitForTimeout(500);
  const typo = await p.evaluate(async () => {
    openEdit('DZ004|2026-08-02|UC');
    document.getElementById('edBy').value = 'R. Marrero';
    document.getElementById('edConfirm').value = 'DZ005';       // wrong unit
    document.getElementById('edDelete').click();
    await new Promise(r => setTimeout(r, 500));
    return { msg: document.getElementById('edMsg').textContent,
      left: window.CMDash.allRecs().filter(x => x.equip === 'DZ004').length };
  });
  ok('nothing is removed on a mistyped confirmation', typo.left === 1, typo.left + ' left');
  ok('and it asks for the unit number', /DZ004/.test(typo.msg), typo.msg.trim().slice(0, 80));

  console.log('\n  the dashboard keeps up with the phones on its own');
  await boot(p, B + '/exec');
  await p.evaluate(() => fetch('/__reset?n=6'));
  await p.waitForTimeout(300);
  await p.evaluate(() => { localStorage.removeItem('cm_drive_cursor'); });
  await p.reload({ waitUntil: 'load' });
  // no button pressed — the page catches up by itself on open
  await p.waitForFunction(() => window.CMDash && window.CMDash.allRecs().length > 0,
    null, { timeout: 20000 }).catch(() => {});
  const onOpen = await p.evaluate(() => window.CMDash.allRecs().length);
  ok('opening the page loads what is in Drive, unprompted', onOpen > 0, onOpen + ' inspections');

  /* A phone uploads while the tab is sitting there. The unit number has to be
     one this mock has not already been given in an earlier run of this suite —
     a repeat is deduped on key, the count never moves, and the refresh takes
     the blame for a fixture that did not change anything. */
  const nonce = 20 + (Date.now() % 500);
  await p.evaluate(n => fetch('/__reset?add=' + n), nonce);
  const grew = await p.evaluate(async n => {
    // coming back to the tab is the moment somebody wants it current
    /* The focus path is debounced — a flurry of visibility events must not
       become a flurry of requests — so keep nudging and give it past the
       debounce window before calling it a failure. */
    for (let i = 0; i < 90; i++) {
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise(r => setTimeout(r, 500));
      if (window.CMDash.allRecs().length > n) return window.CMDash.allRecs().length;
    }
    return window.CMDash.allRecs().length;
  }, onOpen);
  ok('a round uploaded from a phone arrives without a button press', grew > onOpen,
    onOpen + ' → ' + grew);
  const flash = await p.textContent('#syncFlash');
  ok('and it is said quietly, where the reader is looking', /new from Drive|\d/.test(flash || ''),
    (flash || '').trim());

  console.log('\n  it stays out of the way while a correction is open');
  const held = await p.evaluate(async () => {
    const r = window.CMDash.allRecs()[0];
    openEdit(`${r.equip}|${r.date}|${r.type}`);
    const busyBefore = document.getElementById('editOv').classList.contains('hidden');
    await fetch('/__reset?add=8');
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(res => setTimeout(res, 2500));
    return { overlayOpen: !busyBefore, stillOpen: !document.getElementById('editOv').classList.contains('hidden') };
  });
  ok('the panel is still open, not rebuilt underneath', held.overlayOpen && held.stillOpen);

  console.log('\n  the panel explains the two buttons');
  const help = await p.evaluate(() => {
    document.getElementById('editOv').classList.add('hidden');
    openData();
    const el = document.querySelector('[data-i18n="ds_btnhelp"]');
    return el ? el.textContent : '';
  });
  ok('it says the page checks by itself', /by itself|every few minutes/i.test(help), help.slice(0, 80));
  ok('it says what Reload everything is for', /deleted or renamed/i.test(help));
  ok('no markup leaked into the text', !/<b>|<\/b>/.test(help));

  console.log('\n  the asset register');
  const reg = await p.evaluate(() => {
    const A = window.ASSETS || [];
    return { n: A.length,
      dated: A.filter(a => /_\d{8}$/.test(a.n)).map(a => a.n),
      dupes: A.length - new Set(A.map(a => a.n)).size,
      dz015: A.find(a => a.n === 'DZ015') || null,
      dr011: A.find(a => a.n === 'DR011') || null,
      dr010: A.find(a => a.n === 'DR010') || null };
  });
  ok('no unit number carries a date any more', reg.dated.length === 0, reg.dated.join(' '));
  ok('and no unit number appears twice', reg.dupes === 0, String(reg.dupes));
  ok('DZ015 is a findable SHANTUI SD32 dozer',
    reg.dz015 && /SD32/.test(reg.dz015.m || '') && /DOZER/.test(reg.dz015.cat || ''),
    JSON.stringify(reg.dz015));
  ok('DR010 is the last drill the register actually knows', !!reg.dr010);
  ok('DR011 is honestly absent, not silently invented', reg.dr011 === null);

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
