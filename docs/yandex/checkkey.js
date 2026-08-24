/* ============================================================================
   Which of the two things is wrong?

   `SignatureDoesNotMatch` has exactly two causes and the message cannot tell
   them apart:

     1. the secret does not belong to that key id (or has a typo in it)
     2. the region in the signature is not the one this endpoint expects

   Yandex documents ru-central1 for the Russian endpoint and says a different
   value "may lead to an authorization error". It documents nothing at all for
   storage.yandexcloud.kz — so which region the Kazakh endpoint wants is a
   question the documentation does not answer and the error message will not
   either.

   Guessing costs a key rotation and half an hour. This asks the endpoint, once
   per candidate region, with the key already in cm.env, and prints what came
   back for each.

     node checkkey.js                 (reads /opt/cm/cm.env)
     node checkkey.js ./cm.env        (or a path you give it)

   If one region says OK, that is the answer — put it in S3_REGION.
   If every region says SignatureDoesNotMatch, the region is not the problem
   and the secret is: make a new key and take BOTH values from the same screen.
============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || '/opt/cm/cm.env';
let raw;
try { raw = fs.readFileSync(FILE, 'utf8'); }
catch (e) { console.error('Cannot read ' + FILE + ' — try: sudo node ' + __filename); process.exit(1); }

const env = {};
raw.split('\n').forEach(line => {
  const t = line.trim();
  if (!t || t[0] === '#') return;
  const i = t.indexOf('=');
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
});

if (!env.BUCKET || !env.KEY_ID || !env.KEY_SECRET) {
  console.error('BUCKET, KEY_ID and KEY_SECRET must all be set in ' + FILE);
  process.exit(1);
}

/* The configured one first — if it works, nothing needs changing. Then the
   Russian region, because an endpoint that was built from the Russian one may
   simply have kept its signing region. Then the plain country code. */
const tries = [env.S3_REGION || 'kz1', 'ru-central1', 'kz1', 'kz']
  .filter((v, i, a) => v && a.indexOf(v) === i);

const FN = path.join(__dirname, 'function.js');

console.log('\nbucket   ' + env.BUCKET);
console.log('endpoint ' + (env.S3_ENDPOINT || 'storage.yandexcloud.net'));
console.log('key id   ' + env.KEY_ID);
console.log('\nasking the endpoint, once per candidate region:\n');

(async () => {
  let won = null;
  for (const region of tries) {
    Object.keys(env).forEach(k => { process.env[k] = env[k]; });
    process.env.S3_REGION = region;
    /* function.js reads its settings once, at module load, so the cache has to
       go or every attempt would sign with the first region. */
    delete require.cache[require.resolve(FN)];
    let out;
    try { await require(FN)._internals.listAll(''); out = 'OK'; }
    catch (e) {
      const m = String((e && e.message) || e);
      out = /SignatureDoesNotMatch/.test(m) ? 'SignatureDoesNotMatch'
          : /NoSuchBucket|S3 404/.test(m)   ? 'no such bucket'
          : /InvalidAccessKeyId/.test(m)    ? 'no such key id'
          : m.replace(/\s+/g, ' ').slice(0, 70);
    }
    console.log('  ' + region.padEnd(14) + out);
    if (out === 'OK' && !won) won = region;
  }

  console.log('');
  if (won) {
    console.log('→ ' + won + ' is the one. Set it and restart:');
    console.log('    sudo sed -i "s/^S3_REGION=.*/S3_REGION=' + won + '/" ' + FILE);
    console.log('    sudo systemctl restart cm && sleep 2 && curl -s localhost:8080');
  } else {
    console.log('→ No region worked, so the region is not the problem.');
    console.log('  The secret does not match the key id. In the console:');
    console.log('    IAM → Service accounts → cm-function → create a NEW static access key,');
    console.log('  and take the id AND the secret from that one screen — a secret from an');
    console.log('  earlier key with a newer key id fails exactly like this.');
  }
  process.exit(won ? 0 : 2);
})();
