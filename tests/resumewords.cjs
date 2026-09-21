/* THE BUTTON THAT DELETES A DRAFT USED TO SAY "KEEP IT."

   ask()'s Cancel button was hardcoded to always read "Keep it" — correct
   for the delete-round dialog it was written for (declining really does
   keep the round), and never checked against the OTHER caller that reuses
   the identical button: offerDraft()'s "Carry on where you left off?".
   There, an explicit press of "Keep it" runs dbDel(DRAFT_ID) — the OPPOSITE
   of what its own label says, and the opposite of what Esc/the backdrop do
   on the identical dialog (dismissal truly does keep it, per ask()'s own
   comment). Technicians reported exactly this: unsure whether "Keep it"
   beside "Carry on" meant continue or discard.

   ask() now takes an optional cancelLabel/cancelDanger pair; offerDraft()
   passes "Discard it" and marks it as the destructive button. Every OTHER
   ask() caller (the delete-round dialog, at minimum) is untouched and still
   says "Keep it".

   Run: node tests/resumewords.cjs */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, new URL(req.url, 'http://x').pathname);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(fs.readFileSync(f));
});

async function plantDraft(p) {
  await p.evaluate(async () => {
    const d = await idb();
    await new Promise((res, rej) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ id: DRAFT_ID, equip: 'TK900', type: 'MP', date: '2026-09-21',
        positions: { '1': { photos: [] } }, created: new Date().toISOString() });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  });
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(APP, { waitUntil: 'load' });
  await p.waitForTimeout(1200);

  console.log('1. the resume-draft dialog reads honestly');
  await plantDraft(p);
  await p.evaluate(() => { window.__offerP = offerDraft(); });
  await p.waitForTimeout(500);
  ok('the title asks the real question', (await p.textContent('#dlgTitle')).includes('Carry on'));
  ok('the resume button says Carry on', (await p.textContent('#dlgOk')).trim() === 'Carry on');
  ok('the decline button says Discard it, never Keep it',
    (await p.textContent('#dlgCancel')).trim() === 'Discard it');
  ok('the decline button is styled as the destructive one',
    (await p.evaluate(() => document.getElementById('dlgCancel').className)).includes('danger'));

  console.log('\n2. "Discard it" genuinely discards the draft');
  await p.click('#dlgCancel');
  await p.evaluate(() => window.__offerP);
  await p.waitForTimeout(300);
  ok('the draft record is actually gone after Discard it',
    await p.evaluate(async () => !(await dbGet(DRAFT_ID))));

  console.log('\n3. "Carry on" genuinely restores the draft, and keeps the record');
  await plantDraft(p);
  await p.evaluate(() => { window.__offerP = offerDraft(); });
  await p.waitForTimeout(500);
  await p.click('#dlgOk');
  await p.evaluate(() => window.__offerP);
  await p.waitForTimeout(300);
  ok('the draft is loaded into the working round',
    (await p.evaluate(() => (typeof curEquip !== 'undefined' ? curEquip : null))) === 'TK900');
  ok('the draft record is still there — Carry on never deletes it',
    await p.evaluate(async () => !!(await dbGet(DRAFT_ID))));

  console.log('\n4. Esc/the backdrop keep the draft — the true "keep it" — and never delete it');
  await plantDraft(p);
  await p.evaluate(() => { window.__offerP = offerDraft(); });
  await p.waitForTimeout(500);
  await p.keyboard.press('Escape');
  await p.evaluate(() => window.__offerP);
  await p.waitForTimeout(300);
  ok('a dismissal (Esc) leaves the draft alone, unlike an explicit Discard it',
    await p.evaluate(async () => !!(await dbGet(DRAFT_ID))));

  console.log('\n5. the delete-round dialog is untouched — it still says Keep it');
  const delLabel = await p.evaluate(() => t('dlg_cancel'));
  ok('dlg_cancel — the shared default the delete-round dialog reads — is still "Keep it"',
    delLabel === 'Keep it', delLabel);

  console.log('\nno page errors or console errors throughout',
    fails.filter(f => /^PAGEERROR|^CONSOLE/.test(f)).length === 0
      ? '' : fails.filter(f => /^PAGEERROR|^CONSOLE/.test(f)).join(' | '));

  await b.close();
  srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n- ${fails.join('\n- ')}` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
