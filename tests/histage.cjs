/* "MISSED 0" ON A PHONE THAT HAS NOT HEARD FROM THE FLEET.

   Two screenshots of the same URL on the same phone, on the same build:

     installed home-screen app    Missed 0   All 46   "Nothing due — or no
                                                       history on this phone yet."
     the same URL in Safari       Missed 6   All 52   six overdue machines listed

   Both were right about their own storage. iOS gives an installed PWA its own
   localStorage and IndexedDB, separate from the browser's — same origin, same
   build, different history. The installed copy had simply never completed a
   fleet pull, and nothing on screen said so.

   That is the inverse of this project's usual defect. A real value rendered as
   nothing is the one we keep finding; this is NOTHING RENDERED AS A REAL
   ANSWER, and it is worse, because "Missed 0" is not a blank the reader will
   question — it is a reassurance they will act on. Six machines were past
   their interval and a reliability engineer holding that phone had no reason
   to look again.

   Underneath it were three real faults:

     · nothing recorded WHEN this phone last heard from the fleet,
     · teamPull() catches its own errors and returns undefined, so a backend
       answering "unknown action" since the day of install failed silently for
       ever — the caller's .catch() was never reached,
     · a history file loaded by hand did not count as hearing from the fleet.

   And one that hid the fix: the dictionary already had due_never ("never
   done", for a machine with no last-done date). Adding a second due_never for
   the empty state put two keys of the same name in one object literal, the
   later won, and the new sentence rendered as "never done" with no error
   anywhere. So this suite checks the dictionaries for duplicate keys too — a
   whole class of silent string loss, not just the one instance.

   Run: node tests/histage.cjs        (needs tests/mock.cjs on 8098) */
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const SRC = fs.readFileSync(path.join(__dirname, '..', 'mobile', 'index.html'), 'utf8');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
/* Enough to put real machines on the missed list, so "Missed 0" would be a
   lie rather than a coincidence. */
const HIST = {
  'MP|TK160':   { d: ago(14), h: '7725' },
  'MP|TK158':   { d: ago(20), h: '7900' },
  'INSP|TK101': { d: ago(26), h: '10200' },
};

/* ---------- the dictionaries, read as text ----------------------------------
   A duplicate key is legal JavaScript that loses a string with no error, so it
   cannot be caught by asking the running app what t() returned — the app is
   perfectly happy. It has to be read off the source. */
function dictKeys() {
  const start = SRC.indexOf('const I18N = {');
  if (start < 0) return null;
  let i = start + 13, d = 0, lang = null, line = SRC.slice(0, start).split('\n').length;
  const seen = Object.create(null), dups = [], langs = {};
  while (i < SRC.length) {
    const c = SRC[i];
    if (c === '\n') line++;
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < SRC.length && SRC[i] !== q) { if (SRC[i] === '\n') line++; if (SRC[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '/' && SRC[i + 1] === '*') { while (i < SRC.length && !(SRC[i] === '*' && SRC[i + 1] === '/')) { if (SRC[i] === '\n') line++; i++; } i += 2; continue; }
    if (c === '/' && SRC[i + 1] === '/') { while (i < SRC.length && SRC[i] !== '\n') i++; continue; }
    if (c === '{' || c === '[') { d++; i++; continue; }
    if (c === '}' || c === ']') { d--; i++; if (d === 0) break; continue; }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < SRC.length && /[\w$]/.test(SRC[j])) j++;
      let k = j; while (k < SRC.length && /\s/.test(SRC[k])) k++;
      if (SRC[k] === ':') {
        const name = SRC.slice(i, j);
        if (d === 1) { lang = name; langs[lang] = langs[lang] || []; }
        else if (d === 2 && lang) {
          const id = lang + '.' + name;
          if (seen[id]) dups.push(id + ' (lines ' + seen[id] + ' and ' + line + ')');
          else { seen[id] = line; langs[lang].push(name); }
        }
      }
      i = j; continue;
    }
    i++;
  }
  return { dups, langs };
}

(async () => {
  console.log('the dictionaries lose nothing to a name collision');
  const D = dictKeys();
  ok('the I18N block was found and parsed', !!D && Object.keys(D.langs).length >= 2,
     D ? Object.keys(D.langs).join(' ') : 'not found');
  /* THE ONE THAT NAMES THE BUG. due_never was defined twice in each language;
     the second won and the new sentence never appeared. */
  ok('no key is defined twice in any language', D.dups.length === 0,
     D.dups.slice(0, 6).join(' · ') || 'none');

  const NEW = ['hist_at', 'hist_now', 'hist_min', 'hist_hr', 'hist_day',
               'hist_never', 'hist_fail', 'due_no_hist', 'due_stale', 'due_empty'];
  for (const lang of ['en', 'ru']) {
    const have = new Set(D.langs[lang] || []);
    const miss = NEW.filter(k => !have.has(k));
    ok('every freshness string exists in ' + lang, miss.length === 0, miss.join(' ') || 'all present');
  }
  /* The old meaning must survive: a machine with no last-done date still reads
     "never done" on its row, and that is a different sentence from "this phone
     has no history at all". */
  ok('due_never still means a machine that has never been done',
     (D.langs.en || []).includes('due_never') && /due_never:"never done"/.test(SRC));

  console.log('\na failure inside teamPull is recorded where it happens');
  /* teamPull() catches its own errors and returns undefined, so a .catch() on
     the caller can never fire. Guarding the source, not just the behaviour,
     because the behaviour test below can only reach one of the three paths. */
  const pull = SRC.slice(SRC.indexOf('async function teamPull('),
                         SRC.indexOf('let teamShow=""'));
  ok('an unreadable reply is marked as a failed pull', /if\(!j\)\{[\s\S]{0,220}histNote\(/.test(pull));
  ok('a refusal from the backend is marked as a failed pull', /j\.ok===false\)\{[\s\S]{0,300}histNote\(/.test(pull));
  ok('a thrown fetch is marked as a failed pull', /\}catch\(e\)\{[\s\S]{0,500}histNote\(/.test(pull));
  ok('being offline is NOT marked as a failure',
     !/navigator\.onLine\)\{[^\n]*histNote/.test(pull));
  ok('a history file loaded by hand counts as hearing from the fleet',
     /histSave\(h\); histStamp\(/.test(SRC));

  const b = await chromium.launch();
  const mk = async seed => {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
    await p.addInitScript(s => {
      if (s.hist) localStorage.setItem('cm_hist', JSON.stringify(s.hist));
      if (s.at) localStorage.setItem('cm_hist_at', JSON.stringify(s.at));
      if (s.err) localStorage.setItem('cm_hist_err', s.err);
      /* No url = a phone in the pit. Being offline is not a failed pull, so
         the startup pull returns without recording anything and without
         restamping — which leaves the age line to speak for itself, which is
         what these fixtures are reading. (An empty destination list is NOT the
         way to get there: loadDests() falls back to the packaged default, and
         the fixture would then be testing a real unreachable endpoint.) */
      if (!s.url) Object.defineProperty(navigator, 'onLine', { get: () => false });
      // the pit is a port nobody listens on: the app no longer gates a pull on the flag
      localStorage.setItem('up_dests', JSON.stringify(
        [{ id: 'gas', on: true, url: s.url || 'http://127.0.0.1:9/exec', sec: '', folder: '' }]));
    }, seed);
    await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1400);
    await p.evaluate(() => showPane('paneDue'));
    await p.waitForTimeout(500);
    return { ctx, p };
  };
  /* Every expected string is read out of the app's own dictionary. A suite
     holding its own copy of a label is a second source of truth that drifts —
     six of them were found doing exactly that. */
  const say = (p, k, v) => p.evaluate(([k, v]) => t(k, v || undefined), [k, v]);
  const note = p => p.evaluate(() => (document.getElementById('dueBasis') || {}).textContent || '');
  const warn = p => p.evaluate(() => !!(document.getElementById('dueBasis') || {}).classList
                                     && document.getElementById('dueBasis').classList.contains('warn'));
  const empty = p => p.evaluate(() => {
    const e = document.querySelector('#dueList .empty'); return e ? e.textContent.trim() : null; });

  console.log('\na phone that has never heard from the fleet says so');
  {
    const { ctx, p } = await mk({ hist: HIST });
    ok('the note carries the never-loaded warning', (await note(p)).includes(await say(p, 'hist_never')),
       (await note(p)).slice(-70));
    ok('and the note is marked as a warning', await warn(p));
    await ctx.close();
  }

  console.log('\nand with nothing due, it does not say "nothing due"');
  {
    /* No history at all: the list is empty because this phone knows nothing,
       not because the fleet is in good order. Those are different sentences
       and only one of them is reassuring. */
    const { ctx, p } = await mk({});
    const e = await empty(p);
    ok('the empty list explains that there is no history yet', e === await say(p, 'due_no_hist'), e);
    ok('it is not the reassuring one', e !== await say(p, 'due_empty'));
    ok('and it is not the row label for a machine never done', e !== await say(p, 'due_never'));
    await ctx.close();
  }

  console.log('\na stamp older than a shift is stale, not silent');
  {
    const at = { at: Date.now() - 30 * 3600 * 1000, n: 3 };
    const { ctx, p } = await mk({ hist: HIST, at });
    const n = await note(p);
    ok('the note says how long ago', n.includes(await say(p, 'hist_at', { t: await say(p, 'hist_hr', { n: 30 }) })), n.slice(-70));
    ok('and warns, because it is older than a shift', await warn(p));
    await ctx.close();
  }
  {
    const at = { at: Date.now() - 3 * 60000, n: 3 };
    const { ctx, p } = await mk({ hist: HIST, at });
    ok('a stamp from minutes ago reads in minutes',
       (await note(p)).includes(await say(p, 'hist_min', { n: 3 })), (await note(p)).slice(-70));
    ok('and does not warn', !(await warn(p)));
    await ctx.close();
  }
  {
    /* Fresh stamp, nothing due: this is the only case where "Nothing due" is
       a true statement, and it is the only case that may say it. */
    const { ctx, p } = await mk({ at: { at: Date.now() - 60000, n: 0 } });
    const e = await empty(p);
    ok('a fresh phone with nothing due may say nothing is due', e === await say(p, 'due_empty'), e);
    await ctx.close();
  }
  {
    const at = { at: Date.now() - 40 * 3600 * 1000, n: 0 };
    const { ctx, p } = await mk({ at });
    const e = await empty(p);
    ok('a stale phone with nothing due says when it last looked',
       e === await say(p, 'due_stale', { t: await say(p, 'hist_hr', { n: 40 }) }), e);
    await ctx.close();
  }

  console.log('\na recorded failure outranks a good stamp');
  {
    /* The install that had been failing since day one still held whatever
       stamp its last working pull left. A failure since then is the newer
       fact, and it wins. */
    const { ctx, p } = await mk({ hist: HIST, at: { at: Date.now() - 60000, n: 3 }, err: 'Failed to fetch' });
    ok('the note says the system could not be reached',
       (await note(p)).includes(await say(p, 'hist_fail')), (await note(p)).slice(-80));
    ok('and it warns even though the stamp is a minute old', await warn(p));
    await ctx.close();
  }

  console.log('\na pull that lands clears the warning; one that does not sets it');
  {
    const { ctx, p } = await mk({ hist: HIST, url: BASE + '/exec' });
    await p.evaluate(() => teamPull(true, false));
    await p.waitForTimeout(1200);
    const stamped = await p.evaluate(() => localStorage.getItem('cm_hist_at'));
    ok('a successful pull stamps the time', !!stamped && !!JSON.parse(stamped).at);
    ok('and clears any recorded failure', !(await p.evaluate(() => localStorage.getItem('cm_hist_err'))));
    await p.evaluate(() => renderDue());
    ok('the note no longer warns', !(await warn(p)), (await note(p)).slice(-60));
    await ctx.close();
  }
  {
    /* The path that used to be silent: the backend answers, and refuses. */
    const { ctx, p } = await mk({ hist: HIST, at: { at: Date.now() - 60000, n: 3 }, url: BASE + '/old' });
    await p.evaluate(() => { localStorage.setItem('up_index', JSON.stringify({ [document.location.origin + '/old']: false })); });
    await p.evaluate(() => teamPull(true, false));
    await p.waitForTimeout(1200);
    ok('a backend that refuses the request is recorded as a failed pull',
       !!(await p.evaluate(() => localStorage.getItem('cm_hist_err'))),
       String(await p.evaluate(() => localStorage.getItem('cm_hist_err'))));
    await ctx.close();
  }

  await b.close();
  console.log('\n' + (fails.length ? 'FAILED ' + fails.length + '\n  ' + fails.join('\n  ') : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
