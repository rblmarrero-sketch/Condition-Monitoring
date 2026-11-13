/* AN OFFICE PAGE SAVES THROUGH THE OFFICE SITE, WHATEVER ADDRESS THE BROWSER
   ONCE SAVED (CM_DESKROUTE_V1, 13.11.2026).

   "Not saved - office changes go through maintenance.vegadevelopment.com" on a
   comment edit: the browser held a Google /exec address in cm_drive_url, which
   outranks the page's own default, so the office page posted straight to
   Google and Google refused the correction (no desk key).
     1. page default = the site's own forwarder (same origin), saved = Google
        /exec  ->  the saved address is dropped, with its cursor;
     2. page default = Google (Firebase, Pages)  ->  a saved address is kept;
     3. a saved address that is not Google is kept on the office site too;
     4. Google's refusal is said in the page's language, both pages.
   Run: node tests/deskroute.cjs [port] */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8497);
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const GOOGLE = 'https://script.google.com/macros/s/AKfycbTEST/exec';
let mode = 'site';
const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname.startsWith('/cm-api')) { s.setHeader('content-type', 'application/json'); return s.end('{"ok":true,"records":[],"files":[]}'); }
  if (u.pathname.endsWith('/mobile/upload-defaults.js')) {
    s.setHeader('content-type', 'application/javascript');
    return s.end(mode === 'site'
      ? 'window.UPLOAD_DEFAULTS={dests:[{id:"gas",url:"/cm-api",sec:""}]};'
      : 'window.UPLOAD_DEFAULTS={dests:[{id:"gas",url:"' + GOOGLE + '",sec:""}]};');
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  for (const pg of ['dashboard', 'dashboard-next']) {
    console.log(pg);
    const open = async (m, saved, lang) => {
      mode = m;
      const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } });
      await ctx.route(/script\.google\.com|other\.example/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"records":[],"files":[]}' }));
      const p = await ctx.newPage();
      await p.addInitScript(a => {
        if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded', '1');
        if (a.saved !== null) { localStorage.setItem('cm_drive_url', a.saved); localStorage.setItem('cm_drive_cursor', '12345'); }
        localStorage.setItem('cm_dash_lang', a.lang);
      }, { saved, lang: lang || 'en' });
      await p.goto(`http://127.0.0.1:${PORT}/${pg}/index.html`, { waitUntil: 'load' });
      await p.waitForFunction(() => window.CMDrive && typeof edErr === 'function', null, { timeout: 30000 });
      const r = await p.evaluate(() => ({ saved: localStorage.getItem('cm_drive_url'), cur: localStorage.getItem('cm_drive_cursor'), via: CMDrive.viaSite(),
        msg: edErr(new Error('office changes go through maintenance.vegadevelopment.com')), plain: edErr(new Error('boom')) }));
      await ctx.close(); return r;
    };
    const a = await open('site', GOOGLE);
    ok(a.saved === null && a.via, '1. on the office site a saved Google address gives way to the site\'s own route', JSON.stringify(a));
    ok(a.cur === null || a.cur !== '12345', '   and its cursor is dropped', String(a.cur));
    const c = await open('google', GOOGLE);
    ok(c.saved === GOOGLE && !c.via, '2. where the page\'s default is Google, a saved address is kept', JSON.stringify(c));
    const d = await open('site', 'https://other.example/exec');
    ok(d.saved === 'https://other.example/exec', '3. a saved address that is not Google is kept', JSON.stringify(d));
    ok(/maintenance\.vegadevelopment\.com\/cm\/dashboard-next/.test(a.msg) && !/office changes go through/.test(a.msg), '4. the refusal says where to make the change', a.msg);
    ok(a.plain === 'boom', '   any other error is said as it is', a.plain);
    const ru = await open('google', null, 'ru');
    ok(/[а-яё]/i.test(ru.msg) && !/office changes/.test(ru.msg), '   and in Russian on the Russian page', ru.msg);
  }
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
