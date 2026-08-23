/* A /exec that runs the REAL Apps Script logic over an in-memory Drive, so the
   browser tests exercise the same code that will be deployed. */
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT=require('path').join(__dirname, '..');
const ROOTID='1AbCdEfGhIjKlMnOpQrStUvWxYz123456';
const PORT=Number(process.argv[2]||8093);
// "NONE" means the shipped default — ADMIN_SECRET unset, deletion switched off.
// An empty argv would be falsy and silently fall back to a working password,
// which is the one configuration the tests most need to be able to reproduce.
const ADMIN=process.argv[3]==='NONE'?'':(process.argv[3]||'letmein');

function mkDrive(){
  let seq=0, clock=Date.now();
  /* Drive stamps a file with wall-clock time, and the index compares those
     stamps against a wall-clock cursor. A counter made every shard look older
     than every cursor, so a round that had just arrived was never read. */
  const stamp=()=>(clock=Math.max(Date.now(),clock+1));
  const props={};
  const byId={}, trashed=[];
  const it=a=>{let i=0;return{hasNext:()=>i<a.length,next:()=>a[i++]};};
  /* Bytes, not a string. A photograph decoded out of an upload is binary, and
     String(buffer) mangles every byte over 0x7F — so the fake Drive handed back
     a JPEG that no decoder would open, and every test that went near a real
     image passed by never looking at one. Keep the buffer; hand out text only
     when text is what is asked for. */
  const MIMES={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png',
               '.webp':'image/webp','.mp4':'video/mp4','.mov':'video/quicktime'};
  function mkFile(name,body,dir,full){
    const buf=Buffer.isBuffer(body)?body:Buffer.from(String(body));
    const ext=String(name).slice(String(name).lastIndexOf('.')).toLowerCase();
    const f={_id:'f'+(++seq),_name:name,_buf:buf,_updated:stamp(),_path:full,_desc:'',
      get _body(){ return f._buf.toString('utf8'); },
      getId:()=>f._id,getName:()=>f._name,getSize:()=>f._buf.length,
      getUrl:()=>'https://drive/'+f._id,
      getDescription:()=>f._desc,setDescription:d=>{f._desc=d;return f;},
      getLastUpdated:()=>new Date(f._updated),
      getBlob:()=>({getDataAsString:()=>f._buf.toString('utf8'),getBytes:()=>f._buf,
                    getContentType:()=>MIMES[ext]||'application/json'}),
      getParents:()=>it(dir?[dir]:[]),
      setTrashed:v=>{ if(v){ trashed.push(full); delete dir._files[name]; } }};
    byId[f._id]=f; return f;
  }
  function mkFolder(name,full,parent){
    const subs={},files={};
    const dir={_id:'d'+(++seq),_name:name,_files:files,_subs:subs,
      getId:()=>dir._id,getName:()=>dir._name,getParents:()=>it(parent?[parent]:[]),
      getFiles:()=>it(Object.values(files)),getFolders:()=>it(Object.values(subs)),
      getFoldersByName:n=>it(subs[n]?[subs[n]]:[]),
      getFilesByName:n=>it(files[n]?[files[n]]:[]),
      createFolder:n=>subs[n]=mkFolder(n,(full?full+'/':'')+n,dir),
      createFile:b=>files[b.name]=mkFile(b.name,b.bytes,dir,(full?full+'/':'')+b.name)};
    byId[dir._id]=dir; return dir;
  }
  const root=mkFolder('Condition Monitoring','',null);
  root._id=ROOTID; byId[ROOTID]=root;
  const put=(p,body)=>{ const parts=p.split('/'),name=parts.pop();
    let d=root; parts.forEach(x=>d=d._subs[x]||d.createFolder(x));
    return d._files[name]=mkFile(name,body,d,p); };
  const listAll=()=>{const out=[];(function w(d,pre){
    Object.values(d._files).forEach(f=>out.push(pre+f._name));
    Object.values(d._subs).forEach(s=>w(s,pre+s._name+'/'));})(root,'');return out;};
  /* CM_OLD runs the CURRENT script with its newest actions removed — an
     "/exec that nobody has redeployed", which is the only way to prove the
     fallbacks are real. Derived rather than kept as a copy on purpose: a
     snapshot of an old script goes stale the moment the real one moves, and
     then the fallback test is passing against a fixture instead of against
     the thing it is meant to be older than. */
  let raw=fs.readFileSync(ROOT+'/docs/google-upload.gs','utf8');
  if(process.env.CM_OLD){
    raw=raw.replace(/^.*p\.action === 'index'.*$/m,'')
           .replace(/^.*p\.action === 'files'.*$/m,'')
           .replace(/index: true, media: MEDIA_MAX, at: indexAt_\(\)/,'');
  }
  const src=raw
    .replace(/const SECRET = '[^']*';/, "const SECRET = '';")
    .replace(/const ROOT_FOLDER_ID = '[^']*';/,`const ROOT_FOLDER_ID = ${JSON.stringify(ROOTID)};`)
    .replace(/const ADMIN_SECRET = '';/,`const ADMIN_SECRET = ${JSON.stringify(ADMIN)};`);
  const sb={
    DriveApp:{getFolderById:id=>{if(id!==ROOTID)throw new Error('no folder');return root;},
              getFileById:id=>byId[id]},
    Utilities:{base64Decode:s=>Buffer.from(s,'base64'),base64Encode:b=>Buffer.from(b).toString('base64'),
               newBlob:(bytes,ct,name)=>({bytes,ct,name})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})},
    Logger:{log:()=>{}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]===undefined?null:props[k],
                                                 setProperty:(k,v)=>{props[k]=String(v);},
                                                 deleteProperty:k=>{delete props[k];}})},
    LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
  };
  const api=new Function(...Object.keys(sb),src+'\n;return {doGet:doGet,doPost:doPost};')(...Object.values(sb));
  return {api,put,listAll,trashed,root};
}

let D=mkDrive();
const sidecar=(u,d,ty,g,dev,by)=>JSON.stringify({type:'cm-inspection-entries',version:2,
  records:[{equip:u,date:d,type:ty,by:by||'B. Ivanov',cls:'HT',dev:dev||'DAAAA',
    items:[{key:'4C',label:'Left Rear Final Drive',grade:g,defect:'Ferrous debris — heavy',
            defectCode:'DT14-03',cause:'Gear wear',action:'MON',actionLabel:'Monitor',wo:''}]}]});
function seed(){
  D=mkDrive();
  [['TK146','2026-03-09','MP','C'],['TK147','2026-03-10','MP','A'],['TK148','2026-03-11','FC','X']]
    .forEach(([u,d,ty,g])=>{
      const dmy=d.split('-').reverse().join('.');
      D.put(`${ty}/2026-03/${u}_${dmy}_${ty}.json`,sidecar(u,d,ty,g));
      D.put(`${ty}/2026-03/${u}_4C_${dmy}_${ty}.jpg`,'JPEG');
    });
}
seed();

const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json',
            '.webmanifest':'application/manifest+json','.png':'image/png'};
http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x'), cors={'Access-Control-Allow-Origin':'*'};
  const send=o=>{res.writeHead(200,Object.assign({'Content-Type':'application/json'},cors));
                 res.end(JSON.stringify(o));};
  if(u.pathname==='/__seed'){ seed(); res.writeHead(200,cors); return res.end('ok'); }
  if(u.pathname==='/__files') return send({files:D.listAll(),trashed:D.trashed});
  if(u.pathname==='/exec'){
    if(req.method==='POST'){ let b=''; req.on('data',c=>b+=c);
      return req.on('end',()=>{ try{ send(D.api.doPost({postData:{contents:b}})); }
                                catch(e){ send({ok:false,error:String(e.message||e)}); } }); }
    const q={}; u.searchParams.forEach((v,k)=>q[k]=v);
    try{ return send(D.api.doGet({parameter:q})); }catch(e){ return send({ok:false,error:String(e.message||e)}); }
  }
  const p=path.join(ROOT,u.pathname);
  if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404,cors);return res.end('x');}
  res.writeHead(200,Object.assign({'Content-Type':MIME[path.extname(p)]||'application/octet-stream'},cors));
  res.end(fs.readFileSync(p));
}).listen(PORT,()=>console.log('edit server on '+PORT+' (admin='+ADMIN+')'));
