/* EVERY PAGE NAMES ITS OWN ICON.

   Audit of 2026-10-01: the office page asked for /favicon.ico at the GitHub
   Pages ACCOUNT root — outside this project, a 404 in every console — because
   nothing in its <head> said where the icon is. The phone has always declared
   icon-192.png; the two dashboards and the root pages did not.

   Reads every page this repository publishes and checks it declares an icon
   that resolves to a real file under the project — not at the account root.

   Run: node tests/favicon.cjs */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const pages = ['index.html', 'fix.html', 'recover.html', 'mobile/index.html', 'mobile/compare.html',
  'dashboard/index.html', 'dashboard-next/index.html'].filter(p => fs.existsSync(path.join(ROOT, p)));
ok('found the published pages', pages.length >= 5, pages.join(', '));
for (const p of pages) {
  const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const head = (html.match(/<head>([\s\S]*?)<\/head>/i) || [, ''])[1];
  const m = head.match(/<link[^>]*rel="icon"[^>]*href="([^"]+)"/i) || head.match(/<link[^>]*href="([^"]+)"[^>]*rel="icon"/i);
  ok(`${p}: declares an icon in <head>`, !!m, m ? m[1] : 'none');
  if (!m) continue;
  const href = m[1].replace(/[?#].*$/, '');
  ok(`${p}: the icon is a path inside the project, not the account root`, !/^\//.test(href) && !/^https?:/.test(href), href);
  const file = path.normalize(path.join(path.dirname(path.join(ROOT, p)), href));
  ok(`${p}: and the file is there`, file.startsWith(ROOT) && fs.existsSync(file), path.relative(ROOT, file));
}
console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
process.exit(fails.length ? 1 : 0);
