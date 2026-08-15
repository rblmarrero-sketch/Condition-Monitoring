/* Front-end audit. Not "does it work" — the suites answer that — but the things
   that make a screen trustworthy at arm's length in a pit, and that nothing
   else in the sweep is looking at:

     ids that are referenced but do not exist, and ids that exist twice
     text that is clipped, or that pushes the page sideways
     contrast, in both themes, against the WCAG floor
     anything interactive smaller than a gloved thumb
     keyboard focus you can actually see
     dead CSS left behind by markup that has since been renamed

   Every one of these has bitten this codebase already. .um-spot was a class
   three live rules still pointed at after the markup moved on; --bad was a
   colour that never existed. Both shipped. */
const { chromium } = require(require('./pw.cjs'));
const fs=require('fs'), http=require('http'), path=require('path');
const ROOT=require('path').join(__dirname, '..');
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const note=(n,d)=>console.log('   ·      '+n+'   '+d);
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json','.css':'text/css'};
http.createServer((q,r)=>{const u=new URL(q.url,'http://x');const p=path.join(ROOT,u.pathname);
 if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));
}).listen(8084,async()=>{
 const B='http://127.0.0.1:8084';
 const b=await chromium.launch();

 /* ---------- 1. static: ids, and the code that reaches for them ---------- */
 console.log('the markup and the code that reaches into it');
 for(const [label,file] of [['app','mobile/index.html'],['dashboard','dashboard/index.html']]){
   const src=fs.readFileSync(ROOT+'/'+file,'utf8');
   const html=src.replace(/<script[\s\S]*?<\/script>/g,'');
   const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
   const dupes=ids.filter((x,i)=>ids.indexOf(x)!==i);
   ok(label+': no id is used twice', !dupes.length, dupes.length?[...new Set(dupes)].join(' '):ids.length+' ids, all unique');
   /* $("x") for an x that is not in the markup is a null waiting for a tap.
      Look in the WHOLE source, not the static markup: half this app's elements
      are written by innerHTML from a template string, and stripping the scripts
      before looking reports every one of them as missing. */
   const want=new Set([...src.matchAll(/\$\("([a-zA-Z][\w-]*)"\)/g)].map(m=>m[1]));
   const have=new Set([...src.matchAll(/id=\\?"([a-zA-Z][\w-]*)/g)].map(m=>m[1])
                 .concat([...src.matchAll(/id="\$\{([a-zA-Z][\w-]*)/g)].map(m=>m[1])));
   const missing=[...want].filter(x=>!have.has(x));
   ok(label+': every element the code asks for exists', !missing.length,
      missing.length?missing.join(' '):want.size+' referenced, all present');
 }

 /* ---------- 2. CSS that points at markup which has moved on ---------- */
 const appSrc=fs.readFileSync(ROOT+'/mobile/index.html','utf8');
 const styleBlocks=[...appSrc.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
 const cssClasses=new Set([...styleBlocks.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m=>m[1]));
 const jsAndHtml=appSrc+fs.readFileSync(ROOT+'/mobile/wear-map.js','utf8')
   +fs.readFileSync(ROOT+'/mobile/machine-fig.js','utf8')
   +fs.readFileSync(ROOT+'/mobile/wear-figs.js','utf8')
   +fs.readFileSync(ROOT+'/mobile/get-figs.js','utf8')
   /* Every module that emits markup the stylesheet dresses has to be in here,
      or this check reports a live rule as dead. The list is the answer to "who
      writes class names the app's <style> block styles" — add to it whenever a
      new drawing module lands. */
   +fs.readFileSync(ROOT+'/mobile/body-map.js','utf8');
 /* A class can be built rather than written — 'b-'+band gives b-ok, b-watch,
    b-act, and none of those three appears anywhere as a literal. So a name whose
    prefix up to the last dash is itself concatenated in the source counts as
    used; anything else with a single occurrence is its own rule and nothing
    else, which is what .um-spot became. */
 /* The prefix is whatever trails the string literal being concatenated —
    '<span class="band b-'+b is the real shape, so requiring a quote immediately
    before the prefix finds nothing. */
 const built=new RegExp('([a-zA-Z][\\w-]*-)["\'`]\\s*\\+','g');
 const prefixes=new Set([...jsAndHtml.matchAll(built)].map(m=>m[1]));
 const orphans=[...cssClasses].filter(c=>{
   for(const pre of prefixes) if(c.startsWith(pre)) return false;
   const uses=(jsAndHtml.match(new RegExp('[\\s"\'`.]'+c.replace(/[-]/g,'\\-')+'[\\s"\'`,{:.]','g'))||[]).length;
   return uses<=1;                       // only its own rule
 });
 ok('no CSS rule is left pointing at markup that has been renamed', !orphans.length,
    orphans.length?orphans.slice(0,10).join(' '):cssClasses.size+' classes, all still used');

 /* ---------- 3. the running page, both themes, three widths ---------- */
 for(const theme of ['light','dark']){
   for(const [w,h,name] of [[360,780,'small phone'],[412,915,'phone'],[820,1180,'tablet']]){
     const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:w<600,hasTouch:true,
       serviceWorkers:'block',colorScheme:theme});
     const p=await ctx.newPage();
     const errs=[]; p.on('pageerror',e=>errs.push(e.message));
     await p.addInitScript(()=>localStorage.setItem('up_dests','[]'));
     await p.goto(B+'/mobile/index.html',{waitUntil:'load'});
     await p.waitForTimeout(900);
     const r=await p.evaluate(()=>{
       const out={};
       out.sideways=document.documentElement.scrollWidth-document.documentElement.clientWidth;
       /* Anything a thumb has to hit. 44 px is the floor; a gloved thumb in
          Chukotka is not a mouse pointer. */
       const tap=[...document.querySelectorAll('button,select,input,a,[role=button]')]
         .filter(e=>{const s=getComputedStyle(e);
           return s.display!=='none'&&s.visibility!=='hidden'&&e.getClientRects().length;})
         .map(e=>{const b=e.getBoundingClientRect();
           return {t:(e.textContent||e.id||e.tagName).trim().slice(0,18),w:Math.round(b.width),h:Math.round(b.height)};})
         .filter(x=>x.w>0&&x.h>0&&(x.w<44||x.h<44));
       out.small=tap;
       /* Text wider than the box that holds it, i.e. clipped or spilling. */
       out.clipped=[...document.querySelectorAll('button,label,h1,h2,h3,.hint,.pill,span')]
         .filter(e=>{const s=getComputedStyle(e);
           if(s.display==='none'||!e.getClientRects().length) return false;
           /* text-overflow:ellipsis is a decision, not an accident: it says
              "if this does not fit, cut it and show that you did". Flagging it
              would mean no element is ever allowed to degrade gracefully. What
              is a defect is text cut with no ellipsis, which just vanishes. */
           if(s.textOverflow==='ellipsis') return false;
           if(s.overflow==='visible') return false;
           return e.scrollWidth>e.clientWidth+2;})
         .map(e=>(e.textContent||e.id||'').trim().slice(0,26)).slice(0,8);
       return out;
     });
     const tag=theme+' '+name;
     ok(tag+': the page does not scroll sideways', r.sideways<=0, r.sideways+' px over');
     ok(tag+': nothing a thumb must hit is under 44 px', !r.small.length,
        r.small.length?r.small.slice(0,4).map(x=>x.t+' '+x.w+'×'+x.h).join(' | '):'all big enough');
     ok(tag+': no label is cut off by its own box', !r.clipped.length,
        r.clipped.length?r.clipped.join(' | '):'nothing clipped');
     ok(tag+': the page raises no errors', !errs.length, errs.slice(0,2).join(' | ')||'clean');
     await ctx.close();
   }
 }

 /* ---------- 4. contrast, both themes ---------- */
 console.log('\ncontrast, against the WCAG floor');
 for(const theme of ['light','dark']){
   const ctx=await b.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,
     serviceWorkers:'block',colorScheme:theme});
   const p=await ctx.newPage();
   await p.addInitScript(()=>localStorage.setItem('up_dests','[]'));
   await p.goto(B+'/mobile/index.html',{waitUntil:'load'});
   await p.waitForTimeout(900);
   const bad=await p.evaluate(()=>{
     const lum=c=>{const [r,g,b]=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
       return 0.2126*r+0.7152*g+0.0722*b;};
     const parse=s=>{const m=s.match(/[\d.]+/g);return m?m.slice(0,3).map(Number):null;};
     const bgOf=e=>{let n=e;while(n&&n!==document.documentElement){const c=getComputedStyle(n).backgroundColor;
       const p=parse(c); if(p&&!/rgba\(0, 0, 0, 0\)/.test(c)&&getComputedStyle(n).backgroundColor!=='transparent'){
         const a=c.match(/rgba?\([^)]*,\s*([\d.]+)\)/); if(!a||Number(a[1])>0.5) return p;} n=n.parentElement;}
       return parse(getComputedStyle(document.body).backgroundColor)||[255,255,255];};
     const out=[];
     [...document.querySelectorAll('button,label,h1,h2,h3,p,span,div.hint,.pill')]
       .filter(e=>e.getClientRects().length && (e.textContent||'').trim() &&
                  ![...e.children].some(c=>c.textContent===e.textContent))
       .forEach(e=>{
         const s=getComputedStyle(e); const fg=parse(s.color); if(!fg) return;
         const bg=bgOf(e);
         const L1=lum(fg)+0.05, L2=lum(bg)+0.05;
         const ratio=(Math.max(L1,L2)/Math.min(L1,L2));
         const px=parseFloat(s.fontSize), bold=Number(s.fontWeight)>=700;
         const large=px>=24||(px>=18.66&&bold);
         const floor=large?3:4.5;
         if(ratio<floor) out.push(((e.textContent||'').trim().slice(0,22))+' '+ratio.toFixed(2)+':1 (need '+floor+')');
       });
     return [...new Set(out)];
   });
   ok(theme+': every label clears the contrast floor', !bad.length,
      bad.length?bad.slice(0,5).join(' | '):'all pass');
   await ctx.close();
 }

 /* ---------- 5. keyboard ---------- */
 console.log('\nkeyboard, for the office rather than the pit');
 const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'});
 const p=await ctx.newPage();
 await p.addInitScript(()=>localStorage.setItem('up_dests','[]'));
 await p.goto(B+'/mobile/index.html',{waitUntil:'load'});
 await p.waitForTimeout(900);
 const focus=await p.evaluate(()=>{
   const el=[...document.querySelectorAll('button,input,select,textarea,[tabindex]')]
     .filter(e=>e.getClientRects().length).slice(0,25);
   const bad=[];
   el.forEach(e=>{ e.focus();
     const s=getComputedStyle(e);
     const has=(s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0)||
               /inset|0 0 0/.test(s.boxShadow)&&s.boxShadow!=='none';
     if(!has) bad.push((e.id||e.textContent||e.tagName).trim().slice(0,18));
   });
   return {n:el.length, bad:[...new Set(bad)]};
 });
 ok('focus is visible on what can take it', !focus.bad.length,
    focus.bad.length?focus.bad.slice(0,6).join(' | '):focus.n+' checked');
 await ctx.close();

 await b.close();
 console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
 process.exit(fails.length?1:0);
});
