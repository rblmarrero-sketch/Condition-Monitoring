/* The line-by-line audit, run as code.

   Reading 12,000 lines by eye finds what the eye is looking for. These are the
   checks that have actually caught something on this project, turned into
   something a machine does every time:

     · a real value rendered as nothing  — the worst defect class here
     · a control that exists and is wired to nothing
     · a string that only exists in one language
     · an asset the service worker will not have offline
     · CSS that no longer matches anything, and classes that match nothing

   Static only. It reads the source rather than the running page, so it is fast
   enough to run on every change; live.cjs does the other half.
*/
const fs = require('fs'), path = require('path');
const REPO = path.join(__dirname, '..');
const fails = [], warns = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const warn = (n, c, d) => { console.log((c ? '  PASS  ' : '  WARN  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) warns.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8');

const PAGES = ['mobile/index.html', 'dashboard/index.html'];

/* ── 1. the markup itself ────────────────────────────────────────────────── */
console.log('the markup holds together');
for (const f of PAGES) {
  const src = read(f);
  const short = f.split('/')[0];

  /* Two elements with one id: getElementById returns the first, so the second
     is invisible to every line of code that thinks it has it.

     Markup only. The scripts build several panels from template strings, and
     two branches of one panel legitimately use the same id because only one of
     them is ever in the document. live.cjs asks the real DOM instead. */
  const markup = src.replace(/<script[\s\S]*?<\/script>/g, '');
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dupIds = ids.filter((x, i) => ids.indexOf(x) !== i);
  ok(short + ': every id is unique', dupIds.length === 0, [...new Set(dupIds)].join(',') || 'none');

  /* An unclosed <div> does not error — it swallows everything after it into a
     container that was supposed to end, and the page looks almost right. */
  const opens = (src.match(/<div\b[^>]*>/g) || []).length;
  const closes = (src.match(/<\/div>/g) || []).length;
  ok(short + ': every <div> is closed', opens === closes, opens + ' open, ' + closes + ' close');

  /* A single-quoted or unquoted attribute is legal and a magnet for the next
     value that contains a space. */
  const badAttr = [...src.matchAll(/<[a-z][^>]*?\s(id|class|data-[a-z-]+)=([^"'\s>][^\s>]*)/gi)];
  warn(short + ': attributes are quoted', badAttr.length === 0,
       badAttr.slice(0, 3).map(m => m[0].slice(-40)).join(' | ') || 'all');

  /* Inline handlers cannot be removed, cannot be tested, and are the one thing
     a CSP would break. Everything here is wired in script. */
  const inline = [...src.matchAll(/\son(click|change|input|submit)="/g)];
  ok(short + ': no inline event handlers', inline.length === 0, inline.length + ' found');

  /* An image with no alt is a blank rectangle to a screen reader, and a blank
     rectangle to anyone whose connection dropped it. */
  const imgs = [...src.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/g)];
  ok(short + ': every <img> carries alt text', imgs.length === 0,
     imgs.slice(0, 2).map(m => m[0].slice(0, 60)).join(' | ') || 'all');

  /* A button whose only content is an emoji or an svg says nothing at all when
     it is read aloud, and nothing when the glyph is missing from the font. */
  /* data-i18n-title counts: applyLang() sets title AND aria-label from it, in
     whichever language is on, which is the only version of this that is also
     bilingual. live.cjs then checks the accessible name on the real DOM, which
     is the only place the answer is actually true. */
  const bare = [...src.matchAll(/<button\b((?![^>]*(?:aria-label|data-i18n-title))[^>]*)>([^<]{0,4})<\/button>/g)]
    .filter(m => m[2].trim() && !/[A-Za-zА-Яа-я0-9]/.test(m[2]));
  ok(short + ': icon-only buttons carry a translatable label', bare.length === 0,
     bare.slice(0, 4).map(m => m[2]).join(' ') || 'all');
}

/* ── 2. every script the page asks for actually exists ───────────────────── */
console.log('\nnothing is asked for that is not there');
for (const f of PAGES) {
  const src = read(f), dir = path.dirname(path.join(REPO, f)), short = f.split('/')[0];
  const refs = [...src.matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m => m[1])
    .concat([...src.matchAll(/<link[^>]+href="([^"?#]+)[^"]*"/g)].map(m => m[1]))
    .filter(u => !/^https?:/.test(u));
  const missing = refs.filter(u => !fs.existsSync(path.join(dir, u)));
  ok(short + ': every script and stylesheet resolves', missing.length === 0, missing.join(',') || refs.length + ' checked');

  /* An unversioned asset is one a phone can serve from cache after the rest of
     the build has moved on — the mismatch that makes a report print with last
     week's reference data. */
  const unver = [...src.matchAll(/<script src="((?:\.\.?\/)?[^":]+\.js)"/g)].map(m => m[1]);
  ok(short + ': every local script is version-tagged', unver.length === 0, unver.join(',') || 'all');
}

/* ── 3. offline: the service worker precaches what the page needs ─────────── */
console.log('\nthe phone can open with no signal at all');
{
  const sw = read('mobile/sw.js'), page = read('mobile/index.html');
  const pre = [...sw.matchAll(/"\.\/([^"?]+)/g)].map(m => m[1]);
  const needed = [...page.matchAll(/<script src="([^"?]+)/g)].map(m => m[1])
    .concat([...page.matchAll(/<link[^>]+href="([^"?#]+)/g)].map(m => m[1]))
    .filter(u => !/^https?:|^\.\./.test(u));
  const gap = [...new Set(needed)].filter(u => !pre.includes(u.replace(/^\.\//, '')));
  note('precached', pre.length + ' files');
  ok('every file the page loads is precached', gap.length === 0, gap.join(',') || 'all ' + needed.length);

  /* A file precached but no longer on disk fails the whole addAll, and the
     install fails silently — the phone simply never goes offline-capable. */
  const dead = pre.filter(u => !fs.existsSync(path.join(REPO, 'mobile', u)));
  ok('  and every precached file exists on disk', dead.length === 0, dead.join(',') || pre.length + ' checked');

  ok('the worker is on the same build as the page',
     (sw.match(/const BUILD = "(\d+)"/) || [])[1] === (page.match(/const BUILD="(\d+)"/) || [])[1],
     (sw.match(/const BUILD = "(\d+)"/) || [])[1] + ' vs ' + (page.match(/const BUILD="(\d+)"/) || [])[1]);
}

/* ── 4. both languages, everywhere ───────────────────────────────────────── */
console.log('\nnothing is written in only one language');
{
  const src = read('mobile/index.html');
  const grab = tag => {
    const i = src.indexOf(tag); if (i < 0) return null;
    let d = 0, j = src.indexOf('{', i), k = j;
    for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
    return src.slice(j, k + 1);
  };
  /* Several keys to a line, so anchoring to the start of one missed most of
     them; and a key that follows a comment follows neither a brace nor a comma,
     so it missed those too. Strip the comments, then every key follows one or
     the other. Getting this wrong reported 300 good strings as absent, which is
     worse than not checking — a linter nobody believes is a linter nobody
     runs. */
  const KEY = /[{,]\s*([a-z][A-Za-z0-9_]*)\s*:/g;
  const decomment = b2 => b2.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  const keysOf = blob => new Set([...decomment(blob).matchAll(KEY)].map(m => m[1]));
  const en = grab('  en:{'), ru = grab('  ru:{');
  if (en && ru) {
    const E = keysOf(en), R = keysOf(ru);
    const onlyEn = [...E].filter(k => !R.has(k));
    const onlyRu = [...R].filter(k => !E.has(k));
    note('dictionary', E.size + ' en, ' + R.size + ' ru');
    ok('every English string has a Russian one', onlyEn.length === 0, onlyEn.slice(0, 8).join(',') || 'all');
    ok('and no Russian string is orphaned', onlyRu.length === 0, onlyRu.slice(0, 8).join(',') || 'all');
  } else { ok('the dictionaries are readable', false, 'could not locate en:/ru: blocks'); }

  /* A key referenced by t() that does not exist prints the key itself — which
     is truthy, renders fine, and reads as a bug in the data. */
  const HAVE = en ? keysOf(en) : new Set();
  const used = new Set([...src.matchAll(/\bt\("([a-z][A-Za-z0-9_]*)"/g)].map(m => m[1]));
  /* t("type_"+type) is a computed key; the literal half is not a key at all. */
  const undef = [...used].filter(k => !HAVE.has(k) && !/_$/.test(k));
  ok('every t() key exists in the dictionary', undef.length === 0, undef.slice(0, 8).join(',') || used.size + ' used');

  /* data-i18n on an element whose key is gone leaves the English fallback
     frozen in the markup for ever. */
  const marked = new Set([...src.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]));
  const badMark = [...marked].filter(k => !HAVE.has(k));
  ok('every data-i18n key exists too', badMark.length === 0, badMark.slice(0, 8).join(',') || marked.size + ' marked');
}

/* ── 5. CSS that matches nothing, and markup that matches no CSS ─────────── */
console.log('\nno dead paint, no unpainted markup');
for (const f of PAGES) {
  const src = read(f), short = f.split('/')[0];
  const css = (src.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
  const body = src.slice(src.indexOf('</style>'));
  const defined = new Set([...css.matchAll(/\.([a-z][a-z0-9-]{2,})(?=[\s,:{.\[>+~])/gi)].map(m => m[1]));
  /* The maps, the report and the drive layer all emit class names, and a rule
     that only they use is not a dead rule. */
  const MODULES = ['mobile/wear-map.js', 'mobile/report-core.js', 'mobile/body-map.js',
                   'mobile/machine-fig.js', 'mobile/get.js', 'dashboard/report.js',
                   'dashboard/drive.js']
    .map(m => { try { return read(m); } catch (e) { return ''; } }).join('\n');
  const script = src.slice(src.indexOf('<script')) + MODULES;
  const alive = new Set(), prefixes = new Set();
  const take = str => str.split(/\s+/).forEach(c => {
    if (!c) return;
    /* "ucread wg b-" + band  builds b-act, b-watch, b-done. The literal in the
       source is the PREFIX, so a rule for the whole class looks unreferenced —
       which is how a linter talks somebody into deleting a live rule. */
    if (c.endsWith('-')) prefixes.add(c); else alive.add(c);
  });
  for (const m of body.matchAll(/class="([^"]+)"/g)) take(m[1]);
  /* ' open' — with the leading space that makes it append cleanly to a class
     attribute — is how half of these are applied. */
  for (const m of script.matchAll(/["'`](\s*[a-z][a-z0-9 _-]{2,})["'`]/gi)) take(m[1].trim());
  /* querySelectorAll(".um-spot .um-chain") names two live classes and neither
     starts with a letter. Read selector strings as selectors. */
  for (const m of script.matchAll(/["'`]([.#][^"'`]{2,120})["'`]/g))
    for (const c of m[1].matchAll(/\.([a-z][a-z0-9_-]*)/gi)) alive.add(c[1]);
  for (const m of script.matchAll(/class="([^"$]*)/g)) take(m[1]);
  for (const m of script.matchAll(/classList\.(?:add|remove|toggle|contains)\(\s*["']([^"']+)/g)) alive.add(m[1]);
  /* And a selector the CSS itself reaches by prefix is a selector in use. */
  for (const m of css.matchAll(/\[class\*="([a-z][a-z0-9-]*)"\]/g)) prefixes.add(m[1]);
  const dead = [...defined].filter(c =>
    !alive.has(c) && ![...prefixes].some(p => c.startsWith(p)));
  note(short + ' css', defined.size + ' classes defined');
  warn(short + ': no rule paints something that no longer exists', dead.length === 0,
       dead.slice(0, 10).join(',') || 'none');
}

/* ── 6. the shapes that have gone wrong before ───────────────────────────── */
console.log('\nthe mistakes this project has actually made');
{
  const src = read('mobile/index.html');

  /* .btn is display:block;width:100%. In a flex row it claims the whole row.
     Build 114 shipped the report button laid across the machine's name. */
  const flexBtn = [...src.matchAll(/<button[^>]*class="btn[^"]*"[^>]*style="[^"]*flex:\s*none/g)];
  ok('no full-width .btn is pinned into a flex row', flexBtn.length === 0, flexBtn.length + ' found');

  /* A dialog helper that takes [title, body], handed a bare string, prints the
     first two letters as the heading. Build 112 shipped four of them. */
  const dlgKeys = [...src.matchAll(/\bdlg\(t\("([a-z_]+)"\)\)/g)].map(m => m[1]);
  const enBlob = src.slice(src.indexOf('  en:{'), src.indexOf('  ru:{'));
  const notPairs = dlgKeys.filter(k => {
    const m = new RegExp('[{,]\\s*' + k + '\\s*:\\s*(.)')
      .exec(enBlob.replace(/\/\*[\s\S]*?\*\//g, ''));
    return m && m[1] !== '[';
  });
  ok('every dlg() message is a [title, body] pair', notPairs.length === 0, notPairs.join(',') || dlgKeys.length + ' checked');

  /* Assigning to a function's .name throws under "use strict". */
  ok('nothing assigns to a function\'s read-only name',
     !/\b[A-Z]\.name\s*=\s*function|\bT\.name\s*=/.test(src));

  /* A number field that is not inputmode=numeric gets the alphabetic keyboard
     on a phone, in a glove, at -40. */
  const nums = [...src.matchAll(/<input[^>]*type="number"(?![^>]*inputmode)[^>]*>/g)];
  ok('every number field asks for the number keypad', nums.length === 0,
     nums.slice(0, 2).map(m => (m[0].match(/id="[^"]+"/) || [''])[0]).join(',') || 'all');
}

/* ── 6b. every id the script reaches for actually exists ─────────────────── */
console.log('\nevery control the code reaches for is really there');
for (const f of PAGES) {
  const src = read(f), short = f.split('/')[0];
  /* $("saveBtn") on an id nobody defines returns null. Sometimes that throws
     at load and somebody notices; more often it is behind an `if (el)` guard,
     the wiring is skipped in silence, and a button ships that does nothing at
     all when pressed. That is the failure this project has shipped most often,
     and it is visible from here. */
  const defined = new Set([...src.matchAll(/\bid="([^"${}]+)"/g)].map(m => m[1]));
  const asked = new Set([...src.matchAll(/\$\("([^"]+)"\)/g)].map(m => m[1])
    .concat([...src.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1])));
  const ghosts = [...asked].filter(id => !defined.has(id));
  note(short, asked.size + ' ids reached for, ' + defined.size + ' defined');
  ok(short + ': no code reaches for an id that does not exist',
     ghosts.length === 0, ghosts.slice(0, 8).join(',') || 'all found');
}

/* ── 7. weight ───────────────────────────────────────────────────────────── */
console.log('\nwhat a phone has to pull down once');
{
  const sw = read('mobile/sw.js');
  const pre = [...new Set([...sw.matchAll(/"\.\/([^"?]+)/g)].map(m => m[1]))];
  let total = 0; const big = [];
  for (const u of pre) {
    const p = path.join(REPO, 'mobile', u);
    if (!fs.existsSync(p)) continue;
    const kb = fs.statSync(p).size / 1024; total += kb;
    if (kb > 150) big.push(u + ' ' + Math.round(kb) + 'K');
  }
  note('precache total', Math.round(total) + ' KB across ' + pre.length + ' files');
  note('the heavy ones', big.join(', ') || 'none over 150K');
  /* It is a one-time cost on a link that may be a satellite, and it is paid
     again on every build. Worth knowing when it moves. */
  warn('the install stays under 4 MB', total < 4096, Math.round(total) + ' KB');
}

console.log('');
if (warns.length) console.log('WARNINGS (' + warns.length + '): ' + warns.join(' | '));
console.log(fails.length ? 'FAILED ' + fails.length + ': ' + fails.join(' | ') : 'all passed');
process.exit(fails.length ? 1 : 0);
