#!/usr/bin/env node
/* fetch_cm_history.cjs -- pulls every real inspection round CM has ever
   recorded, straight off the live backend, and writes the compact "last
   done" index (ingest/cm_history.generated.json) that gen_class_rounds.cjs
   seeds into a page's localStorage.cm_hist before asking roundsOnClass()
   what a class is on.

   WHY THIS MATTERS FOR THE CLASS/ROUND MAPPING. roundsOnClass() (mobile/
   index.html) answers "which classes are on which rounds" from TWO sources:
   a figure due.js states for a class, OR a round this fleet has actually
   walked on a class ("done"). gen_class_rounds.cjs, run against a bare page
   with no history, could only ever see the first half -- so the day a
   grader gets its first-ever Magnetic Plug round, that fact would never
   reach the Plan vs Actual mapping unless something feeds it real history.
   This script is that something.

   SAME KEY, SAME SHAPE cm_hist already uses (see mobile/index.html,
   "what 'last done' means now", and histPut): "TYPE|EQUIP" -> {d: date}.
   Deliberately the coarsest possible read -- presence of a real round on a
   unit, nothing about grade or condition -- because that is all
   roundsOnClass() actually asks.

   NOT gated the way a phone's own sync is (histGated/histFirm): every entry
   here comes straight from the backend's own listing, which is the
   authoritative source those gates exist to approximate for a phone that
   cannot reach it directly. Leaving no entry stamped `s:"f"` means
   histGated() reads false and every entry counts as firm on its own terms
   -- see gen_class_rounds.cjs's header for the full reasoning.

   THE BACKEND IS GOOGLE (audit 26.10 C7 / check 27.10 N6). This read the
   Yandex VM, which was deleted on 20.10; the workflow allowed the step to
   fail, so the history stayed at 18.10 and nothing said so. It now reads the
   Google Apps Script the phones upload to -- the address is taken from
   mobile/upload-defaults.js (swap.to), the one place it is written -- using
   the same fast read the phones use (action=index&slim=1, paged by `cursor`
   while the reply says `truncated`), and falls back to action=records only
   when the index has never been built. A duckdns address passed in (an old
   CM_BACKEND repository variable) is ignored with a warning.

   A pull that comes back with far fewer pairs than the file already holds is
   refused rather than written: a half-read must not shrink the mapping.

   Usage:
       node ingest/fetch_cm_history.cjs [backend-url]
       node ingest/fetch_cm_history.cjs --check-age [hours]   (default 48)
          exits 1, with a GitHub ::error, when the committed history is older */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUT = process.env.CM_HISTORY_OUT || path.join(__dirname, 'cm_history.generated.json');   // the env is for tests/histpull.cjs
const DEFAULTS = path.join(__dirname, '..', 'mobile', 'upload-defaults.js');
const SHRINK_MIN = 0.5;   // refuse a pull holding under half the pairs already on file

function googleExec() {
  const src = fs.readFileSync(DEFAULTS, 'utf8');
  const m = /\bto:\s*"(https:\/\/script\.google\.com\/macros\/s\/[^"]+\/exec)"/.exec(src)
         || /"(https:\/\/script\.google\.com\/macros\/s\/[^"]+\/exec)"/.exec(src);
  if (!m) throw new Error('no Google Apps Script address in mobile/upload-defaults.js');
  return m[1];
}

function readHist() {
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return null; }
}

/* --check-age: the loud half. Run as its own workflow step after the commit,
   so the data still lands and the run still goes red. */
if (process.argv[2] === '--check-age') {
  const hours = Number(process.argv[3] || 48);
  const h = readHist();
  const at = h && Date.parse(h.generated);
  const age = at ? (Date.now() - at) / 3600e3 : Infinity;
  if (!(age <= hours)) {
    const msg = `CM history (ingest/cm_history.generated.json) is ${isFinite(age) ? Math.round(age) + ' h old' : 'missing or unreadable'}` +
      ` (source ${h && h.source || '?'}); the class/round mapping is not seeing rounds walked since. Limit ${hours} h.`;
    console.log('::error title=CM history is stale::' + msg);
    console.error(msg);
    process.exit(1);
  }
  console.log(`CM history is ${age.toFixed(1)} h old (limit ${hours} h), from ${h.source}`);
  process.exit(0);
}

/* Apps Script answers every GET with a redirect to script.googleusercontent.com. */
function getJSON(url, hops) {
  hops = hops || 0;
  return new Promise((resolve, reject) => {
    (String(url).startsWith('http:') ? http : https).get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) {
        res.resume();
        return resolve(getJSON(new URL(res.headers.location, url).toString(), hops + 1));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`bad JSON from ${url} (HTTP ${res.statusCode}): ${body.slice(0, 120)}`)); }
      });
    }).on('error', reject);
  });
}

(async () => {
  let BASE = process.argv[2] || '';
  if (/duckdns\.org/i.test(BASE)) {
    console.log(`::warning title=Old CM_BACKEND::${BASE} is the deleted Yandex VM; reading Google instead. Clear the CM_BACKEND repository variable.`);
    BASE = '';
  }
  if (!BASE) BASE = process.env.CM_HISTORY_DEFAULT || googleExec();   // the env is for tests/histpull.cjs

  const hist = {};   // "TYPE|EQUIP" -> {d: "YYYY-MM-DD"}
  let total = 0, pages = 0, via = 'index';
  const take = (u, d, t) => {
    if (!u || !d || !t) return;
    const k = String(t).toUpperCase() + '|' + String(u).toUpperCase();
    const cur = hist[k];
    if (!cur || cur.d < d) hist[k] = { d: String(d) };
    total++;
  };

  let since = 0;
  for (;;) {
    const j = await getJSON(`${BASE}?action=index&slim=1&since=${since}`);
    if (!j || j.ok === false) throw new Error('index pull failed: ' + (j && j.error));
    if (j.needsRebuild) { via = 'records'; break; }
    if (!j.v) throw new Error('this backend has no index (no "v" in the reply)');
    pages++;
    for (const r of (j.rows || [])) take(r.u, r.d, r.t);
    console.log(`index page ${pages}: ${(j.rows || []).length} row(s), truncated ${!!j.truncated}`);
    if (!j.truncated) break;
    if (!(Number(j.cursor) > since)) throw new Error('index cursor did not move; the read cannot finish');
    since = Number(j.cursor);
    if (pages > 200) throw new Error('more than 200 index pages; refusing to loop');
  }

  if (via === 'records') {
    console.log('the index has never been built; reading every record (slow)');
    let after = 0;
    for (;;) {
      const j = await getJSON(`${BASE}?action=records&after=${after}&max=2000&index=0`);
      if (!j || j.ok === false) throw new Error('records pull failed: ' + (j && j.error));
      pages++;
      for (const r of (j.records || [])) take(r && r.equip, r && r.date, r && r.type);
      console.log(`records page ${pages}: read ${j.read}, failed ${j.failed}, pending ${j.pending}, truncated ${j.truncated}`);
      if (!j.truncated && !j.pending) break;
      if (!(Number(j.cursor) > after)) throw new Error('records cursor did not move; the read cannot finish');
      after = Number(j.cursor);
    }
  }

  const n = Object.keys(hist).length;
  const prev = readHist(), prevN = prev && prev.hist ? Object.keys(prev.hist).length : 0;
  if (prevN && n < prevN * SHRINK_MIN) {
    throw new Error(`pulled ${n} pair(s) where the file holds ${prevN}; refusing to shrink the history (a partial read?)`);
  }
  fs.writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString(),
    source: BASE + '?action=' + (via === 'index' ? 'index&slim=1' : 'records'),
    pairsSeen: total,
    hist,
  }, null, 2) + '\n');
  console.log(`wrote ${OUT} -- ${n} distinct (type, unit) pair(s) from ${total} round(s) across ${pages} page(s), via ${via}`);
})().catch(e => {
  console.log('::error title=CM history pull failed::' + e.message);
  console.error(e.message);
  process.exit(1);
});
