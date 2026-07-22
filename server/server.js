// server.js — Llamita backend: permanent storage + JSON API + static hosting.
// Zero npm dependencies: uses Node's built-in http, crypto and node:sqlite.
//
//   Run:      node server/server.js
//   Open:     http://localhost:8080
//   Database: server/llamita.db  (SQLite file — back this up)
//
// Env vars (all optional):
//   PORT                    port to listen on            (default 8080)
//   LLAMITA_DB              path to the SQLite file      (default server/llamita.db)
//   LLAMITA_ADMIN_EMAIL     platform-owner login         (default admin@llamita.bo)
//   LLAMITA_ADMIN_PASSWORD  platform-owner password      (default llamita2026 — CHANGE IN PRODUCTION)
//
// Email verification — codes are sent via Brevo's HTTP API (preferred; works
// on hosts that block outbound SMTP, e.g. Railway) or SMTP. With neither
// configured, codes are printed to this console instead (development mode).
//
//   Brevo HTTP API (recommended):
//   LLAMITA_BREVO_API_KEY   transactional API key from brevo.com
//   LLAMITA_BREVO_SENDER    verified sender email (e.g. tucorreo@gmail.com)
//   LLAMITA_BREVO_NAME      sender display name          (default "Llamita")
//
//   SMTP (fallback):
//   LLAMITA_SMTP_HOST       e.g. smtp.gmail.com
//   LLAMITA_SMTP_PORT       465 = TLS directo, otherwise STARTTLS (default 587)
//   LLAMITA_SMTP_USER       SMTP login (e.g. tucorreo@gmail.com)
//   LLAMITA_SMTP_PASS       SMTP password (Gmail: an "app password")
//   LLAMITA_SMTP_FROM       From address                 (default SMTP_USER)

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..'); // static app (index.html, src/, vendor/)
const DB_PATH = process.env.LLAMITA_DB || path.join(__dirname, 'llamita.db');
const PORT = Number(process.env.PORT) || 8080;
const ADMIN_EMAIL = (process.env.LLAMITA_ADMIN_EMAIL || 'admin@llamita.bo').toLowerCase();
const ADMIN_PASSWORD = process.env.LLAMITA_ADMIN_PASSWORD || 'llamita2026';
const MAX_EVENTS = 20000;

const BREVO = {
  apiKey: process.env.LLAMITA_BREVO_API_KEY || '',
  sender: process.env.LLAMITA_BREVO_SENDER || '',
  name: process.env.LLAMITA_BREVO_NAME || 'Llamita',
};
const BREVO_ENABLED = Boolean(BREVO.apiKey && BREVO.sender);

const SMTP = {
  host: process.env.LLAMITA_SMTP_HOST || '',
  port: Number(process.env.LLAMITA_SMTP_PORT) || 587,
  user: process.env.LLAMITA_SMTP_USER || '',
  pass: process.env.LLAMITA_SMTP_PASS || '',
  from: process.env.LLAMITA_SMTP_FROM || process.env.LLAMITA_SMTP_USER || '',
};
const SMTP_ENABLED = Boolean(SMTP.host && SMTP.user && SMTP.pass);

// True when the server can actually deliver mail (vs. dev-mode console print).
const MAIL_ENABLED = BREVO_ENABLED || SMTP_ENABLED;
const CODE_TTL_MS = 10 * 60 * 1000;   // verification code lifetime
const RESEND_COOLDOWN_MS = 60 * 1000; // min. gap between emails to one signup
const MAX_CODE_ATTEMPTS = 5;

// Verification uploads (operator ID docs + lot photos). Files live on disk
// beside the DB (the Railway volume); only references are stored in SQLite.
const UPLOAD_DIR = process.env.LLAMITA_UPLOADS || path.join(path.dirname(DB_PATH), 'uploads');
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;             // per photo
const UPLOAD_PURPOSES = ['id_front', 'id_back', 'selfie', 'business', 'lot_photo'];
const MIN_LOT_PHOTOS = 3;
// Listing-identity fields — an operator may only change these on an existing
// lot through the admin-reviewed edit flow, never by pushing state directly.
const GATED_LOT_FIELDS = ['name', 'address', 'lat', 'lng', 'total', 'terrain', 'covered', 'keyRequired', 'security', 'hours'];
// Operational fields an operator may change live (no review): occupancy + price.
const OPERATIONAL_LOT_FIELDS = ['occupied', 'fees', 'payment'];
// One-time data wipe: set LLAMITA_RESET_DATA to a unique token to erase all
// users/lots/events on next boot. Idempotent per token value (runs once).
const RESET_TOKEN = process.env.LLAMITA_RESET_DATA || '';

// ─────────── Database ───────────
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL,
    initials      TEXT,
    phone         TEXT,
    business      TEXT,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pending_signups (
    id           TEXT PRIMARY KEY,
    email        TEXT UNIQUE NOT NULL,
    code_hash    TEXT NOT NULL,
    code_salt    TEXT NOT NULL,
    payload      TEXT NOT NULL,
    attempts     INTEGER NOT NULL DEFAULT 0,
    expires_at   TEXT NOT NULL,
    last_sent_at TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tokens (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    role       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_state (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    data    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id        TEXT PRIMARY KEY,
    ts        TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    user_name TEXT NOT NULL,
    role      TEXT NOT NULL,
    type      TEXT NOT NULL,
    meta      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);
  -- Uploaded verification media (id docs, selfies, lot photos). Bytes live on
  -- disk at UPLOAD_DIR/<id>.<ext>; this table only tracks ownership + metadata.
  CREATE TABLE IF NOT EXISTS uploads (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL,
    purpose    TEXT NOT NULL,
    ext        TEXT NOT NULL,
    mime       TEXT NOT NULL,
    bytes      INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_uploads_owner ON uploads (owner_id);
  -- Server-authoritative per-lot verification. This — not the app_state blob —
  -- is the source of truth for whether a lot may appear on the driver map.
  CREATE TABLE IF NOT EXISTS lot_verifications (
    lot_id       TEXT PRIMARY KEY,
    owner_id     TEXT NOT NULL,
    status       TEXT NOT NULL,          -- pending | approved | rejected
    address      TEXT,
    photo_ids    TEXT NOT NULL DEFAULT '[]',
    submitted_at TEXT NOT NULL,
    reviewed_at  TEXT,
    reviewed_by  TEXT,
    reject_reason TEXT
  );
  -- Proposed edits to an approved lot's listing details. The live lot keeps its
  -- current details until an admin approves the edit (then changes are applied).
  CREATE TABLE IF NOT EXISTS lot_edits (
    id            TEXT PRIMARY KEY,
    lot_id        TEXT NOT NULL,
    owner_id      TEXT NOT NULL,
    changes       TEXT NOT NULL,          -- JSON of proposed gated-field values
    photo_ids     TEXT NOT NULL DEFAULT '[]',
    status        TEXT NOT NULL,          -- pending | approved | rejected
    submitted_at  TEXT NOT NULL,
    reviewed_at   TEXT,
    reviewed_by   TEXT,
    reject_reason TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_lot_edits_status ON lot_edits (status);
  CREATE TABLE IF NOT EXISTS system_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
db.prepare(`INSERT OR IGNORE INTO app_state (id, version, data)
            VALUES (1, 0, '{"lots":[],"sessions":[],"history":[]}')`).run();

// ─────────── Schema migration (no framework — guarded ALTER TABLE) ───────────
// Adds operator-verification columns to an existing `users` table. Safe to run
// repeatedly: only adds a column when it isn't already present.
(function migrateUsers() {
  const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map(c => c.name));
  const add = (name, decl) => { if (!cols.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${decl}`); };
  add('verif_status', "TEXT NOT NULL DEFAULT 'unsubmitted'"); // unsubmitted|pending|approved|rejected
  add('verif_submitted_at', 'TEXT');
  add('verif_reviewed_at', 'TEXT');
  add('verif_reviewed_by', 'TEXT');
  add('verif_reject_reason', 'TEXT');
  add('id_front_upload', 'TEXT');
  add('id_back_upload', 'TEXT');
  add('selfie_upload', 'TEXT');
  add('business_upload', 'TEXT');
})();

// ─────────── One-time data reset (LLAMITA_RESET_DATA) ───────────
// Wipes all accounts, lots, events and uploaded media. Runs at most once per
// distinct token value, so leaving the env var set won't re-wipe future data.
(function maybeResetData() {
  if (!RESET_TOKEN) return;
  const applied = db.prepare("SELECT value FROM system_meta WHERE key = 'reset_token'").get();
  if (applied && applied.value === RESET_TOKEN) return;
  db.exec(`
    DELETE FROM users;
    DELETE FROM tokens;
    DELETE FROM pending_signups;
    DELETE FROM events;
    DELETE FROM uploads;
    DELETE FROM lot_verifications;
    DELETE FROM lot_edits;
    UPDATE app_state SET version = 0, data = '{"lots":[],"sessions":[],"history":[]}' WHERE id = 1;
  `);
  try {
    if (fs.existsSync(UPLOAD_DIR)) {
      for (const f of fs.readdirSync(UPLOAD_DIR)) { try { fs.unlinkSync(path.join(UPLOAD_DIR, f)); } catch (e) {} }
    }
  } catch (e) {}
  db.prepare(`INSERT INTO system_meta (key, value) VALUES ('reset_token', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(RESET_TOKEN);
  console.log(`[llamita] LLAMITA_RESET_DATA aplicado (token ${RESET_TOKEN}): datos borrados, empezando de cero.`);
})();

// Ensure the upload directory exists.
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {}

// ─────────── Helpers ───────────
const uid = (p) => `${p}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
const nowIso = () => new Date().toISOString();

const hashPassword = (password, salt) =>
  crypto.scryptSync(String(password), salt, 64).toString('hex');

function publicUser(row) {
  return {
    id: row.id, email: row.email, name: row.name, role: row.role,
    initials: row.initials, phone: row.phone, business: row.business,
    createdAt: row.created_at ? row.created_at.slice(0, 10) : '',
    verifStatus: row.verif_status || 'unsubmitted',
    verifRejectReason: row.verif_reject_reason || null,
  };
}

function issueToken(userId, role) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO tokens (token, user_id, role, created_at) VALUES (?,?,?,?)')
    .run(token, userId, role, nowIso());
  return token;
}

// ─────────── Email verification ───────────
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const hashCode = (code, salt) =>
  crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');

// Minimal SMTP client (no dependencies). Supports implicit TLS (port 465)
// and STARTTLS (any other port), with AUTH LOGIN.
function smtpSend(to, subject, text) {
  return new Promise((resolve, reject) => {
    let socket = null;
    let settled = false;
    let buf = '';
    let lines = [];
    const replies = [];
    let waiting = null;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch (e) {}
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        lines.push(line);
        if (/^\d{3}(?: |$)/.test(line)) { // last line of a (possibly multi-line) reply
          const reply = { code: Number(line.slice(0, 3)), text: lines.join(' | ') };
          lines = [];
          if (waiting) { const w = waiting; waiting = null; w(reply); }
          else replies.push(reply);
        }
      }
    };

    const attach = (s) => {
      socket = s;
      buf = ''; lines = [];
      s.on('data', onData);
      s.on('error', fail);
      s.setTimeout(20000, () => fail(new Error('smtp_timeout')));
    };

    const nextReply = () => new Promise((res) => {
      if (replies.length) res(replies.shift());
      else waiting = res;
    });
    const expect = async (okClasses) => {
      const r = await nextReply();
      if (!okClasses.includes(Math.floor(r.code / 100))) {
        throw new Error(`smtp_${r.code}: ${r.text.slice(0, 200)}`);
      }
      return r;
    };
    const send = (line) => socket.write(line + '\r\n');

    const message = [
      `From: Llamita <${SMTP.from}>`,
      `To: <${to}>`,
      `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${uid('mail')}@llamita>`,
      '',
      text.replace(/\n/g, '\r\n').replace(/^\./gm, '..'),
    ].join('\r\n');

    const run = async () => {
      await expect([2]); // 220 greeting
      send('EHLO llamita.local'); await expect([2]);
      if (SMTP.port !== 465) {
        send('STARTTLS'); await expect([2]);
        const plain = socket;
        plain.removeListener('data', onData);
        plain.setTimeout(0);
        await new Promise((res, rej) => {
          const upgraded = tls.connect({ socket: plain, servername: SMTP.host }, res);
          upgraded.once('error', rej);
          attach(upgraded);
        });
        send('EHLO llamita.local'); await expect([2]);
      }
      send('AUTH LOGIN'); await expect([3]);
      send(Buffer.from(SMTP.user, 'utf8').toString('base64')); await expect([3]);
      send(Buffer.from(SMTP.pass, 'utf8').toString('base64')); await expect([2]);
      send(`MAIL FROM:<${SMTP.from}>`); await expect([2]);
      send(`RCPT TO:<${to}>`); await expect([2]);
      send('DATA'); await expect([3]);
      socket.write(message + '\r\n.\r\n'); await expect([2]);
      send('QUIT');
      if (!settled) { settled = true; try { socket.end(); } catch (e) {} resolve(); }
    };

    if (SMTP.port === 465) {
      attach(tls.connect({ host: SMTP.host, port: SMTP.port, servername: SMTP.host }));
    } else {
      attach(net.connect({ host: SMTP.host, port: SMTP.port }));
    }
    run().catch(fail);
  });
}

// Sends mail through Brevo's transactional HTTP API. Uses port 443, so it
// works on hosts that block outbound SMTP (e.g. Railway). Node 18+ fetch.
async function brevoSend(to, subject, text) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO.apiKey,
      'Content-Type': 'application/json',
      'accept': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: BREVO.sender, name: BREVO.name },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`brevo_${res.status}: ${body.slice(0, 200)}`);
  }
}

// Emails the verification code via Brevo or SMTP, or — when neither is
// configured — prints it to the console (development mode).
async function sendVerificationCode(email, code) {
  const subject = 'Tu código de verificación de Llamita';
  const text =
    `Hola,\n\nTu código de verificación de Llamita es:\n\n    ${code}\n\n` +
    `Ingresa este código en la pantalla de registro para activar tu cuenta. ` +
    `Expira en 10 minutos.\n\nSi no creaste una cuenta en Llamita, ignora este correo.\n\n— Llamita · Parqueos en La Paz`;
  if (BREVO_ENABLED) return brevoSend(email, subject, text);
  if (SMTP_ENABLED)  return smtpSend(email, subject, text);
  console.log(`[llamita] Código de verificación para ${email}: ${code}  (email no configurado — modo desarrollo)`);
}

// Returns { id, name, role } for a valid Bearer token, else null.
function authFrom(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const row = db.prepare('SELECT * FROM tokens WHERE token = ?').get(m[1]);
  if (!row) return null;
  if (row.user_id === 'admin') return { id: 'admin', name: 'Administración Llamita', role: 'admin' };
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  return u ? { id: u.id, name: u.name, role: u.role } : null;
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 2e6) { reject(new Error('body_too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

// Reads a raw (non-JSON) request body into a Buffer, rejecting mid-stream once
// maxBytes is exceeded. Used for image uploads (readBody would JSON-parse and
// hard-cap at 2 MB).
function readRawUpload(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error('upload_too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Confirms a buffer really is the image type its extension claims (magic bytes),
// returning the MIME type or null. Blocks a renamed script/video masquerading
// as a photo.
function sniffImage(buf, ext) {
  if (buf.length < 12) return null;
  const jpg  = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  const png  = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  const webp = buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if ((ext === 'jpg' || ext === 'jpeg') && jpg) return 'image/jpeg';
  if (ext === 'png' && png) return 'image/png';
  if (ext === 'webp' && webp) return 'image/webp';
  return null;
}

// ─────────── API routes ───────────
async function handleApi(req, res, pathname) {
  const method = req.method;

  if (pathname === '/api/health' && method === 'GET') {
    return json(res, 200, { ok: true, service: 'llamita', time: nowIso() });
  }

  if (pathname === '/api/auth/signup' && method === 'POST') {
    const b = await readBody(req);
    const email = String(b.email || '').toLowerCase().trim();
    const name = String(b.name || '').trim();
    const role = b.role === 'operador' ? 'operador' : 'conductor';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: 'invalid_email' });
    if (String(b.password || '').length < 6) return json(res, 400, { error: 'weak_password' });
    if (!name) return json(res, 400, { error: 'name_required' });
    if (email === ADMIN_EMAIL) return json(res, 409, { error: 'email_taken' });
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      return json(res, 409, { error: 'email_taken' });
    }
    // Don't create the account yet: email a 6-digit code and hold the signup
    // in pending_signups until /api/auth/verify-email confirms it.
    db.prepare('DELETE FROM pending_signups WHERE expires_at < ?').run(nowIso());
    db.prepare('DELETE FROM pending_signups WHERE email = ?').run(email); // restart any previous attempt
    const salt = crypto.randomBytes(16).toString('hex');
    const initials = name.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
    const payload = {
      email, name, role, initials,
      phone: b.phone || null, business: b.business || null,
      password_hash: hashPassword(b.password, salt), password_salt: salt,
    };
    const code = newCode();
    const codeSalt = crypto.randomBytes(8).toString('hex');
    const verifyId = uid('vs');
    try {
      await sendVerificationCode(email, code);
    } catch (e) {
      console.error(`[llamita] Error enviando correo a ${email}:`, e.message);
      return json(res, 502, { error: 'email_send_failed' });
    }
    db.prepare(`INSERT INTO pending_signups (id,email,code_hash,code_salt,payload,attempts,expires_at,last_sent_at,created_at)
                VALUES (?,?,?,?,?,0,?,?,?)`)
      .run(verifyId, email, hashCode(code, codeSalt), codeSalt, JSON.stringify(payload),
           new Date(Date.now() + CODE_TTL_MS).toISOString(), nowIso(), nowIso());
    return json(res, 200, { pending: true, verifyId, email, smtp: MAIL_ENABLED });
  }

  if (pathname === '/api/auth/verify-email' && method === 'POST') {
    const b = await readBody(req);
    const code = String(b.code || '').trim();
    const row = db.prepare('SELECT * FROM pending_signups WHERE id = ?').get(String(b.verifyId || ''));
    if (!row) return json(res, 404, { error: 'verification_not_found' });
    if (row.expires_at < nowIso()) {
      db.prepare('DELETE FROM pending_signups WHERE id = ?').run(row.id);
      return json(res, 410, { error: 'code_expired' });
    }
    if (hashCode(code, row.code_salt) !== row.code_hash) {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_CODE_ATTEMPTS) {
        db.prepare('DELETE FROM pending_signups WHERE id = ?').run(row.id);
        return json(res, 429, { error: 'too_many_attempts' });
      }
      db.prepare('UPDATE pending_signups SET attempts = ? WHERE id = ?').run(attempts, row.id);
      return json(res, 400, { error: 'invalid_code' });
    }
    const p = JSON.parse(row.payload);
    db.prepare('DELETE FROM pending_signups WHERE id = ?').run(row.id);
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(p.email)) {
      return json(res, 409, { error: 'email_taken' }); // registered while this code was pending
    }
    const id = uid('u');
    db.prepare(`INSERT INTO users (id,email,name,role,initials,phone,business,password_hash,password_salt,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, p.email, p.name, p.role, p.initials, p.phone, p.business,
           p.password_hash, p.password_salt, nowIso());
    const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    return json(res, 201, { user, token: issueToken(id, p.role) });
  }

  if (pathname === '/api/auth/resend-code' && method === 'POST') {
    const b = await readBody(req);
    const row = db.prepare('SELECT * FROM pending_signups WHERE id = ?').get(String(b.verifyId || ''));
    if (!row) return json(res, 404, { error: 'verification_not_found' });
    if (Date.now() - Date.parse(row.last_sent_at) < RESEND_COOLDOWN_MS) {
      return json(res, 429, { error: 'resend_too_soon' });
    }
    const code = newCode();
    const codeSalt = crypto.randomBytes(8).toString('hex');
    try {
      await sendVerificationCode(row.email, code);
    } catch (e) {
      console.error(`[llamita] Error enviando correo a ${row.email}:`, e.message);
      return json(res, 502, { error: 'email_send_failed' });
    }
    db.prepare(`UPDATE pending_signups SET code_hash = ?, code_salt = ?, attempts = 0,
                expires_at = ?, last_sent_at = ? WHERE id = ?`)
      .run(hashCode(code, codeSalt), codeSalt,
           new Date(Date.now() + CODE_TTL_MS).toISOString(), nowIso(), row.id);
    return json(res, 200, { ok: true, smtp: MAIL_ENABLED });
  }

  if (pathname === '/api/auth/signin' && method === 'POST') {
    const b = await readBody(req);
    const email = String(b.email || '').toLowerCase().trim();
    if (email === ADMIN_EMAIL && String(b.password) === ADMIN_PASSWORD) {
      const user = { id: 'admin', email: ADMIN_EMAIL, name: 'Administración Llamita', role: 'admin', initials: 'AD' };
      return json(res, 200, { user, token: issueToken('admin', 'admin') });
    }
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!row || hashPassword(b.password, row.password_salt) !== row.password_hash) {
      return json(res, 401, { error: 'invalid_credentials' });
    }
    return json(res, 200, { user: publicUser(row), token: issueToken(row.id, row.role) });
  }

  if (pathname === '/api/auth/signout' && method === 'POST') {
    const h = req.headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (m) db.prepare('DELETE FROM tokens WHERE token = ?').run(m[1]);
    return json(res, 200, { ok: true });
  }

  // Current account incl. live verification status — the operator UI polls this
  // to transition pending → approved without re-login.
  if (pathname === '/api/me' && method === 'GET') {
    const who = authFrom(req);
    if (!who) return json(res, 401, { error: 'unauthorized' });
    if (who.id === 'admin') {
      return json(res, 200, { user: { id: 'admin', email: ADMIN_EMAIL, name: 'Administración Llamita', role: 'admin', initials: 'AD', verifStatus: 'approved', verifRejectReason: null } });
    }
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(who.id);
    if (!row) return json(res, 404, { error: 'not_found' });
    return json(res, 200, { user: publicUser(row) });
  }

  // Upload one image. Purpose + extension in the query string; raw bytes as body.
  if (pathname === '/api/uploads' && method === 'POST') {
    const who = authFrom(req);
    if (!who) return json(res, 401, { error: 'unauthorized' });
    const q = new URL(req.url, 'http://x').searchParams;
    const purpose = String(q.get('purpose') || '');
    const ext = String(q.get('ext') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!UPLOAD_PURPOSES.includes(purpose)) return json(res, 400, { error: 'unsupported_type' });
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return json(res, 400, { error: 'unsupported_type' });
    // Reject oversized uploads by Content-Length before reading the body — a
    // clean 413 rather than a mid-stream socket reset. readRawUpload is the
    // backstop for chunked requests that omit the header.
    if (Number(req.headers['content-length'] || 0) > MAX_IMAGE_BYTES) {
      return json(res, 413, { error: 'upload_too_large' });
    }
    const buf = await readRawUpload(req, MAX_IMAGE_BYTES);
    const mime = sniffImage(buf, ext);
    if (!mime) return json(res, 400, { error: 'unsupported_type' });
    const id = uid('up');
    fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.${ext}`), buf);
    db.prepare('INSERT INTO uploads (id,owner_id,purpose,ext,mime,bytes,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, who.id, purpose, ext, mime, buf.length, nowIso());
    return json(res, 201, { id, bytes: buf.length });
  }

  // Serve an uploaded image — auth-gated (ID docs are private PII).
  if (pathname.startsWith('/api/uploads/') && method === 'GET') {
    const who = authFrom(req);
    if (!who) return json(res, 401, { error: 'unauthorized' });
    const upId = pathname.slice('/api/uploads/'.length);
    if (!/^[a-z0-9-]+$/i.test(upId)) return json(res, 400, { error: 'bad_id' });
    const row = db.prepare('SELECT * FROM uploads WHERE id = ?').get(upId);
    if (!row) return json(res, 404, { error: 'not_found' });
    if (who.role !== 'admin' && row.owner_id !== who.id) return json(res, 403, { error: 'forbidden' });
    const file = path.join(UPLOAD_DIR, `${row.id}.${row.ext}`);
    if (!file.startsWith(UPLOAD_DIR)) return json(res, 403, { error: 'forbidden' });
    let data;
    try { data = fs.readFileSync(file); } catch (e) { return json(res, 404, { error: 'not_found' }); }
    res.writeHead(200, { 'Content-Type': row.mime, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'private, max-age=300' });
    res.end(data);
    return;
  }

  // Operator submits identity docs for review (metadata only — the images were
  // uploaded separately via /api/uploads). Moves the account to `pending`.
  if (pathname === '/api/operator/verification' && method === 'POST') {
    const who = authFrom(req);
    if (!who || who.role !== 'operador') return json(res, 403, { error: 'forbidden' });
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(who.id);
    if (!row) return json(res, 404, { error: 'not_found' });
    if (row.verif_status === 'pending' || row.verif_status === 'approved') {
      return json(res, 409, { error: 'verification_already_submitted' });
    }
    const b = await readBody(req);
    const phone = String(b.phone || '').trim();
    const business = String(b.business || '').trim();
    const need = { id_front: b.idFront, id_back: b.idBack, selfie: b.selfie, business: b.businessDoc };
    const ids = {};
    for (const [purpose, upId] of Object.entries(need)) {
      const u = db.prepare('SELECT * FROM uploads WHERE id = ?').get(String(upId || ''));
      if (!u || u.owner_id !== who.id || u.purpose !== purpose) {
        return json(res, 400, { error: 'invalid_verification_docs' });
      }
      ids[purpose] = u.id;
    }
    if (!phone) return json(res, 400, { error: 'phone_required' });
    db.prepare(`UPDATE users SET verif_status='pending', verif_submitted_at=?, verif_reject_reason=NULL,
                phone=?, business=?, id_front_upload=?, id_back_upload=?, selfie_upload=?, business_upload=? WHERE id=?`)
      .run(nowIso(), phone, business || row.business || null,
           ids.id_front, ids.id_back, ids.selfie, ids.business, who.id);
    return json(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(who.id)) });
  }

  // ── Admin review queues ──
  if (pathname === '/api/admin/operators/pending' && method === 'GET') {
    const who = authFrom(req);
    if (!who || who.role !== 'admin') return json(res, 403, { error: 'forbidden' });
    const rows = db.prepare("SELECT * FROM users WHERE verif_status = 'pending' ORDER BY verif_submitted_at ASC").all();
    return json(res, 200, { operators: rows.map(r => Object.assign(publicUser(r), {
      submittedAt: r.verif_submitted_at,
      docs: { idFront: r.id_front_upload, idBack: r.id_back_upload, selfie: r.selfie_upload, business: r.business_upload },
    })) });
  }

  if (pathname === '/api/admin/lots/pending' && method === 'GET') {
    const who = authFrom(req);
    if (!who || who.role !== 'admin') return json(res, 403, { error: 'forbidden' });
    const rows = db.prepare("SELECT * FROM lot_verifications WHERE status = 'pending' ORDER BY submitted_at ASC").all();
    const state = JSON.parse(db.prepare('SELECT data FROM app_state WHERE id = 1').get().data);
    const lotById = {}; for (const l of state.lots) lotById[l.id] = l;
    return json(res, 200, { lots: rows.map(r => {
      const lot = lotById[r.lot_id] || {};
      const owner = db.prepare('SELECT name, email, phone FROM users WHERE id = ?').get(r.owner_id) || {};
      return {
        lotId: r.lot_id, ownerId: r.owner_id, ownerName: owner.name || '', ownerEmail: owner.email || '', ownerPhone: owner.phone || '',
        name: lot.name || '(sin nombre)', address: r.address || lot.address || '',
        lat: lot.lat, lng: lot.lng, total: lot.total,
        photoIds: JSON.parse(r.photo_ids || '[]'), submittedAt: r.submitted_at,
      };
    }) });
  }

  {
    const m = /^\/api\/admin\/operator\/([^/]+)\/(approve|reject)$/.exec(pathname);
    if (m && method === 'POST') {
      const who = authFrom(req);
      if (!who || who.role !== 'admin') return json(res, 403, { error: 'forbidden' });
      const [, opId, action] = m;
      const b = await readBody(req);
      if (!db.prepare('SELECT id FROM users WHERE id = ?').get(opId)) return json(res, 404, { error: 'not_found' });
      const status = action === 'approve' ? 'approved' : 'rejected';
      db.prepare(`UPDATE users SET verif_status=?, verif_reviewed_at=?, verif_reviewed_by=?, verif_reject_reason=? WHERE id=?`)
        .run(status, nowIso(), who.id, action === 'reject' ? String(b.reason || 'Sin especificar') : null, opId);
      return json(res, 200, { ok: true, status });
    }
  }

  {
    const m = /^\/api\/admin\/lot\/([^/]+)\/(approve|reject)$/.exec(pathname);
    if (m && method === 'POST') {
      const who = authFrom(req);
      if (!who || who.role !== 'admin') return json(res, 403, { error: 'forbidden' });
      const [, lotId, action] = m;
      const b = await readBody(req);
      if (!db.prepare('SELECT lot_id FROM lot_verifications WHERE lot_id = ?').get(lotId)) return json(res, 404, { error: 'not_found' });
      const status = action === 'approve' ? 'approved' : 'rejected';
      db.prepare(`UPDATE lot_verifications SET status=?, reviewed_at=?, reviewed_by=?, reject_reason=? WHERE lot_id=?`)
        .run(status, nowIso(), who.id, action === 'reject' ? String(b.reason || 'Sin especificar') : null, lotId);
      // Patch the app_state blob so drivers see the change on their next 4 s pull
      // (without waiting for the operator client to push again).
      const stateRow = db.prepare('SELECT version, data FROM app_state WHERE id = 1').get();
      const state = JSON.parse(stateRow.data);
      let changed = false;
      state.lots = state.lots.map(l => (l.id === lotId ? (changed = true, Object.assign({}, l, { status })) : l));
      if (changed) db.prepare('UPDATE app_state SET version = ?, data = ? WHERE id = 1').run(stateRow.version + 1, JSON.stringify(state));
      return json(res, 200, { ok: true, status });
    }
  }

  // Operator deletes one of their own lots (no admin review needed).
  {
    const m = /^\/api\/operator\/lot\/([^/]+)$/.exec(pathname);
    if (m && method === 'DELETE') {
      const who = authFrom(req);
      if (!who || (who.role !== 'operador' && who.role !== 'admin')) return json(res, 403, { error: 'forbidden' });
      const lotId = m[1];
      const lv = db.prepare('SELECT * FROM lot_verifications WHERE lot_id = ?').get(lotId);
      if (who.role === 'operador' && (!lv || lv.owner_id !== who.id)) return json(res, 403, { error: 'forbidden' });
      // Remove from the shared blob.
      const stateRow = db.prepare('SELECT version, data FROM app_state WHERE id = 1').get();
      const state = JSON.parse(stateRow.data);
      const before = state.lots.length;
      state.lots = state.lots.filter(l => l.id !== lotId);
      if (state.lots.length !== before) {
        db.prepare('UPDATE app_state SET version = ?, data = ? WHERE id = 1').run(stateRow.version + 1, JSON.stringify(state));
      }
      // Clean up verification, any edits, and the uploaded photo files.
      const photoIds = lv ? JSON.parse(lv.photo_ids || '[]') : [];
      for (const e of db.prepare('SELECT photo_ids FROM lot_edits WHERE lot_id = ?').all(lotId)) {
        try { for (const pid of JSON.parse(e.photo_ids || '[]')) photoIds.push(pid); } catch (x) {}
      }
      db.prepare('DELETE FROM lot_verifications WHERE lot_id = ?').run(lotId);
      db.prepare('DELETE FROM lot_edits WHERE lot_id = ?').run(lotId);
      for (const pid of photoIds) {
        const up = db.prepare('SELECT ext FROM uploads WHERE id = ?').get(pid);
        if (up) { try { fs.unlinkSync(path.join(UPLOAD_DIR, `${pid}.${up.ext}`)); } catch (x) {} db.prepare('DELETE FROM uploads WHERE id = ?').run(pid); }
      }
      return json(res, 200, { ok: true });
    }
  }

  // Operator submits an edit request (listing details) with new proof photos.
  {
    const m = /^\/api\/operator\/lot\/([^/]+)\/edit$/.exec(pathname);
    if (m && method === 'POST') {
      const who = authFrom(req);
      if (!who || who.role !== 'operador') return json(res, 403, { error: 'forbidden' });
      const lotId = m[1];
      const lv = db.prepare('SELECT * FROM lot_verifications WHERE lot_id = ?').get(lotId);
      if (!lv || lv.owner_id !== who.id) return json(res, 403, { error: 'forbidden' });
      if (lv.status !== 'approved') return json(res, 409, { error: 'lot_not_approved' });
      const bd = await readBody(req);
      const photoIds = Array.isArray(bd.photoIds) ? bd.photoIds : [];
      const validPhotos = photoIds.filter(pid => {
        const up = db.prepare('SELECT owner_id, purpose FROM uploads WHERE id = ?').get(String(pid));
        return up && up.owner_id === who.id && up.purpose === 'lot_photo';
      });
      if (validPhotos.length < MIN_LOT_PHOTOS) return json(res, 400, { error: 'invalid_lot_submission' });
      const src = bd.changes || {};
      const changes = {};
      for (const f of GATED_LOT_FIELDS) if (src[f] !== undefined) changes[f] = src[f];
      if ((changes.name !== undefined && !String(changes.name).trim()) ||
          (changes.address !== undefined && !String(changes.address).trim()) ||
          (changes.total !== undefined && !(Number(changes.total) >= 1))) {
        return json(res, 400, { error: 'invalid_edit' });
      }
      if (!Object.keys(changes).length) return json(res, 400, { error: 'no_changes' });
      db.prepare("DELETE FROM lot_edits WHERE lot_id = ? AND status = 'pending'").run(lotId);
      const editId = uid('ed');
      db.prepare(`INSERT INTO lot_edits (id,lot_id,owner_id,changes,photo_ids,status,submitted_at)
                  VALUES (?,?,?,?,?,'pending',?)`)
        .run(editId, lotId, who.id, JSON.stringify(changes), JSON.stringify(validPhotos), nowIso());
      return json(res, 200, { ok: true, editId });
    }
  }

  // Operator's own pending / rejected edits, keyed by lot (for status badges).
  if (pathname === '/api/operator/edits' && method === 'GET') {
    const who = authFrom(req);
    if (!who || who.role !== 'operador') return json(res, 403, { error: 'forbidden' });
    const rows = db.prepare("SELECT lot_id, status, reject_reason FROM lot_edits WHERE owner_id = ? AND status IN ('pending','rejected') ORDER BY submitted_at DESC").all(who.id);
    const byLot = {};
    for (const r of rows) if (!byLot[r.lot_id]) byLot[r.lot_id] = { status: r.status, rejectReason: r.reject_reason };
    return json(res, 200, { edits: byLot });
  }

  // Admin: pending edit requests, with a current-vs-proposed diff + proof photos.
  if (pathname === '/api/admin/edits/pending' && method === 'GET') {
    const who = authFrom(req);
    if (!who || who.role !== 'admin') return json(res, 403, { error: 'forbidden' });
    const rows = db.prepare("SELECT * FROM lot_edits WHERE status = 'pending' ORDER BY submitted_at ASC").all();
    const state = JSON.parse(db.prepare('SELECT data FROM app_state WHERE id = 1').get().data);
    const lotById = {}; for (const l of state.lots) lotById[l.id] = l;
    return json(res, 200, { edits: rows.map(r => {
      const lot = lotById[r.lot_id] || {};
      const owner = db.prepare('SELECT name, phone FROM users WHERE id = ?').get(r.owner_id) || {};
      const changes = JSON.parse(r.changes || '{}');
      const current = {}; for (const k of Object.keys(changes)) current[k] = lot[k];
      return {
        editId: r.id, lotId: r.lot_id, lotName: lot.name || '(sin nombre)',
        ownerName: owner.name || '', ownerPhone: owner.phone || '',
        changes, current, photoIds: JSON.parse(r.photo_ids || '[]'), submittedAt: r.submitted_at,
      };
    }) });
  }

  {
    const m = /^\/api\/admin\/edit\/([^/]+)\/(approve|reject)$/.exec(pathname);
    if (m && method === 'POST') {
      const who = authFrom(req);
      if (!who || who.role !== 'admin') return json(res, 403, { error: 'forbidden' });
      const [, editId, action] = m;
      const bd = await readBody(req);
      const ed = db.prepare('SELECT * FROM lot_edits WHERE id = ?').get(editId);
      if (!ed) return json(res, 404, { error: 'not_found' });
      if (action === 'reject') {
        db.prepare("UPDATE lot_edits SET status='rejected', reviewed_at=?, reviewed_by=?, reject_reason=? WHERE id=?")
          .run(nowIso(), who.id, String(bd.reason || 'Sin especificar'), editId);
        return json(res, 200, { ok: true, status: 'rejected' });
      }
      // Approve: apply the proposed changes to the live lot in the blob.
      const changes = JSON.parse(ed.changes || '{}');
      const stateRow = db.prepare('SELECT version, data FROM app_state WHERE id = 1').get();
      const state = JSON.parse(stateRow.data);
      let found = false;
      state.lots = state.lots.map(l => (l.id === ed.lot_id ? (found = true, Object.assign({}, l, changes)) : l));
      if (found) db.prepare('UPDATE app_state SET version = ?, data = ? WHERE id = 1').run(stateRow.version + 1, JSON.stringify(state));
      db.prepare("UPDATE lot_edits SET status='approved', reviewed_at=?, reviewed_by=? WHERE id=?").run(nowIso(), who.id, editId);
      // Keep the verification record's address/photos in step with the approved edit.
      if (changes.address !== undefined) db.prepare('UPDATE lot_verifications SET address=? WHERE lot_id=?').run(String(changes.address), ed.lot_id);
      db.prepare('UPDATE lot_verifications SET photo_ids=? WHERE lot_id=?').run(ed.photo_ids, ed.lot_id);
      return json(res, 200, { ok: true, status: 'approved' });
    }
  }

  if (pathname === '/api/state' && method === 'GET') {
    const row = db.prepare('SELECT version, data FROM app_state WHERE id = 1').get();
    return json(res, 200, { version: row.version, state: JSON.parse(row.data) });
  }

  if (pathname === '/api/state' && method === 'PUT') {
    const who = authFrom(req);
    if (!who || (who.role !== 'operador' && who.role !== 'admin')) {
      return json(res, 403, { error: 'forbidden' });
    }
    const b = await readBody(req);
    const s = b.state;
    if (!s || !Array.isArray(s.lots) || !Array.isArray(s.sessions) || !Array.isArray(s.history)) {
      return json(res, 400, { error: 'invalid_state' });
    }
    const statusOf = (id) => { const lv = db.prepare('SELECT status FROM lot_verifications WHERE lot_id = ?').get(id); return lv ? lv.status : null; };
    const ownerOf = (id) => { const lv = db.prepare('SELECT owner_id FROM lot_verifications WHERE lot_id = ?').get(id); return lv ? lv.owner_id : null; };
    const clientById = {}; for (const l of s.lots) if (l && typeof l.id === 'string') clientById[l.id] = l;

    let lots;
    if (who.role === 'admin') {
      // Admin is trusted to add/edit/delete anything; still stamp authoritative status.
      lots = [];
      for (const lot of s.lots) {
        if (!lot || typeof lot.id !== 'string') continue;
        let st = statusOf(lot.id);
        if (!st) {
          db.prepare(`INSERT INTO lot_verifications (lot_id,owner_id,status,address,photo_ids,submitted_at,reviewed_at,reviewed_by)
                      VALUES (?,?,?,?,?,?,?,?)`)
            .run(lot.id, lot.ownerId || 'admin', 'approved', String(lot.address || ''),
                 JSON.stringify(Array.isArray(lot.photoIds) ? lot.photoIds : []), nowIso(), nowIso(), 'admin');
          st = 'approved';
        }
        lots.push(Object.assign({}, lot, { status: st }));
      }
    } else {
      // Operator: server-authoritative for listing fields. Start from the CURRENT
      // server lots (so nothing is deleted via a state push and other operators'
      // lots can't be touched), apply only operational-field changes to their own
      // lots, then run the creation gate for genuinely new lots.
      const opApproved = (() => {
        const u = db.prepare('SELECT verif_status FROM users WHERE id = ?').get(who.id);
        return !!u && u.verif_status === 'approved';
      })();
      const stateRow0 = db.prepare('SELECT data FROM app_state WHERE id = 1').get();
      const serverLots = JSON.parse(stateRow0.data).lots;
      const outById = {};
      for (const sl of serverLots) {
        const merged = Object.assign({}, sl, { status: statusOf(sl.id) || sl.status });
        if (ownerOf(sl.id) === who.id && clientById[sl.id]) {
          const cl = clientById[sl.id];
          for (const f of OPERATIONAL_LOT_FIELDS) if (cl[f] !== undefined) merged[f] = cl[f];
        }
        outById[sl.id] = merged;
      }
      // New lots (not present on the server) → creation gate.
      for (const lot of s.lots) {
        if (!lot || typeof lot.id !== 'string' || outById[lot.id]) continue;
        if (!opApproved) return json(res, 403, { error: 'operator_unverified' });
        const photoIds = Array.isArray(lot.photoIds) ? lot.photoIds : [];
        const address = String(lot.address || '').trim();
        const validPhotos = photoIds.filter(pid => {
          const up = db.prepare('SELECT owner_id, purpose FROM uploads WHERE id = ?').get(String(pid));
          return up && up.owner_id === who.id && up.purpose === 'lot_photo';
        });
        if (validPhotos.length < MIN_LOT_PHOTOS || !address) return json(res, 400, { error: 'invalid_lot_submission' });
        db.prepare(`INSERT INTO lot_verifications (lot_id,owner_id,status,address,photo_ids,submitted_at)
                    VALUES (?,?,?,?,?,?)`)
          .run(lot.id, who.id, 'pending', address, JSON.stringify(validPhotos), nowIso());
        outById[lot.id] = Object.assign({}, lot, { status: 'pending' });
      }
      lots = Object.values(outById);
    }
    const row = db.prepare('SELECT version FROM app_state WHERE id = 1').get();
    const version = row.version + 1;
    db.prepare('UPDATE app_state SET version = ?, data = ? WHERE id = 1')
      .run(version, JSON.stringify({ lots, sessions: s.sessions, history: s.history }));
    return json(res, 200, { version });
  }

  if (pathname === '/api/events' && method === 'POST') {
    const who = authFrom(req);
    const b = await readBody(req);
    if (!b.type || typeof b.type !== 'string') return json(res, 400, { error: 'type_required' });
    const id = typeof b.id === 'string' && b.id ? b.id : uid('ev');
    db.prepare(`INSERT OR IGNORE INTO events (id, ts, user_id, user_name, role, type, meta)
                VALUES (?,?,?,?,?,?,?)`)
      .run(id, typeof b.ts === 'string' ? b.ts : nowIso(),
           who ? who.id : 'anonimo', who ? who.name : 'Anónimo', who ? who.role : 'anonimo',
           b.type, JSON.stringify(b.meta || {}));
    // Ring buffer: keep the newest MAX_EVENTS rows.
    db.prepare(`DELETE FROM events WHERE id IN (
                  SELECT id FROM events ORDER BY ts DESC LIMIT -1 OFFSET ?)`).run(MAX_EVENTS);
    return json(res, 201, { ok: true });
  }

  if (pathname === '/api/events' && method === 'GET') {
    const who = authFrom(req);
    if (!who || who.role !== 'admin') return json(res, 403, { error: 'forbidden' });
    const rows = db.prepare('SELECT * FROM events ORDER BY ts ASC LIMIT 5000').all();
    return json(res, 200, {
      events: rows.map(r => ({
        id: r.id, ts: r.ts, userId: r.user_id, userName: r.user_name,
        role: r.role, type: r.type, meta: JSON.parse(r.meta),
      })),
    });
  }

  if (pathname === '/api/users' && method === 'GET') {
    const who = authFrom(req);
    if (!who || who.role !== 'admin') return json(res, 403, { error: 'forbidden' });
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all();
    return json(res, 200, { users: rows.map(publicUser) });
  }

  return json(res, 404, { error: 'not_found' });
}

// ─────────── Static files ───────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.jsx': 'text/javascript',
  '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; } // no traversal
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

// ─────────── Server ───────────
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch(e => {
      const code = (e.message === 'body_too_large' || e.message === 'upload_too_large') ? 413
                 : e.message === 'invalid_json' ? 400 : 500;
      json(res, code, { error: e.message || 'server_error' });
    });
    return;
  }

  if (req.method === 'GET') { serveStatic(req, res, pathname); return; }
  res.writeHead(405); res.end();
});

server.listen(PORT, () => {
  console.log(`Llamita server listo → http://localhost:${PORT}`);
  console.log(`Base de datos: ${DB_PATH}`);
  console.log(
    BREVO_ENABLED ? `Verificación de correo: Brevo API (remitente ${BREVO.sender})`
    : SMTP_ENABLED ? `Verificación de correo: SMTP vía ${SMTP.host}:${SMTP.port}`
    : 'Verificación de correo: sin configurar — los códigos se imprimen en esta consola (modo desarrollo)');
});
