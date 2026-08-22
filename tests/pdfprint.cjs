/* Does the sheet survive being PRINTED?

   Everything else about this poster is verified on screen, and a screen check
   cannot see the one failure that matters here: the print stylesheet hides every
   direct child of <body>, and the sheet is three levels down inside one of them.
   A descendant of a display:none ancestor cannot be un-hidden, so the paper comes
   out blank with every value still present in the DOM.

   A real value rendered as nothing, on the sheet a fitter takes to the machine.

   Run: node tests/pdfprint.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const fs = require("fs"), { execFileSync } = require("child_process");
const PORT = Number(process.argv[2] || 8093);
const URL  = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const OUT  = "/tmp/cm-print-test.pdf";

let fail = 0;
const ok = (c, w) => { if (!c) { fail++; console.log("  FAIL  " + w); }
                       else console.log("  PASS  " + w); return c; };

const textOf = f => execFileSync("python3", ["-c", `
import sys, pypdf
r = pypdf.PdfReader(sys.argv[1])
print(len(r.pages))
for p in r.pages: print(p.extract_text() or "")
`, f], { encoding: "utf8" });

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  p.on("pageerror", e => ok(false, "page error: " + e.message));
  await p.goto(URL, { waitUntil: "networkidle" });
  await p.evaluate(() => showTab("lube"));
  await p.waitForTimeout(600);

  for (const which of ["model", "class"]) {
    await p.evaluate(v => { const s = document.getElementById("lpoWhich");
      s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }, which);
    await p.waitForTimeout(400);

    /* Print exactly the way the button does — the class the button adds IS the
       thing under test, so a check that sets up its own DOM proves nothing. */
    await p.evaluate(() => lubePrintPrep());
    await p.waitForTimeout(250);
    await p.pdf({ path: OUT, format: "A3", landscape: true, printBackground: true });
    await p.evaluate(() => lubePrintDone());

    const out = textOf(OUT).split("\n");
    const pages = Number(out[0]);
    const text = out.slice(1).join("\n").replace(/\s+/g, " ").trim();
    console.log(`── the ${which} sheet, printed`);
    ok(pages >= 1, `it makes at least one page: ${pages}`);
    ok(text.length > 200, `there is text on the paper: ${text.length} characters`);
    /* Not just "some text" — the things a fitter reads off it. */
    ok(/BAIMSKAYA/i.test(text), "the site is named");
    ok(/LEMARC|EXSOIL|NEXXOL|TEBOIL|OIL/i.test(text), "a product is named");
    ok(/\d+\s*L|L \/ л/i.test(text), "a capacity is on it");
    if (which === "model")
      ok(/Engine|Двигатель/i.test(text), "a compartment is named");
    else
      ok(/×\d|\d+\s*L/i.test(text), "the fleet counts are on it");
    /* And the screen must NOT come back on the paper with it. */
    ok(!/Export CSV|Save the reference|choose —/i.test(text),
       "the screen's own controls stayed off the paper");
  }
  fs.unlinkSync(OUT);
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nthe sheet survives the printer");
  process.exit(fail ? 1 : 0);
})();
