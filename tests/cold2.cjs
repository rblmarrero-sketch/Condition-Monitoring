/* Cold start on a phone with no cache. The four big libraries used to sit in
   front of the first paint; they should now arrive after it, or on demand. */
const { chromium } = require(require('./pw.cjs'));
const fails=[]; const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const HEAVY=['jsQR.js','qrcode.js','jspdf.umd.min.js','html2canvas.min.js'];
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
  const p=await ctx.newPage();
  p.on('pageerror',e=>fails.push('PAGEERROR '+e.message));
  const order=[]; let painted=null;
  p.on('request',r=>order.push({u:r.url().split('/').pop().split('?')[0],t:Date.now()}));
  await p.addInitScript(()=>localStorage.setItem('up_dests','[]'));
  const t0=Date.now();
  await p.goto('http://127.0.0.1:8093/mobile/index.html',{waitUntil:'load'});
  const load=Date.now()-t0;
  /* The paint entry is not always posted by the time load fires — wait for it
     rather than reading once and calling an unmeasured page a slow one. */
  try{ await p.waitForFunction(()=>performance.getEntriesByType('paint')
        .some(x=>x.name==='first-contentful-paint'), null, {timeout:8000}); }catch(e){}
  painted=await p.evaluate(()=>{const e=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');return e?Math.round(e.startTime):null;});
  const heavyBefore=order.filter(r=>HEAVY.includes(r.u)&&r.t-t0<load);
  ok('the app is interactive without the heavy libraries', await p.evaluate(()=>!!document.getElementById('typeSel')&&typeof selectEquip==='function'));
  ok('first contentful paint under 1200 ms', painted!=null&&painted<1200, painted+' ms');
  ok('load event under 2500 ms', load<2500, load+' ms');
  ok('none of the four blocked the document load',
    heavyBefore.length===0, heavyBefore.map(r=>r.u).join(','));
  // idle warm-up brings them in on its own
  await p.waitForTimeout(4000);
  const warm=await p.evaluate(()=>({pdf:!!(window.jspdf&&window.jspdf.jsPDF),h2c:!!window.html2canvas,qr:!!window.jsQR,qg:!!window.qrcode}));
  ok('and idle time warms all four anyway', warm.pdf&&warm.h2c&&warm.qr&&warm.qg, JSON.stringify(warm));
  // and an explicit need resolves even from a cold page
  const p2=await ctx.newPage();
  await p2.goto('http://127.0.0.1:8093/mobile/index.html',{waitUntil:'domcontentloaded'});
  await p2.waitForFunction(()=>typeof needScan==='function',null,{timeout:20000});
  ok('needScan() resolves on demand', await p2.evaluate(()=>needScan()));
  ok('needPdf() resolves on demand', await p2.evaluate(()=>needPdf()));
  ok('needQRGen() resolves on demand', await p2.evaluate(()=>needQRGen()));
  console.log(fails.length?'\nFAILED: '+fails.length+'\n'+fails.join('\n'):'\nall green');
  await b.close(); process.exit(fails.length?1:0);
})().catch(e=>{console.log('FAIL harness: '+e.message);process.exit(1);});
