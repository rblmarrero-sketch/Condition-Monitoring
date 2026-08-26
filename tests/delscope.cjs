/* Deleting one round must delete one round.

   On the Yandex backend it did not. deleteRecord matched on two indexOf tests —
   the name starts with the unit, the name contains the date — and the round
   TYPE was never in the match. So deleting the magnetic-plug round on TK146 for
   9 March also destroyed the undercarriage round walked on the same machine the
   same day: its sidecar, its photographs, its correction marker, its conflict
   marker. It destroyed TK1465's rounds too, because "TK1465" starts with
   "TK146". And because only ONE .deleted.json marker is written — naming the
   round the office actually asked about — nothing ever told a phone the others
   had gone. They sit in every team cache as walked, against files that no
   longer exist, and the machine stops being due for a round nobody did.

   The Apps Script had it right from the start: a regex anchored on the unit
   with a required separator, the date, the type, and a required separator after
   the type. This is the guard that the port now says the same thing.

   Run: node tests/delscope.cjs
*/
const { spawn } = require("child_process");
const path = require("path");

const PORT = 8118, B = `http://127.0.0.1:${PORT}`, ADMIN = "letmein";
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

/* The round the office asks to delete, and everything that is genuinely part of
   it — including the second device's copy of a clash, which is the same record. */
const MINE = [
  "MP/2026-03/TK146_09.03.2026_MP.json",
  "MP/2026-03/TK146_09.03.2026_MP~DBBBB.json",
  "MP/2026-03/TK146.4C_09.03.2026_MP_2.jpg",
  "MP/2026-03/TK146_09.03.2026_MP_SIGN.png",
  "_meta/TK146_09.03.2026_MP.edit.json",
  "_meta/TK146_09.03.2026_MP.conflict.json",
];
/* Neighbours. Every one of these was destroyed by the old rule. */
const SAFE = [
  ["UC/2026-03/TK146_09.03.2026_UC.json",      "another round, same machine, same day"],
  ["UC/2026-03/TK146.4C_09.03.2026_UC_2.jpg",  "that round's photograph"],
  ["_meta/TK146_09.03.2026_UC.edit.json",      "that round's correction"],
  ["MP/2026-03/TK1465_09.03.2026_MP.json",     "a different unit whose name starts the same"],
  ["MP/2026-03/TK146_10.03.2026_MP.json",      "the same round the next day"],
  ["MPX/2026-03/TK146_09.03.2026_MPX.json",    "a type whose name starts the same"],
];

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(B + "/exec"); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  await fetch(B + "/__seed");
  const before = await keys();
  for (const k of before) { /* the seed's own files stay out of the way */ }
  for (const k of MINE) await put(k);
  for (const [k] of SAFE) await put(k);

  console.log("\n── one round, and only that round");
  const r = await post({ op: "delete", key: "TK146|2026-03-09|MP", by: "office", admin: ADMIN });
  ok(r.ok === true, "the delete is accepted", JSON.stringify(r));

  const after = new Set(await keys());
  const survived = MINE.filter(k => after.has(k));
  ok(survived.length === 0, "every file of the round is gone",
     survived.length ? JSON.stringify(survived) : `${MINE.length} removed`);

  for (const [k, why] of SAFE) ok(after.has(k), "kept: " + why, k);

  ok(after.has("_meta/TK146_09.03.2026_MP.deleted.json"),
     "and a marker is left so a phone stops counting the round");

  console.log("\n── the marker tells the whole truth");
  /* If a delete ever destroys more than one round again, the markers are the
     only thing that could tell a phone — so the count of markers and the count
     of destroyed rounds have to be the same number. */
  const markers = [...after].filter(k => /\.deleted\.json$/.test(k));
  ok(markers.length === 1, "exactly one round was destroyed, and one marker says so",
     JSON.stringify(markers));

  console.log("\n── a key that matches nothing is refused, not reported as done");
  const none = await post({ op: "delete", key: "TK999|2026-03-09|MP", by: "office", admin: ADMIN });
  ok(none.ok === false && /Nothing found/i.test(none.error || ""),
     "it says so instead of answering ok with zero", JSON.stringify(none));

  console.log("\n── the gate still holds");
  const nopw = await post({ op: "delete", key: "UC|2026-03-09|UC", by: "office" });
  ok(nopw.ok === false && /admin/i.test(nopw.error || ""),
     "no password, no delete", JSON.stringify(nopw));
  const bad = await post({ op: "delete", key: "TK146|2026-03-09|UC", by: "office", admin: "wrong" });
  ok(bad.ok === false, "wrong password, no delete", JSON.stringify(bad));
  ok((await keys()).includes("UC/2026-03/TK146_09.03.2026_UC.json"),
     "and the refused attempts destroyed nothing");

  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
