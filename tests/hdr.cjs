const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');   // the machine photographs every round now carries
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const vis=(p,s)=>p.evaluate(x=>{const e=document.querySelector(x);
  return !!e&&!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none'&&e.getClientRects().length>0;},s);
(async()=>{
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
await p.addInitScript(()=>{localStorage.setItem('up_dests','[]');localStorage.removeItem('inspector');});
await p.goto('http://127.0.0.1:8093/mobile/index.html',{waitUntil:'load'});
await p.waitForTimeout(1800);
ok('with no unit the header is open', await vis(p,'#hdrBody') && !(await vis(p,'#hdrSum')));
await p.evaluate(()=>{const s=document.getElementById('typeSel');s.value='UC';s.dispatchEvent(new Event('change'));});
await p.waitForTimeout(300);
await p.evaluate(()=>selectEquip('DZ001')); await p.waitForTimeout(900);
/* A name Save will demand and the fold would hide is the one thing that keeps
   it open — otherwise somebody's first round ends at a dialog pointing at a
   field that is not on the screen. */
ok('but a unit alone does not fold it, because the name is still blank',
   await vis(p,'#hdrBody') && !(await vis(p,'#hdrSum')));
await p.fill('#inspector','R. Marrero'); await p.waitForTimeout(200);
await p.evaluate(()=>selectEquip('DZ001')); await p.waitForTimeout(700);
ok('with a name, picking a unit folds it', !(await vis(p,'#hdrBody')) && await vis(p,'#hdrSum'));
ok('and the fold names the unit', /DZ001/.test(await p.textContent('#hsUnit')), await p.textContent('#hsUnit'));
ok('with the round and the date', /Undercarriage/i.test(await p.textContent('#hsMeta')), await p.textContent('#hsMeta'));
const before = await p.evaluate(()=>document.getElementById('cardComponent').getBoundingClientRect().top+scrollY);
await p.click('#hdrSum'); await p.waitForTimeout(300);
ok('tapping it opens it again', await vis(p,'#hdrBody') && !(await vis(p,'#hdrSum')));
const after = await p.evaluate(()=>document.getElementById('cardComponent').getBoundingClientRect().top+scrollY);
ok('and the fold is worth having', after-before>250, 'the round starts '+(after-before)+'px further down when it is open');
await p.evaluate(()=>selectEquip('DZ002')); await p.waitForTimeout(700);
ok('the name shows in the fold', /R. Marrero/.test(await p.textContent('#hsMeta')), await p.textContent('#hsMeta'));
/* Typing must never move the card out from under the thumb: the name and the
   machine hours are next to each other and are filled one after the other. */
await p.click('#hdrSum'); await p.waitForTimeout(250);
await p.fill('#inspector','B. Ivanov');
ok('typing the name does not fold the card mid-sentence', await vis(p,'#hdrBody'));
await p.fill('#smu','6100');
ok('so the field beside it is still there to fill', (await p.inputValue('#smu'))==='6100');
/* Two ways back to folded, and both are things the inspector is already doing:
   moving on to a point, or simply leaving the card. */
await p.evaluate(()=>{saveCur();curItem='ROLLER.L2';loadPos();renderChips();});
await p.waitForTimeout(400);
ok('moving to a point folds it again', !(await vis(p,'#hdrBody')) && await vis(p,'#hdrSum'));
ok('carrying what was just typed', /B. Ivanov/.test(await p.textContent('#hsMeta')) && /6100/.test(await p.textContent('#hsMeta')),
   await p.textContent('#hsMeta'));
await p.evaluate(()=>{const i=document.getElementById('inspector');i.value='';i.dispatchEvent(new Event('input'));
  document.getElementById('cardInspection').dispatchEvent(new Event('focusout',{bubbles:true}));});
await p.waitForTimeout(250);
ok('with no name it stays open, however focus moves', await vis(p,'#hdrBody'));
await p.evaluate(()=>{ window.__dlg=[]; });
p.on('dialog',d=>d.dismiss().catch(()=>{}));
await p.evaluate(()=>{curItem='GROUSER.L';loadPos();draft.positions['GROUSER.L']={mm:60};});
await p.evaluate(PLANT);
await p.click('#saveBtn'); await p.waitForTimeout(600);
ok('a save blocked on the inspector opens the header that holds it', await vis(p,'#hdrBody'));
/* dlg() is <dialog>.showModal(), so the page behind it is inert — the field is
   there and waiting, but not typeable until OK is pressed. */
await p.click('#dlgOk'); await p.waitForTimeout(250);
ok('and once the notice is dismissed the field can be typed into', await p.evaluate(()=>{
  const i=document.getElementById('inspector');
  return !!i.getClientRects().length && !i.disabled && !i.closest('[inert]'); }));
await p.fill('#inspector','R. Marrero');
await p.evaluate(()=>{const btn=document.querySelector('.lang button[data-lang="ru"]');btn.click();});
await p.waitForTimeout(500);
await p.evaluate(()=>selectEquip('DZ001')); await p.waitForTimeout(700);
ok('the fold speaks Russian too', /Ходов/.test(await p.textContent('#hsMeta')), await p.textContent('#hsMeta'));
await b.close();
console.log(fails.length?'\nFAILED '+fails.length+': '+fails.join(' | '):'\nall passed');
process.exit(fails.length?1:0);
})();
