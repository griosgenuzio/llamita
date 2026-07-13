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

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..'); // static app (index.html, src/, vendor/)
const DB_PATH = process.env.LLAMITA_DB || path.join(__dirname, 'llamita.db');
const PORT = Number(process.env.PORT) || 8080;
const ADMIN_EMAIL = (process.env.LLAMITA_ADMIN_EMAIL || 'admin@llamita.bo').toLowerCase();
const ADMIN_PASSWORD = process.env.LLAMITA_ADMIN_PASSWORD || 'llamita2026';
const MAX_EVENTS = 20000;

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
    const salt = crypto.randomBytes(16).toString('hex');
    const initials = name.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
    const id = uid('u');
    db.prepare(`INSERT INTO users (id,email,name,role,initials,phone,business,password_hash,password_salt,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, email, name, role, initials, b.phone || null, b.business || null,
           hashPassword(b.password, salt), salt, nowIso());
    const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    return json(res, 201, { user, token: issueToken(id, role) });
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
});
