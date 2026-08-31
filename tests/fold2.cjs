/* End-to-end check that each inspection type lands in its own folder.
   Records the `folder` + `name` of every upload the phone actually makes, then
   replays them through the real Apps Script folderPath_/doPost to prove the
   sub-folders get created. */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = require('path').join(__dirname, '..');
const PORT = 8095;

const got = [];
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), cors = { 'Access-Control-Allow-Origin': '*' };
  if (u.pathname === '/exec') {
    if (req.method !== 'POST') { res.writeHead(200, Object.assign({'Content-Type':'application/json'},cors));
      return res.end(JSON.stringify({ ok:true, records:[], cursor:0 })); }
    let b = ''; req.on('data', c => b += c);
    return req.on('end', () => {
      let j = null; try { j = JSON.parse(b); } catch (e) {}
      if (j && j.name) got.push({ folder: j.folder, name: j.name });
      res.writeHead(200, Object.assign({'Content-Type':'application/json'},cors));
      res.end('{"ok":true}');
    });
  }
  const p = path.join(ROOT, u.pathname);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404,cors); return res.end('x'); }
  const m = {'.html':'text/html','.js':'text/javascript','.json':'application/json',
             '.webmanifest':'application/manifest+json','.png':'image/png'}[path.extname(p)];
  res.writeHead(200, Object.assign({'Content-Type': m || 'application/octet-stream'}, cors));
  res.end(fs.readFileSync(p));
});

const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };

/* ---- the real Apps Script, against a fake Drive, to prove folders get made ---- */
function appsScript() {
  const ROOTID = '1AbCdEfGhIjKlMnOpQrStUvWxYz123456';
  const made = [];                                    // every folder actually created
  const mkFolder = (name, fullPath) => {
    const subs = {}, files = {};
    const dir = {
      getId: () => 'id:' + fullPath, getName: () => name,
      getFolders: () => it([]), getFiles: () => it([]),
      getFoldersByName: n => it(subs[n] ? [subs[n]] : []),
      getFilesByName: n => it(files[n] ? [files[n]] : []),
      createFolder: n => { made.push((fullPath ? fullPath + '/' : '') + n);
        return subs[n] = mkFolder(n, (fullPath ? fullPath + '/' : '') + n); },
      createFile: blob => { const f = { getId:()=>'f', getName:()=>blob.name,
        getUrl:()=>'u', setTrashed(){}, _path:(fullPath?fullPath+'/':'')+blob.name };
        files[blob.name] = f; stored.push(f._path); return f; },
      _subs: subs,
    };
    return dir;
  };
  const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
  const stored = [];
  const root = mkFolder('Condition Monitoring', '');
  const src = fs.readFileSync(ROOT + '/docs/google-upload.gs', 'utf8')
    .replace(/const SECRET = '[^']*';/, "const SECRET = '';")
    .replace(/const ROOT_FOLDER_ID = '[^']*';/, `const ROOT_FOLDER_ID = ${JSON.stringify(ROOTID)};`);
  const sandbox = {
    DriveApp: { getFolderById: id => { if (id !== ROOTID) throw new Error('no folder'); return root; },
                getFileById: () => null },
    Utilities: { ...require('./gsdigest.cjs'), base64Decode: s => Buffer.from(s, 'base64'), base64Encode: b => Buffer.from(b).toString('base64'),
                 newBlob: (bytes, ct, name) => ({ bytes, ct, name }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) },
    Logger: { log: () => {} },
  };
  const fn = new Function(...Object.keys(sandbox), src + '\n;return {doPost:doPost};');
  return { api: fn(...Object.values(sandbox)), made, stored };
}

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));

  const FOLDER = '{TYPE}/{YYYY-MM}';
  await p.addInitScript(([u, f]) => localStorage.setItem('up_dests', JSON.stringify(
    [{ id: 'gas', on: true,  url: u, sec: '', folder: f },
     { id: 'pa',  on: false, url: 'http://127.0.0.1:9/dead', sec: '', folder: f },
     { id: 'post',on: false, url: '', sec: '', folder: f }])), [`http://127.0.0.1:${PORT}/exec`, FOLDER]);
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(900);

  /* ---- 1. what the built-in default actually is ---- */
  console.log('the shipped default');
  const def = await p.evaluate(() => (window.UPLOAD_DEFAULTS.dests || []).map(d => `${d.id}=${d.folder}`).join(' '));
  ok('every built-in destination has {TYPE} in its folder', /gas=\{TYPE\}/.test(def) && /pa=\{TYPE\}/.test(def), def);

  /* ---- 2. save one inspection of each type, see where its files go ---- */
  console.log('\none inspection of each type');
  const TYPES = ['MP', 'FC', 'INSP', 'TEMP'];
  for (const ty of TYPES) {
    await p.evaluate(async ([ty, folder, url]) => {
      saveDests([{ id: 'gas', on: true,  url, sec: '', folder },
                 { id: 'pa',  on: false, url: 'http://127.0.0.1:9/dead', sec: '', folder },
                 { id: 'post',on: false, url: '', sec: '', folder }]);
      const png = await new Promise(r => { const c = document.createElement('canvas');
        c.width = c.height = 8; c.getContext('2d').fillRect(0, 0, 8, 8); c.toBlob(r, 'image/jpeg'); });
      await dbPut({ id: 'F_' + ty, cls: 'HT', type: ty, equip: 'TK158', date: '2026-03-09', by: 'R. Marrero',
        positions: { '4C': { grade: 'C', photos: [png] } },
        created: new Date().toISOString(), up: 0, rev: 1 });
    }, [ty, FOLDER, `http://127.0.0.1:${PORT}/exec`]);
  }
  await p.evaluate(() => syncNow());
  await p.waitForFunction(() => !syncing, null, { timeout: 30000 });
  await p.waitForTimeout(400);
  console.log('   sent:', got.map(g => g.folder + '/' + g.name).join('\n         ') || '(nothing)');
  console.log('   queue:', JSON.stringify(await p.evaluate(async () =>
    (await dbAll()).map(r => ({ id: r.id, up: r.up, upTo: r.upTo })))), 'lastErr:', await p.evaluate(() => lastErr));

  for (const ty of TYPES) {
    const mine = got.filter(g => g.name.includes('_' + ty + '.'));
    ok(`${ty} → its own folder`, mine.length > 0 && mine.every(g => g.folder === `${ty}/2026-03`),
       mine.length ? `${mine.length} file(s) → ${[...new Set(mine.map(g => g.folder))].join(', ')}` : 'no files sent');
  }
  ok('no two types share a folder',
     new Set(got.map(g => g.folder)).size === TYPES.length,
     [...new Set(got.map(g => g.folder))].sort().join(' | '));
  ok('the sidecar goes to the same folder as its photos',
     TYPES.every(ty => { const g = got.filter(x => x.name.includes('_' + ty + '.'));
       return new Set(g.map(x => x.folder)).size === 1 && g.some(x => x.name.endsWith('.json')); }),
     got.filter(g => g.name.endsWith('.json')).map(g => g.folder + '/' + g.name).join(' '));
  ok('the date comes from the inspection, not today',
     got.every(g => /\/2026-03$/.test(g.folder)), [...new Set(got.map(g => g.folder))].join(' '));

  /* ---- 2b. a dead destination must not stall the working one ---- */
  // keep the four-type set; section 4 replays it through the real Apps Script
  const perType = got.slice();
  console.log('\n10 records with SharePoint dead');
  got.length = 0;
  await p.evaluate(async ([url, folder, dead]) => {
    saveDests([{ id:'gas', on:true, url, sec:'', folder },
               { id:'pa',  on:true, url:dead, sec:'', folder },
               { id:'post',on:false,url:'', sec:'', folder }]);
    for (const r of await dbAll()) await dbDel(r.id);
    for (let i = 0; i < 10; i++)
      await dbPut({ id:'Q'+i, cls:'HT', type:'MP', equip:'TK'+(200+i), date:'2026-03-09', by:'A',
        positions:{'4C':{grade:'C'}}, created:new Date().toISOString(), up:0, rev:1 });
  }, [`http://127.0.0.1:${PORT}/exec`, FOLDER, 'http://127.0.0.1:9/dead']);
  await p.evaluate(() => syncNow());
  await p.waitForFunction(() => !syncing, null, { timeout: 60000 });
  const q = await p.evaluate(async () => (await dbAll()).filter(r => r.upTo && r.upTo.gas).length);
  ok('all 10 still reach Google when SharePoint is dead', q === 10, `${q}/10 accepted by Google`);
  ok('and each is held pending for SharePoint',
     (await p.evaluate(async () => (await dbAll()).every(r => r.up === 0))));

  /* ---- 2c. phones on the old default get upgraded once ---- */
  console.log('\nupgrade from the old shared-folder default');
  await p.evaluate(() => {
    localStorage.removeItem('up_folder_v2');
    localStorage.setItem('up_dests', JSON.stringify(
      [{ id:'gas', on:true, url:'https://x/exec', sec:'', folder:'{YYYY-MM}' }]));
    destsCache = null; destsRaw = null;
  });
  ok('the old built-in folder becomes per-type',
     (await p.evaluate(() => loadDests().find(d => d.id === 'gas').folder)) === '{TYPE}/{YYYY-MM}',
     await p.evaluate(() => loadDests().find(d => d.id === 'gas').folder));
  await p.evaluate(() => {
    localStorage.setItem('up_dests', JSON.stringify(
      [{ id:'gas', on:true, url:'https://x/exec', sec:'', folder:'MyFolder/{YYYY}' }]));
    destsCache = null; destsRaw = null;
  });
  ok('a folder the inspector chose is left alone',
     (await p.evaluate(() => loadDests().find(d => d.id === 'gas').folder)) === 'MyFolder/{YYYY}',
     await p.evaluate(() => loadDests().find(d => d.id === 'gas').folder));
  await p.evaluate(() => {
    localStorage.setItem('up_dests', JSON.stringify(
      [{ id:'gas', on:true, url:'https://x/exec', sec:'', folder:'{YYYY-MM}' }]));
    destsCache = null; destsRaw = null;
  });
  ok('and going back to {YYYY-MM} on purpose sticks',
     (await p.evaluate(() => loadDests().find(d => d.id === 'gas').folder)) === '{YYYY-MM}',
     await p.evaluate(() => loadDests().find(d => d.id === 'gas').folder));

  /* ---- 3. every placeholder ---- */
  console.log('\nplaceholders');
  const cases = [
    ['{TYPE}/{YYYY-MM}',        'INSP/2026-03'],
    ['{TYPENAME}',              'Inspection'],
    ['{UNIT}/{TYPE}',           'TK158/INSP'],
    ['{YYYY}/{MM}/{DD}',        '2026/03/09'],
    ['CM/{TYPE}/{YYYY}-{MM}',   'CM/INSP/2026-03'],
    ['//{TYPE}//',              'INSP'],                       // stray slashes collapse
    ['',                        ''],                           // blank = folder root
  ];
  for (const [tpl, want] of cases) {
    const out = await p.evaluate(f => expandFolder(f, { type: 'INSP', date: '2026-03-09', equip: 'TK158' }), tpl);
    ok(`"${tpl || '(blank)'}" → "${want}"`, out === want, `got "${out}"`);
  }
  const unsafe = await p.evaluate(() => expandFolder('{UNIT}/{TYPE}', { type: 'MP', date: '2026-03-09', equip: 'TK/158:x' }));
  ok('characters illegal in a folder name are stripped', unsafe === 'TK-158-x/MP', unsafe);
  const ru = await p.evaluate(() => { const old = lang; lang = 'ru';
    const v = expandFolder('{TYPENAME}', { type: 'MP', date: '2026-03-09' }); lang = old; return v; });
  ok('{TYPENAME} follows the language', ru === 'Магнитная пробка', ru);

  await ctx.close(); await b.close();

  /* ---- 4. the Apps Script really creates them ---- */
  console.log('\nthe script creates the folders in Drive');
  const { api, made, stored } = appsScript();
  for (const g of perType) {
    const r = api.doPost({ postData: { contents: JSON.stringify(
      { name: g.name, folder: g.folder, file: Buffer.from('x').toString('base64'), contentType: 'image/jpeg' }) } });
    if (r.ok === false) fails.push('doPost: ' + r.error);
  }
  const wanted = TYPES.map(t => `${t}/2026-03`);
  ok('each type folder was created', wanted.every(w => made.includes(w)), made.join(', '));
  ok('the month folder is nested inside the type, not flat',
     TYPES.every(t => made.includes(t) && made.includes(`${t}/2026-03`)), made.join(', '));
  ok('each folder is created once, not per file',
     made.length === new Set(made).size, `${made.length} creates, ${new Set(made).size} unique`);
  ok('every file landed under its type folder',
     stored.length === perType.length && stored.every(s => TYPES.some(t => s.startsWith(t + '/2026-03/'))),
     `${stored.length} files: ${[...new Set(stored.map(s => s.split('/').slice(0, 2).join('/')))].join(', ')}`);

  console.log('\nfiles as they appear in Drive:');
  [...new Set(stored)].sort().forEach(s => console.log('   ' + s));

  srv.close();
  console.log(fails.length ? '\nFAILURES:\n  ' + [...new Set(fails)].join('\n  ') : '\nall folder checks passed');
  process.exit(fails.length ? 1 : 0);
})();
