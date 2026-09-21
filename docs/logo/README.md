# The report logo

`baimskaya-logo.png` (253×56, transparent PNG) is the source for the mark
printed on every report masthead, embedded in `mobile/report-core.js` as
`CMR.LOGO_DATA` — a base64 `data:image/png` URI, drawn at 72×16 via
`CMR.LOGO_HTML` — for the same reason the font is embedded rather than linked
(see `docs/fonts/README.md`): the stylesheet this lives in is injected into
two pages in two different directories, and a relative image path would
resolve against whichever one happened to load it.

To replace the logo: drop the new PNG in here, re-run the base64 encode, and
paste the result into `CMR.LOGO_DATA` in `mobile/report-core.js` (next to
`CMR.FONT`). Keep it small — this one is 6.7 kB before encoding — since it
goes on every single page's masthead alongside a font that already costs
13.8 kB a weight.
