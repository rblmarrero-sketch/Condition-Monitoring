const { chromium } = require(require('./pw.cjs'));
const B='http://127.0.0.1:8099/dashboard/index.html';
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:1366,height:768}})).newPage();
  await p.addInitScript(()=>{ localStorage.setItem('cm_drive_url',''); localStorage.setItem('cm_dash_lang','en'); });
  await p.goto(B,{waitUntil:'load'}); await p.waitForTimeout(2000);
  await p.evaluate(()=>{ const o=document.getElementById('dataOv'); if(o) o.classList.add('hidden'); showTab('history',true); });
  await p.waitForTimeout(1500);
  const has = await p.evaluate(()=>document.querySelectorAll('#history .pos [data-i]').length);
  console.log('photo cards present:', has);
  const churn = await p.evaluate(()=>new Promise(res=>{
    let n=0; const t=document.getElementById('history');
    if(!t) return res('no #history');
    const mo=new MutationObserver(ms=>{ ms.forEach(m=>{ n+=m.addedNodes.length+m.removedNodes.length; }); });
    mo.observe(t,{childList:true,subtree:true});
    setTimeout(()=>{ mo.disconnect(); res(n); }, 4000);
  }));
  console.log('DOM add/remove in #history over 4s with NO interaction:', churn);
  await b.close();
})();
