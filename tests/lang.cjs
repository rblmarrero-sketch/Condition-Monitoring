/* EN/RU across the dashboard, including the parts built in code. */
const { chromium } = require(require('./pw.cjs'));
const B='http://127.0.0.1:8093', OUT=__dirname+'/out';
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails.push(n);};
const cyr=s=>/[А-Яа-яЁё]/.test(s);
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

  console.log('English by default');
  ok('tabs are English', (await p.textContent('nav.tabs')).includes('Overview'));
  ok('a language toggle exists', (await p.$$('.lang button')).length===2);

  console.log('\nswitch to Russian');
  await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(500);
  ok('tabs translate', cyr(await p.textContent('nav.tabs')), (await p.textContent('nav.tabs')).replace(/\s+/g,' ').trim());
  ok('control labels translate', cyr(await p.textContent('.controls')),
     (await p.textContent('.controls')).replace(/\s+/g,' ').trim().slice(0,60));
  ok('KPI tiles translate — built in code', cyr(await p.textContent('#kpis')),
     (await p.textContent('#kpis')).replace(/\s+/g,' ').trim().slice(0,60));
  /* The words changed, deliberately. The four ISO 14224 categories had three
     different Russian renderings across the phone, this screen and the printed
     legend — "Начальный / Ухудшено / Критично" here against "Зарождающийся /
     Частичный / Критический" in the field. The field's wording won, because it
     is the one inspectors have been trained on and it is the ISO term. */
  ok('grade labels translate', /Критическое|Ухудшенное/.test(await p.textContent('#kpis')));
  ok('the fleet table headers translate', cyr(await p.textContent('#fleetTbl thead')),
     (await p.textContent('#fleetTbl thead')).replace(/\s+/g,' ').trim());
  ok('inspection type names translate', /Магнитная пробка/.test(await p.textContent('#fleetTbl')));
  ok('the status chip translates', cyr(await p.textContent('#srcText')), (await p.textContent('#srcText')).trim());

  console.log('\nother tabs');
  await p.click('nav.tabs button[data-tab="actions"]'); await p.waitForTimeout(300);
  /* The register lost its <thead> when it became a grouped worklist. What has
     to translate is the same either way: the words a Russian planner reads on
     the page — the filter chips, the status of each row, the "assign" prompt. */
  const regTxt = (await p.textContent('#tab-actions')).replace(/\s+/g,' ').trim();
  ok('action register translates', cyr(regTxt), regTxt.slice(0,110));
  ok('  including the filter it is read through',
     cyr(await p.textContent('#aSeg')), (await p.textContent('#aSeg')).replace(/\s+/g,' ').trim());
  await p.click('nav.tabs button[data-tab="failure"]'); await p.waitForTimeout(300);
  ok('failure-mode section translates', cyr(await p.textContent('#tab-failure')));
  await p.click('nav.tabs button[data-tab="reports"]'); await p.waitForTimeout(300);
  ok('the report tab translates', cyr(await p.textContent('#tab-reports')));

  console.log('\nfilters and chips');
  await p.click('nav.tabs button[data-tab="overview"]'); await p.waitForTimeout(200);
  await p.fill('#fQ','TK14'); await p.waitForTimeout(400);
  ok('filter chips translate', cyr(await p.textContent('#chips')), (await p.textContent('#chips')).replace(/\s+/g,' ').trim());
  await p.click('#chipClear'); await p.waitForTimeout(300);

  console.log('\nthe sheets');
  await p.evaluate(()=>openData()); await p.waitForTimeout(300);
  ok('data sources translates', cyr(await p.textContent('#dataOv')),
     (await p.textContent('#dataOv')).replace(/\s+/g,' ').trim().slice(0,70));
  await p.screenshot({path:OUT+'/dash-ru.png'});
  await p.click('#dataClose');
  await p.click('nav.tabs button[data-tab="equipment"]'); await p.waitForTimeout(200);
  await p.selectOption('#equipSel','TK146'); await p.waitForTimeout(400);
  ok('history heading translates', cyr(await p.textContent('#histTitle')), (await p.textContent('#histTitle')).trim());
  const eb=await p.$('[data-edit]');
  if(eb){ await eb.click(); await p.waitForTimeout(400);
    ok('the edit panel translates', cyr(await p.textContent('#editOv')),
       (await p.textContent('#editOv')).replace(/\s+/g,' ').trim().slice(0,70));
    ok('and its severity/action pickers do too',
       /Критическое/.test(await p.textContent('#edItems')) && /Наблюдать/.test(await p.textContent('#edItems')));
    await p.screenshot({path:OUT+'/edit-ru.png'});
    await p.click('#edClose');
  } else fails.push('no edit button to test');

  console.log('\nnothing English left on screen');
  await p.click('nav.tabs button[data-tab="overview"]'); await p.waitForTimeout(300);
  ok('the subtitle translates', cyr(await p.textContent('#sub')), (await p.textContent('#sub')).trim());
  await p.evaluate(()=>openData()); await p.waitForTimeout(200);
  await p.click('#drvGo');
  await p.waitForFunction(()=>/^(✅|❌|Нет|No)/.test(document.getElementById('drvMsg').textContent.trim()),null,{timeout:20000});
  ok('the load message translates', cyr(await p.textContent('#drvMsg')), (await p.textContent('#drvMsg')).trim());
  await p.click('#dataClose');

  console.log('\nthe choice sticks');
  await p.reload({waitUntil:'load'}); await p.waitForTimeout(700);
  ok('still Russian after a reload', cyr(await p.textContent('nav.tabs')));
  await p.click('.lang button[data-lang="en"]'); await p.waitForTimeout(400);
  ok('and switches back', (await p.textContent('nav.tabs')).includes('Overview'));
  ok('with the code-built parts too', !cyr(await p.textContent('#kpis')),
     (await p.textContent('#kpis')).replace(/\s+/g,' ').trim().slice(0,50));

  console.log(fails.length?'\nFAILURES:\n  '+[...new Set(fails)].join('\n  '):'\nall EN/RU checks passed');
  await b.close(); process.exit(fails.length?1:0);
})();
