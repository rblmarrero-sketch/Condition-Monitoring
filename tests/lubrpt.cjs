/* The lubrication round, on paper.

   A fitter opens a compartment, reads the drum, photographs the label and ticks
   that a sample went with it. Every one of those reached the phone and NONE of
   them reached the report: the round produced a masthead, a green "all points
   normal" line and a signature. The product, the evidence and the sample were
   in the record and rendered as nothing — which is the worst defect this
   project has, and it was sitting on the one document that leaves the site.

   Three things had to be true before it could be believed, and each is checked
   here against the state it failed in:

     the answers are ON the paper, not only in the database
     the compartment is NAMED, not printed as a bare code twice
     nothing on the page contradicts anything else on it

   Run: node tests/lubrpt.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL  = `http://127.0.0.1:${PORT}/mobile/index.html`;

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log('  FAIL  ' + w + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + w + (d !== undefined ? '   ' + d : '')); return c; };

/* One round, deliberately mixed: the right oil with a photographed label and a
   sample, the WRONG oil reported only verbally, and one compartment nobody
   answered at all. A seed where everything is correct cannot tell whether the
   sheet reports or merely decorates. */
const SEED = async () => {
  type = 'LUBE'; selectEquip('TK101');
  await new Promise(r => setTimeout(r, 300));
  const ks = items().map(x => x.k);
  const right = (LUBE.catalog.find(x => x.t === 'engine') || {}).p;
  const wrong = (LUBE.catalog.find(x => x.t === 'hydraulic') || {}).p;
  const o = {};
  o[ks[0]] = { grade: 'A', sev: 'NOF', prod: right, evid: 'label', samp: 1, photos: [], video: null };
  o[ks[1]] = { grade: 'A', sev: 'NOF', prod: wrong, evid: 'told',  samp: 0, photos: [], video: null };
  o[ks[2]] = { grade: 'A', sev: 'NOF', photos: [], video: null };
  await dbPut({ id: 'lr1', type: 'LUBE', equip: 'TK101', date: '2026-08-21',
    by: 'I. Petrov', sup: 'A. Sokolov', smu: '6100', cls: 'AT',
    gps: { lat: 68.0421, lon: 167.3318, acc: 6 }, dev: 'PH-01', sign: null,
    positions: o, created: '2026-08-21T06:00:00.000Z', up: 0, upTo: {}, rev: 1 });
  return { ks: ks.slice(0, 3), right, wrong };
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => ok(false, 'page error', e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);

  const seed = await p.evaluate(SEED);

  /* Both languages are built from the same records, because "bilingual" is the
     property that broke on every round except undercarriage. */
  const txt = await p.evaluate(async () => {
    const recs = await rptRecords();
    const one = L => CMR.sections({ lang: L, title: 'x', titleAlt: 'x', stamp: new Date(),
      sevLabel: s => s, sevLabelAlt: s => s, records: recs })
      .map(s => s.html).join('\n');
    return { en: one('en'), ru: one('ru') };
  });
  const flat = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const en = flat(txt.en), ru = flat(txt.ru);

  console.log('\nthe answers reach the paper');
  ok(en.indexOf(seed.right) >= 0, 'the product the fitter recorded is printed', seed.right);
  ok(en.indexOf(seed.wrong) >= 0, 'including the one that was wrong', seed.wrong);
  ok(/Label photographed/.test(en) && /Reported, not shown/.test(en),
     'and how he knows it — which is the difference between a finding and a rumour');
  ok(/Oil sample/.test(en), 'the sample column is there to be counted');
  /* A compartment nobody answered must appear as unanswered rather than vanish:
     an audit that silently drops the gaps reports better coverage than it has. */
  ok((txt.en.match(/<tr/g) || []).length >= 4,
     'a compartment nobody answered still has a row',
     (txt.en.match(/<tr/g) || []).length + ' rows');

  console.log('\nthe compartment is named, not just numbered');
  ok(/Engine|Transmission/.test(en),
     'the masterlist name is on the row, beside the code');
  /* itemLabelFor had no lubrication branch, so every compartment fell through
     to its own key and the table printed "1 1", "4AL 4AL". */
  ok(!/\b1\s+1\b/.test(en) && !/4AL\s+4AL/.test(en),
     'and the code is not printed twice in place of it');

  console.log('\nnothing on the page contradicts anything else on it');
  const allok = /points normal|Nothing to do on this machine/.test(en);
  const offstd = /hold something other than the site standard/.test(en);
  ok(offstd, 'an off-standard compartment is stated as a finding');
  /* This is the pair that shipped: green "all points normal" printed directly
     above red "5 compartments hold something other than the standard". Normal
     is computed from grades; off-standard is not a grade. */
  ok(!(allok && offstd), 'and "all points normal" is not printed above it',
     'allok=' + allok + ' off=' + offstd);
  ok(/OFF STANDARD/.test(en) && en.indexOf(seed.right) >= 0,
     'the row says what should have been in there instead');

  console.log('\nboth languages, on the same page');
  ok(/Lubricant found in each compartment/.test(en), 'the English heading');
  ok(/узлах|Масло/.test(ru), 'the Russian heading');
  ok(/Фото этикетки/.test(en),
     'and the evidence carries BOTH on one page, the way undercarriage does');
  ok(/НЕ ПО СТАНДАРТУ/.test(ru),
     'off standard is said in Russian too');

  console.log('\nand it is still a document');
  ok(/Inspected by|Осмотр/.test(en),
     'the signature block survived being moved onto the table');
  ok(txt.en.indexOf('__N__') < 0, 'no section number was left unfilled');

  await b.close();
  console.log(fail ? `\n${fail} FAILED` : '\nthe lubrication round reaches the paper');
  process.exit(fail ? 1 : 0);
})();
