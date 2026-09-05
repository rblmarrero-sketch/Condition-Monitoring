const REPO = require('path').join(__dirname, '..');
/* An inspector on an old build captures against an old reference table and has
   no way to know. The app now asks the server what the current build is and says
   so — and stays quiet when there is no signal, because that is the normal case
   in the pit and not a fault. */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs');
/* "Newer" has to be derived, never typed. A literal here is a suite with a
   shelf life: it passes until the real build catches up with the number, and
   then it reports the app as broken when the app is doing exactly the right
   thing — staying quiet because the two builds match. */
const CUR = (fs.readFileSync(REPO + '/mobile/index.html', 'utf8')
             .match(/const BUILD\s*=\s*"([^"]+)"/) || [, '0'])[1];
const NEWER = String(Number(CUR) + 1);
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); if(!c)fails.push(n);};
const B='http://127.0.0.1:8093';
const vis=(p,s)=>p.evaluate(x=>{const e=document.querySelector(x);
  return !!e && !e.classList.contains('hidden') && e.getClientRects().length>0;},s);

async function open(b, swBuild, opts={}) {
  // page.route cannot see a request the service worker mediates, and the worker
  // is not what is under test here — the check that runs inside the page is.
  const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,
    serviceWorkers:'block'});
  const p=await ctx.newPage();
  p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
  await p.addInitScript(()=>localStorage.setItem('up_dests','[]'));
  if(swBuild!==undefined) await p.route('**/sw.js*', r=>r.fulfill({status:200,
    contentType:'application/javascript', body:`const BUILD = "${swBuild}";`}));
  if(opts.fail) await p.route('**/sw.js*', r=>r.abort());
  /* No signal is a network that answers nothing, not a flag. The app no longer
     gates the check on navigator.onLine — it asks, and a routed answer would
     get through setOffline — so the pit is a request that fails. */
  if(opts.offline) await p.route('**/sw.js*', r=>r.abort('internetdisconnected'));
  await p.goto(B+'/mobile/index.html',{waitUntil:'load'});
  if(opts.offline) await ctx.setOffline(true);   // load first, then lose the signal
  await p.waitForTimeout(2600);
  return {ctx,p};
}
(async()=>{
  const b=await chromium.launch();

  // read the running build rather than hard-coding it, so a version bump never
  // makes this suite lie
  let {ctx,p}=await open(b,NEWER);
  const BUILD=await p.evaluate(()=>BUILD);
  console.log('the server is on a newer build than this phone (running v'+BUILD+')');
  ok('the app says so', await vis(p,'#staleBar'));
  const txt=(await p.textContent('#staleTxt')||'').replace(/\s+/g,' ');
  ok('it names both numbers', txt.includes('v'+NEWER) && txt.includes('v'+BUILD), txt);
  ok('and offers the fix', /Update now/i.test(await p.textContent('#staleGo')));
  ok('the fix is the same one-tap update',
    await p.evaluate(()=>{ let called=false;
      document.getElementById('forceUpdate').click=()=>{called=true;};
      document.getElementById('staleGo').click(); return called; }));
  await ctx.close();

  console.log('\nthe phone is already current');
  ({ctx,p}=await open(b,BUILD));
  ok('nothing is said', !(await vis(p,'#staleBar')));
  await ctx.close();

  console.log('\nno signal — the normal case in the pit');
  ({ctx,p}=await open(b,NEWER,{offline:true}));
  ok('it stays quiet', !(await vis(p,'#staleBar')));
  ok('and the app still works offline', await p.evaluate(()=>ASSETS.length>0));
  await ctx.close();

  console.log('\nthe check itself fails');
  ({ctx,p}=await open(b,undefined,{fail:true}));
  ok('still quiet, no error shown', !(await vis(p,'#staleBar')));
  await ctx.close();

  console.log('\ncoming back to the app re-checks');
  ({ctx,p}=await open(b,BUILD));
  ok('quiet on arrival', !(await vis(p,'#staleBar')));
  await p.route('**/sw.js*', r=>r.fulfill({status:200,
    contentType:'application/javascript', body:`const BUILD = "${NEWER}";`}));
  await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(900);
  ok('a build shipped while the phone was in a pocket gets noticed', await vis(p,'#staleBar'),
    (await p.textContent('#staleTxt')||'').trim());
  await ctx.close();

  await b.close();
  console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
  process.exit(fails.length?1:0);
})();
