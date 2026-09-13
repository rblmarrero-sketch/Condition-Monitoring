# The report font

The PDF report sets its type in **CM Sans**, a subset of the **Liberation Sans**
family (Regular and Bold), embedded in `mobile/report-core.js` as `woff2`
data URIs so that one file carries the whole report — the office page loads
`report-core.js` from `../mobile/`, and a relative font URL inside a stylesheet
injected into that page would resolve against the wrong directory.

**Why a bundled font at all.** The report used to set `system-ui`, which is San
Francisco on an iPhone, Roboto on Android and Segoe UI on the office PC. Three
different sets of glyph widths mean three different line breaks, three
different `fitPage` outcomes and, for a long report, a different page count per
device — for a document senior management read on paper and compare between
sites. Liberation Sans is metric-compatible with Arial, covers Cyrillic in
full, and is 13.8 kB per weight after subsetting.

**Subset** — Latin-1, Latin Extended-A, Cyrillic (U+0400–045F, plus ѐ/ґ/ұ),
the punctuation and symbols the report uses (№, °, ×, ≤, ≥, ✓, →, —). **Keep
`kern`** — the first subset dropped every layout feature and the missing
kerning pairs put a visible gap after every capital T ("T emperature results",
"T erex"), which on a rasterised page reads as a broken font:

```
python3 -m fontTools.subset LiberationSans-<Regular|Bold>.ttf \
  --unicodes="U+0020-007E,U+00A0-00FF,U+0100-017F,U+0192,U+02C6,U+02DC,U+0300-0301,\
U+0400-045F,U+0490-0491,U+04B0-04B1,U+2010-2015,U+2018-201A,U+201C-201E,U+2020-2022,\
U+2026,U+2030,U+2039-203A,U+2044,U+20AC,U+2116,U+2122,U+2190-2193,U+2212,U+2215,\
U+2264-2265,U+25CF,U+2713,U+00B0,U+00B7,U+00D7" \
  --layout-features="kern,liga,rlig" --no-hinting --desubroutinize --flavor=woff2 \
  --output-file=lib-<Regular|Bold>.woff2
```

**Licence.** SIL Open Font License 1.1 — `OFL.txt` in this folder. Digitized
data copyright (c) 2010 Google Corporation; copyright (c) 2012 Red Hat, Inc.,
with Reserved Font Name "Liberation". The OFL forbids a modified version from
carrying a reserved name, which is why the embedded subset is called
**CM Sans** and not Liberation Sans.
