const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const OUT = __dirname + '/out';
require('fs').mkdirSync(OUT, { recursive: true });

const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };
const stats = () => fetch(BASE + '/__stats').then(r => r.json());
/* "Reading inspections… 5/12" contains the word "inspection", so waiting on that
   matched mid-progress and every later assertion read a half-finished state. */
const settled = (p, ms) => p.waitForFunction(
  () => /^(✅|❌|No inspections)/.test(document.getElementById('drvMsg').textContent.trim()),
  null, { timeout: ms || 20000 });
const reset = q => fetch(BASE + '/__reset' + (q || '')).then(r => r.text());
/* The page is reused across blocks, so the previous block's "✅ …" is still in the
   box when the next click happens — settled() would match it instantly and every
   assertion would read a stale message. Blank it first, then click. */
async function act(p, sel, ms) {
  await p.evaluate(() => { document.getElementById('drvMsg').textContent = ''; });
  await p.click(sel);
  await settled(p, ms);
}

/* Open, wait out the boot catch-up with the endpoint refused, then let it
   through. Everything after this point is a cost the test actually asked for. */
const open = async (p, url) => {
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(1700);
  await p.unroute('**/exec*');
};
async function newPage(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  p.ctx = ctx;                       // the offline switch belongs to the context
  /* Refuse the script's URL until the page has finished opening.

     quiet() clears the three-minute poller and cannot reach the boot catch-up,
     which is a setTimeout armed at parse time and fires 1200 ms after load —
     deliberately, so a dashboard left open overnight is current when somebody
     walks up to it. Every counted window in this suite therefore races it, and
     four passes in five is what that looks like. Blocked at the browser, the
     boot catch-up costs nothing it can be blamed for; open() lifts it once the
     window has passed. */
  await p.route('**/exec*', r => r.abort());
  return p;
}
/* Stop the page checking Drive on its own for the duration of a counted
   window.

   Every request-count check here means "what does pressing this button cost",
   and the dashboard also polls by itself every three minutes — by design,
   because a round uploaded from a phone should appear without anyone asking.
   This suite runs for longer than three minutes, so eventually one of those
   polls lands between a counter reset and the read that follows it and the
   button appears to have cost two calls. It did not; something else made one.

   Three passes green and the fourth red, on a machine that was busier. The
   poller, not the button. */
const quiet = p => p.evaluate(() => { try { clearInterval(autoTimer); } catch (e) {} });
const connect = (p, path) => p.evaluate(u => {
  openData();                                   // bundled data means it does not self-open
  document.getElementById('drvUrl').value = u;
  document.getElementById('drvSec').value = '';
}, BASE + path);

(async () => {
  const b = await chromium.launch();

  /* ---------- 1. first load: one call, not one per file ---------- */
  console.log('first load');
  await reset('?n=40');
  let p = await newPage(b);
  await open(p, BASE + '/dashboard/index.html');
  await connect(p, '/exec');
  await act(p, '#drvGo', 15000);
  let s = await stats();
  let msg = await p.textContent('#drvMsg');
  ok('40 inspections arrive in ONE request', s.records === 1 && s.file === 0,
     `records=${s.records} file=${s.file} list=${s.list}`);
  ok('and the dashboard says so', /40 new inspection/.test(msg), msg.trim());
  ok('records reach the tables', (await p.evaluate(() => CMDash.driveCount())) === 40);
  ok('the photo index came along', (await p.evaluate(() => CMDrive.indexed())) === 40,
     String(await p.evaluate(() => CMDrive.indexed())));
  ok('the Drive card owns them, not "Import a file"',
     /40 inspection/.test(await p.textContent('#stDrive')) && (await p.textContent('#stFile')).trim() === '—',
     `drive="${await p.textContent('#stDrive')}" file="${await p.textContent('#stFile')}"`);

  /* ---------- 2. refresh with nothing new ---------- */
  console.log('\nrefresh, nothing new');
  await quiet(p).catch(()=>{});
  await reset();
  await act(p, '#drvGo', 15000);
  s = await stats(); msg = await p.textContent('#drvMsg');
  ok('costs one request and reads no files', s.records === 1 && s.file === 0, `records=${s.records} file=${s.file}`);
  ok('says "up to date", not "0 loaded"', /Up to date/.test(msg), msg.trim());
  ok('nothing is lost', (await p.evaluate(() => CMDash.driveCount())) === 40);

  /* ---------- 3. one new inspection ---------- */
  console.log('\none new inspection appears in Drive');
  await quiet(p).catch(()=>{});
  await reset('?add=1');
  await act(p, '#drvGo', 15000);
  ok('only the new one comes down', (await p.evaluate(() => CMDash.driveCount())) === 41,
     String(await p.evaluate(() => CMDash.driveCount())));
  ok('and it is in the fleet table',
     (await p.textContent('#fleetTbl')).includes('TK901'));

  /* ---------- 4. survives a reload without touching the network ---------- */
  console.log('\nreopening the dashboard');
  await quiet(p).catch(()=>{});
  await reset();
  /* The dashboard deliberately catches up 1200 ms after open, and quiet() only
     clears the three-minute poller — the boot catch-up is a setTimeout armed
     at parse time and nothing here could reach it. Every previous attempt to
     time the read against it (load + 500 ms, then "wait for the cache to
     land") lost on a busy machine and reported a deliberate request as a
     defect: three passes green and the fourth red, with nothing wrong.

     So the counted window is enforced instead of timed. The script's own URL
     is refused at the browser, which is what a reload with no signal looks
     like — it never reaches the server, so the counters cannot move, and the
     cache still has to be on screen underneath. Cutting the whole context
     offline would have been simpler and does not work: the dashboard is not
     a service-worker app, so the reload itself fails. */
  await p.route('**/exec*', r => r.abort());
  await p.reload({ waitUntil: 'load' });
  /* Measure the instant the cache is on screen, not after an arbitrary sleep.
     The scheduled catch-up is armed at script-parse time, which is BEFORE
     'load' resolves — so "load + 500ms" is a race against a 1200ms timer that
     started earlier, and on a busy machine it loses. Three passes won that
     race and the fourth did not, which is exactly what a flake looks like
     while it is still pretending to be a bug. The requirement never mentioned
     half a second: it is that the cached rounds are readable before anything
     is fetched. */
  await p.waitForFunction(() => window.CMDash && CMDash.driveCount() > 0,
                          null, { timeout: 10000 });
  s = await stats();
  ok('cached inspections are there before any request', (await p.evaluate(() => CMDash.driveCount())) === 41,
     String(await p.evaluate(() => CMDash.driveCount())));
  ok('opening the dashboard costs nothing', s.records === 0 && s.list === 0 && s.file === 0,
     JSON.stringify(s));
  ok('the status chip credits Drive', /Drive/.test(await p.textContent('#srcText')),
     (await p.textContent('#srcText')).trim());
  await p.unroute('**/exec*');
  await p.screenshot({ path: OUT + '/drv-loaded.png' });

  /* ---------- 5. Reload everything ---------- */
  console.log('\nReload everything');
  /* The dashboard makes ONE scheduled catch-up shortly after open — by design,
     so a tab left on a wall screen stays current. Zeroing the counters before
     it has happened measures that timer as well as the button, and the number
     under test is what the BUTTON costs. Let the scheduled one land first. */
  await p.waitForTimeout(1600);
  await quiet(p).catch(()=>{});
  await reset();
  await p.evaluate(() => openData());
  await act(p, '#drvFull', 20000);
  s = await stats();
  ok('re-reads the whole folder in one request', s.records === 1, `records=${s.records}`);
  ok('and ends with the same count', (await p.evaluate(() => CMDash.driveCount())) === 41,
     String(await p.evaluate(() => CMDash.driveCount())));
  await p.screenshot({ path: OUT + '/drv-sources.png' });
  await p.context().close();

  /* ---------- 6. paging when the folder is huge ---------- */
  console.log('\na folder too big for one reply');
  await reset('?n=1500');
  p = await newPage(b);
  await open(p, BASE + '/dashboard/index.html');
  await connect(p, '/exec');
  await act(p, '#drvGo', 60000);
  s = await stats();
  ok('pages through with the cursor', (await p.evaluate(() => CMDash.driveCount())) === 1500,
     `${await p.evaluate(() => CMDash.driveCount())} records in ${s.records} calls`);
  // renderHistory() pulls the selected unit's photos — a handful, not 1500.
  ok('still far fewer calls than files', s.records <= 4 && s.file < 20,
     `records=${s.records} photoFetches=${s.file}`);
  await p.context().close();

  /* ---------- 7. an /exec that was never redeployed ---------- */
  console.log('\nold deployment (no batch action)');
  await quiet(p).catch(()=>{});
  await reset('?n=12');
  p = await newPage(b);
  await open(p, BASE + '/dashboard/index.html');
  await connect(p, '/old');
  await act(p, '#drvGo', 30000);
  s = await stats(); msg = await p.textContent('#drvMsg');
  ok('falls back instead of failing', (await p.evaluate(() => CMDash.driveCount())) === 12,
     String(await p.evaluate(() => CMDash.driveCount())));
  ok('using the old list+file path', s.list === 1 && s.file === 12, `list=${s.list} file=${s.file}`);
  ok('and tells you to redeploy', /New version/.test(msg), msg.trim().slice(0, 120));

  console.log('\nTest connection on an old deployment');
  await quiet(p).catch(()=>{});
  await reset('?n=12');
  await act(p, '#drvTest', 15000);
  msg = await p.textContent('#drvMsg');
  ok('names the folder and flags the old reader', /Connected/.test(msg) && /New version/.test(msg), msg.trim().slice(0, 140));

  console.log(fails.length ? '\nFAILURES:\n  ' + [...new Set(fails)].join('\n  ') : '\nall Drive checks passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
