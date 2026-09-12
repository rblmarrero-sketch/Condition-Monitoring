#!/usr/bin/env node
/* gen_class_rounds.cjs -- the class/round fitment table ingest_work_orders.py
   needs, evaluated from the REAL due.js in a real page, never hand-copied.

   WHY THIS EXISTS INSTEAD OF A TABLE IN PYTHON. An earlier pass of the
   ingest script hand-typed an (hours, class) -> round-type table by reading
   due.js and copying its numbers into Python. That table had a real error in
   it (it put articulated trucks on the Undercarriage round at 1000h, which
   due.js does not state anywhere -- UC's own byClass entry names only DOZ
   and EXC) -- exactly the failure mode this project keeps finding when one
   rule lives in two places and they drift. This script asks due.js itself,
   in a real browser, and writes down the answer.

   roundsOnClass() (mobile/index.html) answers class membership from TWO
   sources, and this script now feeds it BOTH:
     stated  a figure due.js names for a class (onClass / byClass) -- needs
             nothing but due.js itself.
     done    a round this fleet has actually walked on a class -- needs real
             synced inspection history, which run/fetch_cm_history.cjs pulls
             straight off the live backend (?action=records) and this script
             seeds into the page's localStorage.cm_hist before asking.
   Run fetch_cm_history.cjs first (or pass --no-history to skip it and fall
   back to "stated" only, e.g. offline). The FIRST TIME a class gets a real
   round walked on it -- a grader's first-ever Magnetic Plug round, say --
   that shows up here on the very next refresh, the same way roundsOnClass()
   already works on the phone; this script no longer has to leave that half
   of the rule unanswered just because it runs unattended.

   TWO DIFFERENT QUESTIONS FOR TWO DIFFERENT SHAPES OF ROUND, STILL:
     - MP / UC / TB: due.js RESTRICTS these to named classes. Membership
       comes from roundsOnClass(), stated-or-done as above.
     - FC / GET / INSP: due.js states NO restriction for these at all -- no
       onClass, no byClass -- unlike MP, which needed onClass added
       specifically BECAUSE it is restricted. Absence of a stated
       restriction is read as "applies broadly", not as "unproven", so every
       equipment class gets these at due.js's own flat figure regardless of
       history.

   Run against a locally served copy of the repo:
       python3 -m http.server 8391 &
       node ingest/fetch_cm_history.cjs        # writes cm_history.generated.json
       node ingest/gen_class_rounds.cjs http://127.0.0.1:8391

   Re-run this whenever due.js's D.EVERY table changes, and re-run
   ingest_work_orders.py after, so the two never drift apart. */
const { chromium } = require(require('../tests/pw.cjs'));
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || 'http://127.0.0.1:8391';
const NO_HISTORY = process.argv.includes('--no-history');
const OUT = path.join(__dirname, 'class_rounds.generated.json');
const HIST_PATH = path.join(__dirname, 'cm_history.generated.json');

(async () => {
  let hist = {}, histNote = 'none (--no-history)';
  if (!NO_HISTORY) {
    if (fs.existsSync(HIST_PATH)) {
      const h = JSON.parse(fs.readFileSync(HIST_PATH, 'utf8'));
      hist = h.hist || {};
      histNote = `${Object.keys(hist).length} pair(s) from ${h.source} (pulled ${h.generated})`;
    } else {
      histNote = 'none -- ' + HIST_PATH + ' not found; run fetch_cm_history.cjs first for the "done" half';
    }
  }
  console.log('history for the "done" rule:', histNote);

  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  /* Seeded BEFORE the app boots, so roundsOnClass()'s own histAll() read
     sees real fleet history rather than an empty phone's. No entry here
     carries histPut's "f" stamp -- see this file's header and
     fetch_cm_history.cjs's for why that is deliberate, not an oversight. */
  await p.addInitScript(h => { try { localStorage.setItem('cm_hist', JSON.stringify(h)); } catch (e) {} }, hist);
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(400);
  if (errs.length) { console.error('page errors, aborting:', errs); process.exit(1); }

  const map = await p.evaluate(() => {
    const classes = Array.from(new Set((window.ASSETS || []).map(a => a.cls).filter(Boolean)));
    const restrictedMap = roundsOnClass();   // class -> Set of round types, stated + real history
    const out = {};
    for (const ty of Object.keys(DUE.EVERY)) {
      const spec = DUE.EVERY[ty];
      const restricted = !!(spec.onClass || spec.byClass);
      const clsHours = {};
      for (const cls of classes) {
        if (restricted) {
          const onIt = restrictedMap[cls] && restrictedMap[cls].has(ty);
          if (!onIt) continue;                       // not a member -- no figure recorded
          clsHours[cls] = DUE.hours(ty, null, cls);
        } else {
          const h = DUE.hours(ty, null, cls);
          if (h != null) clsHours[cls] = h;
        }
      }
      out[ty] = { restricted, classes: clsHours };
    }
    return out;
  });

  fs.writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString(),
    source: "mobile/due.js (D.EVERY, D.hours) and mobile/index.html (roundsOnClass), evaluated live -- not hand-copied",
    history: histNote,
    map,
  }, null, 2) + "\n");
  console.log("wrote", OUT);
  await b.close();
})();
