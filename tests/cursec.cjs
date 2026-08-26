/* Object Storage timestamps the second, not the millisecond.

   readRecords hands back a cursor — "you now hold everything up to here" — and
   the next call asks for what is newer. The Apps Script reads Drive's
   last-modified in milliseconds, so no two files ever share a timestamp and an
   exclusive `>` cursor loses nothing. The port kept the `>` and took its
   timestamp from S3's LastModified, which is rendered to the whole second.

   Six sidecars uploaded in the same second therefore all carry the same number.
   The read delivers them, the cursor advances to that second, and every later
   read asks for something strictly newer — so if the read had stopped partway
   through that second, or a phone uploaded into a second already passed, those
   rounds are never delivered to anybody again. Not to the office, not to a
   phone. And read, pending and truncated all report a complete read, so nothing
   anywhere says a round is missing. A batch upload at the end of a shift is
   exactly when several sidecars land inside one second.

   This loads the REAL readRecords over a bucket that stamps whole seconds, the
   way the storage does. tests/ya-srv.cjs deliberately stamps strictly
   increasing milliseconds so that suites have stable ordering — which is also
   why no suite could ever have caught this.

   Run: node tests/cursec.cjs
*/
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

/* A bucket that tells the truth about its own resolution. Every object written
   between two calls to `tick()` shares one timestamp, because that is what a
   second of wall-clock does to real objects. */
function mkBucket() {
  const obj = new Map();
  let sec = 1772000000;                       // whole seconds, like LastModified
  return {
    tick() { sec += 1; },
    put(key, buf, type, dev) {
      obj.set(key, { buf: Buffer.from(String(buf)), type: type || "application/json",
                     dev: dev || "", at: sec * 1000 });
    },
    get(key) { return obj.get(key) || null; },
    del(key) { return obj.delete(key); },
    list(prefix) {
      const out = [];
      for (const [key, v] of obj) {
        if (prefix && key.indexOf(prefix) !== 0) continue;
        out.push({ key, name: key.slice(key.lastIndexOf("/") + 1), path: key, id: key,
                   size: v.buf.length, updated: v.at });
      }
      return out;
    },
  };
}
const B = mkBucket();

process.env.BUCKET = "cm-test"; process.env.SECRET = ""; process.env.ADMIN_SECRET = "";
const src = fs.readFileSync(path.join(ROOT, "docs/yandex/function.js"), "utf8");
const shim = `
  listAll = async prefix => BUCKET_.list(prefix || '');
  getObj = async key => { const o = BUCKET_.get(key); if (!o) throw new Error('S3 404: ' + key);
    return { status: 200, body: o.buf, headers: { 'content-type': o.type } }; };
  headObj = async key => { const o = BUCKET_.get(key); return o ? { status: 200, body: Buffer.alloc(0),
    headers: { 'content-type': o.type } } : null; };
  putObj = async (key, buf, type, dev) => { BUCKET_.put(key, buf, type, dev); return { status: 200 }; };
  delObj = async key => { BUCKET_.del(key); return { status: 204 }; };
`;
const body = src
  .replace(/^const (listAll|getObj|headObj|putObj|delObj)/gm, "let $1")
  .replace(/^async function listAll/m, "let _unusedListAll; async function listAll")
  + "\n" + shim + "\nreturn exports;";
const mod = { exports: {} };
const FN = new Function("exports", "module", "require", "process", "BUCKET_", body)(
  mod.exports, mod, require, process, B);
const { readRecords } = FN._internals;

const sidecar = (u, d, ty) => JSON.stringify({ type: "cm-inspection-entries", version: 2,
  records: [{ equip: u, date: d, type: ty, by: "B. Ivanov", dev: "DAAAA",
              items: [{ key: "4C", grade: "A" }] }] });
const add = (u, d, ty) => B.put(`${ty}/2026-03/${u}_${d.split("-").reverse().join(".")}_${ty}.json`,
  sidecar(u, d, ty));
const equips = j => (j.records || []).map(r => r.equip).sort();

(async () => {
  console.log("\n── a shift's worth of rounds, uploaded inside one second");
  B.tick(); add("TK101", "2026-03-09", "MP");          // second 1, on its own
  B.tick(); ["TK102", "TK103", "TK104", "TK105"].forEach(u => add(u, "2026-03-09", "MP"));

  const first = await readRecords({ after: "0", index: "0" });
  ok(equips(first).length === 5, "a full read sees all five", JSON.stringify(equips(first)));

  /* The office, or a phone, now holds everything and syncs again. This is the
     step that used to lose four rounds for ever. */
  const second = await readRecords({ after: String(first.cursor), index: "0" });
  const held = new Set(equips(first));
  const everSeen = new Set([...equips(first), ...equips(second)]);
  ok(everSeen.size === 5, "and nothing has been dropped by the cursor",
     JSON.stringify([...everSeen]));

  console.log("\n── a round uploaded into a second the cursor already passed");
  /* No tick: this lands in the same second as the four above, AFTER a client
     has already read up to that second. The exclusive cursor made it invisible. */
  add("TK106", "2026-03-09", "MP");
  const third = await readRecords({ after: String(first.cursor), index: "0" });
  ok(equips(third).indexOf("TK106") >= 0,
     "it is still delivered", JSON.stringify(equips(third)));

  console.log("\n── and the cursor still moves");
  B.tick(); add("TK107", "2026-03-09", "MP");
  const fourth = await readRecords({ after: String(third.cursor), index: "0" });
  ok(fourth.cursor >= third.cursor, "forward, never backward",
     `${third.cursor} -> ${fourth.cursor}`);
  ok(equips(fourth).indexOf("TK107") >= 0, "and the newest round arrives",
     JSON.stringify(equips(fourth)));
  /* Inclusive means the newest second is re-read. That is the price, and it has
     to stay bounded by that second — a sync must never walk back over the
     folder. Sync again from where the last one stopped: the newest second now
     holds TK107 alone, so one record is what comes back. */
  const fifth = await readRecords({ after: String(fourth.cursor), index: "0" });
  ok(fifth.records.length === 1 && fifth.records[0].equip === "TK107",
     "a routine sync re-reads the newest second and nothing else",
     `${fifth.records.length} of 7: ${JSON.stringify(equips(fifth))}`);

  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
