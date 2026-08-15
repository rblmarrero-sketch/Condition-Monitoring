/* Where Playwright lives.

   The dev container installs it globally; a laptop that ran `npm i -D
   playwright` has it in node_modules. Every suite asked for the container's
   absolute path, so none of them ran anywhere else. Resolve it instead. */
const CANDIDATES = ['playwright', '/opt/node22/lib/node_modules/playwright'];
for (const c of CANDIDATES) {
  try { require.resolve(c); module.exports = c; break; } catch (e) { /* next */ }
}
if (!module.exports) {
  throw new Error('Playwright not found. Install it with:  npm i -D playwright\n' +
                  'Looked for: ' + CANDIDATES.join(', '));
}
