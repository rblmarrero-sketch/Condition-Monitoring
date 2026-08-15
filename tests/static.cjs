/* A read of the source for the shapes that have actually gone wrong here, as
   opposed to the ones a linter likes to talk about. Each check below exists
   because the thing it looks for shipped at least once. */
const fs=require('fs'), path=require('path');
const R=require('path').join(__dirname, '..');
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const note=(n,d)=>console.log('   ·      '+n+'   '+d);

const app=fs.readFileSync(R+'/mobile/index.html','utf8');
const sw =fs.readFileSync(R+'/mobile/sw.js','utf8');
const dash=fs.readFileSync(R+'/dashboard/index.html','utf8');

/* 1. Everything the worker promises to cache has to be on disk. A typo here is
      an install that never completes, and an app that is never offline — and it
      fails silently, because the worker just does not take over. */
console.log('the worker and the disk agree');
/* The entries are "./name.js?v=" + BUILD, so the path ends at the first quote
   OR the first question mark, whichever comes first. */
const listed=[...sw.matchAll(/"\.\/([^"?]+)/g)].map(m=>m[1])
  .filter(f=>!/^https?:/.test(f));
const missing=[...new Set(listed)].filter(f=>!fs.existsSync(path.join(R,'mobile',f)));
ok('every file the worker caches exists', !missing.length,
   missing.length?missing.join(' '):[...new Set(listed)].length+' files, all present');

/* The other direction: something loaded by the page but NOT cached is a file
   that works until the signal goes. */
const loaded=[...app.matchAll(/<script src="([^"?]+)/g)].map(m=>m[1])
  .concat([...app.matchAll(/loadLib\("([^"]+)"\)/g)].map(m=>m[1]));
const uncached=[...new Set(loaded)].filter(f=>!listed.includes(f) && !/^https?:/.test(f));
ok('every file the page loads is one the worker keeps', !uncached.length,
   uncached.length?uncached.join(' '):[...new Set(loaded)].length+' scripts, all cached');

/* 2. A promise nobody catches. reg.update() was one of these: it rejects
      whenever there is no signal, which is the normal state of a phone here. */
console.log('\npromises with nobody waiting');
const risky=[];
for(const [name,src] of [['app',app],['dashboard',dash],['sw',sw]]){
  const lines=src.split('\n');
  lines.forEach((l,i)=>{
    /* a bare call to something that returns a promise, not awaited, not
       returned, and with no .catch on the line */
    const m=/^\s*(?:[\w.$()\[\]]+\.)?(fetch|caches\.(?:open|match|delete)|navigator\.storage\.\w+|\w+\.update)\(/.exec(l);
    if(!m) return;
    if(/await |return |\.catch|\.then|=\s*$|^\s*(const|let|var)\s/.test(l)) return;
    if(/^\s*(\/\/|\*)/.test(l)) return;
    risky.push(name+':'+(i+1)+' '+l.trim().slice(0,60));
  });
}
ok('no unhandled promise is left in a hot path', !risky.length,
   risky.length?risky.slice(0,4).join(' | '):'none found');

/* 3. Left-behind debugging. Harmless until it is in a loop on a phone. */
console.log('\nleftovers');
const noisy=[];
for(const [name,src] of [['app',app],['dashboard',dash],['sw',sw]]){
  src.split('\n').forEach((l,i)=>{
    if(/^\s*(\/\/|\*|\/\*)/.test(l)) return;
    if(/\bdebugger\b/.test(l)) noisy.push(name+':'+(i+1)+' debugger');
    if(/console\.log\(/.test(l)) noisy.push(name+':'+(i+1)+' console.log');
  });
}
ok('no debugger or stray console.log', !noisy.length,
   noisy.length?noisy.slice(0,5).join(' | '):'clean');

/* 4. The version has to move together or the pair arrives mismatched. */
console.log('\nthe build number, everywhere it appears');
const build=(app.match(/const BUILD="([^"]+)"/)||[])[1];
const swBuild=(sw.match(/const BUILD = "([^"]+)"/)||[])[1];
const appV=[...new Set([...app.matchAll(/\?v=(\d+)/g)].map(m=>m[1]))];
const dashV=[...new Set([...dash.matchAll(/\?v=(\d+)/g)].map(m=>m[1]))];
ok('the app and its worker are on the same build', build===swBuild, build+' / '+swBuild);
ok('every ?v= in the app matches it', appV.length===1&&appV[0]===build, appV.join(','));
ok('and every ?v= in the dashboard too', dashV.length===1&&dashV[0]===build, dashV.join(','));

/* 5. Two declarations of one name in one scope is a crash on load in strict
      mode and a silent shadow otherwise. */
console.log('\nnames');
const topConsts=[...app.matchAll(/^(?:const|let) ([A-Za-z_$][\w$]*)\s*=/gm)].map(m=>m[1]);
const dupes=topConsts.filter((x,i)=>topConsts.indexOf(x)!==i);
ok('nothing at the top level is declared twice', !dupes.length,
   dupes.length?[...new Set(dupes)].join(' '):topConsts.length+' declarations, all distinct');

/* 6. i18n: a key used but never defined falls back to the key itself, which
      ships a screen showing "sp_v_ok_d" to an inspector. */
console.log('\nlanguage');
for(const [name,src] of [['app',app],['dashboard',dash]]){
  /* The two blocks sit one after the other inside I18N; slice between their
     openers rather than trying to find a matching brace. */
  let iEn=src.indexOf('\n  en:{'), iRu=src.indexOf('\n  ru:{');
  if(iEn<0||iRu<0){ iEn=src.search(/\n\s*en\s*:\s*\{/); iRu=src.search(/\n\s*ru\s*:\s*\{/); }
  const defined={};
  /* Strip the values before looking for keys. A phrase like "Uploading: 3 of 5"
     contains something that looks exactly like a key, and counting those made
     the English side appear to have entries the Russian side lacked. */
  const keysOf=t=>new Set([...t.replace(/"(?:[^"\\]|\\.)*"/g,'""')
    .matchAll(/[\s{,]([a-z][\w]*)\s*:/g)].map(m=>m[1]).filter(k=>k!=='en'&&k!=='ru'));
  if(iEn>=0&&iRu>iEn){
    defined.en=keysOf(src.slice(iEn,iRu));
    defined.ru=keysOf(src.slice(iRu,src.indexOf('\n};',iRu)));
  }
  if(!defined.en||!defined.ru){ note(name+': i18n blocks not found in the expected shape','skipped'); continue; }
  /* t("prefix"+x) builds its key at run time — the literal is a prefix, not a
     key, and demanding it be defined would be demanding the wrong thing. */
  const used=new Set([...src.matchAll(/\bt\("([a-z][\w]*)"\s*[,)]/g)].map(m=>m[1]));
  const undef=[...used].filter(k=>!defined.en.has(k));
  const onlyEn=[...defined.en].filter(k=>!defined.ru.has(k));
  ok(name+': every phrase the code asks for is defined', !undef.length,
     undef.length?undef.slice(0,6).join(' '):used.size+' keys used, all defined');
  ok(name+': and defined in Russian as well as English', !onlyEn.length,
     onlyEn.length?onlyEn.slice(0,6).join(' '):defined.ru.size+' Russian phrases');
}

console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
process.exit(fails.length?1:0);
