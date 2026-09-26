/* THE "CM" TAB — Condition Monitoring's own queue, one merged list.

   Replaced the List's five separate scope pills (Overdue / Due soon / Never
   inspected / Deferred — 1C plan and Compare moved to the 1C PM tab, see
   tests/dueplan.cjs and tests/schedcompare.cjs) with a single This day/All
   14 days span, asked for by name: "Inside CM This day and All 14 days."

   dueRows()/neverRows() are UNCHANGED — the interval math, the held-off
   rule, the deferral check, none of it moved, and this suite proves the
   MERGE, not the arithmetic those functions already prove of themselves
   elsewhere (tests/duetab.cjs, tests/duetoday.cjs, tests/dueweek.cjs's own
   successor). What has to hold:

   1. AN OVERDUE ROUND IS NEVER DROPPED FOR HOW OVERDUE IT IS. Some run to
      forty-five days; "This day" still means "everything overdue, plus
      what's due today", not "overdue within the span".
   2. "AHEAD" WORK (due soon, not yet today) ONLY SHOWS UNDER ALL 14 DAYS —
      the one thing the span actually narrows.
   3. A DEFERRED OR NEVER-INSPECTED ROUND IS ALWAYS SHOWN, REGARDLESS OF
      SPAN — neither is bounded by a date the span could clip.
   4. THE BADGE IS THE OVERDUE COUNT, on both tabs' shared header.

   Run: node tests/duecm.cjs   (starts its own server) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8479);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    localStorage.setItem('up_dests', '[]');
    const ago = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
    /* CM001 MP: 250 h round, last done 45 days ago -- badly overdue.
       CM002 MP: last done 11 days ago -- inside the "soon" window, ahead of
         today but not overdue; must appear only under All 14 days. due.js's
         own "soon" threshold (D.status's soonH) is the last 20% of the
         interval, never less than 20 h -- for MP's 250 h/20 h-per-day
         (12.5-day) interval that is the last 2.5 days (50 h), i.e. 10 to
         12.5 days since last done. A flat "days before the interval" guess
         (12, then 8) missed that window on both sides: 12 drifted onto
         "over" depending on the hour this suite ran, 8 landed on "ok"
         (comfortably not due) rather than "soon" at all. 11 sits inside it
         with margin either way.
       CM003 MP: last done yesterday -- comfortably not due; must not appear
         under either span (this is the retired "All"/"ok" scope's old
         territory, deliberately not carried into the merged agenda). */
    localStorage.setItem('cm_hist', JSON.stringify({
      'MP|CM001': { d: ago(45), h: 9000 },
      'MP|CM002': { d: ago(11), h: 9000 },
      'MP|CM003': { d: ago(1), h: 9000 },
      /* Also overdue on its own history, same shape as CM001 — but deferred,
         below, so the ONLY thing distinguishing it is the "put/off" state. */
      'MP|CM004': { d: ago(45), h: 9000 },
    }));
    localStorage.setItem('cm_hist_at', JSON.stringify({ at: Date.now(), n: 1 }));
  });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(300);
  /* A round an inspector answered "not now" on, with no date -- must show
     regardless of span. Written directly, the same call dueNotDoing() makes. */
  await p.evaluate(() => deferPut('MP', 'CM004', { until: null, why: 'awaiting parts', whyKey: '', by: 'test', at: new Date().toISOString() }));
  await p.click('#dueViewCM');
  await p.waitForTimeout(400);

  console.log('\n1. the CM tab is a real tab, and This day is its default span');
  ok('the CM panel is visible, 1C PM is not', await p.evaluate(() =>
    !$('dueCmWrap').classList.contains('hidden') && $('duePmWrap').classList.contains('hidden')));

  console.log('\n2. an overdue round shows under BOTH spans, however overdue it is');
  await p.click('#dueSpanF [data-dw="today"]');
  await p.waitForTimeout(300);
  let text = await p.evaluate(() => document.getElementById('dueCmList').innerText);
  ok('CM001 (45 days overdue) shows under This day', text.includes('CM001'), text.slice(0, 200));
  ok('CM002 (ahead, not yet due) does NOT show under This day', !text.includes('CM002'), text.slice(0, 200));
  ok('CM003 (not due at all) never shows', !text.includes('CM003'));

  console.log('\n3. All 14 days adds what is coming up, keeps what is overdue');
  await p.click('#dueSpanF [data-dw="all"]');
  await p.waitForTimeout(300);
  text = await p.evaluate(() => document.getElementById('dueCmList').innerText);
  ok('CM001 is still there', text.includes('CM001'));
  ok('CM002 now shows too', text.includes('CM002'));
  ok('CM003 (comfortably not due) still never shows', !text.includes('CM003'));

  console.log('\n4. a deferred round is shown regardless of span, with its reason — ONCE, not twice');
  await p.click('#dueSpanF [data-dw="today"]');
  await p.waitForTimeout(300);
  text = await p.evaluate(() => document.getElementById('dueCmList').innerText);
  ok('CM004\'s deferral shows under This day', text.includes('CM004') && text.includes('awaiting parts'), text.slice(0, 300));
  /* CM004 is deferred (st "off") but still just as overdue underneath —
     dueInDays<=0 alone would put it in BOTH the overdue bucket and the
     deferred bucket, printing the row twice. */
  const cm004Rows = await p.evaluate(() => [...document.querySelectorAll('#dueCmList [data-u="CM004"]')].length);
  ok('  exactly one row, not one per bucket it happens to satisfy', cm004Rows === 1, cm004Rows);

  console.log('\n5. a machine never inspected at all is shown regardless of span');
  const neverUnit = await p.evaluate(() => {
    const n = neverRows('')[0];
    return n ? n.unit : null;
  });
  if (neverUnit) {
    text = await p.evaluate(() => document.getElementById('dueCmList').innerText);
    ok('a never-inspected machine appears under This day', text.includes(neverUnit), neverUnit);
  } else {
    ok('at least one never-inspected machine exists to test against', false);
  }

  console.log('\n6. the badge is the overdue count, and matches the app\'s own rule for it');
  const badge = await p.evaluate(() => document.getElementById('dueCount').textContent);
  /* Asks the app's OWN dueCmToday() rather than keeping a second copy of
     the rule here — CM004 is deferred (st "off") and must NOT double as
     "overdue" for the badge either, the same fact section 4 just proved
     for the row list. */
  const trueOver = await p.evaluate(() => dueRows('').filter(dueCmToday).length);
  ok('the badge equals the true overdue count', Number(badge) === trueOver, badge + ' vs ' + trueOver);

  console.log('\n7. search reaches every state, and falls back to the register when nothing matches');
  await p.fill('#dueFind', 'CM002');
  await p.waitForTimeout(300);
  text = await p.evaluate(() => document.getElementById('dueCmList').innerText);
  ok('search finds CM002 even though it is not shown under This day otherwise', text.includes('CM002'), text.slice(0, 150));
  await p.fill('#dueFind', 'ZZZNOMATCH');
  await p.waitForTimeout(300);
  ok('a search with no hits says so plainly', /none found|ничего не найдено|no|нет/i.test(await p.textContent('#dueFindMsg')));
  await p.fill('#dueFind', '');
  await p.waitForTimeout(300);

  console.log('\n8. tapping a row opens the machine on the right round');
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('#dueCmList [data-u]')].find(b => b.dataset.u === 'CM001');
    if (btn) btn.click();
  });
  await p.waitForTimeout(300);
  ok('the capture pane opened', await p.evaluate(() => !document.getElementById('paneCapture').classList.contains('hidden')));
  ok('on the right unit', await p.evaluate(() => curEquip === 'CM001'));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close();
  server.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); server.close(); process.exit(1); });
