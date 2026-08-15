/* Endpoints for the stability suite.
     /exec      normal records endpoint, honours after= and the seeded set
     /hang      accepts and never answers   (connects-but-stalls)
     /slow?ms=  answers after a delay        (weak signal)
     /__seed?n= replace the record set;  /__del?u= remove one;  /__stats
   Also serves the repo so the app and dashboard load from the same origin. */
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT=require('path').join(__dirname, '..');
const PORT=Number(process.argv[2]||8096);

let FILES=[], stats={records:0,uploads:0};
const mk=(u,d,ty,g,t)=>({name:`${u}_${d}_${ty}.json`,id:'j'+u+ty,updated:t,
  rec:{equip:u,date:d,type:ty,by:'B. Ivanov',items:[{key:'4C',grade:g}]}});
function seed(n){
  FILES=[]; stats={records:0,uploads:0};
  for(let i=1;i<=n;i++)
    FILES.push(mk('TK'+(100+i), `2026-07-${String((i%28)+1).padStart(2,'0')}`,
                  ['MP','FC','INSP','TEMP'][i%4], ['A','C','X'][i%3], 1000000+i*1000));
}
seed(8);

const send=(res,o,extra)=>{ res.writeHead(200,Object.assign(
  {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},extra||{})); res.end(JSON.stringify(o)); };

http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x'), q=u.searchParams;
  const cors={'Access-Control-Allow-Origin':'*'};

  if(u.pathname==='/hang') return;                                   // never answers
  if(u.pathname==='/__seed'){ seed(Number(q.get('n')||8)); res.writeHead(200,cors); return res.end('ok'); }
  if(u.pathname==='/__del'){ FILES=FILES.filter(f=>!f.name.startsWith(q.get('u')+'_')); res.writeHead(200,cors); return res.end('ok'); }
  if(u.pathname==='/__stats') return send(res,stats);

  if(u.pathname==='/exec'||u.pathname==='/slow'){
    if(req.method==='POST'){ stats.uploads++; let b=''; req.on('data',c=>b+=c);
      return req.on('end',()=>send(res,{ok:true})); }
    const action=q.get('action');
    if(!action) return send(res,{ok:true,folder:'Condition Monitoring'});
    if(action!=='records') return send(res,{ok:false,error:'Unknown action: '+action});
    stats.records++;
    const after=Number(q.get('after')||0)||0;
    const list=FILES.filter(f=>f.updated>after).sort((a,b)=>a.updated-b.updated);
    const body={ok:true,records:list.map(f=>f.rec),read:list.length,failed:0,pending:0,
                truncated:false,cursor:list.length?list[list.length-1].updated:after,
                files:FILES.length,photos:0};
    const delay=u.pathname==='/slow'?Number(q.get('ms')||5000):0;
    return delay?setTimeout(()=>send(res,body),delay):send(res,body);
  }

  const p=path.join(ROOT,u.pathname);
  if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){ res.writeHead(404,cors); return res.end('x'); }
  const m={'.html':'text/html','.js':'text/javascript','.json':'application/json',
           '.webmanifest':'application/manifest+json','.png':'image/png'}[path.extname(p)];
  res.writeHead(200,Object.assign({'Content-Type':m||'application/octet-stream'},cors));
  res.end(fs.readFileSync(p));
}).listen(PORT,()=>console.log('stab server on '+PORT));
