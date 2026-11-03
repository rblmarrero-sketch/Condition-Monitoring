/* READ-ONLY access to the live Google Apps Script, for the monitoring audit.

   Only GET, and only these actions: ping (the plain GET), index, list, file.
   Nothing here can write, delete or upload: there is no POST in this file,
   and get() refuses any other action. The address is read from
   mobile/upload-defaults.js (the swap's `to`), never written into a file. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const ALLOWED = new Set(['', 'index', 'list', 'file']);
function liveUrl() {
  const src = fs.readFileSync(path.join(ROOT, 'mobile', 'upload-defaults.js'), 'utf8');
  const m = src.match(/https:\/\/script\.google\.com\/macros\/s\/[^"'\s]+\/exec/);
  if (!m) throw new Error('no Apps Script address in mobile/upload-defaults.js');
  return m[0];
}
async function get(params) {
  const q = new URLSearchParams(params || {});
  const act = q.get('action') || '';
  if (!ALLOWED.has(act)) throw new Error('read-only: action not allowed: ' + act);
  const url = liveUrl() + (q.toString() ? '?' + q : '');
  let last;
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { method: 'GET' }); return await r.json(); }
    catch (e) { last = e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
  throw last;
}
/* action=file answers base64 in `content` (or `data`). */
function body(f) {
  const b = f && (f.content || f.data || f.body); if (b == null) return null;
  try { return JSON.parse(Buffer.from(b, 'base64').toString('utf8')); } catch (e) {}
  try { return JSON.parse(b); } catch (e) { return null; }
}
module.exports = { get, body, liveUrl, ROOT };
