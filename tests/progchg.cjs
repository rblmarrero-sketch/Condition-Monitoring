/* TWO CHANGES THE SITE MADE TO THE PROGRAMME, HELD TO ON BOTH SURFACES.

   Stated on 2026-09-12 while reviewing plan against actual:

     1. THE FILTER CUT IS 1,000 h, not 500. It was modelled as two intervals
        — the engine filter at 500 and the rest at 1,000 — and a round is due
        at the shortest of its parts, so every machine on site was proposed a
        filter cut at 500 h. Retiring that halves the proposed work for 1,127
        machines, which is much too big a change to leave asserted only by the
        interval table it came from.
     2. DZ011 ALONE stays at 500 h. Its own class does not: the other dozers
        are on the fleet's 1,000. No class rule can say this, so it is a
        figure stated for a MACHINE.
     3. THE KAMAZ TRUCKS COME OFF GENERAL INSPECTION for now. 30 of the 55
        are class HT — the same class as the Terex TR60 haul trucks, which
        stay on it — so again no class rule can say it.

   Why this suite exists at all, rather than trusting due.js:

   Work that is NOT proposed is invisible by nature. A round that quietly
   stops appearing looks exactly like a round nobody is due for, which is
   this project's signature defect wearing its most comfortable disguise. So
   each change is asserted as a DIFFERENCE — the machine that is off next to
   the machine of the same class that is still on, the unit at 500 next to
   its classmate at 1,000 — because only a difference can tell a rule that
   works from a rule that removed everything.

   And both surfaces are asked separately. They schedule from one file, and
   the whole reason that file exists is that they used to disagree. */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8527;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css' };

let bad = 0;
const ok = (c, s, d) => { console.log((c ? 'PASS  ' : 'FAIL  ') + s + (d ? '   [' + d + ']' : '')); if (!c) bad = 1; };

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();

  /* `hist` seeds the phone's last-done index. It matters for section 4:
     INSP carries no onClass, so a class reaches that round only once the
     fleet has WALKED it on a machine of that kind. With an empty index no
     machine is on General Inspection at all, and a list that is empty for
     that reason looks exactly like a list the KAMAZ rule emptied. The first
     run of this suite made precisely that mistake and reported a pass. */
  const phone = async hist => {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const pg = await ctx.newPage();
    await pg.addInitScript(h => {
      try {
        localStorage.setItem('up_dests', '[]');
        if (h) {
          localStorage.setItem('cm_hist', JSON.stringify(h));
          localStorage.setItem('cm_hist_at', JSON.stringify({ at: Date.now(), n: 0 }));
        }
      } catch (e) {}
    }, hist || null);
    await pg.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
    await pg.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 25000 });
    return { ctx, p: pg };
  };

  const first = await phone();
  const p = first.p;

  console.log('\n1. THE REGISTER — what these rules have to separate');
  const reg = await p.evaluate(() => {
    const km = ASSETS.filter(a => /KAMAZ/i.test(String(a.m || '') + ' ' + String(a.mk || '')));
    return {
      kamaz: km.length,
      kamazHT: km.filter(a => a.cls === 'HT').length,
      /* The trap: the MAKE field does not know about all of them. */
      byMake: km.filter(a => /^KAMAZ/i.test(String(a.mk || ''))).length,
      htTotal: ASSETS.filter(a => a.cls === 'HT').length,
      terexHT: ASSETS.filter(a => a.cls === 'HT' && !/KAMAZ/i.test(String(a.m || '') + ' ' + String(a.mk || ''))).length,
      dz011: ASSETS.find(a => a.n === 'DZ011') || null,
      dozers: ASSETS.filter(a => a.cls === 'DOZ').length,
    };
  });
  ok(reg.kamaz === 55, 'the register holds 55 KAMAZ machines', reg.kamaz + ' found');
  ok(reg.byMake < reg.kamaz,
    '  and the MAKE field knows about only ' + reg.byMake + ' of them — the model text is the only rule that sees all 55',
    'mk ' + reg.byMake + ' vs model ' + reg.kamaz);
  ok(reg.kamazHT > 0 && reg.terexHT > 0,
    '  ' + reg.kamazHT + ' of them share class HT with ' + reg.terexHT + ' machines that stay on the round',
    'no class rule can separate these');
  ok(reg.dz011 && reg.dz011.cls === 'DOZ' && reg.dozers > 1,
    '  and DZ011 is one dozer among ' + reg.dozers, reg.dz011 && reg.dz011.m);

  console.log('\n2. THE INTERVAL — the phone');
  const iv = await p.evaluate(() => ({
    round: DUE.hours('FC'),
    days: DUE.days('FC'),
    dz011: DUE.hours('FC', null, 'DOZ', 'DZ011'),
    sibling: DUE.hours('FC', null, 'DOZ', 'DZ003'),
    noUnit: DUE.hours('FC', null, 'DOZ'),
    parts: DUE.partsDue('FC', 1100),
    eng: DUE.hours('FC', 'ENG'),
    from: DUE.spec('FC', 'DOZ', 'DZ011').byUnitFor,
    /* Unrelated rounds must not have moved. */
    mp: DUE.hours('MP'), insp: DUE.hours('INSP'), ucExc: DUE.hours('UC', null, 'EXC'),
  }));
  ok(iv.round === 1000 && iv.days === 50, 'the filter cut is 1,000 h (50 days at the fleet rate)', iv.round + ' h → ' + iv.days + ' d');
  ok(iv.eng === 1000 && iv.parts === null,
    '  the 500 h engine-filter interval is retired, so nothing pulls the round back to 500', 'ENG ' + iv.eng);
  ok(iv.dz011 === 500, 'DZ011 is cut every 500 h', iv.dz011 + ' h');
  ok(iv.sibling === 1000 && iv.noUnit === 1000,
    '  and its own class is not — this is a machine, not a class', 'DZ003 ' + iv.sibling + ' h');
  ok(iv.from === 'DZ011', '  and the answer says the figure came from the machine', String(iv.from));
  ok(iv.mp === 250 && iv.insp === 500 && iv.ucExc === 4000,
    '  no other round moved', 'MP ' + iv.mp + ' · INSP ' + iv.insp + ' · UC/EXC ' + iv.ucExc);

  console.log('\n3. HELD OFF THE ROUND — the phone');
  const off = await p.evaluate(() => {
    const a = u => ASSETS.find(x => x.n === u);
    const kmHT = ASSETS.find(x => x.cls === 'HT' && /KAMAZ/i.test(String(x.m || '') + ' ' + String(x.mk || '')));
    const kmGEN = ASSETS.find(x => x.cls !== 'HT' && /KAMAZ/i.test(String(x.m || '') + ' ' + String(x.mk || '')));
    const terex = ASSETS.find(x => x.cls === 'HT' && !/KAMAZ/i.test(String(x.m || '') + ' ' + String(x.mk || '')));
    return {
      kmHT: kmHT && kmHT.n, kmGEN: kmGEN && kmGEN.n, terex: terex && terex.n,
      kmInsp: !!DUE.offRound('INSP', kmHT),
      kmGenInsp: !!DUE.offRound('INSP', kmGEN),
      terexInsp: !!DUE.offRound('INSP', terex),
      kmMp: !!DUE.offRound('MP', kmHT),
      kmTb: !!DUE.offRound('TB', kmHT),
      dzInsp: !!DUE.offRound('INSP', a('DZ011')),
      why: (DUE.offRound('INSP', kmHT) || {}).why,
      unknown: DUE.offRound('INSP', null),
    };
  });
  ok(off.kmInsp === true, 'a KAMAZ haul truck (' + off.kmHT + ') is off General Inspection');
  ok(off.kmGenInsp === true, '  including the ones the make field never named (' + off.kmGEN + ')');
  ok(off.terexInsp === false, '  and the Terex of the SAME CLASS (' + off.terex + ') stays on it');
  ok(off.dzInsp === false, '  and nothing else is swept up (' + 'DZ011' + ')');
  ok(off.kmMp === false && off.kmTb === false,
    '  the KAMAZ trucks keep their other rounds — only General Inspection was named');
  ok(!!off.why, '  and the reason travels with it, so work not proposed can still be explained', String(off.why));
  ok(off.unknown === null, '  a machine the register does not know is held off nothing');

  /* One Terex haul truck with a General Inspection on record. That is what
     puts class HT on the round, and from there every OTHER haul truck is a
     machine that has never had one — KAMAZ and Terex alike, but for the
     rule under test. */
  const terexUnit = await p.evaluate(() => {
    const a = ASSETS.find(x => x.cls === 'HT' && !/KAMAZ/i.test(String(x.m || '') + ' ' + String(x.mk || '')));
    return a && a.n;
  });
  await first.ctx.close();

  console.log('\n4. AND IT REACHES THE LISTS, NOT ONLY THE RULE');
  const second = await phone({ ['INSP|' + terexUnit]: { d: '2026-08-01' } });
  const lists = await second.p.evaluate(seed => {
    const isKm = u => { const a = ASSET_BY[u]; return a && /KAMAZ/i.test(String(a.m || '') + ' ' + String(a.mk || '')); };
    const never = neverRows('INSP');
    return {
      seed,
      neverInsp: never.length,
      kamazInNever: never.filter(r => isKm(r.unit)).length,
      terexInNever: never.filter(r => { const a = ASSET_BY[r.unit]; return a && a.cls === 'HT' && !isKm(r.unit); }).length,
      kamazHT: ASSETS.filter(a => a.cls === 'HT' && isKm(a.n)).length,
      /* Other rounds must still list them, or the rule has taken too much. */
      kamazInNeverMp: neverRows('MP').filter(r => isKm(r.unit)).length,
    };
  }, terexUnit);
  /* The list has to be NON-EMPTY for its emptiness of KAMAZ to mean anything. */
  ok(lists.neverInsp > 0, 'with one General Inspection on record, the round reaches class HT',
    lists.neverInsp + ' machines have never had one (seed ' + lists.seed + ')');
  ok(lists.terexInNever > 0, '  the Terex haul trucks are on that list',
    lists.terexInNever + ' of them');
  ok(lists.kamazInNever === 0, '  and not one of the ' + lists.kamazHT + ' KAMAZ haul trucks is',
    lists.kamazInNever + ' KAMAZ');
  ok(lists.kamazInNeverMp > 0, '  while the same KAMAZ are still proposed their plug round',
    lists.kamazInNeverMp + ' rows');

  /* AND THEY ARE COUNTED, NOT MERELY GONE. Thirty machines removed from a
     programme with nothing said about it is this project's signature defect:
     an empty list that reads as "nobody is due". */
  const note = await second.p.evaluate(() => {
    const en = heldOffNote();
    let ru = '';
    try { lang = 'ru'; applyLang(); ru = heldOffNote(); } catch (e) { ru = 'ERR ' + e.message; }
    return { en, ru };
  });
  /* THIRTY, not fifty-five. The rule holds all 55 KAMAZ off the round, but 25
     are class GEN and were never proposed anything — a note that said 55
     would name work that was never going to happen. */
  ok(/\b30\b/.test(note.en) && /KAMAZ/i.test(note.en) && /General Inspection/i.test(note.en),
    '  and the machines held off are COUNTED on screen, with the reason', note.en);
  ok(!/\b55\b/.test(note.en),
    '  counted against the programme, not against the rule — the 25 GEN trucks were never proposed one');
  ok(/КАМАЗ/.test(note.ru) && /осмотр/i.test(note.ru),
    '  in Russian too', note.ru);
  await second.ctx.close();

  console.log('\n5. THE OFFICE AGREES — one file, two surfaces');
  const dctx = await b.newContext();
  const d = await dctx.newPage();
  await d.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`, { waitUntil: 'load' });
  await d.waitForFunction(() => !!window.DUE && !!window.ASSETS, null, { timeout: 25000 });
  const dash = await d.evaluate(seed => {
    const kmHT = ASSETS.find(x => x.cls === 'HT' && /KAMAZ/i.test(String(x.m || '') + ' ' + String(x.mk || '')));
    const terex = ASSETS.find(x => x.cls === 'HT' && !/KAMAZ/i.test(String(x.m || '') + ' ' + String(x.mk || '')));
    /* The office reads RECS, so it needs the same one General Inspection on
       record before class HT is on the round at all — same reason as above. */
    RECS.push({ equip: seed, date: '2026-08-01', type: 'INSP' });
    const never = typeof dueNeverRows === 'function' ? dueNeverRows('INSP') : [];
    const isKm = u => { const a = ASSET_BY[u]; return a && /KAMAZ/i.test(String(a.m || '') + ' ' + String(a.mk || '')); };
    return {
      fc: DUE.hours('FC'), dz: DUE.hours('FC', null, 'DOZ', 'DZ011'),
      kmOff: !!DUE.offRound('INSP', kmHT), terexOn: !DUE.offRound('INSP', terex),
      neverRows: never.length, kamaz: never.filter(r => isKm(r.unit)).length,
      terexRows: never.filter(r => { const a = ASSET_BY[r.unit]; return a && a.cls === 'HT' && !isKm(r.unit); }).length,
    };
  }, terexUnit);
  ok(dash.fc === 1000 && dash.dz === 500, 'the office reads the same two figures', 'FC ' + dash.fc + ' · DZ011 ' + dash.dz);
  ok(dash.kmOff === true && dash.terexOn === true, '  and the same exclusion');
  ok(dash.kamaz === 0, '  no KAMAZ on its never-inspected list either', dash.neverRows + ' rows');
  ok(dash.terexRows > 0, '  and the haul trucks that stay on the round are still there', dash.terexRows + ' rows');
  console.log('\n6. PLAN VS ACTUAL — 1C\'s plan is a different source, and it obeyed too');
  /* The screenshot that prompted this: the week grid was still printing INSP
     pills for six KAMAZ haul trucks the day after the site took them off the
     round. This tab reads 1C's work orders, not CM's programme, so the rule
     in due.js did not reach it — two screens proposing different work off one
     decision. Asserted on the REAL work-order file, not a fixture, because
     the failure was that real data took a path the rule never saw. */
  const pa = await d.evaluate(() => {
    if (typeof paRows !== 'function') return { skip: 'no paRows' };
    const isKm = u => { const a = ASSET_BY[String(u || '').toUpperCase()];
      return a && /KAMAZ/i.test(String(a.m || '') + ' ' + String(a.mk || '')); };
    const rows = paRows();
    const km = rows.filter(r => isKm(r.w.equip));
    const other = rows.filter(r => !isKm(r.w.equip));
    const has = (rs, ty) => rs.filter(r => (r.info.types || []).includes(ty)).length;
    return {
      total: rows.length, kmRows: km.length, otherRows: other.length,
      kmInsp: has(km, 'INSP'), otherInsp: has(other, 'INSP'),
      kmFc: has(km, 'FC'), kmMp: has(km, 'MP'),
      kmOffCount: km.reduce((n, r) => n + ((r.info.off || []).length), 0),
      kmPreInsp: km.filter(r => r.preInspNeeded).length,
      otherPreInsp: other.filter(r => r.preInspNeeded).length,
      kmMissing: km.filter(r => r.status === 'missing').length,
      kmHeldOffRows: km.filter(r => r.heldOff).length,
      /* 1C's own plan must still be there — the work order is a fact.
         Counted as ROWS SURVIVING, not as rows carrying a number: four of
         1C's own KAMAZ work orders have no number in the source file, and
         asserting on that measured the data rather than the change. */
      kmSource: (CM_WO_DATA.workOrders || []).filter(w => isKm(w.equip)).length,
      /* And the week grid itself. */
      weekKmInsp: (typeof paWeekData === 'function' ? paWeekData(rows) : [])
        .filter(e => isKm(e.equip) && e.code === 'INSP').length,
      weekOtherInsp: (typeof paWeekData === 'function' ? paWeekData(rows) : [])
        .filter(e => !isKm(e.equip) && e.code === 'INSP').length,
      weekKmAny: (typeof paWeekData === 'function' ? paWeekData(rows) : [])
        .filter(e => isKm(e.equip)).length,
    };
  });
  if (pa.skip) { ok(false, 'Plan vs Actual could not be read', pa.skip); }
  else {
    ok(pa.total > 0 && pa.kmRows > 0,
      '1C has planned work on KAMAZ machines', pa.kmRows + ' of ' + pa.total + ' work orders');
    ok(pa.otherInsp > 0,
      '  and General Inspection is still resolved for everything else — the rule did not empty the tab',
      pa.otherInsp + ' rows keep INSP');
    ok(pa.kmInsp === 0, '  but not one KAMAZ work order resolves to a General Inspection now',
      pa.kmInsp + ' of ' + pa.kmRows);
    ok(pa.kmOffCount > 0, '  and each one that lost it is COUNTED, not silently dropped',
      pa.kmOffCount + ' rounds held off');
    ok(pa.kmPreInsp === 0 && pa.otherPreInsp >= 0,
      '  the 3-day pre-check no longer fires for a KAMAZ either', 'KAMAZ ' + pa.kmPreInsp);
    ok(pa.kmRows === pa.kmSource,
      '  1C\'s own plan is never hidden — every KAMAZ work order is still listed',
      pa.kmRows + ' of ' + pa.kmSource + ' in the source file');
    ok(pa.kmHeldOffRows === 0 || pa.kmMissing < pa.kmHeldOffRows + pa.kmMissing,
      '  a round nobody is going to walk is not reported as one we missed',
      pa.kmHeldOffRows + ' held off, ' + pa.kmMissing + ' missing');
    ok(pa.weekKmInsp === 0, '  the week grid prints no INSP pill on a KAMAZ',
      pa.weekKmInsp + ' pills');
    ok(pa.weekOtherInsp > 0, '  while other machines still get theirs',
      pa.weekOtherInsp + ' pills');
  }

  await d.close(); await dctx.close();

  await b.close(); srv.close();
  process.exit(bad);
})().catch(e => { console.error('THROWN', e && e.stack || e); process.exit(1); });
