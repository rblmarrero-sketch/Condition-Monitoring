/* Where Playwright lives — and the guard every suite gets with it.

   The dev container installs it globally; a laptop that ran `npm i -D
   playwright` has it in node_modules. Every suite asked for the container's
   absolute path, so none of them ran anywhere else. pw-guard.cjs resolves it
   instead, and this file hands back the guard's path, so every
   `require(require('./pw.cjs'))` gets Playwright with the production
   backends unreachable (see pw-guard.cjs). CM_PW_UNGUARDED=1 hands back the
   bare module, for the rare hand-run script that means to look at live. */
module.exports = process.env.CM_PW_UNGUARDED === '1'
  ? require('./pw-guard.cjs').REAL
  : require.resolve('./pw-guard.cjs');
