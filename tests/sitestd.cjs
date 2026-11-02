/* CM_SITE_STD_V1: the site menu / band / footer load ONLY under /cm/ (the site, PECHANKA).

   Proves, on both office pages, with a stand-in for the site's /site/std.js (the real one is the site kit
   SITE_STD_V1, not in this repository):
     · served anywhere but /cm/ (Firebase, GitHub Pages, every other suite) nothing is requested from /site/
       and the page is unchanged;
     · under /cm/ std.js and std.css are requested, SiteStd.init gets page "cm", the page's own source chip and
       Data sources button are kept, the EN/RU buttons are handed over;
     · the site's one language (askpi_lang) wins over the page's own (cm_dash_lang), both ways;
     · the band's theme switch sets the page's data-theme;
     · the side menu starts under the site menu (--std-top), not under it;
     · no page errors.
   Run: node tests/sitestd.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '   ' + d : ''}`); c ? pass++ : fail++; };
const STUB = `window.SiteStd={init:function(c){window.__std=c;var n=document.createElement('nav');n.id='stdNav';n.style.height='50px';
document.body.insertBefore(n,document.body.firstChild);document.documentElement.style.setProperty('--std-top','50px');
var L=localStorage.getItem('askpi_lang')||'en';if(c.lang&&c.lang.set&&c.lang.get()!==L)c.lang.set(L);
document.documentElement.setAttribute('data-std','SITE_STD_V1');}};`;
const hits = [];
const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u.startsWith('/site/')) { hits.push(u); r.writeHead(200, { 'Content-Type': u.endsWith('.css') ? 'text/css' : 'application/javascript' }); return r.end(u.endsWith('.css') ? '/* stub */' : STUB); }
  let p = path.join(ROOT, u.startsWith('/cm/') ? u.slice(4) : u); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
});
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const b = await chromium.launch();
  for (const file of ['dashboard', 'dashboard-next']) {
    console.log(`\n== ${file}`);
    const open = async (prefix, site, own) => {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(([s, o]) => { if (s) localStorage.setItem('askpi_lang', s); if (o) localStorage.setItem('cm_dash_lang', o); }, [site, own]);
      const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      hits.length = 0;
      await p.goto(`http://127.0.0.1:${port}${prefix}/${file}/index.html`); await p.waitForTimeout(1500);
      return { p, ctx, errs };
    };
    let { p, ctx, errs } = await open('', null, null);
    ok('outside /cm/ nothing is requested from /site/', hits.length === 0, hits.join(' '));
    ok('and the page is unchanged (no cmStd class, no site menu)', await p.evaluate(() => !document.documentElement.classList.contains('cmStd') && !document.getElementById('stdNav')));
    ok('no page errors', !errs.length, errs.join(' | ')); await ctx.close();

    ({ p, ctx, errs } = await open('/cm', 'ru', 'en'));
    ok('under /cm/ std.js and std.css are loaded', hits.includes('/site/std.js') && hits.includes('/site/std.css'), hits.join(' '));
    const st = await p.evaluate(() => ({ cls: document.documentElement.classList.contains('cmStd'), page: window.__std && window.__std.page,
      keep: window.__std && window.__std.keep, el: window.__std && window.__std.lang && window.__std.lang.el, lang: document.documentElement.lang,
      top: getComputedStyle(document.querySelector('nav.tabs')).top, themeBtn: getComputedStyle(document.getElementById('themeBtn')).display }));
    ok('the site standard is applied (page "cm")', st.cls && st.page === 'cm', JSON.stringify(st.page));
    ok('the source chip and Data sources stay the page\'s own', JSON.stringify(st.keep) === '["#srcChip","#dataBtn"]', JSON.stringify(st.keep));
    ok('the page\'s EN/RU buttons are handed to the band', st.el === 'header.app .lang', st.el);
    ok('the site language wins: askpi_lang ru over cm_dash_lang en', st.lang === 'ru', st.lang);
    ok('and the page remembers it', await p.evaluate(() => localStorage.getItem('cm_dash_lang')) === 'ru');
    ok('the side menu starts under the site menu', st.top === '50px', st.top);
    ok('the page\'s own theme button gives way to the band\'s', st.themeBtn === 'none', st.themeBtn);
    await p.evaluate(() => window.__std.theme.set('dark'));
    ok('the band\'s Dark sets the page theme', await p.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark' && window.__std.theme.get() === 'dark'));
    await p.evaluate(() => window.__std.theme.set('auto'));
    ok('and Auto hands it back to the system', await p.evaluate(() => !document.documentElement.hasAttribute('data-theme') && window.__std.theme.get() === 'auto'));
    await p.evaluate(() => window.__std.lang.set('en'));
    ok('the band\'s language switch reaches the page', await p.evaluate(() => document.documentElement.lang === 'en'));
    ok('no page errors', !errs.length, errs.join(' | ')); await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
})();
