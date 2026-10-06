import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { openDb } from './db.js';
import { MODELS, DEFAULT_MODEL } from './attribution.js';
import { CHANNELS, isBot } from './channels.js';
import { HttpError, Router, clientIp, parseJson, rateLimiter, readBody, send } from './http.js';
import {
  bootstrapAdmin, canAccessWorkspace, createSession, createUser, currentUser, login, logout,
  requireAdmin, sessionCookie, userCount, validatePassword, hashPassword, verifyPassword,
} from './auth.js';
import {
  createWorkspace, deleteWorkspace, getWorkspace, listWorkspaces, rotateKey, updateWorkspace,
  workspaceByApiKey, workspaceBySiteKey,
} from './workspaces.js';
import { importSpendCsv, recordEvent, recordOrders, recordSallaWebhook, verifySignature } from './ingest.js';
import { parseParams } from './analytics/dataset.js';
import {
  agencyReport, analyticsReport, attributionReport, customersReport, funnelReport, journeysReport,
  measurementReport, overviewReport,
} from './analytics/reports.js';
import { mmmReport } from './analytics/mmm.js';
import { deleteConnection, listConnections, platformInfo, saveConnection, startScheduler, syncConnection } from './connectors/index.js';
import { TRACKER_SOURCE } from './tracker.js';
import { transaction } from './db.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

function publicUrl(req) {
  if (config.publicUrl) return config.publicUrl;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}`;
}

function workspaceView(ws, req) {
  const base = publicUrl(req);
  return {
    ...ws,
    snippet_url: `${base}/t.js?k=${ws.site_key}`,
    salla_webhook_url: `${base}/webhooks/salla/${ws.site_key}`,
    orders_api_url: `${base}/api/v1/orders`,
    spend_api_url: `${base}/api/v1/spend`,
  };
}

function userView(db, u) {
  const workspaces = db.prepare('SELECT workspace_id FROM user_workspaces WHERE user_id = ?').all(u.id).map((r) => r.workspace_id);
  return { id: u.id, email: u.email, name: u.name, role: u.role, created_at: u.created_at, workspaces };
}

function setUserWorkspaces(db, userId, ids = []) {
  db.prepare('DELETE FROM user_workspaces WHERE user_id = ?').run(userId);
  const ins = db.prepare('INSERT OR IGNORE INTO user_workspaces (user_id, workspace_id) SELECT ?, id FROM workspaces WHERE id = ?');
  for (const id of ids) ins.run(userId, Number(id));
}

export function createApp(db) {
  const loginLimit = rateLimiter({ limit: 10, windowMs: 15 * 60_000 });
  const collectLimit = rateLimiter({ limit: 600, windowMs: 60_000 });
  const r = new Router();

  // ------------------------------------------------------------- public
  r.get('/health', () => ({ ok: true }));

  r.get('/t.js', ({ req, url, res }) => {
    const ws = workspaceBySiteKey(db, url.searchParams.get('k'));
    if (!ws) throw new HttpError(404, 'unknown site key');
    const js = TRACKER_SOURCE.replace('__ENDPOINT__', publicUrl(req)).replace('__SITE_KEY__', ws.site_key);
    send(res, 200, js, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  });

  r.add('OPTIONS', '/collect', ({ res }) => send(res, 204, '', CORS));
  r.post('/collect', async ({ req, url, res }) => {
    const ws = workspaceBySiteKey(db, url.searchParams.get('k'));
    if (!ws) throw new HttpError(404, 'unknown site key');
    if (!collectLimit(clientIp(req))) throw new HttpError(429, 'too many requests');
    const ua = String(req.headers['user-agent'] || '');
    const event = parseJson(await readBody(req));
    const result = isBot(ua) ? { stored: null, bot: true } : recordEvent(db, ws, event, { userAgent: ua });
    send(res, 200, result, CORS);
  });

  r.post('/webhooks/salla/:siteKey', async ({ req, params }) => {
    const ws = workspaceBySiteKey(db, params.siteKey);
    if (!ws) throw new HttpError(404, 'unknown store');
    const raw = await readBody(req);
    if (!verifySignature(raw, req.headers['x-salla-signature'], ws.webhook_secret)) throw new HttpError(401, 'invalid signature');
    return recordSallaWebhook(db, ws, parseJson(raw));
  });

  const apiKeyWorkspace = (req) => {
    const ws = workspaceByApiKey(db, req.headers['x-api-key']);
    if (!ws) throw new HttpError(401, 'invalid API key');
    return ws;
  };
  r.post('/api/v1/orders', async ({ req }) => recordOrders(db, apiKeyWorkspace(req), parseJson(await readBody(req))));
  r.post('/api/v1/spend', async ({ req }) => importSpendCsv(db, apiKeyWorkspace(req), (await readBody(req)).toString('utf8')));

  // --------------------------------------------------------------- auth
  r.get('/api/auth/state', ({ req }) => ({ needsSetup: userCount(db) === 0, user: currentUser(db, req) }));

  r.post('/api/auth/setup', async ({ req, res }) => {
    const body = parseJson(await readBody(req));
    if (userCount(db) > 0) throw new HttpError(403, 'تم الإعداد مسبقاً');
    const id = createUser(db, { ...body, role: 'admin' });
    if (body.workspace) createWorkspace(db, { name: body.workspace });
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(createSession(db, id)) });
  });

  r.post('/api/auth/login', async ({ req, res }) => {
    if (!loginLimit(clientIp(req))) throw new HttpError(429, 'محاولات كثيرة، حاول بعد ربع ساعة');
    const { email, password } = parseJson(await readBody(req));
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(login(db, email, password)) });
  });

  r.post('/api/auth/logout', ({ req, res }) => {
    logout(db, req);
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  });

  r.post('/api/auth/password', async ({ req, user }) => {
    const { current, next } = parseJson(await readBody(req));
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    if (!verifyPassword(String(current || ''), row.password_hash)) throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة');
    validatePassword(next);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), user.id);
    return { ok: true };
  }, { auth: true });

  // --------------------------------------------------------- meta + team
  r.get('/api/meta', () => ({ models: MODELS, defaultModel: DEFAULT_MODEL, channels: CHANNELS, platforms: platformInfo() }), { auth: true });

  r.get('/api/users', ({ user }) => {
    requireAdmin(user);
    return db.prepare('SELECT * FROM users ORDER BY created_at').all().map((u) => userView(db, u));
  }, { auth: true });

  r.post('/api/users', async ({ req, user }) => {
    requireAdmin(user);
    const body = parseJson(await readBody(req));
    return transaction(db, () => {
      const id = createUser(db, body);
      setUserWorkspaces(db, id, body.workspaces);
      return userView(db, db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    });
  }, { auth: true });

  r.put('/api/users/:id', async ({ req, user, params }) => {
    requireAdmin(user);
    const id = Number(params.id);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) throw new HttpError(404, 'المستخدم غير موجود');
    const body = parseJson(await readBody(req));
    if (body.role && !['admin', 'member'].includes(body.role)) throw new HttpError(400, 'invalid role');
    if (id === user.id && body.role && body.role !== 'admin') throw new HttpError(400, 'ما تقدر تشيل صلاحية المدير عن نفسك');
    transaction(db, () => {
      if (body.role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.role, id);
      if (body.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(String(body.name).slice(0, 100), id);
      if (body.password) {
        validatePassword(body.password);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.password), id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      }
      if (Array.isArray(body.workspaces)) setUserWorkspaces(db, id, body.workspaces);
    });
    return userView(db, db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  }, { auth: true });

  r.delete('/api/users/:id', ({ user, params }) => {
    requireAdmin(user);
    if (Number(params.id) === user.id) throw new HttpError(400, 'ما تقدر تحذف نفسك');
    db.prepare('DELETE FROM users WHERE id = ?').run(Number(params.id));
    return { ok: true };
  }, { auth: true });

  // --------------------------------------------------------- workspaces
  r.get('/api/workspaces', ({ user }) => listWorkspaces(db, user), { auth: true });
  r.post('/api/workspaces', async ({ req, user }) => {
    requireAdmin(user);
    return workspaceView(createWorkspace(db, parseJson(await readBody(req))), req);
  }, { auth: true });

  const ws = (user, id) => {
    const w = getWorkspace(db, Number(id));
    if (!canAccessWorkspace(db, user, w.id)) throw new HttpError(404, 'العميل غير موجود');
    return w;
  };

  r.get('/api/workspaces/:id', ({ req, user, params }) => {
    const w = workspaceView(ws(user, params.id), req);
    if (user.role !== 'admin') { delete w.api_key; delete w.webhook_secret; }
    return w;
  }, { auth: true });
  r.put('/api/workspaces/:id', async ({ req, user, params }) => {
    requireAdmin(user);
    return workspaceView(updateWorkspace(db, ws(user, params.id).id, parseJson(await readBody(req))), req);
  }, { auth: true });
  r.delete('/api/workspaces/:id', ({ user, params }) => {
    requireAdmin(user);
    deleteWorkspace(db, ws(user, params.id).id);
    return { ok: true };
  }, { auth: true });
  r.post('/api/workspaces/:id/rotate', async ({ req, user, params }) => {
    requireAdmin(user);
    const { which } = parseJson(await readBody(req));
    return workspaceView(rotateKey(db, ws(user, params.id).id, which), req);
  }, { auth: true });

  // ------------------------------------------------------------- reports
  r.get('/api/agency', ({ user, url }) => agencyReport(db, listWorkspaces(db, user).map((w) => getWorkspace(db, w.id)), parseParams(url.searchParams)), { auth: true });

  const REPORTS = {
    overview: (w, p) => overviewReport(db, w, p),
    analytics: (w, p) => analyticsReport(db, w, p),
    channels: (w, p) => attributionReport(db, w, p, 'channel'),
    campaigns: (w, p) => attributionReport(db, w, p, 'campaign'),
    creatives: (w, p) => attributionReport(db, w, p, 'creative'),
    customers: (w, p) => customersReport(db, w, p),
    funnel: (w, p) => funnelReport(db, w, p),
    measurement: (w, p) => measurementReport(db, w, p),
    journeys: (w, p) => journeysReport(db, w, p),
  };
  r.get('/api/w/:id/report/mmm', ({ user, params, url }) => {
    const w = ws(user, params.id);
    const days = [60, 90, 180, 365].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 90;
    return mmmReport(db, w, { to: parseParams(url.searchParams, w).to, days });
  }, { auth: true });

  r.get('/api/w/:id/report/:name', ({ user, params, url }) => {
    const fn = REPORTS[params.name];
    if (!fn) throw new HttpError(404, 'unknown report');
    const w = ws(user, params.id);
    return fn(w, parseParams(url.searchParams, w));
  }, { auth: true });
  // ----------------------------------------------------- data + platforms
  r.post('/api/w/:id/spend', async ({ req, user, params }) => {
    requireAdmin(user);
    return importSpendCsv(db, ws(user, params.id), (await readBody(req)).toString('utf8'));
  }, { auth: true });

  r.get('/api/w/:id/connections', ({ user, params }) => listConnections(db, ws(user, params.id).id), { auth: true });
  r.post('/api/w/:id/connections', async ({ req, user, params }) => {
    requireAdmin(user);
    const w = ws(user, params.id);
    const id = saveConnection(db, w.id, parseJson(await readBody(req)));
    const result = await syncConnection(db, id);
    return { id, sync: result };
  }, { auth: true });
  r.post('/api/w/:id/connections/:cid/sync', async ({ user, params }) => {
    const w = ws(user, params.id);
    const conn = db.prepare('SELECT id FROM connections WHERE id = ? AND workspace_id = ?').get(Number(params.cid), w.id);
    if (!conn) throw new HttpError(404, 'الربط غير موجود');
    return syncConnection(db, conn.id);
  }, { auth: true });
  r.delete('/api/w/:id/connections/:cid', ({ user, params }) => {
    requireAdmin(user);
    deleteConnection(db, ws(user, params.id).id, Number(params.cid));
    return { ok: true };
  }, { auth: true });

  // ------------------------------------------------------------ dispatch
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    const isCollect = pathname === '/collect';
    try {
      const m = r.match(req.method, pathname);
      if (m?.handler) {
        const { opts } = m;
        // CSRF: cookie-authenticated writes must carry a header a cross-site form can't set.
        const cookieWrite = pathname.startsWith('/api/') && !pathname.startsWith('/api/v1/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        if (cookieWrite && req.headers['x-requested-with'] !== 'fetch') throw new HttpError(403, 'missing X-Requested-With header');
        let user = null;
        if (opts.auth) {
          user = currentUser(db, req);
          if (!user) throw new HttpError(401, 'سجّل دخولك أولاً');
        }
        const out = await m.handler({ req, res, url, params: m.params, user });
        if (!res.headersSent && out !== undefined) send(res, 200, out);
        return;
      }
      if (m?.methodNotAllowed) throw new HttpError(405, 'method not allowed');
      if (req.method === 'GET' && !pathname.startsWith('/api/')) return await serveStatic(res, pathname);
      throw new HttpError(404, 'not found');
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      send(res, status, { error: status === 500 ? 'internal error' : err.message }, isCollect ? CORS : {});
    }
  };
}

async function serveStatic(res, pathname) {
  let file = normalize(join(PUBLIC_DIR, pathname));
  if (!file.startsWith(PUBLIC_DIR)) throw new HttpError(404, 'not found');
  if (!extname(file)) file = join(PUBLIC_DIR, 'index.html'); // SPA routes
  try {
    const data = await readFile(file);
    send(res, 200, data, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  } catch {
    throw new HttpError(404, 'not found');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production' && !config.secretKey) {
    console.error('SECRET_KEY is required in production (encrypts ad platform tokens).');
    process.exit(1);
  }
  const db = openDb(config.dbPath);
  bootstrapAdmin(db);
  startScheduler(db);
  createServer(createApp(db)).listen(config.port, () => {
    console.log(`Tracking server on http://localhost:${config.port}`);
  });
}
