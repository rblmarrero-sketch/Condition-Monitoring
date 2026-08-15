/* Stage 1: F1 delete confirmation, F3 persistence, F6 storage readout. */
const { chromium } = require(require('./pw.cjs'));
const B='http://127.0.0.1:8093';
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails.push(n);};
const dlgTxt=p=>p.evaluate(()=>document.getElementById('dlgTitle').textContent+' | '
  +document.getElementById('dlgMsg').textContent);
const nPend=p=>p.evaluate(async()=>(await dbAll()).length);

async function app(b,opts){
  const ctx=await b.newContext(Object.assign({viewport:{width:412,height:915},isMobile:true,hasTouch:true},opts||{}));
  const p=await ctx.newPage();
  p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
  p.on('console',m=>{ if(m.type()==='error'&&!/ERR_|Failed to load/.test(m.text())) fails.push('CONSOLE '+m.text()); });
  await p.addInitScript(u=>localStorage.setItem('up_dests',JSON.stringify(
    [{id:'gas',on:true,url:u,sec:'',folder:'{TYPE}/{YYYY-MM}'}])), B+'/exec');
  await p.goto(B+'/mobile/index.html',{waitUntil:'load'});
  await p.waitForTimeout(1100);
  return {ctx,p};
}
const seedRec=(p,id,up)=>p.evaluate(async([id,up])=>{
  const png=await new Promise(r=>{const c=document.createElement('canvas');c.width=c.height=8;
    c.getContext('2d').fillRect(0,0,8,8);c.toBlob(r,'image/jpeg');});
  await dbPut({id,cls:'HT',type:'MP',equip:id,date:'2026-07-31',by:'R',
    positions:{'4C':{grade:'C',photos:[png,png]}},sign:png,
    created:new Date().toISOString(),up,rev:1});
  renderPending();
  showPane('paneQueue');            // the queue is its own screen now
},[id,up]);

(async()=>{
  const b=await chromium.launch();

  /* ---------------- F1 ---------------- */
  console.log('F1 — deleting an inspection that has NOT been uploaded');
  let {ctx,p}=await app(b);
  await seedRec(p,'TKUNSENT',0); await p.waitForTimeout(300);
  ok('it is in the queue', (await nPend(p))===1);
  await p.click('.pitem .del'); await p.waitForTimeout(300);
  const d1=await dlgTxt(p);
  ok('a confirmation appears at all', await p.evaluate(()=>document.getElementById('dlg').open), d1);
  ok('it names the unit', /TKUNSENT/.test(d1), d1.slice(0,120));
  ok('it says the data exists nowhere else', /only on this phone|cannot be undone/.test(d1));
  ok('it says what is lost', /2 photo|photos/.test(d1)&&/signature/.test(d1), d1.slice(-90));
  ok('the confirm button is marked destructive',
     await p.evaluate(()=>document.getElementById('dlgOk').className.includes('danger')));

  console.log('\n  cancelling keeps it');
  await p.click('#dlgCancel'); await p.waitForTimeout(300);
  ok('the record survives', (await nPend(p))===1, `${await nPend(p)} left`);
  ok('the dialog closed', !(await p.evaluate(()=>document.getElementById('dlg').open)));

  console.log('\n  Escape also keeps it');
  await p.click('.pitem .del'); await p.waitForTimeout(250);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok('still there after Esc', (await nPend(p))===1, `${await nPend(p)} left`);

  console.log('\n  confirming deletes it');
  await p.click('.pitem .del'); await p.waitForTimeout(250);
  await p.click('#dlgOk'); await p.waitForTimeout(400);
  ok('now gone', (await nPend(p))===0, `${await nPend(p)} left`);

  console.log('\n  an already-uploaded record reads differently');
  await seedRec(p,'TKSENT',1); await p.waitForTimeout(300);
  await p.click('.pitem .del'); await p.waitForTimeout(300);
  const d2=await dlgTxt(p);
  ok('it says the Drive copy is safe', /not touched|already been uploaded/.test(d2), d2.slice(0,130));
  ok('and does not claim the data is unrecoverable', !/cannot be undone/.test(d2));
  ok('the button is not styled as destructive',
     !(await p.evaluate(()=>document.getElementById('dlgOk').className.includes('danger'))));
  await p.click('#dlgCancel'); await p.waitForTimeout(200);

  console.log('\n  the plain notice dialog still works afterwards');
  await p.evaluate(()=>dlg(['Title','Body']));
  await p.waitForTimeout(200);
  await p.click('#dlgOk'); await p.waitForTimeout(250);
  ok('OK still closes a plain dialog', !(await p.evaluate(()=>document.getElementById('dlg').open)));
  ok('and its Keep button is hidden',
     await p.evaluate(()=>{dlg(['a','b']);const h=document.getElementById('dlgCancel').classList.contains('hidden');
       document.getElementById('dlg').close();return h;}));

  console.log('\n  the targets are big enough to aim at');
  const box=await p.evaluate(()=>{const d=document.querySelector('.pitem .del').getBoundingClientRect(),
    e=document.querySelector('.pitem .edit').getBoundingClientRect();
    return {w:Math.round(d.width),h:Math.round(d.height),gap:Math.round(d.left-e.right)};});
  ok('delete is at least 44px', box.w>=44&&box.h>=44, `${box.w}x${box.h}`);
  ok('and separated from edit', box.gap>=8, `${box.gap}px gap`);
  await ctx.close();

  /* ---------------- F3 / F6 ---------------- */
  console.log('\nF3 — storage protection');
  ({ctx,p}=await app(b));
  ok('nothing is claimed before it is asked', (await p.evaluate(()=>persistState))===null);
  await seedRec(p,'TKP',0);
  await p.evaluate(async()=>{ await saveRecord?.(); }).catch(()=>{});
  await p.evaluate(()=>askPersist()); await p.waitForTimeout(400);
  const ps=await p.evaluate(()=>persistState);
  ok('it asks and records the real answer', ps===true||ps===false, String(ps));
  ok('it does not throw where unsupported',
     (await p.evaluate(async()=>{const o=navigator.storage; delete navigator.storage;
       let bad=false; try{ await askPersist(); }catch(e){ bad=true; }
       navigator.storage=o; return bad;}))===false);

  console.log('\nF6 — storage headroom');
  await p.evaluate(()=>openSettings()); await p.waitForTimeout(500);
  const st=await p.textContent('#setStore');
  ok('settings reports usage', /%|does not report/.test(st), st.trim().slice(0,110));
  ok('and states the protection honestly',
     /kept by the browser|not protected|not requested/.test(st), st.trim().slice(-60));
  const low=await p.evaluate(async()=>{
    const real=navigator.storage.estimate.bind(navigator.storage);
    navigator.storage.estimate=async()=>({usage:95e6,quota:100e6});
    await renderStorage();
    const out={txt:document.getElementById('setStore').textContent,
               warn:document.getElementById('setStore').className.includes('warn')};
    navigator.storage.estimate=real; return out;});
  ok('a nearly-full phone is warned before it fails', low.warn && /⚠/.test(low.txt), low.txt.slice(0,100));
  ok('and told what to do about it', /upload and clear/i.test(low.txt));
  await ctx.close();

  console.log(fails.length?'\nFAILURES:\n  '+[...new Set(fails)].join('\n  '):'\nStage 1 checks passed');
  await b.close(); process.exit(fails.length?1:0);
})();
