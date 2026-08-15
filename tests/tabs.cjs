/* Every tab on the bar goes somewhere.

   Wear & life was added to the nav, and to the markup, and to renderAll — and
   not to the one hard-coded array inside showTab() that decides which section
   to unhide. Pressing it hid every other section and showed a blank page. It
   shipped in build 96 and four full sweeps went green over it, because the
   tests for that tab called renderWearTab() directly instead of pressing the
   button a person presses.

   That is the whole lesson: a test that drives the function cannot see that
   nothing can reach the function. So this suite touches only what a hand can
   touch — it clicks each tab and looks at what appears.

   showTab now reads the tab list off the tab bar rather than keeping a second
   copy of it, so the two cannot drift again. This checks the behaviour anyway,
   because the next thing to break will not be the thing that broke last time.
*/
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099')
        + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.getElementById('dataOv').classList.add('hidden'));

  const tabs = await p.$$eval('#tabs button[data-tab]', bs => bs.map(b => b.dataset.tab));
  note('tabs on the bar', tabs.join(', '));
  ok('there are tabs to check', tabs.length >= 5, tabs.length + '');

  console.log('\nclicking each one, the way a person does');
  for (const t of tabs) {
    await p.click(`#tabs button[data-tab="${t}"]`);
    await p.waitForTimeout(350);
    const r = await p.evaluate(x => {
      const s = document.getElementById('tab-' + x);
      const others = [...document.querySelectorAll('#tabs button[data-tab]')]
        .map(b => b.dataset.tab).filter(y => y !== x)
        .filter(y => { const e = document.getElementById('tab-' + y);
                       return e && !e.classList.contains('hidden'); });
      return { exists: !!s, shown: !!s && !s.classList.contains('hidden'),
               text: (s ? s.innerText : '').trim().length,
               active: (document.querySelector('#tabs button.active') || {}).dataset?.tab,
               alsoShown: others };
    }, t);
    ok(`${t} has a section`, r.exists);
    ok(`  and pressing it shows that section`, r.shown);
    /* The failure was not an error — it was a blank. A section that unhides
       with nothing in it looks exactly like a section that is loading. */
    ok(`  with something actually on it`, r.text > 20, r.text + ' characters');
    ok(`  the button reads as selected`, r.active === t, String(r.active));
    ok(`  and nothing else is left open behind it`, r.alsoShown.length === 0,
       r.alsoShown.join(',') || 'none');
  }

  console.log('\nand every section on the page belongs to a tab');
  /* The other direction: a section with no button is unreachable too, and
     nothing else would ever notice it. */
  const orphans = await p.evaluate(() => {
    const known = new Set([...document.querySelectorAll('#tabs button[data-tab]')]
      .map(b => 'tab-' + b.dataset.tab));
    return [...document.querySelectorAll('section[id^="tab-"]')]
      .map(s => s.id).filter(id => !known.has(id));
  });
  ok('no section is stranded without a button', orphans.length === 0, orphans.join(',') || 'none');

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
