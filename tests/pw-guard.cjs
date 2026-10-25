/* NO BROWSER A SUITE STARTS CAN REACH A PRODUCTION BACKEND.

   tests/noprodhit.cjs stops a suite from NAMING the real host, and
   tests/prodguard.cjs proves the app refuses to WRITE to a remote host while
   navigator.webdriver is true. Neither covers the case noprodhit.cjs itself
   calls "a real, standing structural risk ... not solved here": a page that
   boots with the shipped defaults (mobile/upload-defaults.js) and READS from
   the live backend because nothing overrode the destination.

   That stopped being theoretical on 2026-10-25. The cloud environment's
   network policy had been refusing script.google.com, so those reads died in
   a millisecond and every suite behaved as if offline. Once the host was
   allowed (so the daily trace review could read the Google backend), the same
   suites waited seconds on the real Apps Script or got its real file index
   back, and four went red on code nobody had changed: orphanphoto and
   sync-next (the media-index refresh opening the Data & Sync tab had not
   answered yet), truncate, and lubesync. A green sweep must not depend on
   what one environment's network policy happens to allow, and a test must
   never read live data.

   So every page a suite opens refuses the production hosts: a request to one
   fails at once, as if the phone had no signal, which is the state those
   suites were written in. Everything else (127.0.0.1 servers, file reads, a
   suite's own routes) is untouched, and a suite that answers a production URL
   with its own route keeps doing so (below). tests/pwguard.cjs proves the
   block, and proves it is the guard doing it. */
const CANDIDATES = ['playwright', '/opt/node22/lib/node_modules/playwright'];
let REAL = null;
for (const c of CANDIDATES) {
  try { require.resolve(c); REAL = c; break; } catch (e) { /* next */ }
}
if (!REAL) {
  throw new Error('Playwright not found. Install it with:  npm i -D playwright\n' +
                  'Looked for: ' + CANDIDATES.join(', '));
}
const pw = require(REAL);

/* The backends upload-defaults.js ships (Apps Script, the old Yandex VM,
   Power Automate) and the two places the app is published. */
const PROD_HOSTS = ['script.google.com', 'script.googleusercontent.com', '*.duckdns.org',
  '*.powerplatform.com', '*.vegadevelopment.com', 'relconditionmonitoring.web.app'];
const PROD = /(^|\.)(script\.google\.com|script\.googleusercontent\.com|duckdns\.org|powerplatform\.com|vegadevelopment\.com|relconditionmonitoring\.web\.app)$/i;
const isProd = u => { try { return PROD.test(new URL(u).hostname); } catch (e) { return false; } };

/* BY CHROMIUM'S OWN URL BLOCKLIST, NOT BY page.route() OR A LAUNCH FLAG.
   Two earlier versions of this file failed, and tests/pwguard.cjs caught both:
     · page.route() turns on Playwright's request interception for the whole
       context, and with it on Chromium no CORS preflight reaches the network —
       which tests/audit.cjs section 8 asserts happens, because the upload's
       preflight is load-bearing (CLAUDE.md, "THE UPLOAD IS PREFLIGHTED");
     · --host-rules maps names at the socket, and a browser going through a
       proxy never opens that socket: behind this environment's proxy the
       "blocked" request answered.
   Network.setBlockedURLs (the DevTools "block request URL" switch) refuses a
   matching request inside the renderer before any proxy or socket, and
   intercepts nothing, so every other request — preflights included — is
   exactly what it was. It is set per page, before the page is handed to the
   suite; a page the app opens itself is covered as soon as it appears. */
/* A SUITE THAT ANSWERS A PRODUCTION URL ITSELF IS IN CHARGE OF IT. The
   blocklist is checked before any route, so tests/fboverlay.cjs — which
   fulfils script.google.com with its own route to watch the request the phone
   builds — would have had its stub refused. When a suite registers a route
   whose matcher covers a production host, that host comes off the blocklist
   for that page (page.route) or that context (context.route); the suite's
   route now decides what the request gets, and it never reaches live. */
const SAMPLE = h => 'https://' + h.replace(/^\*\./, 'x.') + '/macros/s/X/exec';
const hostsCovered = m => PROD_HOSTS.filter(h => {
  const u = SAMPLE(h);
  try {
    if (m instanceof RegExp) return m.test(u);
    if (typeof m === 'function') return !!m(new URL(u));
    if (typeof m === 'string') return m.includes(h.replace(/^\*\./, ''));
  } catch (e) {}
  return false;
});
const urlsFor = hosts => {
  const out = [];
  PROD_HOSTS.filter(h => !hosts.has(h)).forEach(h => {
    const d = h.replace(/^\*\./, ''); out.push('*://' + d + '/*', '*://*.' + d + '/*'); });
  return out;
};
const BLOCK = urlsFor(new Set());
const LIFTED = new WeakMap();                       // page or context -> Set of hosts
const lifted = page => new Set([...(LIFTED.get(page) || []), ...(LIFTED.get(page.context()) || [])]);
const CDP = new WeakMap();
async function block(page) {
  try {
    /* One session a page, kept as a promise from the first call: the page
       event and newPage both arrive here for the same page, and two sessions
       each carry their own list, so lifting one left the other blocking. */
    if (!CDP.has(page)) CDP.set(page, page.context().newCDPSession(page).then(async s => { await s.send('Network.enable'); return s; }));
    const s = await CDP.get(page);
    await s.send('Network.setBlockedURLs', { urls: urlsFor(lifted(page)) });
  } catch (e) { /* a page closed before it could be guarded has nothing to send */ }
  return page;
}
function lift(owner, m, pages) {
  const hs = hostsCovered(m); if (!hs.length) return Promise.resolve();
  const set = LIFTED.get(owner) || new Set(); hs.forEach(h => set.add(h)); LIFTED.set(owner, set);
  return Promise.all(pages.map(block));
}
function guardPage(p) {
  if (p.__cmGuarded) return p; p.__cmGuarded = true;
  const route = p.route.bind(p);
  p.route = async (m, ...a) => { const r = await route(m, ...a); await lift(p, m, [p]); return r; };
  return p;
}
const guarded = new WeakSet();
function guard(ctx) {
  if (!ctx || guarded.has(ctx)) return ctx;
  guarded.add(ctx);
  const newPage = ctx.newPage.bind(ctx);
  ctx.newPage = async (...a) => block(guardPage(await newPage(...a)));
  ctx.on('page', p => { block(guardPage(p)); });
  const route = ctx.route.bind(ctx);
  ctx.route = async (m, ...a) => { const r = await route(m, ...a); await lift(ctx, m, ctx.pages()); return r; };
  return ctx;
}
function wrapBrowser(b) {
  const newContext = b.newContext.bind(b);
  b.newContext = async (...a) => guard(await newContext(...a));
  const newPage = b.newPage.bind(b);
  b.newPage = async (...a) => { const p = await newPage(...a); guard(p.context()); return block(guardPage(p)); };
  return b;
}
function wrapType(t) {
  if (!t || t.__cmGuarded) return t;
  const launch = t.launch.bind(t);
  const persistent = t.launchPersistentContext && t.launchPersistentContext.bind(t);
  return Object.assign(Object.create(t), {
    __cmGuarded: true,
    launch: async (...a) => wrapBrowser(await launch(...a)),
    launchPersistentContext: persistent && (async (...a) => {
      const c = guard(await persistent(...a)); await Promise.all(c.pages().map(p => block(guardPage(p)))); return c; }),
  });
}

module.exports = Object.assign({}, pw, {
  chromium: wrapType(pw.chromium),
  REAL, isProd, BLOCK,
});
