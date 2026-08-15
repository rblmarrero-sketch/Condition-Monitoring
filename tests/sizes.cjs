/* The pit is not a design studio. Check the sheet holds its promise — number,
   verdict, challenge and the way out all on screen — on the small phones too. */
const { chromium } = require(require('./pw.cjs'));
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const SIZES=[[320,568,'iPhone SE 1'],[360,640,'small Android'],[375,667,'iPhone SE 2'],
             [390,844,'iPhone 14'],[412,915,'Pixel 7'],[430,932,'iPhone Pro Max'],
             [768,1024,'tablet portrait'],[915,412,'phone landscape']];
(async()=>{
  const b=await chromium.launch();
  for(const [w,h,name] of SIZES){
    const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:w<700,hasTouch:true});
    const p=await ctx.newPage();
    p.on('pageerror',e=>fails.push('PAGEERROR '+name+' '+e.message));
    await p.addInitScript(()=>localStorage.setItem('up_dests','[]'));
    await p.goto('http://127.0.0.1:8093/mobile/index.html',{waitUntil:'load'});
    await p.waitForFunction(()=>(document.getElementById('verNum')||{}).textContent!=='?',null,{timeout:20000});
    await p.waitForTimeout(400);
    await p.evaluate(()=>{const s=document.getElementById('typeSel');s.value='UC';s.dispatchEvent(new Event('change'));});
    await p.waitForTimeout(250);
    await p.evaluate(()=>selectEquip('DZ001'));
    await p.waitForTimeout(800);
    await p.evaluate(()=>pickComponent(ucOrder()[8]));
    await p.waitForTimeout(400);
    await p.evaluate(()=>{const f=document.getElementById('ucMM');f.value='88';f.dispatchEvent(new Event('input',{bubbles:true}));});
    await p.waitForTimeout(400);
    const r=await p.evaluate(()=>{
      const g=i=>{const e=document.getElementById(i);const b=e.getBoundingClientRect();
        return {h:b.height,top:b.top,bot:b.bottom,hidden:e.classList.contains('hidden')};};
      const inside=x=>!x.hidden&&x.h>0&&x.top>=-0.5&&x.bot<=innerHeight+0.5;
      const tap=i=>{const b=document.getElementById(i).getBoundingClientRect();return Math.round(Math.min(b.width,b.height));};
      return {sheetOn:ucSheetOn(),
        mm:inside(g('ucMM')),read:inside(g('ucRead')),warn:inside(g('ucWarn')),
        nav:inside(g('ucSheetNav')),stood:inside(g('ucStood')),
        tapNext:tap('ucNext'),tapPrev:tap('ucPrev'),tapClose:tap('ucClose'),
        hscroll:document.documentElement.scrollWidth>innerWidth+1,
        sheetPct:Math.round(g('ucFields').h/innerHeight*100)};
    });
    const all=r.mm&&r.read&&r.warn&&r.nav&&r.stood;
    ok(name+' '+w+'×'+h+': number, verdict, challenge and buttons all on screen', all||!r.sheetOn,
      JSON.stringify(r));
    if(r.sheetOn){
      ok(name+': the buttons clear 44 px', Math.min(r.tapNext,r.tapPrev,r.tapClose)>=44,
        r.tapPrev+'/'+r.tapNext+'/'+r.tapClose);
      ok(name+': nothing scrolls sideways', !r.hscroll);
    }
    await ctx.close();
  }
  console.log(fails.length?'\nFAILED: '+fails.length+'\n'+fails.join('\n'):'\nall green');
  await b.close(); process.exit(fails.length?1:0);
})().catch(e=>{console.log('FAIL harness: '+e.message);process.exit(1);});
