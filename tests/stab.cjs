/* Stability suite — one case per bug found in the audit. */
const { chromium } = require(require('./pw.cjs'));
const B='http://127.0.0.1:8096', OUT=__dirname+'/out';
require('fs').mkdirSync(OUT,{recursive:true});
const fails=[];
const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails.push(n);};
const seed=n=>fetch(`${B}/__seed?n=${n}`).then(r=>r.text());
const del=u=>fetch(`${B}/__del?u=${u}`).then(r=>r.text());
const stats=()=>fetch(B+'/__stats').then(r=>r.json());
const msg=p=>p.textContent('#teamMsg').then(s=>s.trim());
const settled=p=>p.waitForFunction(()=>{
  const s=document.getElementById('teamMsg').textContent.trim();
  return s && !/^Checking/.test(s);},null,{timeout:30000});

async function app(b, url, extra){
  const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
  const p=await ctx.newPage();
  p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
  await p.addInitScript(([u,x])=>{
    localStorage.setItem('up_dests',JSON.stringify([{id:'gas',on:true,url:u,sec:'',folder:''}]));
    if(x) eval(x);
  },[url,extra||'']);
  await p.goto(B+'/mobile/index.html',{waitUntil:'load'});
  await p.waitForTimeout(900);
  return {ctx,p};
}

(async()=>{
  const b=await chromium.launch();

  /* 1 — the reported symptom: cache gone, cursor left behind */
  console.log('1. cache cleared but the cursor survived');
  await seed(8);
  {
    const {ctx,p}=await app(b,B+'/exec');
    await settled(p);
    ok('first pull gets everything', (await p.evaluate(()=>teamAll().length))===8,
       String(await p.evaluate(()=>teamAll().length)));
    // exactly what a storage eviction or a separate PWA/browser store looks like
    await p.evaluate(()=>{ localStorage.removeItem('cm_team'); teamCache=null; });
    await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamRefresh'); await settled(p);
    ok('it re-reads instead of reporting "up to date" for ever',
       (await p.evaluate(()=>teamAll().length))===8,
       `${await p.evaluate(()=>teamAll().length)} — ${await msg(p)}`);
    await ctx.close();
  }

  /* 2 — a failed write must not advance the cursor */
  console.log('\n2. no room to store the reply');
  {
    const {ctx,p}=await app(b,B+'/exec',
      `window.__realSet=localStorage.setItem.bind(localStorage);
       localStorage.setItem=(k,v)=>{ if(k==='cm_team'){ const e=new Error('quota'); e.name='QuotaExceededError'; throw e; } return window.__realSet(k,v); };`);
    await settled(p);
    ok('it says storage is full', /No room left/.test(await msg(p)), await msg(p));
    ok('the cursor was NOT advanced', !(await p.evaluate(()=>localStorage.getItem('cm_team_cursor'))),
       String(await p.evaluate(()=>localStorage.getItem('cm_team_cursor'))));
    // room appears again -> the same records must still be offered
    // restore the ORIGINAL, not the patched one we would get by re-binding now
    await p.evaluate(()=>{ localStorage.setItem=window.__realSet; teamCache=null; });
    await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamRefresh'); await settled(p);
    ok('once there is room they arrive', (await p.evaluate(()=>teamAll().length))===8,
       `${await p.evaluate(()=>teamAll().length)} — ${await msg(p)}`);
    await ctx.close();
  }

  /* 3 — Reload all must not destroy the offline copy when it cannot reach Drive */
  console.log('\n3. Reload all with no signal');
  {
    const {ctx,p}=await app(b,B+'/exec');
    await settled(p);
    ok('8 held before', (await p.evaluate(()=>teamAll().length))===8);
    await ctx.setOffline(true);
    await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamReload'); await p.waitForTimeout(600);
    ok('the offline copy survives a failed reload', (await p.evaluate(()=>teamAll().length))===8,
       `${await p.evaluate(()=>teamAll().length)} — ${await msg(p)}`);
    ok('and it says why', /Offline/.test(await msg(p)), await msg(p));
    await ctx.setOffline(false);
    await ctx.close();
  }

  /* 4 — Reload all really does replace */
  console.log('\n4. Reload all after a deletion in Drive');
  {
    await seed(8);
    const {ctx,p}=await app(b,B+'/exec');
    await settled(p);
    await del('TK101');
    await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamRefresh'); await settled(p);
    ok('an incremental refresh cannot see the deletion',
       (await p.evaluate(()=>teamAll().length))===8, String(await p.evaluate(()=>teamAll().length)));
    await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamReload'); await settled(p);
    ok('Reload all drops it', (await p.evaluate(()=>teamAll().length))===7,
       `${await p.evaluate(()=>teamAll().length)} — ${await msg(p)}`);
    ok('but the due-list date is kept', (await p.evaluate(()=>Object.keys(histAll()).length))===8,
       String(await p.evaluate(()=>Object.keys(histAll()).length)));
    await ctx.close();
  }

  /* 5 — an upload that never completes must not wedge sync */
  console.log('\n5. upload against a stalled connection');
  {
    await seed(2);
    const {ctx,p}=await app(b,B+'/exec');
    await settled(p);
    const r=await p.evaluate(async u=>{
      saveDests([{id:'gas',on:true,url:u,sec:'',folder:''}]);
      await dbPut({id:'S1',cls:'HT',type:'MP',equip:'TK500',date:'2026-07-31',by:'A',
        positions:{'4C':{grade:'C'}},created:new Date().toISOString(),up:0,rev:1});
      const t0=Date.now();
      // the real code allows 90 s; prove the mechanism, not the constant
      const err=await fetchT(u,{method:'POST',body:'x'},1200).then(()=>'no error',e=>e.message);
      return {ms:Date.now()-t0, err};
    }, B+'/hang');
    ok('a stalled upload gives up instead of hanging', r.ms<4000 && /timed out/.test(r.err),
       `${r.ms} ms — ${r.err}`);
    ok('sync is not left marked busy', (await p.evaluate(()=>syncing))===false);
    ok('the record is still queued, not lost',
       (await p.evaluate(async()=>(await dbGet('S1')).up))===0);
    await ctx.close();
  }

  /* 6 — reading settings must not write to storage */
  console.log('\n6. loadDests() on the render path');
  {
    const {ctx,p}=await app(b,B+'/exec');
    const w=await p.evaluate(()=>{
      let n=0; const _s=localStorage.setItem.bind(localStorage);
      localStorage.setItem=(k,v)=>{ if(k==='up_dests') n++; return _s(k,v); };
      for(let i=0;i<200;i++){ activeDests(); renderSync(); }
      localStorage.setItem=_s; return n;
    });
    ok('200 renders cause no settings writes', w===0, `${w} writes`);
    const changed=await p.evaluate(()=>{
      let n=0; const _s=localStorage.setItem.bind(localStorage);
      localStorage.setItem=(k,v)=>{ if(k==='up_dests') n++; return _s(k,v); };
      saveDests(loadDests().map(d=>Object.assign({},d,{folder:'X/{YYYY-MM}'})));
      localStorage.setItem=_s; return n;
    });
    ok('but a real change still persists', changed===1, `${changed} writes`);
    ok('and is visible immediately',
       (await p.evaluate(()=>loadDests().find(d=>d.id==='gas').folder))==='X/{YYYY-MM}');
    await ctx.close();
  }

  /* 7 — a full disk must not break Save */
  console.log('\n7. saving an inspection with storage full');
  {
    const {ctx,p}=await app(b,B+'/exec',
      `const _s=localStorage.setItem.bind(localStorage);
       localStorage.setItem=(k,v)=>{ if(k==='cm_hist'){ const e=new Error('quota'); e.name='QuotaExceededError'; throw e; } return _s(k,v); };`);
    const res=await p.evaluate(async()=>{
      let threw='';
      try{ noteDone({equip:'TK777',date:'2026-07-31',type:'MP'}); }catch(e){ threw=String(e.message||e); }
      return threw;
    });
    ok('noteDone does not throw out of the Save path', res==='', res||'no throw');
    await ctx.close();
  }

  /* 8 — a connection that stalls must not block a cold start */
  console.log('\n8. cold start on a signal that connects and stalls');
  {
    const {ctx,p}=await app(b,B+'/exec');
    await p.evaluate(()=>navigator.serviceWorker.ready);
    await p.waitForTimeout(400);
    // every same-origin request now stalls; the SW must fall back to its cache
    await p.route('**/mobile/**', route => { /* never fulfilled */ });
    const t0=Date.now();
    await p.reload({waitUntil:'domcontentloaded'});
    const took=Date.now()-t0;
    await p.waitForTimeout(800);
    const units=await p.evaluate(()=>window.ASSETS?ASSETS.length:0);
    ok('the app still starts', units>1000, `${units} units in ${took} ms`);
    ok('and does not sit there waiting', took<12000, `${took} ms`);
    await p.unroute('**/mobile/**');
    await ctx.close();
  }

  console.log(fails.length?'\nFAILURES:\n  '+[...new Set(fails)].join('\n  '):'\nall stability checks passed');
  await b.close();
  process.exit(fails.length?1:0);
})();
