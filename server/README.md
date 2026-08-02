# The backend

Four endpoints and a schema. Not a framework — the dependency would be more code than the
server.

```
POST /v1/push          rounds and markers, batched, idempotent
GET  /v1/pull?cursor=  everything since a cursor, in order
POST /v1/photos/:id    the bytes for one photograph
GET  /v1/events        server-sent events, so the dashboard stops polling
GET  /v1/health        no token needed
```

## Running it

```bash
createdb cm
psql cm -f server/schema.sql
DATABASE_URL=postgresql://user@host/cm PORT=8787 node server/api.js
```

Register a site and a phone:

```sql
INSERT INTO site (id, name, tz) VALUES ('baim', 'Baimskaya', 'Asia/Kamchatka');

-- token_hash is sha256 of the token. Generate the token, hash it, store the
-- hash, hand the token to the phone once, and never store it anywhere else.
--   node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" <token>
INSERT INTO device (id, site_id, label, token_hash)
VALUES ('PH-07', 'baim', 'Petrov', '<sha256>');
```

Point the dashboard at it: `cm_api_url` and `cm_api_token` in localStorage, and
`CMSync.pick()` chooses the server over Drive automatically.

---

## The four rules that make it correct

Everything here is about what happens when the network misbehaves, because on a pit link it
always does.

**1. The phone owns identity.** Every round gets its id and rev on the device, at save,
before anything is online. The server never mints an id the phone needs — the moment it
does, capture stops working out of signal. That makes every write idempotent by
construction: the same round pushed twice is one row.

The case this is really for: the server commits, the reply is lost, the phone retries. It
must not create a second round, and it must not be told "accepted" for something the server
is actually behind on. A retry comes back as `stale`, with the revision the server holds.

**2. A captured round is never rewritten.** A higher rev supersedes; the old row stays,
marked. So "what did the phone actually send, and when" survives every correction. A
correction, a void or a conflict resolution is a `marker` row, layered at read time — the
same model the Drive version uses, and for the same reason: the phone still holds the round
it captured, and a re-sync would overwrite anything written into it.

**3. One cursor, shared.** `round.seq` and `marker.seq` draw from the same sequence.

This is worth stating because getting it wrong is invisible: a `bigserial` on each table
looks identical and makes two independent counters, so a correction written at marker-seq 1
is never seen by a client whose cursor sits at round-seq 6, and the dashboard shows an
uncorrected round forever. It is a sequence rather than a timestamp because two rows can
share a millisecond and a client resuming on a timestamp would skip one.

**4. The record goes first, the photographs follow.** A push announces its photographs and
claims their slots; the bytes are uploaded separately. A 2 KB record makes a Critical
finding visible in seconds while 12 MB of images are still climbing out of the pit, and the
dashboard can honestly say "three photographs, still coming" rather than showing a round
that looks like it has none.

---

## What it does that Drive cannot

| | Drive | Server |
|---|---|---|
| Identity | one shared secret, every phone the same | one token per device, revocable alone |
| A lost phone | rotate the secret on every phone | revoke one row |
| Push | impossible — nothing can call a web page | SSE, seconds not minutes |
| Conflicts | resolved by hand in the dashboard | still by hand, but recorded server-side and shared |
| Rate limit | ~90 min/day of Apps Script on a consumer account | none |
| Listing cost | O(files) — degrades at 100,000 photographs | indexed |
| Audit | the deletion log only | every request, including refusals |

**Drive is not deprecated.** A site whose IT blocks everything but a browser can run the
whole system from a shared folder, and keeping that working is a feature, not legacy. The
`SyncAdapter` seam in `dashboard/sync-adapter.js` is what lets both be true.

---

## Storage for the photographs

`memoryStore()` is the default and is for tests. The interface is three methods —
`put`, `get`, `del` — because where the images live is the decision most likely to change:
a bucket today, the client's own NAS the moment their security team asks. Everything above
that line stays the same when it does.

For production, implement the same three methods against S3, MinIO, or a directory.

---

## What is deliberately not here

- **No ORM and no migration tool.** One schema file, and it is readable in one sitting.
  When there is a second version of it, add `node-pg-migrate`; not before.
- **No user accounts.** Devices authenticate, people are named on records. Adding logins
  changes the offline story, and the offline story is the product.
- **No photograph processing.** The phone already shrinks them; doing it twice loses detail
  a fitter needs.
- **No 1C integration.** That is its own contract, deliberately — see
  `docs/MOBILE-APP-PLAN.md` §8. This server is where it will attach.

---

## Testing

`backend.cjs` in the scratchpad runs against a real Postgres, not a mock. The interesting
cases — a push that times out after the server committed, an older revision arriving late,
two phones racing, a marker landing before its round, a batch that half-fails — are only
interesting against something that can actually roll back.

Two real bugs came out of it that a mock would have hidden: `id` as a lone primary key made
the first correction unstorable, and the two `bigserial` columns silently broke the shared
cursor.
