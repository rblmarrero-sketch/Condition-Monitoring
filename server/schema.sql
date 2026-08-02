-- Condition Monitoring — the backend schema.
--
-- Two ideas run through all of it.
--
-- 1. THE PHONE OWNS IDENTITY. Every round is given an id and a rev on the
--    device, at save, before anything is online. The server never mints an id
--    that the phone needs, because the moment it does, capture stops working
--    out of signal. That makes every write idempotent by construction: the same
--    round pushed twice is one row, and a retry after a timeout — the normal
--    case on a pit link — cannot duplicate anything.
--
-- 2. A CAPTURED RECORD IS NEVER REWRITTEN. Corrections, voids and conflict
--    resolutions are their own rows, layered at read time. This is already how
--    the Drive version works and it is not an accident: the phone still holds
--    the round it captured, and a re-sync would overwrite anything written into
--    it. It also means the audit trail is the storage model rather than a thing
--    bolted on beside it.

BEGIN;

-- ONE cursor for the whole site, shared by rounds and markers.
--
-- A bigserial on each table looks like the same thing and is not: it makes two
-- independent counters, so a correction written at marker-seq 1 is invisible to
-- a client whose cursor is at round-seq 6, and the dashboard shows an
-- uncorrected round forever. The two streams have to be interleaved in one
-- order, or "everything since X" cannot mean anything.
CREATE SEQUENCE IF NOT EXISTS change_seq;

CREATE TABLE IF NOT EXISTS site (
  id           text PRIMARY KEY,               -- 'baimskaya'
  name         text NOT NULL,
  tz           text NOT NULL DEFAULT 'UTC',    -- rounds are stamped in local time
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Who captured it. Not an auth table: authentication is the API's problem, this
-- is the name that has to appear on a report years later, whether or not the
-- person still has a login.
CREATE TABLE IF NOT EXISTS inspector (
  id           text PRIMARY KEY,
  site_id      text NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  name         text NOT NULL,
  code_1c      text,                           -- табельный номер, when 1C is wired up
  active       boolean NOT NULL DEFAULT true
);

-- The asset register, as the app already knows it. Mirrored here so the phones
-- can be handed a delta instead of a new build every time a machine arrives.
CREATE TABLE IF NOT EXISTS unit (
  site_id      text NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  code         text NOT NULL,                  -- 'TK151' — what is painted on it
  category     text,                           -- 'TRUCK, DUMP'
  model        text,
  cls          text,
  code_1c      text,                           -- their Объект ремонта code
  retired_at   date,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, code)
);
CREATE INDEX IF NOT EXISTS unit_updated ON unit (site_id, updated_at);

-- ── the round ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS round (
  -- Issued by the phone, never here. NOT the primary key on its own: a
  -- correction keeps the id and raises the rev, and both rows stay, so the
  -- pair is what is unique. Making id alone the key looks right until the
  -- first correction, which then cannot be stored at all.
  id           text NOT NULL,
  site_id      text NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  rev          integer NOT NULL DEFAULT 1,
  unit_code    text NOT NULL,
  insp_type    text NOT NULL,                  -- MP | FC | INSP | TEMP | UC
  insp_date    date NOT NULL,
  cls          text,
  smu          text,
  captured_by  text,                           -- the name as typed, not a FK:
  verified_by  text,                           -- a report must still read right
  device       text,                           -- when somebody has left
  gps          jsonb,
  signed       boolean NOT NULL DEFAULT false,

  -- The whole finding set, as the phone shaped it. Kept whole rather than
  -- shredded into columns because the app's item shape is the contract both
  -- ends and the report engine already share; splitting it here would create a
  -- third shape to keep in step, and that is how the two ends drift apart.
  items        jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Set when a later revision of the same id arrives. The old row is kept, so
  -- "what did the phone actually send, and when" survives a correction.
  superseded_at timestamptz,

  captured_at  timestamptz,                    -- when the inspector saved it
  received_at  timestamptz NOT NULL DEFAULT now(),
  -- What a cursor pull walks. A sequence rather than a timestamp because two
  -- rows can share a millisecond and a client resuming on a timestamp would
  -- skip one of them; and the SAME sequence as marker.seq, so the two streams
  -- interleave in one order.
  seq          bigint NOT NULL DEFAULT nextval('change_seq'),
  PRIMARY KEY (id, rev)
);
-- Exactly one live revision per round, enforced rather than assumed: the
-- alternative is two rows both claiming to be current after a race between
-- two pushes of the same correction, and every reader silently picking a
-- different one.
CREATE UNIQUE INDEX IF NOT EXISTS round_live_one
  ON round (id) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS round_cursor  ON round (site_id, seq);
CREATE INDEX IF NOT EXISTS round_unit    ON round (site_id, unit_code, insp_date DESC);
CREATE INDEX IF NOT EXISTS round_live    ON round (site_id, insp_date DESC) WHERE superseded_at IS NULL;
-- Two phones inspecting one unit on one day is legal and must stay legal — it
-- is a clash for a person to settle, not a constraint violation that loses one
-- of them. So this is an index, not a unique key.
CREATE INDEX IF NOT EXISTS round_natural ON round (site_id, unit_code, insp_date, insp_type);

-- ── what happened to it afterwards ───────────────────────────────────────────
-- One row per decision, never an update to the round. A void is reversible
-- because un-voiding is just the next marker.
CREATE TABLE IF NOT EXISTS marker (
  id           bigserial PRIMARY KEY,
  site_id      text NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  round_id     text NOT NULL,                  -- not a FK: a marker may arrive
                                               -- before the round it describes
  kind         text NOT NULL CHECK (kind IN ('correction','void','unvoid','resolve','delete')),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason       text,
  by_name      text NOT NULL,
  at           timestamptz NOT NULL DEFAULT now(),
  seq          bigint NOT NULL DEFAULT nextval('change_seq')   -- shared, see above
);
CREATE INDEX IF NOT EXISTS marker_cursor ON marker (site_id, seq);
CREATE INDEX IF NOT EXISTS marker_round  ON marker (site_id, round_id, at);

-- ── photographs ──────────────────────────────────────────────────────────────
-- The bytes live in object storage; this is the index. Separate from the round
-- so a 2 KB record can be visible in seconds while 12 MB of images follow.
CREATE TABLE IF NOT EXISTS photo (
  id           text PRIMARY KEY,               -- also phone-issued
  site_id      text NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  round_id     text NOT NULL,
  item_key     text NOT NULL,                  -- '4C', 'IDLER.L', 'DRS.ENG'
  ord          integer NOT NULL DEFAULT 1,     -- 1..4
  filename     text NOT NULL,                  -- the agreed name, for humans
  content_type text NOT NULL DEFAULT 'image/jpeg',
  bytes        integer,
  storage_key  text,                           -- null until the bytes arrive
  uploaded_at  timestamptz,
  received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photo_round ON photo (site_id, round_id);
CREATE UNIQUE INDEX IF NOT EXISTS photo_slot ON photo (site_id, round_id, item_key, ord);

-- ── the audit trail ──────────────────────────────────────────────────────────
-- Append-only, and deliberately not derivable from the tables above: it records
-- attempts, including the ones that were refused.
CREATE TABLE IF NOT EXISTS audit (
  id           bigserial PRIMARY KEY,
  site_id      text,
  at           timestamptz NOT NULL DEFAULT now(),
  actor        text,
  action       text NOT NULL,
  subject      text,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ok           boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS audit_at ON audit (at DESC);

-- ── device credentials ───────────────────────────────────────────────────────
-- One token per phone, revocable. This is the thing the Drive version cannot
-- do: today every phone shares one secret, so a lost phone means changing the
-- secret on all of them.
CREATE TABLE IF NOT EXISTS device (
  id           text PRIMARY KEY,               -- 'PH-07'
  site_id      text NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  label        text,
  token_hash   text NOT NULL,                  -- sha256, never the token itself
  scopes       text[] NOT NULL DEFAULT ARRAY['push','pull'],
  revoked_at   timestamptz,
  last_seen_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMIT;
