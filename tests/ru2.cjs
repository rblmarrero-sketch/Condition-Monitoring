/* THE GRADING AND PHOTOGRAPH WORKFLOW IS RUSSIAN WHEN THE PHONE IS.

   The audit of build 253 switched the phone to Russian and found the new
   sections still in English: "1 – Normal — 80–100% remaining", "Equipment
   overview · Required · Take", "Add a supervisor signature". The dictionary
   had every key in both languages; those parts are built in code, with the
   words of the language at the time, and the language switch never repainted
   them.

   What has to be true, in Russian and back in English:
     · every grade card carries the Russian name and the Russian meaning;
     · the machine-photograph rows are Russian — category, required, take;
     · the signature fold's row is Russian;
     · none of the English words the audit quoted survive on the screen.

   Run: node tests/ru2.cjs */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, new URL(req.url, 'http://x').pathname);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(fs.readFileSync(f));
});
const ENGLISH = /\b(Normal|Incipient|Degraded|Severe|Critical|Equipment overview|Required|Optional|Take|Add a supervisor signature|remaining)\b/;

(async () => {
  await new Promise(r => srv.listen(0, r));
  const APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); localStorage.removeItem('lang'); });
  await p.goto(APP, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('TK147'));
  await p.waitForTimeout(500);
  await p.evaluate(() => { pickComponent(items()[0].k); });
  await p.waitForTimeout(300);
  const read = () => p.evaluate(() => ({
    lang,
    cards: [...document.querySelectorAll('#gradeSeg .gcard')].map(c => ({ name: c.querySelector('b').textContent, meaning: c.querySelector('.gm').textContent })),
    rows: (document.getElementById('mpRows') || {}).innerText || '',
    count: (document.getElementById('mpCount') || {}).textContent || '',
    sign: (document.getElementById('signTog') || {}).textContent || '',
    wantName: GRADE.LEVELS.map(n => GRADE.label(n, lang)), wantMeaning: GRADE.LEVELS.map(n => GRADE.meaning(n, gradeFamilyType(), lang)),
  }));

  console.log('in English, as it opens');
  let s = await read();
  ok('the grade cards carry the English names', s.cards.map(c => c.name).join('|') === s.wantName.join('|'), s.cards.map(c => c.name).join(' / '));

  console.log('\nswitched to Russian');
  await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(600);
  s = await read();
  ok('the phone is in Russian', s.lang === 'ru');
  ok('every grade card carries the Russian name', s.cards.length === 5 && s.cards.map(c => c.name).join('|') === s.wantName.join('|'), s.cards.map(c => c.name).join(' / '));
  ok('and the Russian meaning', s.cards.map(c => c.meaning).join('|') === s.wantMeaning.join('|'), (s.cards[0] || {}).meaning);
  ok('no English on a card', !s.cards.some(c => ENGLISH.test(c.name + ' ' + c.meaning)), s.cards.map(c => c.name + ' — ' + c.meaning.slice(0, 30)).join(' / '));
  ok('the machine-photograph rows are Russian', /Обязательно|По желанию/.test(s.rows) && /Снять/.test(s.rows) && /Общий вид/.test(s.rows), s.rows.replace(/\s+/g, ' ').slice(0, 120));
  ok('  and carry no English', !ENGLISH.test(s.rows), s.rows.replace(/\s+/g, ' ').slice(0, 120));
  ok('the checklist counter is Russian', /Снято/.test(s.count), s.count);
  ok('the signature row is Russian', /подпис/i.test(s.sign) && !ENGLISH.test(s.sign), s.sign);

  console.log('\nand back to English');
  await p.click('.lang button[data-lang="en"]'); await p.waitForTimeout(600);
  s = await read();
  ok('the cards are English again', s.cards.map(c => c.name).join('|') === s.wantName.join('|') && /Normal/.test(s.cards[0].name), s.cards[0].name);
  ok('and so are the rows', /Required|Optional/.test(s.rows) && /Take/.test(s.rows), s.rows.replace(/\s+/g, ' ').slice(0, 80));
  ok('and the signature row', /signature/i.test(s.sign), s.sign);

  await ctx.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
