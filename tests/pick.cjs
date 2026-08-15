/* Searching the defect and cause lists in the edit panel. */
const { chromium } = require(require('./pw.cjs'));
const B='http://127.0.0.1:8093', OUT=__dirname+'/out';
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails.push(n);};
const nOpts=(p,f)=>p.$$eval(`#edItems select[data-f="${f}"] option`,a=>a.length);
const val=(p,f)=>p.$eval(`#edItems select[data-f="${f}"]`,e=>e.value);
const count=(p,f)=>p.$eval(`#edItems [data-count="${f}"]`,e=>e.textContent.trim());

(async()=>{
  await fetch(B+'/__seed');
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:1440,height:1000}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
  p.on('console',m=>{ if(m.type()==='error'&&!/ERR_|Failed to load/.test(m.text())) fails.push('CONSOLE '+m.text()); });
  await p.goto(B+'/dashboard/index.html',{waitUntil:'load'});
  await p.evaluate(u=>{ openData(); document.getElementById('drvUrl').value=u; }, B+'/exec');
  await p.click('#drvGo');
  await p.waitForFunction(()=>/^(✅|❌|No)/.test(document.getElementById('drvMsg').textContent.trim()),null,{timeout:20000});
  await p.click('#dataClose');
  await p.click('nav.tabs button[data-tab="equipment"]'); await p.waitForTimeout(200);
  await p.selectOption('#equipSel','TK146'); await p.waitForTimeout(300);
  await p.click('[data-edit="TK146|2026-03-09|MP"]'); await p.waitForTimeout(400);

  const allDef=await nOpts(p,'defectCode'), allCau=await nOpts(p,'causeCode');
  console.log('the lists are the ones this record can use');
  // A magnetic-plug round addresses a plug position, not a register component, so
  // it gets the plug vocabulary — 14 debris and oil findings, not all 114 modes.
  ok('the magnetic-plug findings are offered', allDef===15, `${allDef} options for 14 findings + blank`);
  ok('so are their operating causes', allCau===13, `${allCau} options for 12 causes + blank`);
  ok('there is a search box for each', (await p.$$('#edItems [data-filter]')).length===2);
  ok('the record\'s existing defect is preselected', (await val(p,'defectCode'))==='DT14-03', await val(p,'defectCode'));

  console.log('\nnarrowing the defects');
  await p.fill('#edItems [data-filter="defectCode"]','ferrous'); await p.waitForTimeout(200);
  const nf=await nOpts(p,'defectCode');
  ok('the list shrinks', nf>1 && nf<allDef, `${nf} of ${allDef}`);
  ok('and says how many matched', /of/.test(await count(p,'defectCode')), await count(p,'defectCode'));
  const labels=await p.$$eval('#edItems select[data-f="defectCode"] option',
    a=>a.slice(1).map(o=>o.textContent.toLowerCase()));
  ok('every option shown actually matches',
     labels.every(l=>l.includes('ferrous')||l.includes('dt14-03')), labels.slice(0,3).join(' | '));
  ok('the existing choice is not lost by filtering', (await val(p,'defectCode'))==='DT14-03', await val(p,'defectCode'));

  console.log('\npicking from a narrowed list');
  await p.fill('#edItems [data-filter="defectCode"]','ferrous'); await p.waitForTimeout(200);
  const opts=await p.$$eval('#edItems select[data-f="defectCode"] option',a=>a.map(o=>({v:o.value,l:o.textContent})));
  const chosen=opts.find(o=>o.v && o.v!=='DT14-03');
  ok('a match is available to pick', !!chosen, chosen?chosen.l:'none');
  if(chosen){
    await p.selectOption('#edItems select[data-f="defectCode"]',chosen.v);
    await p.fill('#edItems [data-filter="defectCode"]',''); await p.waitForTimeout(200);
    ok('clearing the search restores the full list', (await nOpts(p,'defectCode'))===allDef,
       `${await nOpts(p,'defectCode')} of ${allDef}`);
    ok('and keeps what was just picked', (await val(p,'defectCode'))===chosen.v, await val(p,'defectCode'));
  }

  console.log('\nno matches');
  await p.fill('#edItems [data-filter="causeCode"]','zzzznothing'); await p.waitForTimeout(200);
  ok('it says so rather than showing an empty box',
     /nothing matches/i.test(await count(p,'causeCode')), await count(p,'causeCode'));
  await p.fill('#edItems [data-filter="causeCode"]',''); await p.waitForTimeout(200);
  ok('and recovers', (await nOpts(p,'causeCode'))===allCau);

  console.log('\nthe search is only a search — it must not be saved as a change');
  await p.fill('#edItems [data-filter="causeCode"]','wear'); await p.waitForTimeout(200);
  const collected=await p.evaluate(()=>JSON.stringify(collectEdit()));
  ok('typing in it records nothing', collected==='{}'||!/pickq|filter/.test(collected), collected.slice(0,120));

  console.log('\nsaving a defect chosen through the search');
  await p.fill('#edItems [data-filter="causeCode"]',''); await p.waitForTimeout(150);
  await p.fill('#edBy','R. Marrero');
  await p.fill('#edItems [data-filter="defectCode"]','ferrous'); await p.waitForTimeout(200);
  const pick2=(await p.$$eval('#edItems select[data-f="defectCode"] option',a=>a.map(o=>o.value))).filter(Boolean)[0];
  await p.selectOption('#edItems select[data-f="defectCode"]',pick2);
  await p.click('#edSave');
  await p.waitForFunction(()=>/Saved/.test(document.getElementById('edMsg').textContent),null,{timeout:15000});
  const saved=await p.evaluate(k=>{const r=CMDash.allRecs().find(x=>`${x.equip}|${x.date}|${x.type}`===k);
    return r?r.items[0].defectCode:null;},'TK146|2026-03-09|MP');
  ok('the picked code is what gets stored', saved===pick2, `${saved} vs ${pick2}`);

  console.log('\nRussian');
  await p.click('#edClose'); await p.waitForTimeout(200);   // the panel covers the header
  await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(400);
  await p.click('[data-edit="TK146|2026-03-09|MP"]').catch(()=>{});
  await p.waitForTimeout(400);
  const ph=await p.$eval('#edItems [data-filter="defectCode"]',e=>e.placeholder);
  ok('the search box is translated', /[А-Яа-я]/.test(ph), ph);
  await p.fill('#edItems [data-filter="defectCode"]','ferrous'); await p.waitForTimeout(200);
  ok('and the match count is too', /из/.test(await count(p,'defectCode')), await count(p,'defectCode'));
  await p.screenshot({path:OUT+'/pick-ru.png'});
  await p.click('#edClose'); await p.waitForTimeout(200);   // panel covers the header again
  await p.click('.lang button[data-lang="en"]'); await p.waitForTimeout(300);

  console.log(fails.length?'\nFAILURES:\n  '+[...new Set(fails)].join('\n  '):'\nall picker checks passed');
  await b.close(); process.exit(fails.length?1:0);
})();
