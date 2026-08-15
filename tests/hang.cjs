/* A /exec that accepts the request and never answers — the pit-signal case that
   wedged the button. /exec2 answers normally, to prove recovery. */
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT=require('path').join(__dirname, '..');
const rec=(u,d,ty)=>({equip:u,date:d,type:ty,by:'B. Ivanov',items:[{key:'4C',grade:'C'}]});
http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x'), cors={'Access-Control-Allow-Origin':'*'};
  if(u.pathname==='/hang'){ return; }                       // never responds
  if(u.pathname==='/exec2'){
    const recs=[rec('TK146','2026-07-30','MP'),rec('TK147','2026-07-30','MP'),
                rec('EX01','2026-07-29','FC'),rec('EX02','2026-07-29','FC'),rec('EX03','2026-07-28','TEMP')];
    res.writeHead(200,Object.assign({'Content-Type':'application/json'},cors));
    return res.end(JSON.stringify({ok:true,records:recs,cursor:5,files:5,photos:0}));
  }
  const p=path.join(ROOT,u.pathname);
  if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){ res.writeHead(404,cors); return res.end('x'); }
  const m={'.html':'text/html','.js':'text/javascript','.json':'application/json'}[path.extname(p)];
  res.writeHead(200,Object.assign({'Content-Type':m||'application/octet-stream'},cors));
  res.end(fs.readFileSync(p));
}).listen(8097,()=>console.log('hang server on 8097'));
