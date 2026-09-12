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

   Usage:
       node ingest/fetch_cm_history.cjs [backend-url]
       (defaults to https://baimskaya-cm.duckdns.org, the live endpoint
       docs/yandex/function.js runs on -- see CLAUDE.md) */
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'https://baimskaya-cm.duckdns.org';
const OUT = path.join(__dirname, 'cm_history.generated.json');
const PAGE_MAX = 2000;   // the backend's own cap (RECORDS_MAX in function.js)

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { rejectUnauthorized: false }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error('bad JSON from ' + url + ': ' + e.message)); }
      });
    }).on('error', reject);
  });
}

(async () => {
  const hist = {};   // "TYPE|EQUIP" -> {d: "YYYY-MM-DD"}
  let after = 0, pages = 0, totalRecords = 0;
  for (;;) {
    const url = `${BASE}?action=records&after=${after}&max=${PAGE_MAX}&index=0`;
    const j = await getJSON(url);
    if (!j || j.ok === false) throw new Error('records pull failed: ' + (j && j.error));
    pages++;
    for (const r of (j.records || [])) {
      if (!r || !r.equip || !r.date || !r.type) continue;
      const k = String(r.type).toUpperCase() + '|' + String(r.equip).toUpperCase();
      const cur = hist[k];
      if (!cur || cur.d < r.date) hist[k] = { d: r.date };
      totalRecords++;
    }
    console.log(`page ${pages}: read ${j.read}, failed ${j.failed}, pending ${j.pending}, truncated ${j.truncated}`);
    if (!j.truncated) break;
    after = j.cursor;
  }
  fs.writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString(),
    source: BASE + '?action=records',
    pairsSeen: totalRecords,
    hist,
  }, null, 2) + '\n');
  console.log(`wrote ${OUT} -- ${Object.keys(hist).length} distinct (type, unit) pair(s) from ${totalRecords} record(s) across ${pages} page(s)`);
})().catch(e => { console.error(e.message); process.exit(1); });
