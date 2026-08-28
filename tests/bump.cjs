/* DID THE SHIPPED FILES CHANGE WITHOUT THE BUILD NUMBER CHANGING?

   This suite exists because of one incident, and it is the worst one this
   project has had.

   An entire body of work — class-aware intervals, the photo editor fixes, the
   send-state vocabulary, re-filing a round, the conflict comparison, the
   read-after-write confirmation — was written, tested against 150 green suites,
   committed, pushed, and published by GitHub Pages. Not one phone saw any of
   it. `BUILD` had stayed at "162" throughout.

   BUILD is not a label. It is the cache key:

       CACHE = "plug-capture-v" + BUILD

   Leave it alone and the service worker serves the previous files to every
   installed phone for ever. Worse, `checkForNewBuild()` fetches sw.js, reads its
   BUILD, and RETURNS EARLY when it matches its own — so an un-bumped build does
   not merely fail to arrive, the phone positively concludes there is nothing
   new. The dashboard's ?v= tags do the same to the browser cache.

   ver.cjs could not catch it and never will: it checks the stamps agree WITH
   EACH OTHER, and they did — consistently, at the stale number, through every
   run of the sweep. Agreement is not freshness.

   So this asks a different question, of git rather than of the page: since the
   commit that introduced the current BUILD, has any file that actually ships
   been modified? If yes, the number is stale and the work is invisible.

   Runs in under a second and touches no browser, so it belongs at the FRONT of
   the sweep and can be run on its own before every push:

       node tests/bump.cjs
*/
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

/* Everything served to a phone or a desk. docs/ is the backend and the setup
   notes — deployed by hand, on its own schedule, and deliberately not part of
   this question. tests/ ships to nobody. */
const SHIPPED = ["mobile/", "dashboard/", "data/"];

(() => {
  const sw = fs.readFileSync(path.join(ROOT, "mobile/sw.js"), "utf8");
  const m = sw.match(/const BUILD\s*=\s*"([^"]+)"/);
  if (!ok(!!m, "the service worker declares a build")) { process.exit(1); }
  const BUILD = m[1];
  console.log("  build " + BUILD);

  /* The commit that first introduced this exact BUILD string. -S finds every
     commit where the count of that string changed; the LAST one in log order
     (oldest) is the one that added it. */
  let introduced = "";
  try {
    introduced = git("log", "-S", `const BUILD = "${BUILD}"`, "--format=%H", "--", "mobile/sw.js")
      .split("\n").filter(Boolean).pop() || "";
  } catch (e) { /* shallow clone or no history — handled below */ }

  if (!introduced) {
    /* Never assert a pass from an unanswerable question. A shallow clone cannot
       see when the build was set, and reporting that as "nothing changed" would
       be the false reassurance this whole project is about. */
    console.log("  SKIP  no history for this build — shallow clone?");
    console.log("\nnot checked");
    process.exit(0);
  }
  console.log("  set in " + introduced.slice(0, 8) + "  " + git("log", "-1", "--format=%s", introduced).slice(0, 60));

  const changed = git("diff", "--name-only", `${introduced}..HEAD`, "--", ...SHIPPED)
    .split("\n").filter(Boolean);
  /* Uncommitted work counts too. A change sitting in the working tree is one
     push away from being invisible in exactly the same way. */
  /* Porcelain is two status columns then whitespace then the path — and a
     fixed slice(3) ate the first letter of the filename on some of them, so the
     guard named a file that does not exist. A guard whose message cannot be
     trusted is worth very little. Match the shape instead of counting. */
  const dirty = git("status", "--porcelain", "--", ...SHIPPED)
    .split("\n").filter(Boolean)
    /* `git()` trims, which strips porcelain's leading space off the FIRST line
       only — so a fixed-width match works on every line but that one. Match one
       or two status characters with optional leading space instead. */
    .map(l => (l.match(/^\s?\S{1,2}\s+(.*)$/) || [, l])[1])
    .map(p2 => p2.includes(" -> ") ? p2.split(" -> ").pop() : p2)   // renames
    .map(p2 => p2.replace(/^"|"$/g, "").trim());
  const all = [...new Set(changed.concat(dirty))];

  ok(all.length === 0,
    "no shipped file has changed since the build number was set",
    all.length ? all.length + " have: " + all.slice(0, 6).join(", ") : "clean");

  if (all.length) {
    console.log("");
    console.log("  Those files are on phones and desks, and they will NOT reach");
    console.log("  anybody while BUILD stays at " + BUILD + ". Bump it:");
    console.log("");
    console.log("    N=" + (Number(BUILD) + 1) + "; sed -i \"s/v=" + BUILD + "/v=$N/g; s/const BUILD = \\\"" + BUILD + "\\\"/const BUILD = \\\"$N\\\"/; s/const BUILD=\\\"" + BUILD + "\\\"/const BUILD=\\\"$N\\\"/\" \\");
    console.log("      mobile/sw.js mobile/index.html dashboard/index.html");
    console.log("    node tests/ver.cjs   # then confirm all ~59 stamps agree");
    console.log("");
  }

  console.log(fail ? "\nFAILED: " + fail : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
