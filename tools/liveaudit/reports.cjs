/* EVERY REAL REPORT, REGENERATED AND READ.

   Each round fetch.cjs pulled is rendered through the real engine
   (CMDash.importRecords -> CMReport.sectionsFor) at the report's own width,
   in Russian, English and both, and checked the way tests/rptoverflow.cjs
   checks its fixtures: markup printed as text, a placeholder or "undefined"
   on the page, a fact squeezed under 48 px, text one letter to a line,
   anything past its card, cell or the page, text an ellipsis or a hidden
   overflow cuts off (a printed page has no tooltip), and a label said again
   inside its own value. Photographs are stand-in tiles of the same count:
   the layout is what is measured, not the pixels. Each sheet's text is
   written to OUT/text/<round>_<lang>.txt for a person to read.

   Usage: node tools/liveaudit/reports.cjs PORT ROUNDS_DIR OUT
   (PORT serves the repository root, e.g. node tests/mock.cjs PORT) */
const { chromium } = require(require('../../tests/pw.cjs'));
const fs=require('fs'),path=require('path');
const PORT=process.argv[2], DIR=process.argv[3], OUT=process.argv[4];
fs.mkdirSync(path.join(OUT,'text'),{recursive:true});
(async()=>{
 const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1200,height:1000}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{try{localStorage.clear()}catch(e){};localStorage.setItem('cm_drive_url','');localStorage.setItem('lang','en');});
 await p.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`,{waitUntil:'load'});
 await p.waitForFunction(()=>window.CMR&&window.CMReport&&window.CMDash,{timeout:20000}); await p.waitForTimeout(800);
 const dumps=fs.readdirSync(DIR).map(f=>JSON.parse(fs.readFileSync(path.join(DIR,f))));
 const recs=[]; dumps.forEach(d=>d.recs.forEach(r=>recs.push(r)));
 const keys=await p.evaluate((recs)=>{
   const jpeg=(w,h,c)=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const x=cv.getContext('2d');x.fillStyle=c;x.fillRect(0,0,w,h);return cv.toDataURL('image/jpeg',.8)};
   const L=jpeg(400,300,'#8a7'),P=jpeg(300,400,'#78a');
   recs.forEach(r=>(r.items||[]).forEach(it=>{const n=(it.att||[]).filter(a=>a.mediaType!=='video').length||(+it.photos||0);it.photos=Array.from({length:n},(_,i)=>i%2?P:L);delete it.att;}));
   window.CMDash.evidenceGap=()=>null; window.CMDash.importRecords(recs); const ov=document.getElementById('dataOv'); if(ov) ov.classList.add('hidden');
   return [...new Set(recs.map(r=>'one:'+String(r.equip).toUpperCase()+'|'+r.date+'|'+r.type))];
 },recs);
 const scan=(key,lang,bi)=>p.evaluate(async({key,lang,bi})=>{
   const i=key.indexOf(':'); const secs=CMReport.sectionsFor(key.slice(0,i),key.slice(i+1),{lang,bi,photos:true});
   let st=document.getElementById('ofst'); if(!st){st=document.createElement('style');st.id='ofst';st.textContent=CMR.CSS;document.head.appendChild(st);}
   const old=document.getElementById('rptRoot'); if(old) old.remove();
   const d=document.createElement('div'); d.id='rptRoot'; d.style.cssText='position:absolute;left:0;top:0;width:760px;background:#fff';
   d.innerHTML=secs.map(s=>'<div class="secwrap">'+s.html+'</div>').join(''); document.body.appendChild(d);
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const R=e=>e.getBoundingClientRect(), txt=e=>(e.innerText||'').replace(/\s+/g,' ').trim();
   const out={markup:[],squeezed:[],vertical:[],past:[],twice:[],clip:[],empty:[],lit:[],cells:d.querySelectorAll('.cel').length,imgs:d.querySelectorAll('img:not(.brand)').length};
   (txt(d).match(/<\/?(span|div|b|i)\b[^>]*>?|&lt;|&quot;|&amp;[a-z]+;/g)||[]).forEach(m=>out.markup.push(m));
   (txt(d).match(/\{[a-z]+\}|undefined|NaN|null\b|\[object/g)||[]).forEach(m=>out.lit.push(m));
   d.querySelectorAll('.cel dd').forEach(dd=>{if(txt(dd)&&R(dd).width<48)out.squeezed.push(Math.round(R(dd).width)+'px: '+txt(dd).slice(0,30))});
   d.querySelectorAll('.cel dt').forEach(dt=>{const dd=dt.nextElementSibling;if(!dd)return;const lab=txt(dt).split(' / ')[0].trim();
     if(lab&&new RegExp('(^|[\\s·])'+lab.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*:','i').test(txt(dd)))out.twice.push(lab+' → '+txt(dd).slice(0,40))});
   d.querySelectorAll('dd, dt, td, th, .cm, .sv, .sk, .pk, .muted, .rnote').forEach(e=>{const r=R(e),t=txt(e);if(t.length>12&&r.width>0&&r.height>8*r.width&&r.height>60)out.vertical.push(e.tagName+' '+Math.round(r.width)+'x'+Math.round(r.height)+': '+t.slice(0,24))});
   const clipped=(e,box)=>{for(let x=e.parentElement;x&&x!==box;x=x.parentElement)if(getComputedStyle(x).overflowX!=='visible')return true;return false};
   d.querySelectorAll('.cel').forEach(c=>{const rc=R(c);c.querySelectorAll('dd, dt, .cm, .pk, .chips, b, span').forEach(e=>{const r=R(e);if(r.width>0&&(r.right>rc.right+1||r.left<rc.left-1)&&!clipped(e,c))out.past.push('card: '+txt(e).slice(0,30))})});
   d.querySelectorAll('td, th').forEach(td=>{if(td.scrollWidth>td.clientWidth+2&&getComputedStyle(td).overflowX==='visible')out.past.push('cell: '+txt(td).slice(0,30))});
   /* text an ellipsis or overflow:hidden cuts off - a printed page has no tooltip */
   d.querySelectorAll('*').forEach(e=>{if(!e.children.length&&txt(e)){const cs=getComputedStyle(e);if((cs.textOverflow==='ellipsis'||cs.overflow==='hidden'||cs.overflowX==='hidden')&&(e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+2))out.clip.push(e.tagName.toLowerCase()+'.'+String(e.className).split(' ')[0]+': '+txt(e).slice(0,50))}});
   if(d.scrollWidth>761)out.past.push('page '+d.scrollWidth+'px wide');
   const text=secs.map((s,k)=>{const t=document.createElement('div');t.innerHTML=s.html;return '--- section '+(k+1)+'\n'+t.innerText.replace(/\n{3,}/g,'\n\n')}).join('\n');
   d.remove(); return {out,text};
 },{key,lang,bi});
 const sum=[];
 for(const key of keys){for(const [lang,bi,tag] of [['ru',false,'RU'],['en',false,'EN'],['en',true,'EN+RU']]){
   const {out,text}=await scan(key,lang,bi); const name=key.slice(4).replace(/\|/g,'_')+'_'+tag;
   fs.writeFileSync(path.join(OUT,'text',name+'.txt'),text);
   const issues=Object.entries(out).filter(([k,v])=>Array.isArray(v)&&v.length).map(([k,v])=>k+'('+v.length+'): '+[...new Set(v)].slice(0,4).join(' | '));
   sum.push({name,cells:out.cells,imgs:out.imgs,issues}); console.log((issues.length?'!! ':'ok ')+name+(issues.length?'\n     '+issues.join('\n     '):''));
 }}
 fs.writeFileSync(path.join(OUT,'reports.json'),JSON.stringify({sum,errs},null,1));
 console.log('page errors:',errs.length,errs.slice(0,3)); await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
