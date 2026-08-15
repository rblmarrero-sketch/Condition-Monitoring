const REPO = require('path').join(__dirname, '..');
/* A CSS variable that was never defined is not a style that looks slightly off
   — it is a declaration the browser throws away. The one that mattered here was
   the colour of a component past its condemn limit. */
const fs=require('fs');
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
for (const f of [REPO + '/mobile/index.html',
                 REPO + '/dashboard/index.html',
                 REPO + '/mobile/report-core.js']) {
  const s=fs.readFileSync(f,'utf8');
  const defined=new Set([...s.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m=>m[1]));
  const used=[...s.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/gi)]
    .filter(m=>m[2]===')')                 // var(--x, fallback) is deliberate, leave it
    .map(m=>m[1]);
  const missing=[...new Set(used.filter(v=>!defined.has(v)))];
  ok(f.split('/').slice(-2).join('/')+': every variable it uses is one it defines',
     !missing.length, missing.length?missing.join(' '):used.length+' uses, all defined');
}
console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
process.exit(fails.length?1:0);
