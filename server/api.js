/* Condition Monitoring — the sync API.
   ===========================================================================
   Four verbs, and the whole design is in how they behave when the network
   misbehaves, because on a pit link the network always misbehaves.

     POST /v1/push          rounds and markers, in a batch, idempotent
     GET  /v1/pull?cursor=  everything since a cursor, in order
     POST /v1/photos/:id    the bytes for one photograph, resumable
     GET  /v1/events        server-sent events, so the dashboard stops polling

   The rules that make it correct:

   · The phone owns identity. It issues the id and the rev at capture, before
     anything is online. The server never mints an id the phone needs — the
     moment it does, capture stops working out of signal. Every write is
     therefore idempotent by construction: pushing the same round twice is one
     row, and a retry after a timeout cannot duplicate anything.

   · A captured round is never rewritten. A higher rev supersedes rather than
     overwrites, so "what did the phone actually send, and when" survives.

   · The cursor is a sequence, not a timestamp. Two rows can share a
     millisecond, and a client resuming on a timestamp would skip one of them.

   · Records go before photographs. The record is 2 KB and makes a Critical
     finding visible in seconds; the images are megabytes and can follow.

   No framework: it is four endpoints, and the dependency would be more code
   than the server. */
"use strict";

const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");

const MAX_BODY = 8 * 1024 * 1024;          // a batch of records, never photos
const MAX_PHOTO = 24 * 1024 * 1024;

function sha256(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }

/* ---- storage for the bytes -------------------------------------------------
   An interface, not an S3 client. The photographs are the only part of this
   system with real volume, and where they live is the decision most likely to
   change — a bucket today, the client's own NAS the moment their security team
   asks. Everything above this line stays the same when it does. */
function memoryStore() {
  const m = new Map();
  return {
    async put(key, buf) { m.set(key, buf); return key; },
    async get(key) { return m.get(key) || null; },
    async del(key) { m.delete(key); },
    async size() { return m.size; },
  };
}

function createApp(opts) {
  const pool = opts.pool;
  const store = opts.store || memoryStore();
  const sse = new Set();                    // live dashboards

  /* ---- who is asking --------------------------------------------------------
     One token per device, hashed at rest, revocable on its own. This is the
     thing the Drive version cannot do: today every phone carries the same
     secret, so a phone left in a crib room means rotating it on all of them. */
  async function auth(req) {
    const h = String(req.headers.authorization || "");
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (!m) return null;
    const { rows } = await pool.query(
      `SELECT id, site_id, scopes FROM device
        WHERE token_hash=$1 AND revoked_at IS NULL`, [sha256(m[1])]);
    if (!rows.length) return null;
    pool.query(`UPDATE device SET last_seen_at=now() WHERE id=$1`, [rows[0].id]).catch(() => {});
    return rows[0];
  }

  async function log(site, actor, action, subject, detail, ok) {
    try {
      await pool.query(
        `INSERT INTO audit (site_id, actor, action, subject, detail, ok)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [site || null, actor || null, action, subject || null, detail || {}, ok !== false]);
    } catch (e) { /* the audit trail must never be what fails a request */ }
  }

  /* ---- push -----------------------------------------------------------------
     Everything in one transaction: a batch either lands or it does not, so a
     phone that times out halfway can resend the whole thing without wondering
     which half arrived. */
  async function push(dev, body) {
    const rounds = Array.isArray(body.rounds) ? body.rounds : [];
    const markers = Array.isArray(body.markers) ? body.markers : [];
    const photos = Array.isArray(body.photos) ? body.photos : [];
    const out = { accepted: [], superseded: [], stale: [], photos: [], errors: [] };

    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      for (const r of rounds) {
        if (!r || !r.id) { out.errors.push({ id: null, error: "missing id" }); continue; }
        const rev = Number(r.rev || 1);
        const { rows: prev } = await c.query(
          `SELECT rev FROM round WHERE id=$1 AND superseded_at IS NULL FOR UPDATE`, [r.id]);

        if (prev.length && Number(prev[0].rev) >= rev) {
          /* Already have this, or something newer. Not an error — it is what a
             retry looks like, and answering "accepted" would tell the phone to
             forget a round the server is actually behind on. */
          out.stale.push({ id: r.id, have: Number(prev[0].rev), sent: rev });
          continue;
        }
        if (prev.length) {
          await c.query(
            `UPDATE round SET superseded_at=now() WHERE id=$1 AND superseded_at IS NULL`, [r.id]);
          out.superseded.push(r.id);
        }
        await c.query(
          `INSERT INTO round (id, site_id, rev, unit_code, insp_type, insp_date, cls, smu,
                              captured_by, verified_by, device, gps, signed, items, captured_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [r.id, dev.site_id, rev, r.equip, r.type || "MP", r.date, r.cls || null,
           r.smu || null, r.by || null, r.sup || null, r.dev || dev.id,
           r.gps ? JSON.stringify(r.gps) : null, !!r.signed,
           JSON.stringify(r.items || []), r.capturedAt || null]);
        out.accepted.push(r.id);
      }

      for (const m of markers) {
        if (!m || !m.roundId || !m.kind) { out.errors.push({ id: m && m.id, error: "bad marker" }); continue; }
        await c.query(
          `INSERT INTO marker (site_id, round_id, kind, payload, reason, by_name)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [dev.site_id, m.roundId, m.kind, JSON.stringify(m.payload || {}),
           m.reason || null, m.by || dev.id]);
      }

      /* Photographs are announced here and uploaded separately. The slot is
         claimed first so the dashboard can say "3 photographs, still coming"
         rather than showing a round that looks like it has none. */
      for (const p of photos) {
        if (!p || !p.id || !p.roundId || !p.itemKey) { out.errors.push({ id: p && p.id, error: "bad photo" }); continue; }
        await c.query(
          `INSERT INTO photo (id, site_id, round_id, item_key, ord, filename, content_type, bytes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO NOTHING`,
          [p.id, dev.site_id, p.roundId, p.itemKey, Number(p.ord || 1),
           p.filename || (p.id + ".jpg"), p.contentType || "image/jpeg", p.bytes || null]);
        out.photos.push(p.id);
      }

      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally { c.release(); }

    if (out.accepted.length || markers.length) {
      emit(dev.site_id, { type: "changed", rounds: out.accepted.length, markers: markers.length });
    }
    log(dev.site_id, dev.id, "push", null,
      { rounds: out.accepted.length, stale: out.stale.length, markers: markers.length }, true);
    return out;
  }

  /* ---- pull -----------------------------------------------------------------
     Rounds and markers share one cursor space so a client cannot end up with a
     correction it has no round for. */
  async function pull(dev, q) {
    const cursor = Number(q.get("cursor") || 0) || 0;
    const limit = Math.min(Number(q.get("limit") || 500) || 500, 2000);

    const r = await pool.query(
      `SELECT id, rev, unit_code, insp_type, insp_date, cls, smu, captured_by, verified_by,
              device, gps, signed, items, captured_at, superseded_at, seq
         FROM round WHERE site_id=$1 AND seq>$2 ORDER BY seq LIMIT $3`,
      [dev.site_id, cursor, limit]);
    const m = await pool.query(
      `SELECT id, round_id, kind, payload, reason, by_name, at, seq
         FROM marker WHERE site_id=$1 AND seq>$2 ORDER BY seq LIMIT $3`,
      [dev.site_id, cursor, limit]);
    const ph = await pool.query(
      `SELECT p.id, p.round_id, p.item_key, p.ord, p.filename, p.storage_key IS NOT NULL AS ready
         FROM photo p JOIN round rd ON rd.id=p.round_id
        WHERE p.site_id=$1 AND rd.seq>$2 ORDER BY rd.seq LIMIT $3`,
      [dev.site_id, cursor, limit]);

    const next = Math.max(
      cursor,
      r.rows.length ? Number(r.rows[r.rows.length - 1].seq) : cursor,
      m.rows.length ? Number(m.rows[m.rows.length - 1].seq) : cursor);

    return {
      ok: true,
      cursor: next,
      more: r.rows.length === limit || m.rows.length === limit,
      rounds: r.rows.map(x => ({
        id: x.id, rev: x.rev, equip: x.unit_code, type: x.insp_type,
        date: x.insp_date instanceof Date ? x.insp_date.toISOString().slice(0, 10) : x.insp_date,
        cls: x.cls || "", smu: x.smu || "", by: x.captured_by || "", sup: x.verified_by || "",
        dev: x.device || "", gps: x.gps, signed: !!x.signed, items: x.items,
        superseded: !!x.superseded_at,
      })),
      markers: m.rows.map(x => ({
        roundId: x.round_id, kind: x.kind, payload: x.payload,
        reason: x.reason, by: x.by_name, at: x.at,
      })),
      photos: ph.rows.map(x => ({
        id: x.id, roundId: x.round_id, itemKey: x.item_key, ord: x.ord,
        filename: x.filename, ready: x.ready,
      })),
    };
  }

  /* ---- the bytes ------------------------------------------------------------
     Separate from push so a Critical finding is on the dashboard while its
     photographs are still climbing out of the pit. Idempotent for the same
     reason everything else is: a re-upload overwrites its own slot. */
  async function putPhoto(dev, id, buf, contentType) {
    const { rows } = await pool.query(
      `SELECT id, round_id FROM photo WHERE id=$1 AND site_id=$2`, [id, dev.site_id]);
    if (!rows.length) return { ok: false, error: "unknown photo id — announce it in a push first" };
    const key = dev.site_id + "/" + rows[0].round_id + "/" + id;
    await store.put(key, buf);
    await pool.query(
      `UPDATE photo SET storage_key=$1, bytes=$2, content_type=$3, uploaded_at=now()
        WHERE id=$4`, [key, buf.length, contentType || "image/jpeg", id]);
    emit(dev.site_id, { type: "photo", id: id, roundId: rows[0].round_id });
    return { ok: true, id: id, bytes: buf.length };
  }

  /* ---- live ----------------------------------------------------------------
     The dashboard polls every three minutes today because a page cannot be
     pushed to over Drive. Here it can: one event, and the dashboard pulls the
     delta. Seconds instead of minutes, and the poll stays as a backstop for a
     proxy that eats the stream. */
  function emit(siteId, data) {
    const line = "data: " + JSON.stringify(data) + "\n\n";
    for (const c of sse) if (c.site === siteId) { try { c.res.write(line); } catch (e) {} }
  }

  // ---- plumbing --------------------------------------------------------------
  function json(res, code, obj) {
    const b = Buffer.from(JSON.stringify(obj));
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": b.length,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    res.end(b);
  }
  function readBody(req, cap) {
    return new Promise((resolve, reject) => {
      const chunks = []; let n = 0;
      req.on("data", d => {
        n += d.length;
        if (n > cap) { reject(new Error("payload too large")); req.destroy(); return; }
        chunks.push(d);
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "authorization,content-type",
        "Access-Control-Max-Age": "86400",
      });
      return res.end();
    }

    if (u.pathname === "/v1/health") {
      try { await pool.query("SELECT 1"); return json(res, 200, { ok: true }); }
      catch (e) { return json(res, 503, { ok: false, error: "database unreachable" }); }
    }

    const dev = await auth(req).catch(() => null);
    if (!dev) {
      log(null, null, "auth", u.pathname, {}, false);
      return json(res, 401, { ok: false, error: "a device token is required" });
    }

    try {
      if (req.method === "POST" && u.pathname === "/v1/push") {
        const raw = await readBody(req, MAX_BODY);
        let body; try { body = JSON.parse(raw.toString("utf8")); }
        catch (e) { return json(res, 400, { ok: false, error: "body is not JSON" }); }
        return json(res, 200, Object.assign({ ok: true }, await push(dev, body)));
      }

      if (req.method === "GET" && u.pathname === "/v1/pull") {
        return json(res, 200, await pull(dev, u.searchParams));
      }

      const pm = /^\/v1\/photos\/([A-Za-z0-9._~-]+)$/.exec(u.pathname);
      if (pm && req.method === "POST") {
        const buf = await readBody(req, MAX_PHOTO);
        const r = await putPhoto(dev, pm[1], buf, req.headers["content-type"]);
        return json(res, r.ok ? 200 : 404, r);
      }
      if (pm && req.method === "GET") {
        const { rows } = await pool.query(
          `SELECT storage_key, content_type FROM photo WHERE id=$1 AND site_id=$2`,
          [pm[1], dev.site_id]);
        if (!rows.length || !rows[0].storage_key) return json(res, 404, { ok: false, error: "not uploaded yet" });
        const buf = await store.get(rows[0].storage_key);
        if (!buf) return json(res, 404, { ok: false, error: "missing from storage" });
        res.writeHead(200, { "Content-Type": rows[0].content_type, "Content-Length": buf.length,
          "Access-Control-Allow-Origin": "*", "Cache-Control": "private, max-age=31536000, immutable" });
        return res.end(buf);
      }

      if (req.method === "GET" && u.pathname === "/v1/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",              // nginx would buffer the stream away
          "Access-Control-Allow-Origin": "*",
        });
        res.write("retry: 5000\n\n");
        const c = { res, site: dev.site_id };
        sse.add(c);
        /* A comment every 25 s. Proxies and mobile networks close a stream that
           says nothing, and a silently dead stream is worse than no stream —
           the dashboard would sit there believing it is live. */
        const ka = setInterval(() => { try { res.write(": ka\n\n"); } catch (e) {} }, 25000);
        req.on("close", () => { clearInterval(ka); sse.delete(c); });
        return;
      }

      return json(res, 404, { ok: false, error: "no such endpoint" });
    } catch (e) {
      log(dev.site_id, dev.id, "error", u.pathname, { message: String(e && e.message || e) }, false);
      return json(res, 500, { ok: false, error: String(e && e.message || e) });
    }
  });

  return { server, pool, store, emit, _push: push, _pull: pull, sseCount: () => sse.size };
}

module.exports = { createApp, memoryStore, sha256 };

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const app = createApp({ pool });
  const port = Number(process.env.PORT || 8787);
  app.server.listen(port, () => console.log("condition-monitoring api on " + port));
}
