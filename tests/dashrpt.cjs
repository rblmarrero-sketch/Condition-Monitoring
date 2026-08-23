/* One document, two ends. Print the same rounds from the app and from the
   dashboard and check the pages agree. */
const { chromium } = require(require('./pw.cjs'));
const fs=require('fs');
const B='http://127.0.0.1:8093';
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const note=(n,d)=>console.log('  ....  '+n+(d!==undefined?'   '+d:''));
const SEED=fs.readFileSync('e2e.cjs','utf8').match(/const SEED = `([\s\S]*?)`;/)[1];
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:1440,height:960},acceptDownloads:true});
  const app=await ctx.newPage();
  app.on('pageerror',e=>fails.push('APP '+e.message));
  await app.addInitScript(()=>localStorage.setItem('up_dests','[]'));
  await app.goto(B+'/mobile/index.html',{waitUntil:'load'});
  await app.waitForFunction(()=>(document.getElementById('verNum')||{}).textContent!=='?',null,{timeout:20000});
  await app.waitForTimeout(500);
  const {payload}=await app.evaluate(SEED);
  const appSec=await app.evaluate(async()=>(await buildReportSections()).map(s=>s.html));

  const dash=await ctx.newPage();
  dash.on('pageerror',e=>fails.push('DASH '+e.message));
  await dash.goto(B+'/dashboard/index.html',{waitUntil:'load'});
  await dash.waitForTimeout(1800);
  await dash.evaluate(p=>window.CMDash.importRecords(p), payload);
  await dash.waitForTimeout(900);

  console.log('  both ends load the same engine');
  ok('the app has it', await app.evaluate(()=>!!(window.CMR&&CMR.sections)));
  ok('the dashboard has it', await dash.evaluate(()=>!!(window.CMR&&CMR.sections)));
  ok('and the same stylesheet, byte for byte',
    (await app.evaluate(()=>CMR.CSS)) === (await dash.evaluate(()=>CMR.CSS)));

  console.log('\n  the same round prints the same page');
  const dashSec=await dash.evaluate(()=>{
    const recs=window.CMReport.recsForScope('unit','DZ002');
    return CMR.sections({ lang, title:t('rep_title_doc'), stamp:new Date(),
      sevLabel:s=>SEV[s]?SEV[s].l:s,
      records: window.CMReport.normalise(recs,{photos:false}) }).map(s=>s.html);
  });
  /* The machine's own block, not every section that names it — the cover lists
     DZ002 in its glance table too. */
  const grab=(arr,unit)=>arr.filter(h=>/class="machhd"/.test(h)&&h.includes(unit)).join('\n');
  const aDZ=grab(appSec,'DZ002'), dDZ=grab(dashSec,'DZ002');
  const grid=h=>h.split('<div class="meas">').slice(1).join(' ');
  ok('the dashboard prints the measurement grid too', dDZ.includes('<div class="meas">'));
  ok('every millimetre the app printed, the dashboard printed', (()=>{
      const ag=grid(aDZ), dg=grid(dDZ);
      const mm=[...ag.matchAll(/<b>(\d+(?:\.\d+)?)<\/b>/g)].map(m=>m[1]);
      const miss=mm.filter(v=>!dg.includes('<b>'+v+'</b>'));
      return mm.length>20 && miss.length===0 || (console.log('    n',mm.length,'missing',miss.slice(0,6)),false); })());
  ok('and the same wear percentages', (()=>{
      const p=[...grid(aDZ).matchAll(/>(\d+)%</g)].map(m=>m[1]);
      const q=[...grid(dDZ).matchAll(/>(\d+)%</g)].map(m=>m[1]);
      return p.length>20 && JSON.stringify(p)===JSON.stringify(q)
        || (console.log('    app',p.slice(0,10),'dash',q.slice(0,10)),false); })());
  /* The document's shape follows its scope: one machine gets a workbook sheet,
     a fleet gets cover, work list and legend. So the two ends are only
     comparable when they are asked for the same scope — hand the dashboard the
     whole set the app is holding, not one unit of it. */
  /* Only the rounds the app is holding. The dashboard also carries the bundled
     magnetic-plug history, which the phone has never seen — comparing against
     that would be comparing two different documents. */
  const keys=await app.evaluate(async()=>(await dbAll()).map(r=>`${r.equip}|${r.date}|${r.type}`));
  /* Ask report.js for the context rather than writing a second copy of it.
     The copy that used to live here drifted the moment the report went
     bilingual — it stopped passing the second-language severity labels, so the
     two legends stopped matching and this suite reported its own staleness as
     a defect in the code it was checking. */
  const dashAll=await dash.evaluate(ks=>{
    const want=new Set(ks);
    const recs=window.CMDash.allRecs().filter(r=>!r._void&&want.has(`${r.equip}|${r.date}|${r.type}`));
    return CMR.sections(window.CMReport.ctxFor(recs,{photos:false})).map(s=>s.html);
  },keys);
  ok('the same records make the same number of pages at both ends',
    appSec.length === dashAll.length, appSec.length+' app vs '+dashAll.length+' dashboard');
  const verdict=h=>((h.match(/class="verdict[^"]*"[^>]*>([\s\S]*?)<\/div>/)||[])[1]||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
  const aFleetDZ=grab(appSec,'DZ002'), dFleetDZ=grab(dashAll,'DZ002');
  ok('there is a verdict to compare', verdict(aFleetDZ).length>20, verdict(aFleetDZ).slice(0,70));
  ok('the verdict is worded identically', verdict(aFleetDZ)===verdict(dFleetDZ),
    verdict(dFleetDZ).slice(0,70));
  ok('the legend is the same document section',
    appSec[appSec.length-1].replace(/\s+/g,' ') === dashAll[dashAll.length-1].replace(/\s+/g,' '));

  /* ---- the tray, printed from the office --------------------------------
     Both ends draw this from the same module, and for a while only one of them
     knew what to ask for: the dashboard called bodyMap() with no readings and
     no box height, so a report printed from the office carried sixty-three
     empty dots while the same round printed from the pit carried every
     millimetre. Nothing in either file said they had to match — this does.

     A tray round is seeded here rather than in the shared SEED because the
     seed's record count is asserted elsewhere; a round added there would be
     read as a change in those suites rather than as coverage in this one. */
  console.log('\n  the tray prints the same at both ends');
  const tbPay = await app.evaluate(async () => {
    const s = document.getElementById('typeSel');
    s.value = 'TB'; s.dispatchEvent(new Event('change'));
    selectEquip('TK143');
    await new Promise(r => setTimeout(r, 500));
    const o = {};
    items().forEach((x, i) => { o[x.k] = { mm: Math.round((4 + (i % 11) * 1.3) * 10) / 10,
      stood: 0, reason: '', photos: [], video: null }; });
    await dbPut({ id:'r-tray', type:'TB', equip:'TK143', date:'2026-08-22',
      by:'S. Volkov', sup:'A. Sokolov', smu:'7000', cls:(ASSET_BY['TK143']||{}).cls||'',
      gps:null, dev:'PH-01', sign:null, positions:o,
      created:'2026-08-22T06:00:00.000Z', up:0, upTo:{}, rev:1 });
    return (await dbAll()).map(recToExport);
  });
  await dash.evaluate(p => window.CMDash.importRecords(p), tbPay);
  await dash.waitForTimeout(700);
  const trayOf = h => {
    const n = (h.match(/class="bm-val"/g) || []).length;
    const vb = (h.match(/viewBox="0 0 \d+ (\d+)"/) || [])[1];
    const v = [...h.matchAll(/class="bm-val"[^>]*>([^<]*)</g)].map(m => m[1]);
    return { n, vb, v };
  };
  const appTray = trayOf(await app.evaluate(async () =>
    (await buildReportSections()).map(x => x.html).join('')));
  const dashTray = trayOf(await dash.evaluate(() => {
    const recs = window.CMReport.recsForScope('unit', 'TK143');
    return CMR.sections(window.CMReport.ctxFor(recs, { photos:false })).map(x => x.html).join('');
  }));
  ok('the app prints the millimetres inside the stations', appTray.n > 40, appTray.n + ' stations');
  ok('and so does the dashboard', dashTray.n === appTray.n,
    dashTray.n + ' vs ' + appTray.n);
  ok('  the same figures, in the same order', JSON.stringify(dashTray.v) === JSON.stringify(appTray.v),
    (dashTray.v.slice(0, 8).join(' ') || '(none)') + ' vs ' + appTray.v.slice(0, 8).join(' '));
  ok('  and drawn in the same box, so one is not a shrunken copy',
    dashTray.vb === appTray.vb, dashTray.vb + ' vs ' + appTray.vb);

  console.log('\n  the dashboard prints the photographs too');
  /* photoNames()'s third argument is a list of suffixes, not extensions. Handing
     it extensions built names that matched nothing, and no report the dashboard
     produced had ever carried a photograph. */
  const ph = await dash.evaluate(() => {
    const rec = window.CMReport.recsForScope('unit', 'TK149')[0];
    if (!rec) return { err: 'no TK149 round' };
    const it = rec.items[0];
    const base = window.CMDash.photoBase(it, rec);
    // the two names the phone would have written for a position with two photos
    window.CMDash.addPhoto(window.CMDash.photoNames(base, rec, [''])[1], 'data:image/png;base64,AAA=');
    window.CMDash.addPhoto(window.CMDash.photoNames(base, rec, ['_1'])[1], 'data:image/png;base64,BBB=');
    const on  = window.CMReport.normalise([rec], { photos: true })[0].items[0].photos;
    const off = window.CMReport.normalise([rec], { photos: false })[0].items[0].photos;
    const secs = CMR.sections({ lang, title: 't', stamp: new Date(), sevLabel: s => s,
      records: window.CMReport.normalise([rec], { photos: true }) });
    const html = secs.map(s => s.html).join('');
    /* A photograph now sits in the position it belongs to rather than in a
       gallery at the end — one page, the picture beside its own findings. */
    return { on, off, blocks: secs.filter(s => /<img[^>]+src="data:image/.test(s.html)).length,
      imgs: (html.match(/<img[^>]+src="data:image/g) || []).length };
  });
  ok('a photograph on the shared drive is found by name', !ph.err && ph.on.length === 2,
    JSON.stringify(ph.on || ph.err));
  ok('both photographs on one position are found, not just the first',
    !ph.err && ph.on[0] !== ph.on[1]);
  ok('and they reach the report, beside their own position',
    !ph.err && ph.blocks === 1 && ph.imgs === 2,
    ph.blocks + ' pages carrying photographs, ' + ph.imgs + ' images');
  ok('"no photos" really means none', !ph.err && ph.off.length === 0);

  console.log('\n  the dashboard adds what only it knows');
  const unitSec=dashSec.join('\n');
  ok('a machine report carries a condition-over-time section',
    /Condition over time/.test(unitSec) || (await dash.evaluate(()=>{
      const recs=window.CMReport.recsForScope('unit','DZ002'); return recs.length; }))<2,
    'DZ002 has one round in this fixture');

  console.log('\n  and it produces a PDF');
  await dash.evaluate(()=>showTab('reports'));
  await dash.waitForTimeout(400);
  await dash.evaluate(()=>{ const s=document.getElementById('rScope'); s.value='round'; s.dispatchEvent(new Event('change')); });
  await dash.waitForTimeout(400);
  const tgt=await dash.evaluate(()=>{ const s=document.getElementById('rTarget');
    return s.options.length?s.value:''; });
  ok('there is something to report on', !!tgt, tgt);
  if(tgt){
    const [dl]=await Promise.all([
      dash.waitForEvent('download',{timeout:180000}),
      dash.click('#rGo'),
    ]);
    const out='/tmp/claude-0/-home-user-Condition-Monitoring/1f3ebdba-c3da-5675-b557-e45dfee4b57e/scratchpad/dash-report.pdf';
    await dl.saveAs(out);
    ok('the dashboard PDF downloads', fs.statSync(out).size>20000, fs.statSync(out).size+' bytes');
    ok('and nothing is left in the page afterwards',
      await dash.evaluate(()=>!document.getElementById('rptRoot')));
  }
  /* Last, deliberately: this section seeds a round of every type into both
     ends, which changes how many rounds each machine has. Anything asserted
     about the fixture's shape has to have been asserted before it lands. */
  /* ---- the name a photograph is filed under, at both ends ----------------
     The phone writes every frame into the upload package under a name it
     builds; the dashboard finds it again by rebuilding that name from the
     record. Two functions in two files, and nothing between them — if they
     ever disagree the picture is on Drive, the report is fine, and the
     photograph simply is not on it. Nobody is told.

     They can disagree in two ways today. The phone takes the suffix from
     TYPE_META and the dashboard takes it from rec.type (equal for all eight
     types, but only by hand). And for a register round the phone writes
     UNIT.KEY only when that unit actually HAS components, while the dashboard
     writes UNIT.KEY for the round type regardless — a machine with no register
     entry files its pictures under one name and has them looked for under the
     other.

     So this asks the phone to build the real package and reads the real names
     out of it, then asks the dashboard what it would look for. A test that
     built the names itself would agree with itself and catch neither. */
  console.log('\n  a photograph is filed and found under the same name');
  const named = await app.evaluate(async (TYPES) => {
    const made = [], missed = [];
    for (const ty of TYPES) {
      const s = document.getElementById('typeSel');
      if (![...s.options].some(o => o.value === ty)) continue;
      s.value = ty; s.dispatchEvent(new Event('change'));
      /* A unit that actually has this round: the measured rounds need a wear
         reference, a tray or a set of teeth, so the known ones are tried first
         and the register is scanned only if none of them fits. Skipping a type
         because the test could not find it a machine would be the suite quietly
         narrowing itself. */
      const KNOWN = { UC:['DZ002','DZ001'], TB:['TK143','TK146'],
        /* Teeth are on excavators and loaders, and neither is anywhere near
           the front of a register sorted by truck number. */
        GET:(window.ASSETS||[]).filter(a=>/EXC|LOAD|WL|FEL/i.test(a.cls||''))
              .slice(0,4).map(a=>a.n) };
      let pick = null, ks = [];
      const tryUnit = async (n) => {
        selectEquip(n);
        await new Promise(r => setTimeout(r, 350));
        const got = items().map(x => x.k);
        return got.length ? got : null;
      };
      for (const n of (KNOWN[ty] || [])) { const g = await tryUnit(n); if (g) { pick = n; ks = g; break; } }
      if (!pick) for (const a of (window.ASSETS || []).slice(0, 60)) {
        const g = await tryUnit(a.n); if (g) { pick = a.n; ks = g; break; } }
      if (!pick) { missed.push(ty); continue; }
      /* two frames on the first position, one on the second: the multi-photo
         suffix is where the two ends have gone wrong before */
      const png = () => { const c = document.createElement('canvas'); c.width = c.height = 8;
        c.getContext('2d').fillRect(0, 0, 8, 8);
        return new Promise(r => c.toBlob(r, 'image/jpeg', 0.8)); };
      const pos = {};
      pos[ks[0]] = { grade:'A', sev:'NOF', photos:[await png(), await png()], video:null };
      if (ks[1]) pos[ks[1]] = { grade:'A', sev:'NOF', photos:[await png()], video:null };
      await dbPut({ id:'nm-' + ty, type:ty, equip:pick, date:'2026-08-20',
        by:'S. Volkov', sup:'A. Sokolov', smu:'100', cls:(ASSET_BY[pick]||{}).cls||'',
        gps:null, dev:'PH-01', sign:null, positions:pos,
        created:'2026-08-20T06:00:00.000Z', up:0, upTo:{}, rev:1 });
      made.push({ ty, unit:pick, keys:[ks[0], ks[1]].filter(Boolean) });
    }
    const { files } = await buildPackage();
    return { made, missed, files: files.map(f => f.name).filter(n => /\.(jpe?g|png|webp)$/i.test(n)),
             payload: (await dbAll()).map(recToExport) };
  }, ['MP','FC','INSP','TEMP','UC','GET','TB','LUBE']);
  note('rounds named', named.made.map(m => m.ty + ':' + m.unit).join(' '));
  ok('every round type this build offers got a round to name',
     named.missed.length === 0, named.missed.join(',') || 'all eight');
  ok('the phone wrote a file for every frame it holds', named.files.length >= named.made.length * 3,
     named.files.length + ' image files');
  await dash.evaluate(p => window.CMDash.importRecords(p), named.payload);
  await dash.waitForTimeout(800);
  const lost = await dash.evaluate(names => {
    const want = new Set(names);
    const found = [];
    window.CMDash.allRecs().forEach(rec => {
      (rec.items || []).forEach(it => {
        const base = window.CMDash.photoBase(it, rec);
        window.CMDash.photoNames(base, rec).forEach(n => { if (want.has(n)) found.push(n); });
      });
    });
    return names.filter(n => found.indexOf(n) < 0);
  }, named.files);
  ok('and the dashboard looks for every one of them', lost.length === 0,
     lost.length ? 'never looked for: ' + lost.slice(0, 6).join(', ') : named.files.length + ' names agree');

  /* Looking for the right name is necessary and not sufficient — put the files
     in the folder under the names the phone actually wrote and check they come
     out the other end, on the pages, for every round type. */
  const reached = await dash.evaluate(names => {
    names.forEach(n => window.CMDash.addPhoto(n, 'data:image/jpeg;base64,/9j/AAA='));
    const recs = window.CMDash.allRecs().filter(r => /^nm-/.test(r.id || ''));
    const norm = window.CMReport.normalise(recs, { photos: true });
    const html = CMR.sections(window.CMReport.ctxFor(norm, { photos: true }))
      .map(s => s.html).join('');
    return { byType: norm.map(r => r.type + ':' +
               (r.items || []).reduce((n, it) => n + ((it.photos || []).length), 0)),
             onPaper: (html.match(/<img[^>]+src="data:image/g) || []).length,
             want: names.length };
  }, named.files);
  ok('and every one of them reaches the record it belongs to',
     reached.byType.every(x => Number(x.split(':')[1]) === 3), reached.byType.join(' '));
  ok('  and is printed on the pages', reached.onPaper >= reached.want,
     reached.onPaper + ' of ' + reached.want);

  console.log(fails.length?'\nFAILED: '+fails.length+'\n'+fails.join('\n'):'\nall green');
  await b.close(); process.exit(fails.length?1:0);
})().catch(e=>{console.log('FAIL harness: '+e.message);process.exit(1);});
