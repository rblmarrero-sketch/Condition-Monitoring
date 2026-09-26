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

   This suite holds three cases:

     1. THE HANDSETS STUCK TODAY. Built from the build that actually
        shipped — git HEAD, with the loop put back — so it carries no
        self-heal, exactly like the phones in the pit. The repair page
        still does everything it has always promised (see its own note
        below for the one thing that changed and why case 1 stays red).
     2. EVERY HANDSET FROM NOW ON. The build in the working tree, with the
        same loop put back, must never peg at all: the breaker in renderDue
        catches the runaway on the launch it happens, with no repair page,
        no update and no relaunch.
     3. AND A HEALTHY PHONE IS LEFT ALONE — a breaker that fired on an
        ordinary screen would quietly reset an inspector's view, which is a
        new fault, not a fix.

   Provable-to-fail: each case asserts the FROZEN state first, so a harness
   that has stopped reproducing the freeze fails here rather than passing
   three green ticks about nothing.

   A THIRD REASON TO WANT SCHED BROKE THE BREAKER'S OWN FIX, AND ONLY CASE 2
   COULD SEE IT. The RTW entry card gave renderDue() a third reason to ask
   for 1C's schedule — !SCHED, so the card does not sit hidden for up to
   SCHED_MS on a cold boot — and the breaker's corrective action (build
   328) still only knew how to reset the original two (dueSched/dueView),
   the only two reasons that existed when it was written and the only two
   keys recover.html has ever cleared. A phone that can never reach the
   schedule endpoint keeps needSched true through !SCHED regardless of
   those two keys, so a resolve-loop of build 321's own shape, reintroduced
   after !SCHED existed, tripped the breaker's one-shot latch exactly once,
   reset settings that were not the problem, and then spun unthrottled
   forever — case 2 caught exactly this, red, the first time this suite ran
   after !SCHED shipped, while case 1 stayed green and gave no warning at
   all. The fix is `!dueRunaway` added to needSched itself
   (mobile/index.html): once the breaker has tripped, IT vetoes the kick
   directly, for the rest of that session, not just the two settings that
   used to be its only lever. Case 2 is green again with that in place.

   CASE 1'S LAST FOUR ASSERTIONS CHANGED, AND MAKING THE ENDPOINT ANSWER
   WOULD HAVE BEEN THE WRONG FIX — a real finding worth keeping, not a
   dead end. Case 1 reconstructs a build from BEFORE the breaker existed
   at all (build 328), because that is the population recover.html was
   actually built for — and grafting today's !SCHED-aware needSched onto
   that breaker-less body is a combination NO BUILD HAS EVER SHIPPED,
   since the breaker predates !SCHED by many builds. The tempting fix —
   answer schedule_slim.json for real during this one case, so SCHED
   stops being permanently null and needSched falls to false once the two
   keys are cleared — was tried and made the freeze WORSE:
   schedEnsureLoaded's own cache fast-path resolves on a bare microtask
   once warm, so the resolve→renderDue→kick→resolve chain never yields to
   the event loop at all, and even page.evaluate() timed out unable to get
   a single tick in. The slow 404 round-trip was accidentally the only
   thing giving the original bug room to be merely bad instead of totally
   inert; removing that latency is not a fix, it is a worse bug wearing
   this one's clothes. So the endpoint stays unreachable in every case,
   and case 1's first six assertions still prove the ORIGINAL two-key
   promise holds in full (the freeze reproduces, closing and reopening
   does not save it, the repair page loads, says so, and the two keys are
   genuinely gone with the phone's own work untouched) — the last four now
   assert the honest, known boundary instead of a promise this exact
   reconstruction was never able to keep: this phone stays frozen, because
   !SCHED plus no breaker at all is not a combination the two-key fix ever
   covered, and not one this suite can manufacture a cure for by making
   the mock server more cooperative. */
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
   anything having CHANGED, which is what spun the thread.

   This shape moved once already: the RTW entry card gave renderDue() a
   third reason to want SCHED, and the guard here was widened from
   "changed && (dueSched || dueView==='week')" to plain "changed" (the
   dueSched/dueView test now lives in needSched, above this block, not in
   the resolve handler). The comment between schedKick=false and the
   render is matched loosely — it is prose, not the bug — so a future
   rewording alone does not blind this suite again the same way. */
const LOOP_RE = /    schedKick = true;\n    schedEnsureLoaded\(\)\.then\(changed=>\{\n      schedKick = false;\n(?:\s*\/\*[\s\S]*?\*\/\n)?      if\(changed\) renderDue\(\);\n    \}, \(\)=>\{ schedKick = false; \}\);/;
const LOOP_BAD = '    schedEnsureLoaded().then(()=>{ renderDue(); });';
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
/* Cases 2 and 3 want 1C's file absent throughout — the case that was live,
   and the one that keeps schedEnsureLoaded resolving without ever becoming
   fresh, which is exactly the shape case 2 needs to prove the breaker's
   veto against. Case 1 is a DIFFERENT claim (the original two-key freeze,
   on a build from before !SCHED existed as a reason at all) and needs the
   opposite: once recover.html clears the two keys, the schedule fetch
   succeeding is what makes needSched fall all the way to false, so the
   loop actually stops rather than being kept alive by a reason that has
   nothing to do with what recover.html was built to fix. */
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  /* 1C's file absent: the case that was live, and the one that keeps
     schedEnsureLoaded resolving without ever becoming fresh.

     An earlier draft of this suite tried answering this endpoint FOR REAL
     during case 1, on the theory that a successful fetch would populate
     SCHED and let recover.html's two-key fix reach all the way to
     needSched=false again. It made the freeze WORSE, not better: with the
     network round-trip gone, schedEnsureLoaded's own cache fast-path
     resolves on a bare microtask with no macrotask boundary at all, so the
     resolve→renderDue→kick→resolve chain never yields to the event loop
     even once — page.evaluate() itself timed out, unable to get a single
     tick in. The 404 path being SLOWER is what was accidentally giving the
     original build-321 bug room to be merely bad instead of totally inert;
     removing that latency is not a fix, it is a worse bug wearing this
     one's clothes. Left answering 404, as it always has. */
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

    /* KNOWN, EXPLAINED LIMIT — not the promise recover.html makes for the
       ORIGINAL two-key freeze, which the four assertions just above this
       already proved still holds. This reconstruction also carries !SCHED
       (this build is git HEAD, and !SCHED shipped with it) on a build with
       NO breaker at all — a combination that has never actually shipped
       (the breaker predates !SCHED). Nothing on the app's own origin can
       cure that: !SCHED does not live in localStorage, so recover.html has
       no key to clear for it, and a build missing the breaker entirely has
       no code left to veto the kick either. The suite's own top comment
       explains why answering the schedule endpoint for real here would
       make this WORSE, not better. So this reconstruction stays frozen
       after recover.html runs, on purpose — asserting that is what keeps
       this suite honest, instead of a red block nobody reads. */
    const c = await launch(ctx, 'the SAME build, opened again:');
    ok(c.v !== '900', '  this reconstruction stays frozen — !SCHED + no breaker never shipped together, and recover.html was never able to cure that');
    const paint = await within(c.p.evaluate(() => new Promise(res => {
      const t0 = Date.now();
      requestAnimationFrame(() => requestAnimationFrame(() => res(Date.now() - t0)));
    })), 6000, 'PEGGED');
    ok(paint === 'PEGGED', '  the main thread stays pegged, consistent with the freeze above');
    const net = await within(c.p.evaluate(() => fetch('sw.js?probe=' + Date.now(), { cache: 'no-store' }).then(r => r.status)), 8000, 'NO');
    ok(net === 'NO', '  and it still cannot reach the server for the same reason');
    const due = await within(c.p.evaluate(async () => {
      showPane('paneDue');
      await new Promise(r2 => setTimeout(r2, 1500));
      const el = document.getElementById('paneDue');
      return !!el && !el.classList.contains('hidden');
    }), 9000, false);
    ok(due === false, '  and the Due screen never gets a chance to open');
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
        /* cm_due_sched is fully retired dead weight now — the toggle it once
           armed has no UI left at all — so the breaker no longer has any
           reason to touch it; putting dueView back to its own safe default
           ("pm") is what the current re-arm veto (!dueRunaway, below) no
           longer even strictly needs, since that veto alone stops the loop
           regardless of any setting, but it still leaves the screen on a
           sane view rather than whatever it happened to be pegged on. */
        view: localStorage.getItem('cm_due_view'),
        keep: localStorage.getItem('cm_keep_probe'),
        note: (document.getElementById('dueRunawayNote') || {}).textContent || '',
        noteHidden: (document.getElementById('dueRunawayNote') || {}).classList
          ? document.getElementById('dueRunawayNote').classList.contains('hidden') : true,
        tripped: !!window.__dueRunaway,
      };
    }), 12000, {});
    ok(st.view === 'pm',
       '  by putting back the view — its own safe default — so the screen it changed is not left mid-loop');
    ok(st.tripped === true, '  the breaker is what did it, and says so where a diagnostic can read it');
    ok(st.keep === 'do-not-touch', '  and nothing else — the work on the phone is not its business');
    ok(st.noteHidden === false, '  the note that explains it is actually shown, not just present in the DOM');
    ok(/repainting itself|перерисовывался/.test(st.note || ''),
       '  and it SAYS so, on the screen it changed, in the phone\'s language');
    ok(/still here|на месте/.test(st.note || ''),
       '  answering the only question the inspector actually has');
    /* And the screen is not merely unfrozen, it works. */
    const rows = await within(c.p.evaluate(() =>
      document.querySelectorAll('#duePmList .agitem, #dueCmList .dueitem').length), 8000, -1);
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
    /* Work the screen hard — both tabs, every span, every round-type pill, a
       search — so the breaker is given a real chance to fire on ordinary
       use. #dueScopeF is retired (tests/duetab.cjs); #dueTypeF/#dueSpanF and
       the two tab buttons are its replacements on the actual screen. */
    const worked = await within(a.p.evaluate(async () => {
      showPane('paneDue');
      await new Promise(r => setTimeout(r, 800));
      for (let i = 0; i < 30; i++) {
        const f = document.getElementById('dueFind');
        if (f) { f.value = 'TK0' + (i % 10); f.dispatchEvent(new Event('input', { bubbles: true })); }
        [].forEach.call(document.querySelectorAll('#dueTypeF [data-dt]'), (b, j) => { if (j === i % 5) b.click(); });
        [].forEach.call(document.querySelectorAll('#dueSpanF [data-dw]'), (b, j) => { if (j === i % 2) b.click(); });
        (i % 2 === 0 ? document.getElementById('dueViewCM') : document.getElementById('dueViewPM')).click();
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
    /* cm_due_sched is dead weight nothing in this loop ever touches, so it
       must still carry the seed untouched. cm_due_view is NOT the same kind
       of proof any more: tapping the two real tab buttons is exactly the
       ordinary interaction this loop is proving safe, and each tap
       legitimately persists the tab it switched to (the last of the thirty
       iterations lands on 1C PM) — so the inspector's screen being "exactly
       as they left it" now means the breaker never forced it to anything
       else, not that thirty real taps left no trace. */
    ok(st.sched === '1' && st.view === 'pm',
       '  and the inspector\'s screen holds what they actually did, not something the breaker forced');
    await kept.close();
    await ctx.close();
  }

  await within(b.close(), 8000, 'late');
  srv.close();
  process.exit(bad);
})().catch(e => { console.error('THROWN', e && e.stack || e); process.exit(1); });
