/* A FROZEN HANDSET HAS TO HAVE A WAY HOME THAT NEEDS NOTHING FROM THE SERVER.

   Build 321 shipped a repaint loop, and the phones it caught could not be
   reached by any route that requires an update to ARRIVE: a pegged main
   thread cannot check for a build, cannot apply one, and cannot send the
   rounds already on it, and the worker answers every navigation inside its
   scope from the cache, so relaunching serves the frozen build back. The
   field said so plainly for days — "still phone stuck".

   The way in was that the freeze is not in the build alone. It needs a
   reason to want 1C's schedule while the Due screen draws, and both reasons
   are remembered ON THE HANDSET: cm_due_sched and cm_due_view. localStorage
   belongs to the ORIGIN, and recover.html is on the app's origin — one
   directory above the worker's scope, so the broken build can never answer
   for it. Put those two keys back to their defaults from there and the copy
   of the app already on the phone opens. No download. Nothing deleted.

   This suite holds both halves of that:

     1. THE HANDSETS STUCK TODAY. Built from the build that actually
        shipped — git HEAD, with the loop put back — so it carries no
        self-heal, exactly like the phones in the pit. Only the repair page
        can save it, and it must.
     2. EVERY HANDSET FROM NOW ON. The build in the working tree, with the
        same loop put back, must never peg at all: the breaker in renderDue
        catches the runaway on the launch it happens, with no repair page,
        no update and no relaunch.
     3. AND A HEALTHY PHONE IS LEFT ALONE — a breaker that fired on an
        ordinary screen would quietly reset an inspector's view, which is a
        new fault, not a fix.

   Provable-to-fail: each case asserts the FROZEN state first, so a harness
   that has stopped reproducing the freeze fails here rather than passing
   three green ticks about nothing. */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const PORT = 8524;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

let bad = 0;
const ok = (c, s) => { console.log((c ? 'PASS  ' : 'FAIL  ') + s); if (!c) bad = 1; };
const within = (pr, ms, late) => Promise.race([
  pr.catch(e => 'ERR ' + String(e && e.message).slice(0, 40)),
  new Promise(r => setTimeout(() => r(late), ms)),
]);

const nowIdx = fs.readFileSync(path.join(ROOT, 'mobile/index.html'), 'utf8');
const nowSw = fs.readFileSync(path.join(ROOT, 'mobile/sw.js'), 'utf8');
const shipped = execFileSync('git', ['-C', ROOT, 'show', 'HEAD:mobile/index.html'], { encoding: 'utf8', maxBuffer: 64 << 20 });
const shippedSw = execFileSync('git', ['-C', ROOT, 'show', 'HEAD:mobile/sw.js'], { encoding: 'utf8', maxBuffer: 64 << 20 });
const buildOf = s => (s.match(/const BUILD\s*=\s*"([^"]+)"/) || [])[1];

/* Put the build-321 loop back: repaint on the call RESOLVING rather than on
   anything having CHANGED, which is what spun the thread. */
const LOOP_RE = /    schedKick = true;\n    schedEnsureLoaded\(\)\.then\(changed=>\{\n      schedKick = false;\n      if\(changed && \(dueSched \|\| dueView==="week"\)\) renderDue\(\);\n    \}, \(\)=>\{ schedKick = false; \}\);/;
const LOOP_BAD = '    schedEnsureLoaded().then(()=>{ if(dueSched || dueView==="week") renderDue(); });';
/* AND THE BREAKER TAKEN OUT, or this no longer builds a frozen phone at all.

   Since build 328 every shipped build carries a circuit breaker at the top
   of renderDue: past 250 repaints in a second it puts back the two settings
   that can re-arm the cycle. That is the fix working — and it means putting
   the build-321 loop back is no longer enough to peg anything. This suite
   went red the day the breaker shipped, saying "the freeze reproduces" had
   failed, which read as a regression and was the opposite: the app had
   stopped being able to freeze.

   The handsets this case is about ran a build from BEFORE the breaker, so
   the breaker comes out too. Everything between the function's brace and
   renderTabs() is the breaker and nothing else; removing it by that shape
   rather than by its internals means it keeps working when the breaker is
   edited. */
function stripBreaker(src) {
  const cut = src.replace(/function renderDue\(\)\{[\s\S]*?\n  renderTabs\(\);/,
                          'function renderDue(){\n  renderTabs();');
  if (cut === src) {
    console.error('FAIL  the breaker could not be removed — renderDue has moved, this suite is blind');
    process.exit(1);
  }
  return cut;
}

function freeze(src, ver, keepBreaker) {
  const base = keepBreaker ? src : stripBreaker(src);
  const out = base.replace(LOOP_RE, LOOP_BAD)
    .replace(/const BUILD="[^"]+"/, 'const BUILD="' + ver + '"')
    .replace(/v=\d+/g, 'v=' + ver);
  if (out === base.replace(/const BUILD="[^"]+"/, 'const BUILD="' + ver + '"').replace(/v=\d+/g, 'v=' + ver)) {
    console.error('FAIL  the loop could not be put back — renderDue has moved, this suite is blind');
    process.exit(1);
  }
  return out;
}
function swVer(src, ver) {
  return src.replace(/const BUILD = "[^"]+"/, 'const BUILD = "' + ver + '"').replace(/v=\d+/g, 'v=' + ver);
}

/* 900 = the build in the field today. 901 = the build in the tree, with a
   loop of the same class put into it. */
const PAGES = {
  900: { idx: freeze(shipped, 900), sw: swVer(shippedSw, 900) },
  901: { idx: freeze(nowIdx, 901, true), sw: swVer(nowSw, 901) },
};
let serving = 900;

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  /* 1C's file absent: the case that was live, and the one that keeps
     schedEnsureLoaded resolving without ever becoming fresh. */
  if (/schedule_slim\.json/.test(u.pathname)) { res.writeHead(404); return res.end('nope'); }
  if (/\/mobile\/index\.html$/.test(u.pathname) || u.pathname === '/mobile/') {
    res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(PAGES[serving].idx);
  }
  if (/\/mobile\/sw\.js$/.test(u.pathname)) {
    res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(PAGES[serving].sw);
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});

(async () => {
  /* ---- what the repair page is allowed to do, read off the file ---- */
  const rec = fs.readFileSync(path.join(ROOT, 'recover.html'), 'utf8');
  ok(/cm_due_sched/.test(rec) && /cm_due_view/.test(rec),
     'the repair page releases the two keys that hold the freeze');
  ok(!/\.unregister\s*\(/.test(rec) && !/caches\.delete\s*\(/.test(rec),
     '  and still never unregisters a worker or deletes a cache (build 246)');
  const listed = (rec.match(/var VIEW_KEYS = \[([^\]]*)\]/) || [, ''])[1]
    .split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  ok(listed.length && listed.every(k => /^cm_due_(sched|view)$/.test(k)),
     '  and clears display preferences ONLY — no destination, cursor, draft or queue');

  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();

  /* Each case is its own handset: a fresh profile, so one phone's cache and
     storage can never be mistaken for another's recovery. */
  const handset = async () => {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('up_dests', '[]'); } catch (e) {} });
    return ctx;
  };
  const launch = async (ctx, label) => {
    const p = await ctx.newPage();
    await within(p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'commit' }), 20000, 'late');
    await new Promise(r => setTimeout(r, 9000));
    const v = await within(p.evaluate(() => (document.getElementById('verNum') || {}).textContent), 6000, 'FROZEN');
    if (label) console.log('        ' + label.padEnd(36) + ' verNum = ' + v);
    return { p, v };
  };
  /* The state a stuck phone is actually carrying, set the way the phone set
     it — from a page, before the app opens. */
  const seed = async ctx => {
    const s = await ctx.newPage();
    await s.goto(`http://127.0.0.1:${PORT}/recover-seed.html`).catch(() => {});
    await s.goto(`http://127.0.0.1:${PORT}/index.html`).catch(() => {});
    await s.evaluate(() => {
      localStorage.setItem('cm_due_sched', '1');
      localStorage.setItem('cm_due_view', 'week');
      /* A stand-in for the phone's work: anything that is NOT a display
         preference must come through untouched. up_dests is no good for
         this — the app legitimately rewrites it at boot when it applies a
         changeover, so asserting on it tests the changeover, not the guard. */
      localStorage.setItem('cm_keep_probe', 'do-not-touch');
    });
    await s.close();
  };

  console.log('\n1. THE HANDSETS STUCK IN THE PIT TODAY — build ' + buildOf(shipped) + ', no self-heal');
  {
    serving = 900;
    const ctx = await handset();
    await seed(ctx);
    let a = await launch(ctx, 'as it is now:');
    ok(a.v !== '900', '  it is stuck — the freeze reproduces');
    await a.p.close();
    a = await launch(ctx, 'closed and opened again:');
    ok(a.v !== '900', '  and closing and reopening does NOT save it');
    await a.p.close();

    /* The repair page, run for real — not a re-implementation of it. */
    const r = await ctx.newPage();
    const got = await within(r.goto(`http://127.0.0.1:${PORT}/recover.html`, { waitUntil: 'load' }).then(() => 'ok'), 15000, 'late');
    ok(got === 'ok', '  the repair page loads while the app is frozen');
    await new Promise(r2 => setTimeout(r2, 1200));
    const said = await r.evaluate(() => (document.getElementById('thaw') || {}).textContent || '');
    ok(/yes|да/.test(said), '  and it says out loud that it released the freeze');
    const kept = await r.evaluate(() => ({
      sched: localStorage.getItem('cm_due_sched'),
      view: localStorage.getItem('cm_due_view'),
      dests: localStorage.getItem('up_dests'),
    }));
    ok(kept.sched === null && kept.view === null, '  the two keys are gone');
    ok(kept.dests === '[]', '  and the destinations — the phone\'s work — are untouched');
    await r.close();

    const c = await launch(ctx, 'the SAME build, opened again:');
    ok(c.v === '900', '  THE STUCK BUILD NOW OPENS — no update, nothing deleted');
    const paint = await within(c.p.evaluate(() => new Promise(res => {
      const t0 = Date.now();
      requestAnimationFrame(() => requestAnimationFrame(() => res(Date.now() - t0)));
    })), 6000, 'PEGGED');
    ok(typeof paint === 'number' && paint < 2000, '  the main thread is free again (' + paint + ' ms to paint)');
    const net = await within(c.p.evaluate(() => fetch('sw.js?probe=' + Date.now(), { cache: 'no-store' }).then(r => r.status)), 8000, 'NO');
    ok(net === 200, '  so it can now reach the server — check for a build, and SEND');
    const due = await within(c.p.evaluate(async () => {
      showPane('paneDue');
      await new Promise(r2 => setTimeout(r2, 1500));
      const el = document.getElementById('paneDue');
      return !!el && !el.classList.contains('hidden');
    }), 9000, false);
    ok(due === true, '  and the Due screen opens without going back into the loop');
    await c.p.close();
    await ctx.close();
  }

  console.log('\n2. EVERY HANDSET FROM NOW ON — the same class of loop, build ' + buildOf(nowIdx));
  {
    serving = 901;
    const ctx = await handset();
    await seed(ctx);
    /* One launch. Nobody clears anything, nothing is downloaded. */
    const c = await launch(ctx, 'the loop, on the current build:');
    ok(c.v === '901', '  IT NEVER PEGS — the breaker catches the runaway where it is');
    const paint = await within(c.p.evaluate(() => new Promise(res => {
      const t0 = Date.now();
      requestAnimationFrame(() => requestAnimationFrame(() => res(Date.now() - t0)));
    })), 6000, 'PEGGED');
    ok(typeof paint === 'number' && paint < 2000, '  the thread stays free (' + paint + ' ms to paint)');
    const st = await within(c.p.evaluate(async () => {
      showPane('paneDue');
      await new Promise(r2 => setTimeout(r2, 2500));
      return {
        sched: localStorage.getItem('cm_due_sched'),
        view: localStorage.getItem('cm_due_view'),
        keep: localStorage.getItem('cm_keep_probe'),
        note: (document.getElementById('dueSchedNote') || {}).textContent || '',
        tripped: !!window.__dueRunaway,
      };
    }), 12000, {});
    ok(st.sched === '0' && st.view === 'list',
       '  by putting back the only two settings that can re-arm the cycle');
    ok(st.tripped === true, '  the breaker is what did it, and says so where a diagnostic can read it');
    ok(st.keep === 'do-not-touch', '  and nothing else — the work on the phone is not its business');
    ok(/repainting itself|перерисовывался/.test(st.note || ''),
       '  and it SAYS so, on the screen it changed, in the phone\'s language');
    ok(/still here|на месте/.test(st.note || ''),
       '  answering the only question the inspector actually has');
    /* And the screen is not merely unfrozen, it works. */
    const rows = await within(c.p.evaluate(() =>
      document.querySelectorAll('#dueList .duerow').length), 8000, -1);
    ok(rows >= 0, '  the Due list still draws (' + rows + ' rows)');
    await c.p.close();
    await ctx.close();
  }

  console.log('\n3. AND A HEALTHY PHONE IS LEFT ALONE');
  {
    serving = 901;
    /* The same build, WITHOUT the loop: an ordinary working handset. */
    PAGES[901].idx = nowIdx.replace(/const BUILD="[^"]+"/, 'const BUILD="901"').replace(/v=\d+/g, 'v=901');
    const ctx = await handset();
    await seed(ctx);
    const a = await launch(ctx, 'an ordinary launch:');
    ok(a.v === '901', '  the app opens, as it should');
    /* Work the screen hard — every filter, every scope, a search — so the
       breaker is given a real chance to fire on ordinary use. */
    const worked = await within(a.p.evaluate(async () => {
      showPane('paneDue');
      await new Promise(r => setTimeout(r, 800));
      for (let i = 0; i < 30; i++) {
        const f = document.getElementById('dueFind');
        if (f) { f.value = 'TK0' + (i % 10); f.dispatchEvent(new Event('input', { bubbles: true })); }
        [].forEach.call(document.querySelectorAll('#dueScopeF [data-sc]'), (b, j) => { if (j === i % 5) b.click(); });
        await new Promise(r => setTimeout(r, 30));
      }
      await new Promise(r => setTimeout(r, 800));
      return !window.__dueRunaway;
    }), 30000, 'PEGGED');
    ok(worked === true, '  and thirty filter and search changes do not trip the breaker');
    await a.p.close();
    const kept = await ctx.newPage();
    await kept.goto(`http://127.0.0.1:${PORT}/index.html`);
    const st = await kept.evaluate(() => ({
      sched: localStorage.getItem('cm_due_sched'),
      view: localStorage.getItem('cm_due_view'),
    }));
    ok(st.sched === '1' && st.view === 'week',
       '  and the inspector\'s screen is exactly as they left it');
    await kept.close();
    await ctx.close();
  }

  await within(b.close(), 8000, 'late');
  srv.close();
  process.exit(bad);
})().catch(e => { console.error('THROWN', e && e.stack || e); process.exit(1); });
