/* ONE ROUND, TWO SURFACES, ONE DOCUMENT.

   Both the phone and the dashboard load mobile/report-core.js, so the engine
   that draws a report is the same code on both. What differs is the CONTEXT
   each host hands that engine — the names it resolved, the flags it set, the
   helpers it passed in — and a difference there produces two different
   documents from one round without either surface erroring.

   That drift is silent by construction, and it had happened eight separate
   ways at once. The office's copy of a finished GET round announced "6 of 6
   points could not be measured". A lubrication round exported from the
   dashboard came out with the header, the signature, and no table — the one
   round type whose entire content is that table. The undercarriage drawing was
   captioned "LEFT" on one and "LEFT / ЛЕВАЯ" on the other. The millimetre
   table's hours-to-condemn column was populated on the phone and empty on the
   dashboard. A dump body round printed two different zone summaries, worded
   differently, from the same seven zones.

   So this suite seeds the SAME round on the phone, converts it with the
   phone's own wire builder — recToExport, the shape that actually leaves the
   app — hands that to the dashboard, asks each surface for its single-round
   report through its own path, and demands the text be identical. Every round
   type: MP, FC, INSP, TEMP, UC, TB, GET, LUBE.

   Run: node tests/parity.cjs   (serves the repo itself on 8093) */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:' + (process.env.CMPORT || '8093');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const cp = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const pp = await cp.newPage();
  await pp.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  const perr = [];
  pp.on('pageerror', e => perr.push('phone: ' + e.message));
  await pp.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await pp.waitForTimeout(1800);

  const cd = await b.newContext({ viewport: { width: 1300, height: 1000 } });
  const pd = await cd.newPage();
  await pd.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  pd.on('pageerror', e => perr.push('dash: ' + e.message));
  await pd.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await pd.waitForTimeout(1800);

  /* Which machine and which points, asked of the app's own reference rather
     than invented — an invented key names itself the same way on both ends
     and would hide exactly the divergence this suite is for. */
  const plan = await pp.evaluate(() => {
    const A = window.ASSETS || [];
    const find = f => A.find(f) || null;
    const out = {};
    const dozer = find(a => /DOZER/i.test(a.cat || '') && window.WEAR
      && WEAR.modelFor && WEAR.modelFor(a.m || ''));
    const truck = find(a => /HAUL|DUMP/i.test(a.cat || ''));
    const lube  = find(a => (lubeComps(a.n) || []).length);
    const body  = find(a => window.BODY && bodyModelFor(a.n));
    const get   = find(a => window.GET && GET.walk(a.n, a.cat || '', a.m || '').length);
    const comp = (a, ty) => {
      const c = (window.PTS && PTS.CLASSES[a.cls] && PTS.CLASSES[a.cls][ty]) || [];
      return c.slice(0, 4).map(e => typeof e === 'string' ? e : e.k);
    };
    if (truck) {
      out.MP   = { unit: truck.n, cls: truck.cls, keys: comp(truck, 'MP') };
      out.FC   = { unit: truck.n, cls: truck.cls, keys: comp(truck, 'FC') };
      out.INSP = { unit: truck.n, cls: truck.cls, keys: comp(truck, 'INSP') };
      out.TEMP = { unit: truck.n, cls: truck.cls, keys: comp(truck, 'INSP') };
    }
    if (dozer) {
      /* The whole numbered walk, both sides — which is what puts ADJUST,
         FRAME and SAG in the list: the three visual checks that are NOT in
         the generated wear reference and have to be named from elsewhere. */
      const prof = WEAR.modelFor(dozer.m), ks = [];
      (window.UCPTS ? UCPTS.labels : []).forEach(r =>
        ['L', 'R'].forEach(sd => (UCPTS.keysFor(r[0], sd, prof.rollers) || [])
          .forEach(k => ks.push(k))));
      out.UC = { unit: dozer.n, cls: dozer.cls, keys: ks.slice(0, 10) };
    }
    if (body) {
      const bm = (bodyModelFor(body.n) || {}).id;
      out.TB = { unit: body.n, cls: body.cls, keys: BODY.points(bm).slice(0, 8).map(p => p.k) };
    }
    if (get) {
      out.GET = { unit: get.n, cls: get.cls,
        keys: GET.walk(get.n, get.cat || '', get.m || '').slice(0, 6).map(w => w.k) };
    }
    if (lube) {
      out.LUBE = { unit: lube.n, cls: lube.cls,
        keys: lubeComps(lube.n).slice(0, 6).map(c => String(c.k)),
        prod: ((typeof lubeRegister === 'function' ? lubeRegister() : [])[0] || {}).p || '' };
    }
    return out;
  });

  const WANT = ['MP', 'FC', 'INSP', 'TEMP', 'UC', 'TB', 'GET', 'LUBE'];
  ok('every round type has a machine to test on', WANT.every(t => plan[t] && plan[t].keys.length),
     WANT.filter(t => !(plan[t] && plan[t].keys.length)).join(',') || 'all 8');

  for (const ty of WANT) {
    const spec = plan[ty];
    if (!spec || !spec.keys.length) { ok(ty + ': same document on both surfaces', false, 'no points to seed'); continue; }

    /* Three rounds, so the sheet has a history to print and the millimetre
       table has a series to forecast from. */
    const wire = await pp.evaluate(async ({ ty, spec }) => {
      for (const r of await dbAll()) await dbDel(r.id);
      const DATES = ['2026-04-14', '2026-06-16', '2026-08-11'], G = ['A', 'B', 'C'];
      let last = null;
      for (let n = 0; n < DATES.length; n++) {
        const positions = {};
        spec.keys.forEach((k, i) => {
          const p = { grade: '', sev: '', sevMan: 0, action: '', wo: '', particle: '',
            comp: '', oil: '', defect: '', cause: '', comment: '', tempV: '', tempA: '',
            tempM: '', detect: 'DM-02', prio: '', prod: '', other: '', evid: '', samp: 0,
            mm: null, stood: 0, reason: '', base: null, photos: [], video: null };
          if (ty === 'MP')   { p.grade = G[i % 3]; p.particle = String(3 + i); p.comp = String(4000 + i * 100); p.oil = '250'; }
          if (ty === 'FC')   { p.grade = G[i % 3]; p.comment = 'cut and inspected'; }
          if (ty === 'INSP') { p.grade = G[i % 3]; p.comment = 'walked'; }
          if (ty === 'GET')  { p.grade = G[i % 3]; }
          if (ty === 'TEMP') { p.tempV = String(60 + i * 7 + n); p.tempA = '-31'; p.tempM = 'IR'; }
          if (ty === 'UC' || ty === 'TB') p.mm = Number((100 - i * 3 - n * 1.5).toFixed(1));
          /* One point deliberately NOT measured, with a reason — and the code
             chosen is one BOTH vocabularies carry against different sentences.
             A tray's PARK is "Body not tipped far enough"; a track frame's is
             "Machine parked wrong". The label used to be resolved through
             whichever round type the phone's PICKER was showing at export, so
             the same record said either, depending on a dropdown nobody had
             touched. */
          if ((ty === 'UC' || ty === 'TB') && i === spec.keys.length - 1) {
            p.mm = null; p.reason = 'PARK';
          }
          if (ty === 'LUBE') { p.prod = spec.prod; p.evid = 'label'; p.samp = i === 0 ? 1 : 0; }
          positions[k] = p;
        });
        const rec = { id: 'p' + ty + n, equip: spec.unit, date: DATES[n], type: ty,
          cls: spec.cls, by: 'R. Marrero', sup: 'V. Petrov', smu: String(9000 + n * 500),
          rev: 1, up: 1, created: Date.now(), positions, photos: {}, sign: null };
        await dbPut(rec);
        last = rec;
      }
      return { rows: (await dbAll()).map(recToExport), id: last.id,
               target: last.equip + '|' + last.date + '|' + last.type };
    }, { ty, spec });

    const phone = await pp.evaluate(async id => {
      const s = await buildReportSections(id);
      return { html: s.map(x => x.html).join(''), n: s.length };
    }, wire.id);

    const dash = await pd.evaluate(({ rows, target }) => {
      window.CM_DATA = null;
      CMDash.importRecords(rows);
      const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
      const s = CMR.sections(CMReport.ctxFor(CMReport.recsForScope('one', target),
        { scope: 'one', target, photos: false }));
      return { html: s.map(x => x.html).join(''), n: s.length };
    }, wire);

    /* One entry per text node, not per character — splitting on '' compares
       two documents letter by letter and makes any two of them look alike. */
    const runs = h => h.split(/<[^>]+>/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const a = runs(dash.html), c = runs(phone.html);
    const sa = new Set(a), sc = new Set(c);
    const onlyD = [...new Set(a.filter(x => !sc.has(x)))];
    const onlyP = [...new Set(c.filter(x => !sa.has(x)))];
    ok(ty + ': same number of sections', dash.n === phone.n, dash.n + ' / ' + phone.n);
    ok(ty + ': nothing on the office sheet the phone does not print', !onlyD.length,
       onlyD.slice(0, 4).map(x => x.slice(0, 50)).join(' | '));
    ok(ty + ': nothing on the phone sheet the office does not print', !onlyP.length,
       onlyP.slice(0, 4).map(x => x.slice(0, 50)).join(' | '));
    ok(ty + ': the round printed something at all', a.length > 6 && c.length > 6,
       a.length + ' / ' + c.length + ' text runs');
  }

  /* The unmeasured station's reason: the RECORD's vocabulary, in the reader's
     language, identical on both surfaces. */
  const why = await pd.evaluate(() => {
    const f = (ty, c) => { try { return reasonPair(ty, c); } catch (e) { return { label: '', alt: '' }; } };
    return { tb: f('TB', 'PARK'), uc: f('UC', 'PARK'), weld: f('TB', 'WELD') };
  });
  ok('a tray station says the tray reason', /tipped/i.test(why.tb.label), why.tb.label);
  ok('a track frame says the track reason', /parked/i.test(why.uc.label), why.uc.label);
  ok('and each carries the other language', !!why.tb.alt && !!why.uc.alt,
     why.tb.alt + ' | ' + why.uc.alt);
  ok('a reason only the tray has is not lost', /weld/i.test(why.weld.label), why.weld.label);

  /* Two claims about specific fixtures, so a regression names itself rather
     than arriving as "47 runs differ". */
  const named = await pd.evaluate(() => {
    const f = fn => { try { return fn(); } catch (e) { return ''; } };
    return {
      adjust: f(() => ucRefName('ADJUST.L', { type: 'UC', equip: 'DZ001', cls: 'DOZ' }, 'en')),
      sagRu:  f(() => ucRefName('SAG.R',    { type: 'UC', equip: 'DZ001', cls: 'DOZ' }, 'ru')),
      fcast:  typeof CMReport.ctxFor([], {}).forecast === 'function',
    };
  });
  ok('the office names the three visual undercarriage checks',
     /adjuster/i.test(named.adjust), named.adjust);
  ok('...in Russian too', /[А-Яа-я]/.test(named.sagRu), named.sagRu);
  ok('the office hands the engine a forecast, so "life left" has values', named.fcast);

  ok('no page errors on either surface', !perr.length, perr.slice(0, 3).join(' | '));

  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
