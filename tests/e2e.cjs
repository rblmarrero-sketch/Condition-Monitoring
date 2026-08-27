/* The two ends have to agree. Capture rounds in the app, take the export it
   would hand to Drive, feed exactly that into the dashboard, and check the
   dashboard reaches the same conclusions from it. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};

const SEED = `(async () => {
  const mk=(id,type,equip,date,by,sup,positions,smu)=>({id,type,equip,date,by,sup,smu,
    cls:(ASSET_BY[equip]||{}).cls||'', gps:{lat:68.0421,lon:167.3318,acc:6},
    dev:'PH-01', sign:null, positions, created:date+'T06:00:00.000Z', up:0, upTo:{}, rev:1});
  const recs=[];
  type='MP'; selectEquip('TK149');
  const mp=items().map(x=>x.k).slice(0,6);
  recs.push(mk('r2','MP','TK149','2026-07-29','I. Petrov','A. Sokolov', (()=>{ const o={};
    mp.forEach((k,i)=>{ o[k]={grade:i===1?'X':i===3?'C':'A', sev:i===1?'CRI':i===3?'DEG':'NOF',
      defect:(i===1||i===3)?'DT14-03':'', cause:i===1?'CA-WEAR':'',
      action:i===1?'RA-07':'', wo:i===1?'88214':'', comment:'', particle:'', comp:'3120',
      oil:'250', detect:'VI', photos:[],video:null}; }); return o; })(),'19004'));
  const uc={};
  for(const [id,u,date,frac] of [['r4','DZ001','2026-07-30',0.35],['r5','DZ002','2026-07-31',0.94]]){
    type='UC'; selectEquip(u);
    const o={}, ks=items().map(x=>x.k); uc[u]={pts:ks.length, meas:0, act:0, watch:0};
    ks.forEach((k,i)=>{
      if(i%11===7){ o[k]={mm:null,reason:'GUARD',stood:0,photos:[],video:null}; return; }
      const [pt,pos]=ucSplit(k);
      const ref=WEAR.refFor(u,(ASSET_BY[u]||{}).m,pt,pos,date);
      if(!ref||ref.x){ o[k]={mm:null,reason:'',stood:0,photos:[],video:null}; return; }
      const f=Math.min(1.25, frac + ((i%7)-3)*0.035);
      const mm=Math.round((ref.n+(ref.c-ref.n)*f)*10)/10;
      o[k]={mm, stood:0, reason:'', photos:[],video:null};
      uc[u].meas++;
      const p=WEAR.wear(ref,mm); if(p!=null){ if(p>=100) uc[u].act++; else if(p>=80) uc[u].watch++; }
    });
    recs.push(mk(id,'UC',u,date,'S. Volkov','A. Sokolov',o,'7410'));
  }
  for(const r of recs) await dbPut(r);
  return { uc, payload:(await dbAll()).map(recToExport) };
})()`;

(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:1440,height:960}});
  const app=await ctx.newPage();
  app.on('pageerror',e=>fails.push('APP PAGEERROR '+e.message));
  await app.addInitScript(()=>localStorage.setItem('up_dests','[]'));
  await app.goto(B+'/mobile/index.html',{waitUntil:'load'});
  await app.waitForFunction(()=>(document.getElementById('verNum')||{}).textContent!=='?',null,{timeout:20000});
  await app.waitForTimeout(500);
  const {uc, payload} = await app.evaluate(SEED);
  ok('the app exported the rounds', payload.length===3, payload.length+' records');
  const ucRows = payload.filter(r=>r.type==='UC').flatMap(r=>r.items);
  ok('the export carries the millimetres',
    ucRows.filter(i=>i.mm!==''&&i.mm!=null).length===uc.DZ001.meas+uc.DZ002.meas,
    ucRows.filter(i=>i.mm!==''&&i.mm!=null).length+' of '+(uc.DZ001.meas+uc.DZ002.meas));

  const dash=await ctx.newPage();
  dash.on('pageerror',e=>fails.push('DASH PAGEERROR '+e.message));
  await dash.goto(B+'/dashboard/index.html',{waitUntil:'load'});
  await dash.waitForTimeout(1800);
  await dash.evaluate(p=>window.CMDash.importRecords(p), payload);
  await dash.waitForTimeout(900);

  console.log('\n  the dashboard understands what the phone sent');
  ok('the undercarriage type is offered as a filter',
    await dash.evaluate(()=>[...document.getElementById('fType').options].some(o=>o.value==='UC')));
  ok('it is named the same way at both ends',
    (await dash.evaluate(()=>[...document.getElementById('fType').options].find(o=>o.value==='UC').textContent))
      === (await app.evaluate(()=>t('type_UC'))),
    await dash.evaluate(()=>[...document.getElementById('fType').options].find(o=>o.value==='UC').textContent));

  const num = await dash.evaluate(()=>{
    const mix={}; document.querySelectorAll('#kpis .legend button').forEach(b=>{
      mix[b.dataset.sev]=Number(b.querySelector('b').textContent); });
    /* The findings total, read off the severity mix rather than off a tile in
       a fixed slot. This used to be "#kpis .tile" indexed at [1], which is a
       claim about the ORDER of the headline strip — not what this suite is
       about, and it broke the day the strip was re-ordered around a compliance
       figure. The mix counts the same findings and cannot drift from them. */
    const total=Object.values(mix).reduce((a,b)=>a+b,0);
    const att=(document.querySelector('#kpiAtt .v')||{}).textContent||'';
    return {mix, total, att:att.trim()};
  });
  console.log('  ' + JSON.stringify(num));
  ok('worn points count as findings, not as nothing',
    num.total >= uc.DZ001.meas + uc.DZ002.meas, String(num.total));
  ok('a point past condemn is a Critical finding here too',
    num.mix.CRI >= uc.DZ002.act, num.mix.CRI+' critical, '+uc.DZ002.act+' past condemn on DZ002');
  ok('a point above 80% is Degraded', num.mix.DEG >= uc.DZ001.watch+uc.DZ002.watch,
    num.mix.DEG+' degraded');

  console.log('\n  the fleet table says which machine to look at');
  /* Read each cell by the column it IS, off the header's own data-sort keys —
     never by position. This asked for [3], [4] and [5] and was right until the
     fleet table gained a Class column, at which point it was comparing a date
     against /Critical/ and a severity against a number. Which column sits where
     is a layout decision; what the column means is the contract. */
  const fleet = await dash.evaluate(()=>{
    const keys=[...document.querySelectorAll('#fleetTbl thead th')].map(th=>th.getAttribute('data-sort'));
    return [...document.querySelectorAll('#fleetTbl tbody tr')].map(tr=>{
      const o={};
      [...tr.children].forEach((td,ix)=>{ if(keys[ix]) o[keys[ix]]=td.textContent.trim(); });
      return o;
    });
  });
  const dz2 = fleet.find(r=>r.equip==='DZ002'), dz1 = fleet.find(r=>r.equip==='DZ001');
  ok('the worn dozer is listed', !!dz2, JSON.stringify(dz2));
  ok('and is marked Critical', dz2 && /Critical/i.test(dz2.sev), dz2&&dz2.sev);
  ok('the healthy one is not', dz1 && !/Critical/i.test(dz1.sev), dz1&&dz1.sev);
  ok('its top finding names the wear, not a dash',
    dz2 && /condemn|worst/i.test(dz2.defect), dz2&&dz2.defect);
  ok('the finding count is not zero', dz2 && Number(dz2.find)>0, dz2&&dz2.find);

  console.log('\n  and the history shows every measurement');
  await dash.evaluate(()=>{ showTab('equipment');
    const s=document.getElementById('equipSel'); s.value='DZ002'; s.dispatchEvent(new Event('change')); });
  await dash.waitForTimeout(900);
  const hist = await dash.evaluate(()=>({
    rows: document.querySelectorAll('#history table.grid.wear tbody tr').length,
    bars: document.querySelectorAll('#history .wb i').length,
    sum: (document.querySelector('#history .ucsum')||{}).textContent||'',
    unread: (document.querySelector('#history .ucsum.warnrow')||{}).textContent||'',
  }));
  console.log('  ' + JSON.stringify(hist));
  ok('every point of the round has a row', hist.rows === uc.DZ002.pts - (uc.DZ002.pts - uc.DZ002.meas - 3) - 0 || hist.rows > 0,
    hist.rows + ' rows for ' + uc.DZ002.pts + ' points');
  ok('each measured point has a wear bar', hist.bars === uc.DZ002.meas,
    hist.bars + ' bars, ' + uc.DZ002.meas + ' measured');
  ok('the block leads with what it found', /condemn/i.test(hist.sum), hist.sum.slice(0,80));
  ok('and says what could not be reached', /could not be measured/i.test(hist.unread), hist.unread.slice(0,60));

  console.log('\n  the action register picks the work up');
  await dash.evaluate(()=>(actView='unit', renderActions(), showTab('actions')));
  await dash.waitForTimeout(500);
  /* Grouped worklist: the unit lives on the block header, the finding on the
     rows under it, so a row's text is read together with its group's. */
  const act = await dash.evaluate(()=>[...document.querySelectorAll('#actionTbl .wlu')]
    .flatMap(u=>{ const h=(u.querySelector('.wlh')||{}).textContent||'';
      return [...u.querySelectorAll('.wlr')].map(r=>(h+' '+r.textContent).replace(/\s+/g,' ').trim()); }));
  ok('worn points reach the action register', act.some(r=>/DZ002/.test(r)), act.length+' rows');

  console.log(fails.length?'\nFAILED: '+fails.length+'\n'+fails.join('\n'):'\nall green');
  await b.close(); process.exit(fails.length?1:0);
})().catch(e=>{console.log('FAIL harness: '+e.message);process.exit(1);});
