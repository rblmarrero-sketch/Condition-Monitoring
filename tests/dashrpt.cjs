/* One document, two ends. Print the same rounds from the app and from the
   dashboard and check the pages agree. */
const { chromium } = require(require('./pw.cjs'));
const fs=require('fs');
const B='http://127.0.0.1:8093';
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
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
  console.log(fails.length?'\nFAILED: '+fails.length+'\n'+fails.join('\n'):'\nall green');
  await b.close(); process.exit(fails.length?1:0);
})().catch(e=>{console.log('FAIL harness: '+e.message);process.exit(1);});
