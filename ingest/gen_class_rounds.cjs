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

   TWO DIFFERENT QUESTIONS, ANSWERED DIFFERENTLY, ON PURPOSE.
     - MP / UC / TB: due.js explicitly RESTRICTS these to named classes
       (onClass / byClass). Membership is read from roundsOnClass()
       (mobile/index.html) run with NO inspection history loaded -- the
       honest condition for an offline ingest step, since roundsOnClass()'s
       other half (a round actually walked on a class) needs live synced
       history this script will never have. Its "stated" half needs nothing
       but due.js, which is all these three rounds require: a figure was
       named for a class, so the class is on the round.
     - FC / GET / INSP: due.js states NO restriction for these at all -- no
       onClass, no byClass -- unlike MP, which needed onClass added
       specifically BECAUSE it is restricted. Absence of a stated
       restriction is read as "applies broadly", not as "unproven", so every
       equipment class gets these at due.js's own flat figure.

   Known gap this deliberately does NOT paper over: due.js's own prose above
   TB says haul trucks are "also" on it at the round's default 1000h, but
   roundsOnClass()'s stated rule only reads byClass KEYS (AT's 4000h
   override), so HT never appears here for TB. That is a pre-existing gap in
   roundsOnClass() itself, not something this script invented or silently
   fixed -- fixing mobile/index.html's own membership function was not asked
   for here, and this script's job is to report what that function actually
   says, not what due.js's comments intend it to say.

   Run against a locally served copy of the repo:
       python3 -m http.server 8391 &
       node ingest/gen_class_rounds.cjs http://127.0.0.1:8391

   Re-run this whenever due.js's D.EVERY table changes, and re-run
   ingest_work_orders.py after, so the two never drift apart. */
const { chromium } = require(require('../tests/pw.cjs'));
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || 'http://127.0.0.1:8391';
const OUT = path.join(__dirname, 'class_rounds.generated.json');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(400);
  if (errs.length) { console.error('page errors, aborting:', errs); process.exit(1); }

  const map = await p.evaluate(() => {
    const classes = Array.from(new Set((window.ASSETS || []).map(a => a.cls).filter(Boolean)));
    const restrictedMap = roundsOnClass();   // class -> Set of round types, no history loaded
    const out = {};
    for (const ty of Object.keys(DUE.EVERY)) {
      const spec = DUE.EVERY[ty];
      const restricted = !!(spec.onClass || spec.byClass);
      const clsHours = {};
      for (const cls of classes) {
        if (restricted) {
          const onIt = restrictedMap[cls] && restrictedMap[cls].has(ty);
          if (!onIt) continue;                       // not a stated member -- no figure recorded
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
    map,
  }, null, 2) + "\n");
  console.log("wrote", OUT);
  await b.close();
})();
