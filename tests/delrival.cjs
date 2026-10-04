/* Deleting ONE device's rival copy must not delete the real round beside it.

   Read off the live folder on 2026-10-04: a test run had filed rounds under
   other device codes next to real inspections (TK148 MP, EX003 INSP, 30 Sep).
   deleteRecord() treats "~DEV" as part of the round, so the only delete there
   was would have taken the real inspection with it. `dev` narrows the delete
   to the files carrying "~DEV"; `dry` lists them and changes nothing; and no
   .deleted.json tombstone is written, because that marker removes the WHOLE
   key from every phone and desk.

   Run: node tests/delrival.cjs
*/
const { spawn } = require("child_process");
const path = require("path");

const PORT = 8120, B = `http://127.0.0.1:${PORT}`, ADMIN = "letmein";
let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

const srv = spawn(process.execPath, [path.join(__dirname, "ya-srv.cjs"), String(PORT), ADMIN], { stdio: "ignore" });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on("exit", bye); process.on("SIGINT", () => { bye(); process.exit(1); });

const post = body => fetch(B + "/exec", { method: "POST",
  headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) }).then(r => r.json());
const keys = () => fetch(B + "/__keys").then(r => r.json()).then(j => j.keys);
const put = (key, body) => fetch(B + "/__put?key=" + encodeURIComponent(key),
  { method: "POST", body: body || "{}" }).then(r => r.text());

/* The shape of the live folder: a real round by one phone, two rival copies. */
const RIVAL = [
  "MP/2026-09/TK148_30.09.2026_MP~DGW79E.json",
  "MP/2026-09/TK148_OVERVIEW_30.09.2026_MP~DGW79E.jpg",
  "MP/2026-09/TK148.4E_30.09.2026_MP_1~DGW79E.jpg",
];
const KEEP = [
  ["MP/2026-09/TK148_30.09.2026_MP.json",              "the real round's sidecar"],
  ["MP/2026-09/TK148_OVERVIEW_30.09.2026_MP.jpg",      "the real round's overview photograph"],
  ["MP/2026-09/TK148.4E_30.09.2026_MP_1.jpg",          "the real round's component photograph"],
  ["MP/2026-09/TK148_30.09.2026_MP~D8H0RT.json",       "ANOTHER device's rival copy"],
  ["MP/2026-09/TK148_OVERVIEW_30.09.2026_MP~D8H0RT.jpg", "that device's photograph"],
  ["MP/2026-09/TK148_30.09.2026_MP~DGW79EX.json",      "a device whose code merely starts the same"],
  ["_meta/TK148_30.09.2026_MP.edit.json",              "the round's correction marker"],
  ["_meta/TK148_30.09.2026_MP.conflict.json",          "the round's conflict marker"],
  ["MP/2026-09/TK148_30.09.2026_MP_SIGN.png",          "the real signature"],
  ["UC/2026-09/TK148_30.09.2026_UC~DGW79E.json",       "the same device's copy of a DIFFERENT round type"],
  ["MP/2026-09/TK1485_30.09.2026_MP~DGW79E.json",      "a different unit whose name starts the same"],
];

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(B + "/exec"); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  await fetch(B + "/__seed");
  for (const k of RIVAL) await put(k);
  for (const [k] of KEEP) await put(k);
  const K = "TK148|2026-09-30|MP";

  console.log("\n── dry run says what would go and changes nothing");
  const before = (await keys()).slice().sort();
  const dry = await post({ op: "delete", key: K, dev: "DGW79E", dry: true, by: "office", admin: ADMIN });
  ok(dry.ok === true && dry.dry === true, "the dry run is accepted", JSON.stringify(dry));
  ok(dry.would && dry.would.length === RIVAL.length, "and lists exactly the rival's files", JSON.stringify(dry.would));
  ok(JSON.stringify((await keys()).slice().sort()) === JSON.stringify(before), "nothing was deleted, nothing was written");

  console.log("\n── the real delete takes the rival and only the rival");
  const r = await post({ op: "delete", key: K, dev: "DGW79E", by: "office", why: "test run", admin: ADMIN });
  ok(r.ok === true && r.deleted === RIVAL.length && r.dev === "DGW79E", "the delete is accepted", JSON.stringify(r));
  const after = new Set(await keys());
  const left = RIVAL.filter(k => after.has(k));
  ok(left.length === 0, "every file of that device's copy is gone", left.length ? JSON.stringify(left) : RIVAL.length + " removed");
  for (const [k, why] of KEEP) ok(after.has(k), "kept: " + why, k);

  console.log("\n── no tombstone for the round, and a record of what was done");
  ok(![...after].some(k => /\.deleted\.json$/.test(k)),
     "no .deleted.json — that would remove the REAL round from every screen");
  const rec = [...after].filter(k => /^_meta\/deletions\/.*\.rival\.json$/.test(k));
  ok(rec.length === 1, "one rival-deletion record names who and why", JSON.stringify(rec));

  console.log("\n── refusals");
  const again = await post({ op: "delete", key: K, dev: "DGW79E", by: "office", admin: ADMIN });
  ok(again.ok === false && /Nothing found/i.test(again.error || ""), "a second delete finds nothing and says so", JSON.stringify(again));
  const bad = await post({ op: "delete", key: K, dev: "../x", by: "office", admin: ADMIN });
  ok(bad.ok === false && /Bad device/i.test(bad.error || ""), "a malformed device code is refused", JSON.stringify(bad));
  const nopw = await post({ op: "delete", key: K, dev: "D8H0RT", by: "office" });
  ok(nopw.ok === false, "no password, no delete", JSON.stringify(nopw));
  const wrong = await post({ op: "delete", key: K, dev: "D8H0RT", by: "office", admin: "wrong" });
  ok(wrong.ok === false, "wrong password, no delete", JSON.stringify(wrong));
  ok((await keys()).includes("MP/2026-09/TK148_30.09.2026_MP~D8H0RT.json"), "and the refused attempts destroyed nothing");

  console.log("\n── without `dev` it is still the whole-round delete, unchanged");
  const whole = await post({ op: "delete", key: K, by: "office", admin: ADMIN });
  const end = new Set(await keys());
  ok(whole.ok === true && !end.has("MP/2026-09/TK148_30.09.2026_MP.json") && !end.has("MP/2026-09/TK148_30.09.2026_MP~D8H0RT.json"),
     "no `dev` removes the real round and every rival copy", JSON.stringify(whole));
  ok(end.has("MP/2026-09/TK1485_30.09.2026_MP~DGW79E.json") && end.has("UC/2026-09/TK148_30.09.2026_UC~DGW79E.json"),
     "and still only that unit's round of that type");

  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
