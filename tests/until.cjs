/* Wait in the page until an ASYNC predicate is true.

   page.waitForFunction does not await what its predicate returns. A predicate
   that returns a Promise — `() => dbAll().then(a => a.every(r => r.up))`, or any
   `async () => …` — hands back the Promise object, which is truthy, so the wait
   ends on the first poll whatever the answer is. Seven suites waited for "every
   round is up" that way and moved on at once; they passed only while the upload
   happened to finish inside the next fixed sleep, and field.cjs went red the day
   it did not (2026-10-19). Measured: a predicate resolving to false "succeeded"
   after 51 ms.

   until(page, fn, arg?, { timeout, polling }) runs fn in the page, awaits it,
   and polls until it resolves truthy. It returns that value, or rejects on
   timeout exactly as waitForFunction does, so a caller's .catch() keeps its
   meaning. A predicate that throws counts as not yet. */
module.exports = (page, fn, arg, opts) => page.evaluate(async ({ src, arg, timeout, every }) => {
  const f = (0, eval)('(' + src + ')');
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = await f(arg); } catch (e) { v = false; }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('until: not true after ' + timeout + ' ms');
    await new Promise(r => setTimeout(r, every));
  }
}, { src: fn.toString(), arg, timeout: (opts && opts.timeout) || 30000, every: (opts && opts.polling) || 200 });
