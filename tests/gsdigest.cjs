/* SHA-256 FOR THE APPS SCRIPT SANDBOX — ONE DEFINITION, SIX CALLERS.

   docs/google-upload.gs now issues a receipt, and a receipt needs a hash. Six
   suites run that script against their own fake Drive, each with its own
   `Utilities` shim, and the moment the script called computeDigest every one of
   them threw "Cannot read properties of undefined (reading 'SHA_256')" — which
   presents as ten files failing to upload, not as a missing test stub.

   Written once here rather than pasted into six shims: a stub duplicated six
   times is six chances for one of them to drift into agreeing with a bug.

   The signedness is the point. Apps Script's Utilities.computeDigest returns
   SIGNED bytes — anything above 127 comes back negative — and the script has to
   fold them back before writing hex. Handing out unsigned bytes here would let
   a wrong fold pass the whole suite and fail only on Google, which is the kind
   of test that is worse than no test. So the shim reproduces the signedness,
   not the intent. */
const crypto = require('crypto');

module.exports = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  computeDigest(alg, bytes) {
    const h = crypto.createHash('sha256')
      .update(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)).digest();
    return Array.from(h).map(v => (v > 127 ? v - 256 : v));
  },
};
