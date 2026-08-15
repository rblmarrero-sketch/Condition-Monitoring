/* The coded fields fold on a measurement round and nowhere else, and they open
   themselves the moment there is something to code. The failure this guards
   against is the worst kind: a Critical finding whose defect and action fields
   Save demands are folded out of sight. */
const { chromium } = require(require('./pw.cjs'));
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const vis=(p,s)=>p.evaluate(x=>{const e=document.querySelector(x);
  return !!e&&!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none'&&e.getClientRects().length>0;},s);
(async()=>{
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
await p.addInitScript(()=>{localStorage.setItem('up_dests','[]');localStorage.setItem('inspector','R. Marrero');});
await p.goto('http://127.0.0.1:8093/mobile/index.html',{waitUntil:'load'});
await p.waitForFunction(()=>(document.getElementById('verNum')||{}).textContent!=='?',null,{timeout:30000});
await p.waitForTimeout(500);
const T=(t)=>p.evaluate(x=>{const s=document.getElementById('typeSel');s.value=x;s.dispatchEvent(new Event('change'));},t);

console.log('a round that IS the coding keeps them open');
await T('MP'); await p.waitForTimeout(300);
await p.evaluate(()=>selectEquip('TK032')); await p.waitForTimeout(800);
ok('magnetic plug: the fields are there, with no row to open', await vis(p,'#isoBody') && !(await vis(p,'#isoTog')));
await T('INSP'); await p.waitForTimeout(300);
await p.evaluate(()=>selectEquip('TK032')); await p.waitForTimeout(800);
await p.evaluate(()=>{const n=document.querySelector('#posnav [data-l7]'); if(n)n.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
await p.waitForTimeout(400);
await p.evaluate(()=>{const n=document.querySelector('#posnav [data-l8]'); if(n)n.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
await p.waitForTimeout(500);
ok('component inspection: the same', await vis(p,'#isoBody') && !(await vis(p,'#isoTog')));
await T('GET'); await p.waitForTimeout(300);
await p.evaluate(()=>selectEquip('EX001')); await p.waitForTimeout(900);
await p.evaluate(()=>{const n=document.querySelector('#posnav .ucmap [data-ucg]'); if(n)n.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
await p.waitForTimeout(600);
ok('GET, which is graded: the same', await vis(p,'#isoBody') && !(await vis(p,'#isoTog')));

console.log('\na measurement round folds them');
await T('UC'); await p.waitForTimeout(300);
await p.evaluate(()=>selectEquip('DZ001')); await p.waitForTimeout(900);
await p.evaluate(()=>{curItem='ROLLER.L1';loadPos();renderChips();}); await p.waitForTimeout(500);
ok('undercarriage: folded, with a row that says what is behind it',
   !(await vis(p,'#isoBody')) && await vis(p,'#isoTog'), (await p.textContent('#isoTog')).trim());
const short = await p.evaluate(()=>document.body.scrollHeight);
await p.click('#isoTog'); await p.waitForTimeout(400);
ok('one tap opens them', await vis(p,'#isoBody'));
const tall = await p.evaluate(()=>document.body.scrollHeight);
ok('and the fold is worth having', tall-short>380, 'the round is '+(tall-short)+'px shorter folded');
await p.click('#isoTog'); await p.waitForTimeout(300);
ok('and folds again', !(await vis(p,'#isoBody')));

console.log('\nbut never while there is something to code');
await p.evaluate(()=>{document.querySelector('#sevSeg .s-CRI').click();});
await p.waitForTimeout(400);
ok('marking it Critical opens them by itself', await vis(p,'#isoBody'));
ok('and the row cannot be used to hide them again while it is Critical',
   await p.evaluate(async()=>{ document.getElementById('isoTog').click();
     await new Promise(r=>setTimeout(r,150));
     return !document.getElementById('isoBody').classList.contains('hidden'); }));
await p.evaluate(()=>{document.querySelector('#sevSeg .s-NOF').click();});
await p.waitForTimeout(400);
ok('back to no failure and they fold away again', !(await vis(p,'#isoBody')));
/* The one that matters: a defect recorded, then the point revisited. */
await p.evaluate(()=>{draft.positions['ROLLER.L2']={defect:'D-01'}; curItem='ROLLER.L2'; loadPos();});
await p.waitForTimeout(400);
ok('a point that already carries a defect opens on arrival', await vis(p,'#isoBody'));
await p.evaluate(()=>{curItem='ROLLER.L3'; loadPos();}); await p.waitForTimeout(400);
ok('and the next clean point folds again', !(await vis(p,'#isoBody')));
await b.close();
console.log(fails.length?'\nFAILED '+fails.length+': '+fails.join(' | '):'\nall passed');
process.exit(fails.length?1:0);
})();
