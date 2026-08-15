const { chromium } = require(require('./pw.cjs'));
const B='http://127.0.0.1:8097', OUT=__dirname+'/out';
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails.push(n);};
const msg = p => p.textContent('#teamMsg').then(s=>s.trim());

(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
  const p=await ctx.newPage();
  p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));

  console.log('startup pull hangs (weak signal)');
  await p.addInitScript(u=>{ if(!localStorage.getItem('up_dests'))
    localStorage.setItem('up_dests',JSON.stringify([{id:'gas',on:true,url:u,sec:'',folder:''}])); }, B+'/hang');
  await p.goto(B+'/mobile/index.html',{waitUntil:'load'});
  await p.waitForTimeout(1500);
  ok('the startup pull is still in flight', await p.evaluate(()=>teamBusy===true),
     `teamBusy=${await p.evaluate(()=>teamBusy)}`);

  console.log('\npressing Check for new while it hangs');
  await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamRefresh');
  await p.waitForTimeout(400);
  ok('the press is acknowledged immediately', /Checking/.test(await msg(p)), await msg(p));
  ok('the button is not left dead', await p.evaluate(()=>!document.getElementById('teamRefresh').disabled)
     || await p.evaluate(()=>teamBusy===true), 'either enabled or a live pull owns it');

  console.log('\nthe hung request times out instead of hanging for ever');
  await p.waitForFunction(()=>/did not answer|Could not reach|⚠/.test(document.getElementById('teamMsg').textContent),
    null,{timeout:30000});
  ok('it says the signal is the problem', /did not answer|Could not reach/.test(await msg(p)), await msg(p));
  ok('and the button is usable again', await p.evaluate(()=>!document.getElementById('teamRefresh').disabled));
  ok('nothing is left marked busy', await p.evaluate(()=>teamBusy===false));

  console.log('\nback in coverage');
  // go through saveDests: settings are cached in memory, and writing the raw key
  // from outside is not how the app ever changes them
  await p.evaluate(u=>saveDests([{id:'gas',on:true,url:u,sec:'',folder:''}]), B+'/exec2');
  await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamRefresh');
  await p.waitForFunction(()=>/new ·|Up to date/.test(document.getElementById('teamMsg').textContent),
    null,{timeout:20000});
  ok('the same button now works', /5 new/.test(await msg(p)), await msg(p));
  ok('all five are stored', (await p.evaluate(()=>teamAll().length))===5,
     String(await p.evaluate(()=>teamAll().length)));

  console.log('\n"only 2" — the list is filtered by inspection type');
  const scope = (await p.textContent('#teamScope')).replace(/\s+/g,' ').trim();
  ok('the badge counts only this type', (await p.textContent('#teamCount'))==='2',
     await p.textContent('#teamCount'));
  ok('but the card now says so', /2 ×/.test(scope) && /3 more under other types/.test(scope), scope);
  await p.screenshot({path:OUT+'/team-scope.png'});

  await p.selectOption('#typeSel','FC').catch(()=>p.evaluate(()=>{type='FC';applyForm();}));
  await p.waitForTimeout(400);
  ok('switching type shows the others', (await p.textContent('#teamCount'))==='2',
     `FC count=${await p.textContent('#teamCount')}`);

  console.log(fails.length?'\nFAILURES:\n  '+[...new Set(fails)].join('\n  '):'\nwedge + scope checks passed');
  await b.close(); process.exit(fails.length?1:0);
})();
