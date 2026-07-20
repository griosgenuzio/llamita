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
`);
db.prepare(`INSERT OR IGNORE INTO app_state (id, version, data)
            VALUES (1, 0, '{"lots":[],"sessions":[],"history":[]}')`).run();

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
    const row = db.prepare('SELECT version FROM app_state WHERE id = 1').get();
    const version = row.version + 1;
    db.prepare('UPDATE app_state SET version = ?, data = ? WHERE id = 1')
      .run(version, JSON.stringify({ lots: s.lots, sessions: s.sessions, history: s.history }));
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
      json(res, e.message === 'body_too_large' ? 413 : e.message === 'invalid_json' ? 400 : 500,
           { error: e.message || 'server_error' });
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
