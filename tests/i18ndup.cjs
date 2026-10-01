/* ONE KEY, ONE STRING. A JavaScript object literal accepts the same key twice
   and keeps the LAST one, without a word. On 2026-10-01 a new message was
   added to the dashboards' language table under `ed_stale` — a key that
   already existed, ~10 lines above, for a different sentence. The new one
   won, and the edit panel's "this condition dates from before the grade"
   note started printing "{by} changed this record at {at}…" with nothing
   anywhere saying so. tests/sevgap.cjs caught it by luck of what it reads.

   This reads every page's I18N literal with a lexer that knows strings,
   template literals and comments, takes the keys at the depth of each
   language block, and fails on any key a block defines twice. It proves it
   can see by planting a duplicate and finding it.

   Run: node tests/i18ndup.cjs */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* The keys defined at depth 2 of `const I18N = { en:{…}, ru:{…} }`, per block. */
function dupes(src) {
  const at = src.search(/const I18N\s*=\s*\{/);
  if (at < 0) return null;
  let i = src.indexOf('{', at), depth = 0, block = null, tok = '', lastKey = '';
  const seen = {}, out = [], keysPer = {};
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {           // skip a string
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      tok = ''; continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; tok = ''; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; tok = ''; continue; }
    if (c === '{') { depth++; if (depth === 2) { block = lastKey; seen[block] = seen[block] || {}; keysPer[block] = keysPer[block] || 0; } tok = ''; continue; }
    if (c === '}') { depth--; if (depth === 0) break; tok = ''; continue; }
    if (c === ':') {
      const k = tok.trim(); lastKey = k;
      if (depth === 2 && /^[A-Za-z_$][\w$]*$/.test(k)) {
        keysPer[block]++;
        if (seen[block][k]) out.push(block + '.' + k); else seen[block][k] = 1;
      }
      tok = ''; continue;
    }
    if (c === ',') { tok = ''; continue; }
    tok += c;
  }
  return { dup: out, keysPer };
}

for (const f of ['dashboard/index.html', 'dashboard-next/index.html', 'mobile/index.html']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const r = dupes(src);
  ok(`${f}: the language table was found and read`, r && Object.keys(r.keysPer).length >= 2 && Object.values(r.keysPer).every(n => n > 100),
     r && JSON.stringify(r.keysPer));
  ok(`${f}: no key is defined twice in one language`, r && r.dup.length === 0, r && r.dup.slice(0, 12).join(', '));
  // Can it still see? Plant a duplicate of the first key of the first block.
  const planted = src.replace(/const I18N\s*=\s*\{\s*en\s*:\s*\{/, m => m + ' zz_planted:"a", zz_planted:"b",');
  const p = dupes(planted);
  ok(`${f}: a planted duplicate is found (the check is not blind)`, p && p.dup.includes('en.zz_planted'), p && p.dup.join(', '));
}
console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
process.exit(fails.length ? 1 : 0);
