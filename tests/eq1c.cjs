/* EQ1C_V1: the equipment list follows 1C (mobile/equip1c.js). No browser: assets.js and equip1c.js run in a vm with a stub
   window and localStorage, against a 1C list built from the register itself, so the numbers below are the register's own. */
const fs = require("fs"), path = require("path"), vm = require("vm");
const R = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("  FAIL " + n); } }
const ASSETS_SRC = fs.readFileSync(path.join(R, "mobile/assets.js"), "utf8");
const EQ_SRC = fs.readFileSync(path.join(R, "mobile/equip1c.js"), "utf8");
function boot(stored, opts) {
  opts = opts || {};
  const ls = {}; if (stored !== undefined) ls.cm_eq1c = typeof stored === "string" ? stored : JSON.stringify(stored);
  const timers = [];
  const win = { __errs: [] };
  const ctx = { window: win, localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout: () => {},
    location: opts.loc || { hostname: "127.0.0.1", pathname: "/mobile/index.html" }, fetch: opts.fetch, AbortController: undefined, Date, JSON, String, Object, Array, Promise };
  vm.createContext(ctx);
  vm.runInContext(ASSETS_SRC, ctx); vm.runInContext(EQ_SRC, ctx);
  return { win, ls, timers };
}
const reg = boot().win.ASSETS;
console.log("register: " + reg.length + " units");
ok(reg.length > 1000, "assets.js alone leaves the register as it is (no stored 1C list)");

// a 1C list: every second unit of the register, a few new units, one model changed, one range changed
const pick = reg.filter((a, i) => i % 2 === 0);
const truck = reg.find(a => a.cat === "TRUCK, DUMP" && a.mk && a.mk.indexOf("|") > 0);
const exc = reg.find(a => a.cat === "EXCAVATOR, BUCKET" && a.mk && a.mk.indexOf("|") > 0 && a !== truck);
const keepOne = reg.find((a, i) => i % 2 === 1);
const units = pick.map(a => {
  const mk = (a.mk || "").split("|");
  return { n: a.n, r: a.cat || "", m: mk[0] || "", md: mk[1] || "" };
});
if (!units.find(u => u.n === truck.n)) units.push({ n: truck.n, r: truck.cat, m: truck.mk.split("|")[0], md: truck.mk.split("|")[1] });
if (!units.find(u => u.n === exc.n)) units.push({ n: exc.n, r: exc.cat, m: exc.mk.split("|")[0], md: exc.mk.split("|")[1] });
units.find(u => u.n === truck.n).md = truck.mk.split("|")[1].toLowerCase().replace(/\s+/g, "-");   // same model, other spelling
units.find(u => u.n === exc.n).md = "ZZ9000";                                                       // another model
units.push({ n: "ZZ001", r: "LOADER, FRONT", m: "LIUGONG", md: "LIUGONG 990F", ap: "MINING", d: "Loader" });
units.push({ n: "ZZ002", r: "SOMETHING NEW", m: "ACME", md: "" });
const chg = units.find(u => u.r === "TRUCK, DUMP" && u.n !== truck.n);
chg.r = "TRUCK, ARTICULATED";
const doc = { marker: "EQ1C_V1", generated: "2026-11-17T10:00:00Z", units, keep: [keepOne.n] };

const b = boot(doc), A = b.win.ASSETS, by = {}; A.forEach(a => by[a.n] = a);
const st = b.win.EQ1C.stats;
ok(st && st.units === A.length, "stats count the list (" + (st && st.units) + ")");
ok(A.length === units.length + 1, "1C units plus the one kept unit, nothing else (" + A.length + ")");
ok(st.added === 2 && by.ZZ001 && by.ZZ002, "units only 1C knows are added");
ok(by[keepOne.n] && by[keepOne.n].n1c === 1, "a unit not in 1C with CM rounds is kept and marked n1c");
ok(st.dropped === reg.length - (units.length - 2) - 1, "every other unit not in 1C is dropped (" + st.dropped + ")");
ok(by[truck.n].m === truck.m && by[truck.n].mk === truck.mk, "the same model under another spelling keeps the register's model text and key");
ok(by[exc.n].mk === exc.mk.split("|")[0] + "|ZZ9000" && /ZZ9000$/.test(by[exc.n].m), "another model in 1C replaces the register's (" + by[exc.n].m + ")");
ok(by[exc.n].cls === exc.cls, "the class stays while the range is unchanged");
ok(by[chg.n].cat === "TRUCK, ARTICULATED" && by[chg.n].cls === "AT", "a changed range takes the class of 1C's range");
ok(by.ZZ001.cls === "LDR" && by.ZZ001.m === "LIUGONG 990F" && by.ZZ001.mk === "LIUGONG|LIUGONG 990F", "a new unit: class from its range, model not doubled");
ok(by.ZZ001.ap === "MINING" && by.ZZ001.src === "1C", "applicability and source carried");
ok(by.ZZ002.cls === "GEN" && by.ZZ002.m === "ACME" && !by.ZZ002.mk, "an unknown range is GEN, a unit with no model shows its manufacturer");
ok(A.every((a, i) => i === 0 || A[i - 1].n < a.n), "the list stays sorted by unit");

// guards
ok(boot({ marker: "EQ1C_V1", units: units.slice(0, 50) }).win.ASSETS.length === reg.length, "a list of under 100 units is ignored");
ok(boot("{not json").win.ASSETS.length === reg.length, "a broken stored copy is ignored");

// the class table is the page's own
const page = fs.readFileSync(path.join(R, "mobile/index.html"), "utf8");
const m = page.match(/const CAT2CLS=(\{[\s\S]*?\});/);
ok(m && JSON.stringify(JSON.parse(m[1])) === JSON.stringify(b.win.EQ1C.CAT2CLS), "CAT2CLS equals mobile/index.html's");

// loaded right after assets.js on all three pages, and precached
for (const [f, p] of [["mobile/index.html", ""], ["dashboard/index.html", "../mobile/"], ["dashboard-next/index.html", "../mobile/"]]) {
  const s = fs.readFileSync(path.join(R, f), "utf8");
  const re = new RegExp('<script src="' + p.replace(/\./g, "\\.").replace(/\//g, "\\/") + 'assets\\.js\\?v=(\\d+)"></script>\\n<script src="' + p.replace(/\./g, "\\.").replace(/\//g, "\\/") + 'equip1c\\.js\\?v=\\1"></script>');
  ok(re.test(s), f + " loads equip1c.js directly after assets.js, same build tag");
}
ok(/"\.\/equip1c\.js\?v=" \+ BUILD/.test(fs.readFileSync(path.join(R, "mobile/sw.js"), "utf8")), "sw.js precaches equip1c.js");

// asked for only where PECHANKA publishes it
ok(boot().timers.length === 0, "a test server asks for nothing");
ok(boot(undefined, { loc: { hostname: "relconditionmonitoring.web.app", pathname: "/mobile/" } }).timers.length === 1, "Firebase asks");
ok(boot(undefined, { loc: { hostname: "maintenance.vegadevelopment.com", pathname: "/cm/dashboard/" } }).timers.length === 1, "the office copy under /cm/ asks");

// a fetched list is stored for the next load; a wrong marker is not
(async () => {
  const mk = d => () => Promise.resolve({ ok: true, json: () => Promise.resolve(d) });
  const b1 = boot(undefined, { fetch: mk(doc) });
  ok(await b1.win.EQ1C.refresh() === true && JSON.parse(b1.ls.cm_eq1c).generated === doc.generated, "a fetched list is stored");
  ok(b1.win.ASSETS.length === reg.length, "and is not applied under a page that already built its indexes");
  const b2 = boot(undefined, { fetch: mk(Object.assign({}, doc, { marker: "X" })) });
  ok(await b2.win.EQ1C.refresh() === false && !b2.ls.cm_eq1c, "a list without the EQ1C_V1 marker is not stored");
  const b3 = boot(undefined, { fetch: () => Promise.reject(new Error("offline")) });
  ok(await b3.win.EQ1C.refresh() === false, "offline: nothing stored, nothing thrown");
  console.log("\neq1c: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
