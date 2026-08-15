const REPO=require('path').join(__dirname, '..');
/* Batching, against the real Apps Script code over a fake Drive.

   Two things have to be true and only one of them is the speed-up. The other is
   that a phone which updates before somebody redeploys the script must keep
   working — the fleet does not move together, and an improvement that breaks
   the phones it has not reached yet is not an improvement. */
const fs=require('fs');
const SRC=REPO + '/docs/google-upload.gs';
const ROOTID='1AbCdEfGhIjKlMnOpQrStUvWxYz123456';
const fails=[];const ok=(n,c,d)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));if(!c)fails.push(n);};
const note=(n,d)=>console.log('   ·      '+n+'   '+d);

/* A Drive that counts what it is asked to do, because the whole point is doing
   less of it. */
function mkDrive(){
  let seq=0; const byId={}; const c={lookups:0,creates:0,folders:0};
  const it=a=>{let i=0;return{hasNext:()=>i<a.length,next:()=>a[i++]};};
  function mkFile(name,dir){ const f={_id:'f'+(++seq),_name:name,_desc:'',
    getId:()=>f._id,getName:()=>f._name,getUrl:()=>'https://drive/'+f._id,
    getDescription:()=>f._desc,setDescription:d=>{f._desc=d;return f;},
    getSize:()=>4,getLastUpdated:()=>new Date(1000+seq),
    getBlob:()=>({getDataAsString:()=>'{}',getBytes:()=>Buffer.from('x'),getContentType:()=>'image/jpeg'}),
    getParents:()=>it([dir]), setTrashed:()=>{ delete dir._files[name]; }};
    byId[f._id]=f; return f; }
  function mkFolder(name,parent){ const subs={},files={};
    const d={_id:'d'+(++seq),_name:name,_files:files,_subs:subs,
      getId:()=>d._id,getName:()=>d._name,getParents:()=>it(parent?[parent]:[]),
      getFolders:()=>it(Object.values(subs)),
      getFiles:()=>it(Object.values(files)),
      getFoldersByName:n=>{c.folders++;return it(subs[n]?[subs[n]]:[]);},
      getFilesByName:n=>{c.lookups++;return it(files[n]?[files[n]]:[]);},
      createFolder:n=>subs[n]=mkFolder(n,d),
      createFile:b=>{c.creates++;return files[b.name]=mkFile(b.name,d);}};
    byId[d._id]=d; return d; }
  const root=mkFolder('Condition Monitoring',null);
  return {root,byId,c};
}
function load(drive, src){
  const s=src
    .replace(/const SECRET = '[^']*';/,"const SECRET = '';")
    .replace(/const ROOT_FOLDER_ID = '[^']*';/,`const ROOT_FOLDER_ID = ${JSON.stringify(ROOTID)};`);
  const sb={
    DriveApp:{getFolderById:id=>{if(id!==ROOTID)throw new Error('no folder');return drive.root;},
              getFileById:id=>drive.byId[id]},
    Utilities:{base64Decode:x=>Buffer.from(x,'base64'),base64Encode:b=>Buffer.from(b).toString('base64'),
               newBlob:(bytes,ct,name)=>({bytes,ct,name})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})},
    Logger:{log:()=>{}},
  };
  return new Function(...Object.keys(sb),s+'\n;return {doGet:doGet,doPost:doPost};')(...Object.values(sb));
}
const post=(api,body)=>api.doPost({postData:{contents:JSON.stringify(body)}});
const b64=s=>Buffer.from(s).toString('base64');
const FOLDER='UC/DZ001/2026-08-03';
const files=n=>Array.from({length:n},(_,i)=>({name:`DZ001_ROLLER.L${i+1}_03.08.2026_UC.jpg`,
  contentType:'image/jpeg', file:b64('JPEG-'+i)}));

const NEW=fs.readFileSync(SRC,'utf8');
/* A deployment from before batching: the real previous file, so "an old script"
   means the actual old script rather than a hand-written stub.

   Found by walking back through history for the last version that does NOT know
   the op, not by reading HEAD. HEAD was right for exactly as long as it took to
   commit the change — after that this suite was comparing the new script with
   itself and reporting the app broken for not refusing its own feature. A test
   whose fixture is "whatever is current" has a shelf life of one commit. */
const sh=c=>require('child_process').execSync(c,{encoding:'utf8'});
const OLD=(()=>{
  const revs=sh(`git -C ${REPO} log --format=%H -- docs/google-upload.gs`).trim().split('\n');
  for(const r of revs){
    const src=sh(`git -C ${REPO} show ${r}:docs/google-upload.gs`);
    if(!/op === 'batch'/.test(src)) return src;
  }
  throw new Error('no version of the script predates batching — cannot test the fallback');
})();

console.log('one request instead of ten');
let d=mkDrive(); let api=load(d,NEW);
let r=post(api,{op:'batch',folder:FOLDER,dev:'DAAAA',files:files(10)});
ok('every file in the batch lands', r.ok && r.saved.length===10 && !r.failed.length,
   (r.saved||[]).length+' saved, '+((r.failed||[]).length)+' failed');
const batchOps={...d.c};
note('Drive operations for the batch', `${batchOps.folders} folder lookups, ${batchOps.lookups} name lookups, ${batchOps.creates} creates`);

let d2=mkDrive(); let api2=load(d2,NEW);
files(10).forEach(f=>post(api2,{name:f.name,folder:FOLDER,contentType:f.contentType,file:f.file,dev:'DAAAA'}));
const oneByOne={...d2.c};
note('Drive operations one at a time', `${oneByOne.folders} folder lookups, ${oneByOne.lookups} name lookups, ${oneByOne.creates} creates`);
ok('the folder chain is resolved once, not once per photograph',
   batchOps.folders < oneByOne.folders/3,
   batchOps.folders+' against '+oneByOne.folders);
ok('and the same ten files are on Drive either way',
   Object.keys(d.root._subs.UC._subs.DZ001._subs['2026-08-03']._files).length===10 &&
   Object.keys(d2.root._subs.UC._subs.DZ001._subs['2026-08-03']._files).length===10);

console.log('\nit still says what happened to each file');
ok('each saved file reports the name the phone asked for',
   (r.saved||[]).every(x=>/^DZ001_ROLLER/.test(x.req||'')), (r.saved[0]||{}).req);
d=mkDrive(); api=load(d,NEW);
r=post(api,{op:'batch',folder:FOLDER,dev:'DAAAA',
  files:[{name:'good.jpg',contentType:'image/jpeg',file:b64('A')},
         {name:'',contentType:'image/jpeg',file:b64('B')},
         {name:'also-good.jpg',contentType:'image/jpeg',file:b64('C')}]});
ok('a bad file does not take the good ones down with it',
   r.ok && r.saved.length===2 && r.failed.length===1,
   (r.saved||[]).length+' saved, '+(r.failed||[]).length+' failed: '+((r.failed[0]||{}).error||''));

console.log('\nthe ping announces it, so a phone never has to guess');
ok('the new script says it takes batches', post(api,{op:'ping'}).batch===true);
const oldApi=load(mkDrive(),OLD);
ok('the old one does not claim to', !post(oldApi,{op:'ping'}).batch);

console.log('\nand an old deployment is not broken by a new phone');
const oldR=post(oldApi,{op:'batch',folder:FOLDER,dev:'DAAAA',files:files(3)});
ok('it refuses the batch rather than misfiling it', oldR.ok===false, JSON.stringify(oldR).slice(0,80));
ok('and it refuses it in the way the phone watches for',
   /missing file name/i.test(oldR.error||''), oldR.error);
const oldD=mkDrive(), oldApi2=load(oldD,OLD);
files(3).forEach(f=>post(oldApi2,{name:f.name,folder:FOLDER,contentType:f.contentType,file:f.file,dev:'DAAAA'}));
ok('single uploads to the old script still work exactly as before',
   Object.keys(oldD.root._subs.UC._subs.DZ001._subs['2026-08-03']._files).length===3);

console.log('\nnothing else changed shape');
d=mkDrive(); api=load(d,NEW);
const one=post(api,{name:'solo.jpg',folder:FOLDER,contentType:'image/jpeg',file:b64('S'),dev:'DAAAA'});
ok('a single upload still answers the way it always did',
   one.ok===true && !!one.id && !!one.url && one.name==='solo.jpg', JSON.stringify(one).slice(0,90));

console.log(fails.length?`\n${fails.length} FAILED: `+fails.join(' | '):'\nall passed');
process.exit(fails.length?1:0);
