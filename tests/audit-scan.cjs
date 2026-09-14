#!/usr/bin/env node
/* A LINE-BY-LINE READING OF EVERY SHIPPED FILE, DONE BY SOMETHING THAT DOES
   NOT GET TIRED.

   42,780 lines across two surfaces, one engine, a worker and two backends.
   This walks all of them and reports the failure shapes this project has
   actually produced, in the order they have cost real work:

     · a crash path   — a property read off something that can be null
     · a silent path  — a catch that swallows, a guard that can never be true
     · two truths     — one fact stated in two places that can disagree
     · dead weight    — a function nothing calls, a branch nothing reaches

   It reports CANDIDATES, not verdicts. Every finding has to be read before it
   is believed: this file's own job is to make sure nothing is missed, not to
   decide. A scanner that cries wolf is the noise a real failure hides in, so
   each check carries its own known-innocent exclusions and says how many it
   suppressed.

   Run: node tests/audit-scan.cjs [--full] */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const FULL = process.argv.includes('--full');

/* ── the units under audit ─────────────────────────────────────────────────
   An HTML file is not one program: it is the inline <script> blocks plus the
   markup. The blocks are extracted with their TRUE line offsets so every
   finding points at a line the maintainer can open. */
const FILES = [
  'mobile/index.html', 'dashboard/index.html', 'mobile/report-core.js',
  'mobile/sw.js', 'mobile/due.js', 'mobile/grade.js', 'mobile/report.js',
  'dashboard/report.js', 'mobile/terms.js', 'mobile/pts.js', 'mobile/lube.js',
  'mobile/upload-defaults.js', 'docs/yandex/function.js', 'docs/yandex/server.js',
].filter(f => fs.existsSync(path.join(ROOT, f)));

function units(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (!/\.html$/.test(file)) return [{ file, code: src, offset: 0, src }];
  const out = []; const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src))) {
    if (/\bsrc=/.test(m[1])) continue;                   // external, not ours
    const before = src.slice(0, m.index + m[0].indexOf('>') + 1);
    out.push({ file, code: m[2], offset: before.split('\n').length - 1, src });
  }
  return out;
}

/* Names some shipped file genuinely publishes onto window. `const HME =
   window.HME || {}` is not a dead guard: hme.js assigns window.HME, and the
   const is the local alias. Only a name NOBODY publishes is the build-367
   trap. */
/* EVERY script the two surfaces can load, found by listing the folders — not
   a hand-written list. The first version of this WAS a hand-written list, it
   spelled the magnetic-plug module `mobile/mpfc.js` when the file on disk is
   `mobile/mp-fc.js`, and so it reported both surfaces' `window.MPFC` as a
   guard that can never be true. A list of the files that define the truth is
   itself a second copy of the truth, and it disagreed on its first run. */
const GLOBALS = new Set();
['mobile', 'data', 'dashboard'].forEach(dir => {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) return;
  fs.readdirSync(d).filter(n => /\.js$/.test(n)).forEach(n => {
    const t = fs.readFileSync(path.join(d, n), 'utf8');
    let m; const re = /window\.([A-Za-z_$][\w$]*)\s*=[^=]/g;
    while ((m = re.exec(t))) GLOBALS.add(m[1]);
  });
});
FILES.forEach(f => { const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  let m; const re = /window\.([A-Za-z_$][\w$]*)\s*=[^=]/g;
  while ((m = re.exec(t))) GLOBALS.add(m[1]); });

const findings = [];
const I18N_SEEN = [];
const add = (sev, kind, file, line, text, note) =>
  findings.push({ sev, kind, file, line, text: String(text).trim().slice(0, 120), note });

/* ONE lexer, two views of the file, offsets preserved in both:
     code — comments blanked, string CONTENT kept  (for reading keys out of calls)
     mask — comments AND string content blanked    (for reading keys out of tables)

   Both had to exist, and the lexer had to learn a regex literal from a
   division, because this scanner's first two answers were wrong in exactly
   the two ways it is built to catch:

   · The report engine DOCUMENTS its own accessors — `T("k")`, `T.I("k")` — in
     a comment; a scan that read comments filed that documentation as a label
     with no translation.
   · `esc()` is `String(s).replace(/[&<>"']/g, …)`, and a walker that does not
     know a regex from a division sees the `"` in that character class, opens a
     string, and runs to the next quote hundreds of lines later — swallowing
     real code AND handing comment text back as code. That single line
     desynchronised everything after it in report-core.js.

   The regex/division test is the standard one: after `)` `]` `}` or a word
   character a `/` divides, unless that word is a keyword that cannot end an
   expression. */
const RX_KW = /(?:return|typeof|instanceof|case|in|of|new|delete|void|do|else|yield|await)$/;
function lex(src) {
  const code = new Array(src.length), mask = new Array(src.length);
  const put = (i, a, b) => { code[i] = a; mask[i] = b; };
  const gone = (a, b) => { for (let i = a; i < b && i < src.length; i++) {
    const nl = src[i] === '\n'; put(i, nl ? '\n' : ' ', nl ? '\n' : ' '); } };
  const text = (a, b) => { for (let i = a; i < b && i < src.length; i++) {
    const nl = src[i] === '\n'; put(i, src[i], nl ? '\n' : ' '); } };
  let i = 0;

  /* A TEMPLATE LITERAL IS NOT "UP TO THE NEXT BACKTICK". The office page
     builds its tables as a template whose ${…} holds MORE templates —
     `<td>${r.planned ? `<span>—</span>` : cell(r.descr)}</td>` — and a walker
     that counts backticks pairs the inner close with the outer open, ends the
     literal one backtick early, and reads the rest of the file inside out.
     That is how a comment 250 lines later kept its backticks, the depth count
     drifted, and the scope this scanner uses to find a function's callers
     spanned half the page. So ${…} re-enters code, recursively. */
  function tpl() {
    put(i, '`', '`'); i++;
    while (i < src.length) {
      if (src[i] === '\\') { text(i, i + 2); i += 2; continue; }
      if (src[i] === '`') { put(i, '`', '`'); i++; return; }
      if (src[i] === '$' && src[i + 1] === '{') {
        put(i, '$', '$'); put(i + 1, '{', '{'); i += 2;
        codeSpan(true);
        if (i < src.length && src[i] === '}') { put(i, '}', '}'); i++; }
        continue;
      }
      text(i, i + 1); i++;
    }
  }

  function codeSpan(stopAtBrace) {
    let braces = 0;
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (stopAtBrace && c === '}' && braces === 0) return;
      if (c === '/' && n === '/') { const e = src.indexOf('\n', i); const st = e < 0 ? src.length : e; gone(i, st); i = st; continue; }
      if (c === '/' && n === '*') { const e = src.indexOf('*/', i); const st = e < 0 ? src.length : e + 2; gone(i, st); i = st; continue; }
      if (c === '"' || c === "'") {
        put(i, c, c); i++;
        while (i < src.length) {
          if (src[i] === '\\') { text(i, i + 2); i += 2; continue; }
          if (src[i] === c) break;
          if (src[i] === '\n') break;                 /* an unterminated quote */
          text(i, i + 1); i++;
        }
        if (i < src.length && src[i] === c) { put(i, c, c); i++; }
        continue;
      }
      if (c === '`') { tpl(); continue; }
      if (c === '/') {                       /* regex literal, or a division */
        let k = i - 1; while (k >= 0 && /\s/.test(src[k])) k--;
        const prev = k >= 0 ? src[k] : '';
        let isRe = true;
        if (/[)\]}]/.test(prev)) isRe = false;
        else if (/[\w$]/.test(prev)) {
          let w = k; while (w >= 0 && /[\w$]/.test(src[w])) w--;
          isRe = RX_KW.test(src.slice(w + 1, k + 1));
        }
        if (isRe) {
          const s = i; let cls = false, j = i;
          for (j++; j < src.length; j++) {
            const d = src[j];
            if (d === '\\') { j++; continue; }
            if (d === '\n') { j = s; break; }          /* not a regex after all */
            if (d === '[') cls = true;
            else if (d === ']') cls = false;
            else if (d === '/' && !cls) break;
          }
          if (j > s) { gone(s, Math.min(j + 1, src.length)); i = Math.min(j + 1, src.length); continue; }
        }
      }
      if (c === '{') braces++; else if (c === '}') braces--;
      put(i, c, c); i++;
    }
  }

  codeSpan(false);
  for (let k = 0; k < src.length; k++) if (code[k] === undefined) put(k, src[k], src[k]);
  return { code: code.join(''), mask: mask.join('') };
}
function codeOnly(src) { return lex(src).code; }

/* Strings, template literals, REGEX LITERALS and comments blanked so a pattern
   cannot match inside a message to a human — and, just as important, so brace
   counting is not thrown by a `{` inside a character class. This function
   hand-rolled its own walker and did not know a regex from a division, so
   `/[&<>"']/g` in esc() opened a phantom string, the depth drifted, and the
   scope the JSON.parse check uses to find a function's callers spanned half
   the file. It is the lexer above now — one of them, for both jobs. */
function blank(code) { return lex(code).mask; }

/* The nearest `function NAME(` / `const NAME = … function|=>` at or above a
   line. Deliberately shallow: it answers null rather than guess, and a null
   answer only makes the caller report a finding it would have reported anyway. */
function enclosingFn(safe, i) {
  for (let k = i; k >= 0; k--) {
    const m = safe[k].match(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/)
           /* the arrow forms too — `const ask = async pr => {` is the one that
              holds the conflict re-check's only JSON.parse, and missing it
              blamed the function three levels out */
           || safe[k].match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/);
    if (m) return { name: m[1], at: k };
  }
  return null;
}
/* Lines where NAME( is called with no try open at that column — its own
   definition excepted.

   SCOPED, because a name is not unique. `ask` is a local arrow inside
   cfRecheck and there is another `ask` elsewhere in the same 14,000-line
   unit; an unscoped search found the other one's caller and blamed a function
   in a different part of the file. A definition at brace depth d can only be
   called inside the block that encloses it, so the search is bounded to that
   block. */
function callsOutsideTry(safe, openAt, name, defLine, depthAt) {
  let lo = 0, hi = safe.length - 1;
  if (depthAt) {
    const d = depthAt[defLine];
    if (d > 0) {
      for (let k = defLine; k >= 0; k--) if (depthAt[k] < d) { lo = k; break; }
      for (let k = defLine; k < safe.length; k++) if (depthAt[k] < d) { hi = k; break; }
    }
  }
  const re = new RegExp('\\b' + name.replace(/[$]/g, '\\$') + '\\s*\\(', 'g');
  const bare = [];
  for (let k = lo; k <= hi; k++) {
    const s = safe[k];
    if (k === defLine) continue;
    if (/^\s*(?:async\s+)?function\s/.test(s) && s.indexOf(name) >= 0) continue;
    let m; re.lastIndex = 0;
    while ((m = re.exec(s))) if (!(openAt[k] && openAt[k][m.index])) bare.push(k);
  }
  return bare;
}

function scanUnit(u) {
  const raw = u.code.split('\n');
  const masked = blank(u.code);
  const safe = masked.split('\n');
  const L = (i) => u.offset + i + 1;

  /* THE LEXER SAYS WHETHER IT STAYED IN SYNC, and every check below is only
     worth as much as that answer. A walker that loses its place does not
     fail: it silently reads code as text and text as code, and the checks go
     quiet. Every shipped unit balances its braces exactly, so a non-zero
     balance means the mask is fiction — said out loud rather than scanned. */
  const bal = (masked.match(/\{/g) || []).length - (masked.match(/\}/g) || []).length;
  if (bal !== 0) {
    add('high', 'lex-desync', u.file, u.offset + 1, 'brace balance ' + bal,
      'the lexer did not stay in sync over this unit — every finding in it, and '
      + 'every silence, is unreliable');
    return;
  }

  /* ── 1b. AN ELEMENT THIS PAGE DOES NOT HAVE ─────────────────────────────
     The two surfaces share code and share habits, and $("x") answers null for
     an id that is not on THIS page — then .value throws and takes the rest of
     the handler with it. Every literal id asked for is checked against the
     ids the file actually declares. This is the precise form of the check
     below, and the one worth acting on. */
  if (/\.html$/.test(u.file)) {
    /* an id is "declared" by the markup, by setAttribute("id",…), by .id="…"
       and by an id built into a template string — the boot-stall panel is
       created by script precisely because it has to exist when the markup
       has not parsed, and calling that a missing element is a false alarm. */
    const ids = new Set();
    let mm; const idre = /\sid\s*=\s*["']([^"']+)["']/g;
    while ((mm = idre.exec(u.src))) ids.add(mm[1]);
    const dynre = /(?:setAttribute\(\s*["']id["']\s*,\s*["']([\w-]+)["']|\.id\s*=\s*["']([\w-]+)["']|id=\\?["']([\w-]+)\\?["'])/g;
    while ((mm = dynre.exec(u.src))) ids.add(mm[1] || mm[2] || mm[3]);
    raw.forEach((line, i) => {
      const s = safe[i]; let m;
      const re = /(?:\$|document\.getElementById)\(\s*["']([A-Za-z_][\w-]*)["']\s*\)/g;
      /* the blanked copy has no string bodies, so read ids off the RAW line
         and only where the blanked line shows the call shape */
      if (!/(?:\$|document\.getElementById)\(/.test(s)) return;
      while ((m = re.exec(line))) {
        if (!ids.has(m[1])) {
          const after = line.slice(m.index + m[0].length, m.index + m[0].length + 3);
          add(/^\s*\./.test(after) ? 'high' : 'med', 'missing-id', u.file, L(i), line,
              'id "' + m[1] + '" is never declared in this file'
                + (/^\s*\./.test(after) ? ' — and a property is read off it' : ''));
        }
      }
    });
  }

  /* ── 1. A PROPERTY READ OFF SOMETHING THAT CAN BE NULL ───────────────────
     $("x") and getElementById return null for an id that is not on THIS page
     — and these two surfaces share code, so an id that exists on one is
     absent on the other. `$("x").value` then throws and takes the rest of the
     handler with it. The guarded spellings are the fleet's own idiom and are
     not findings: ($("x")||{}), if($("x")), const e=$("x"); if(!e). */
  raw.forEach((line, i) => {
    const s = safe[i]; if (!s.trim()) return;
    const re = /(?:\$|document\.getElementById)\(\s*\)?\s*[^)]*\)\s*\.\s*([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = re.exec(s))) {
      const at = m.index;
      const before = s.slice(Math.max(0, at - 40), at);
      if (/\|\|\s*\{\s*\}\s*\)\s*$/.test(before)) continue;      // ($("x")||{}) .
      if (/\bif\s*\(\s*$/.test(before)) continue;
      if (/[?&|]\s*$/.test(before)) continue;                     // a && $("x").b
      const after = s.slice(at);
      if (/\|\|\s*\{\s*\}/.test(after.slice(0, 60))) continue;
      if (/\?\./.test(after.slice(0, 60))) continue;              // optional chain
      /* guarded on an earlier line in the same statement block is common and
         cannot be seen from one line — flagged at low severity for reading. */
      add('low', 'null-deref?', u.file, L(i), line, 'reads .' + m[1] + ' off a lookup that can be null');
    }
  });

  /* ── 2. A CATCH THAT SWALLOWS ────────────────────────────────────────────
     Deliberate silence is a real tool here — a diagnostic that fails must not
     become a fault, and a server that does not answer produces no finding.
     But a bare catch on a path that WRITES or SENDS is how a real value
     becomes nothing, which is this project's signature defect. Reported so
     each can be judged; the count is the point, not any single one. */
  raw.forEach((line, i) => {
    const s = safe[i];
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(s)) add('low', 'empty-catch', u.file, L(i), line, 'swallows');
  });

  /* ── 3. JSON.parse OUTSIDE ANY try ──────────────────────────────────────
     Every unguarded one is a crash on malformed input, and localStorage and
     the wire both deliver malformed input in the field.

     "no try within three lines above" reported five and all five were
     guarded — a `.catch()` on the next line, or a try opened forty lines
     earlier at the top of the function. So the braces are COUNTED: the depth
     at which each `try {` opens is remembered and the parse is a finding only
     when no try is still open around it. A promise chain that answers its own
     rejection on the following lines is guarded too.

     A try that opens and closes on ONE line — `try{ … }catch(e){ … }`, the
     idiom every localStorage read here uses — is only ever open in the middle
     of that line, so the state is read at the parse's own COLUMN and not at
     the end of the line. Read at the end it reported `recentReports()`, whose
     guard is four characters to the left of the call. */
  const tryDepth = [];            // depths of the `try {` blocks open right now
  let depth = 0; const openAt = [], depthAt = [];
  safe.forEach((s, i) => {
    const cols = openAt[i] = []; depthAt[i] = depth;
    let pend = false;
    for (let c = 0; c < s.length; c++) {
      cols[c] = tryDepth.length > 0;
      if (s.startsWith('try', c) && /^\s*\{/.test(s.slice(c + 3))) pend = true;
      if (s[c] === '{') { depth++; if (pend) { tryDepth.push(depth); pend = false; } }
      else if (s[c] === '}') { depth--; while (tryDepth.length && tryDepth[tryDepth.length - 1] > depth) tryDepth.pop(); }
    }
    cols[s.length] = tryDepth.length > 0;
  });
  raw.forEach((line, i) => {
    const s = safe[i];
    const at = s.search(/JSON\.parse\s*\(/);
    if (at < 0) return;
    if (/JSON\.parse\s*\(\s*JSON\.stringify\s*\(/.test(s)) return;  // deep clone, cannot throw
    if (openAt[i] && openAt[i][at]) return;
    /* a rejection handler on this line or just after it catches a throw
       inside the same .then() */
    if (/\.catch\s*\(/.test(safe.slice(i, i + 3).join(' '))) return;
    /* A FUNCTION MAY THROW ON PURPOSE. `serverList` answers with the folder's
       listing or throws — `if(!r.ok) throw`, `throw new Error("list gave no
       files")` — and a malformed body belongs in exactly that channel. Its
       callers all catch. So the enclosing function is found, and if EVERY
       call to it in this unit sits inside an open try, the parse is guarded
       where it is meant to be. A single unguarded caller and the finding
       stands, naming that line. */
    const fn = enclosingFn(safe, i);
    if (fn) {
      /* and the chain can be longer than one link: serverList() throws,
         serverNames() calls it bare, and the caller that catches is the one
         above THAT. Followed to a bounded depth; anything deeper, or a
         function called from nowhere this unit can see, is reported. */
      const seenFn = new Set([fn.name]);
      let level = [fn], bare = null;
      for (let d = 0; d < 4 && level.length; d++) {
        const next = [];
        for (const g of level) {
          const calls = callsOutsideTry(safe, openAt, g.name, g.at, depthAt);
          for (const k of calls) {
            const up = enclosingFn(safe, k);
            if (!up || seenFn.has(up.name)) { bare = bare || { line: k, of: g.name }; continue; }
            seenFn.add(up.name); next.push(up);
          }
        }
        if (bare) break;
        level = next;
      }
      if (!bare) return;                       /* every path up ends in a try */
      add('med', 'json-parse', u.file, L(i), line,
        'JSON.parse with no try around it, in ' + fn.name + '() — and '
        + bare.of + '() is called without one at line ' + L(bare.line));
      return;
    }
    add('med', 'json-parse', u.file, L(i), line, 'JSON.parse with no try open around it');
  });

  /* ── 4. A GUARD THAT CAN NEVER BE TRUE ───────────────────────────────────
     `window.X && ...` where X is declared with let/const at module scope is
     ALWAYS false: a let is not a property of window. Build 367 shipped one of
     these, and it would have answered "1C has nothing planned" for all 1,128
     machines in silence. This is the check that would have caught it. */
  const declared = new Set();
  safe.forEach((s) => {
    const m = s.match(/^\s*(?:let|const)\s+([A-Za-z_$][\w$]*)/);
    if (m) declared.add(m[1]);
  });
  raw.forEach((line, i) => {
    const s = safe[i]; let m;
    const re = /window\.([A-Za-z_$][\w$]*)/g;
    while ((m = re.exec(s))) {
      if (declared.has(m[1]) && !GLOBALS.has(m[1])) {
        add('high', 'dead-guard', u.file, L(i), line,
            'window.' + m[1] + ' — but ' + m[1] + ' is a let/const at module scope, so this is always undefined');
      }
    }
  });

  /* ── 5. ONE NAME, DECLARED TWICE IN ONE SCOPE ────────────────────────────
     A second `function f(){}` silently replaces the first; a second `var x`
     silently keeps the last value. Both read as working code.

     IN ONE SCOPE. The report engine has four functions called `cell` and two
     called `row`, every one of them a private helper inside a different
     section builder, and nothing shadows anything. Keyed on the name alone
     this reported all four — and it did so only after the lexer was fixed,
     which is the useful part: the answer changed because the reading changed,
     so the key has to carry the block the name is declared in. */
  const seen = new Map();
  safe.forEach((s, i) => {
    const m = s.match(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/)
           || s.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function/);
    if (!m) return;
    /* the line where the enclosing block opened — the scope's own identity */
    let scope = -1;
    for (let k = i; k >= 0; k--) if (depthAt[k] < depthAt[i]) { scope = k; break; }
    const key = m[1] + '@' + scope;
    if (seen.has(key)) add('high', 'redeclared', u.file, L(i), raw[i],
      m[1] + ' was already defined in this same scope at line ' + seen.get(key)
      + ' — the later one wins, silently');
    else seen.set(key, L(i));
  });
}

/* ── 0. THE SCANNER PROVES IT CAN SEE, BEFORE IT IS BELIEVED ──────────────
   Every check above was tightened to stop it crying wolf, and each tightening
   is a step towards a scanner that reports nothing because it looks at
   nothing. That failure is invisible: a clean report and a blind one are the
   same text. So a synthetic unit carrying ONE of each defect is scanned
   first, and a check that does not find its own planted fault is reported as
   BLIND — loudly, at the top, in place of the clean bill it would otherwise
   have given. */
const PLANT = [
  ['missing-id',  'var e = document.getElementById("zzNotOnThisPage").value;'],
  ['null-deref?', 'var v = $("zzAlsoAbsent").value;'],
  ['empty-catch', 'try{ risky(); }catch(e){}'],
  ['json-parse',  'var o = JSON.parse(wire);'],
  ['dead-guard',  'const ZZNOBODY = window.ZZNOBODY || {};'],
  ['redeclared',  'function zzTwice(){}\nfunction zzTwice(){}'],
];
{
  const before = findings.length;
  scanUnit({ file: 'planted.html', offset: 0, src: '<div id="real"></div>',
             code: PLANT.map(p => p[1]).join('\n') });
  const got = new Set(findings.slice(before).map(f => f.kind));
  findings.length = before;                      /* the fixture is not a finding */
  const blind = PLANT.map(p => p[0]).filter(k => !got.has(k));
  if (blind.length) add('high', 'scanner-blind', 'tests/audit-scan.cjs', 1, blind.join(', '),
    'these checks did not find a fault planted for them — their silence on the real files means nothing');
}

FILES.flatMap(units).forEach(scanUnit);

/* ── 6. A KEY THAT EXISTS IN ONE LANGUAGE AND NOT THE OTHER ───────────────
   This is the check with a record. t() and T() answer a missing key WITH THE
   KEY, which is a truthy string that renders exactly like a value: the
   masthead of every tray and GET report once printed the literal words
   "method_TB" and "method_GET", and on 2026-09-14 the first page of every
   machine report printed "method_LUBE". Three misses, the same shape, and
   nothing in the tooling looked. Each dictionary is read out of the file and
   every key ASKED FOR is checked against both.

   Only literal keys can be checked — t("g_" + n) is built at run time and is
   invisible here, which is exactly why the tables also get a symmetry check:
   a key present in one language and absent in the other is a defect whether
   or not anything asks for it today. */

function dictOf(src, langTag) {
  /* the table is `en: { ... }` / `ru: { ... }`. A regex over the body reads
     every word before a colon, and a LABEL'S OWN TEXT contains colons —
     "Note: retake the position" made a key called "Note", and 64 English
     words were reported as missing Russian. So the body is WALKED: strings,
     template literals and comments are skipped whole, and an identifier is a
     key only at depth 1 and only when a colon follows it. */
  const i = src.indexOf(langTag);
  if (i < 0) return null;
  const open = src.indexOf('{', i);
  if (open < 0) return null;
  const keys = new Set();
  let depth = 0, j = open, pendId = null, pendDepth = 0;
  for (; j < src.length; j++) {
    const c = src[j], n = src[j + 1];
    if (c === '/' && n === '/') { j = src.indexOf('\n', j); if (j < 0) break; continue; }
    if (c === '/' && n === '*') { j = src.indexOf('*/', j); if (j < 0) break; j++; continue; }
    if (c === '"' || c === "'" || c === '`') {          /* skip the literal whole */
      const s = j;
      for (j++; j < src.length; j++) {
        if (src[j] === '\\') { j++; continue; }
        if (src[j] === c) break;
      }
      /* a quoted key — `"gal_odd_heic": "…"` — is still a key */
      pendId = null;
      const inner = src.slice(s + 1, j);
      if (c !== '`' && /^[A-Za-z_][\w.-]*$/.test(inner)) { pendId = inner; pendDepth = depth; }
      continue;
    }
    if (c === '{') { depth++; pendId = null; continue; }
    if (c === '}') { depth--; pendId = null; if (!depth) break; continue; }
    if (/[A-Za-z_]/.test(c)) {
      let k = j; while (k < src.length && /[\w]/.test(src[k])) k++;
      pendId = src.slice(j, k); pendDepth = depth; j = k - 1; continue;
    }
    if (c === ':') { if (pendId && pendDepth === 1 && depth === 1) keys.add(pendId); pendId = null; continue; }
    if (!/\s/.test(c)) pendId = null;
  }
  return keys.size ? keys : null;
}

function i18nTables(f, raw) {
  const src = codeOnly(raw);   /* comments and regex literals gone, strings intact */
  const en = dictOf(src, /\.js$/.test(f) ? 'en: {' : '  en:{') || dictOf(src, 'en:{') || dictOf(src, 'en: {');
  const ru = dictOf(src, /\.js$/.test(f) ? 'ru: {' : '  ru:{') || dictOf(src, 'ru:{') || dictOf(src, 'ru: {');
  return { src, en, ru };
}

/* THE CHECK PROVES IT CAN STILL SEE, on every run, before it is believed.
   A silent zero is this project's signature defect wearing a tester's coat:
   the first two versions of this check reported 86 findings and every one was
   an artefact of its own parser, and a third version that had gone blind would
   have reported a clean sweep just as confidently. So one gap and one missing
   key are PLANTED in a copy of each file and the check is asked to find
   exactly those. If it cannot, the scan says so instead of saying nothing. */
function i18nSelfProof(f, raw) {
  const bad = [];
  const { en, ru } = i18nTables(f, raw);
  if (!en || !ru) return ['tables unreadable'];
  if (en.size < 50) bad.push('EN table implausibly small (' + en.size + ')');
  /* plant a gap: add a key to EN only, at the head of its table */
  const tag = /\.js$/.test(f) ? 'en: {' : (raw.includes('  en:{') ? '  en:{' : 'en:{');
  const at = raw.indexOf(tag);
  if (at < 0) return ['language tag not found'];
  const cut = raw.indexOf('{', at) + 1;
  const planted = raw.slice(0, cut) + ' zz_planted_gap:"x",' + raw.slice(cut);
  const p = i18nTables(f, planted);
  if (!p.en || !p.en.has('zz_planted_gap')) bad.push('planted EN key not seen');
  if (p.ru && p.ru.has('zz_planted_gap')) bad.push('planted EN key seen in RU');
  /* plant a missing key: a call for a label no table carries */
  const src2 = codeOnly(raw + '\nvoid t("zz_planted_missing");\n');
  if (!/t\("zz_planted_missing"\)/.test(src2)) bad.push('planted call not seen');
  return bad;
}

['mobile/index.html', 'dashboard/index.html', 'mobile/report-core.js'].forEach(f => {
  if (!fs.existsSync(path.join(ROOT, f))) return;
  const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const proof = i18nSelfProof(f, raw);
  if (proof.length) {
    add('high', 'i18n-blind', f, 1, '(self-proof)',
      'the i18n check could not find faults planted in this file (' + proof.join('; ')
      + ') — its silence on this file means nothing');
    return;
  }
  const { src, en, ru } = i18nTables(f, raw);
  if (!en || !ru) { add('med', 'i18n', f, 1, '(dictionaries)', 'could not read both language tables — check by hand'); return; }
  I18N_SEEN.push(f + ': ' + en.size + ' EN / ' + ru.size + ' RU');
  /* symmetry: one language carrying a label the other does not */
  const onlyEn = [...en].filter(k => !ru.has(k));
  const onlyRu = [...ru].filter(k => !en.has(k));
  onlyEn.forEach(k => add('high', 'i18n-gap', f, 1, k, 'key "' + k + '" is in EN and NOT in RU — it will print in English on a Russian phone'));
  onlyRu.forEach(k => add('high', 'i18n-gap', f, 1, k, 'key "' + k + '" is in RU and NOT in EN'));
  /* asked for but nowhere: the method_LUBE case exactly */
  /* Only a WHOLE literal counts. t("g_" + n) builds its key at run time, and
     a regex that stops at the closing quote reads that as a key called "g_" —
     22 of those were reported before this terminator was required. A built
     key cannot be checked from here at all, which is why the symmetry check
     above exists. */
  const asked = new Set();
  let m; const re = /\b(?:t|T|T\.I)\s*\(\s*["']([A-Za-z_][\w]*)["']\s*[,)]/g;
  while ((m = re.exec(src))) asked.add(m[1]);
  [...asked].forEach(k => {
    if (!en.has(k) && !ru.has(k))
      add('high', 'i18n-missing', f, 1, k, 't("' + k + '") is asked for and is in NEITHER table — it prints the key');
  });
});

/* ── report ───────────────────────────────────────────────────────────────*/
const order = { high: 0, med: 1, low: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file) || a.line - b.line);
const byKind = {};
findings.forEach(f => { (byKind[f.kind] = byKind[f.kind] || []).push(f); });

console.log('AUDIT SCAN — ' + FILES.length + ' files, '
  + FILES.reduce((n, f) => n + fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').length, 0)
  + ' lines\n');
/* Say what the i18n check actually read, so a clean answer is a measured one
   and not an unnoticed silence. */
if (I18N_SEEN.length) console.log('language tables read (self-proof passed):\n  '
  + I18N_SEEN.join('\n  ') + '\n');
console.log('by kind:');
Object.keys(byKind).sort((a, b) => byKind[b].length - byKind[a].length)
  .forEach(k => console.log('  ' + String(byKind[k].length).padStart(5) + '  ' + k
    + '   [' + [...new Set(byKind[k].map(f => f.sev))].join('/') + ']'));

const show = FULL ? findings : findings.filter(f => f.sev !== 'low');
console.log('\n' + show.length + ' finding(s) at med or above'
  + (FULL ? ' (--full: everything)' : '  — run with --full for the rest') + '\n');
show.slice(0, 200).forEach(f => {
  console.log(`[${f.sev.toUpperCase()}] ${f.kind}  ${f.file}:${f.line}`);
  console.log(`        ${f.note}`);
  console.log(`        | ${f.text}`);
});

/* ── and it ASSERTS, so it can sit in the sweep ───────────────────────────
   `tests/runall.sh` counts PASS lines and calls a suite that prints none
   SILENT, because a suite that asserts nothing is not a suite that passed.
   A report with no verdict is the same thing one level up. */
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
console.log('');
const count = k => (byKind[k] || []).length;
ok('the lexer stayed in sync over every unit', count('lex-desync') === 0, count('lex-desync') + ' desynced');
ok('every check found the fault planted for it', count('scanner-blind') === 0);
ok('both language tables were read on all three surfaces', I18N_SEEN.length === 3, I18N_SEEN.length + ' of 3');
ok('  and no label exists in one language only', count('i18n-gap') === 0, count('i18n-gap'));
ok('  and no t() asks for a label neither table has', count('i18n-missing') === 0, count('i18n-missing'));
ok('no element is fetched by an id its page does not carry', count('missing-id') === 0, count('missing-id'));
ok('no guard reads a window property nothing publishes', count('dead-guard') === 0, count('dead-guard'));
ok('no name is declared twice in one scope', count('redeclared') === 0, count('redeclared'));
ok('no JSON.parse is reachable with nothing to catch it', count('json-parse') === 0, count('json-parse'));
ok('nothing at high or medium severity', show.length === 0, show.length + ' finding(s)');
console.log('\n' + (fails.length ? fails.length + ' FAILED' : 'ALL PASS'));
process.exit(fails.length ? 1 : 0);
