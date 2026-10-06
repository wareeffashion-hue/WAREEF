import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { openDb, transaction } from './db.js';
import { MODELS, DEFAULT_MODEL } from './attribution.js';
import { CHANNELS, isBot } from './channels.js';
import { HttpError, Router, clientIp, parseJson, rateLimiter, readBody, send } from './http.js';
import {
  canAccessWorkspace, createPasswordReset, createUser, currentUser, hashPassword, login, logout,
  requireAdmin, requireSuperadmin, resetPassword, sessionCookie, userCount, validatePassword, verifyPassword,
} from './auth.js';
import { resetEmail, signup, welcomeEmail } from './accounts.js';
import {
  createWorkspace, deleteWorkspace, getWorkspace, listWorkspaces, rotateKey, updateWorkspace,
  workspaceByApiKey, workspaceBySiteKey,
} from './workspaces.js';
import { importSpendCsv, recordEvent, recordOrders, recordSallaWebhook, verifySignature } from './ingest.js';
import { admitEvent, assertCanAdd, assertDashboardAccess, counts, getOrg, invalidateOrg, orgState, planOf, accessEndsAt } from './orgs.js';
import { publicPlans, TRIAL_DAYS, GRACE_DAYS } from './plans.js';
import { billingEnabled, createCheckout, handleMoyasarNotification, paymentsOf, verifyRecent } from './billing.js';
import { platformOverview, updateOrgAdmin } from './platform.js';
import { parseParams } from './analytics/dataset.js';
import {
  agencyReport, analyticsReport, attributionReport, customersReport, funnelReport, journeysReport,
  measurementReport, overviewReport,
} from './analytics/reports.js';
import { mmmReport } from './analytics/mmm.js';
import { deleteConnection, listConnections, platformInfo, saveConnection, syncConnection } from './connectors/index.js';
import { backupTo, startJobs } from './jobs.js';
import { TRACKER_SOURCE } from './tracker.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};
const PAGES = { '/': 'landing.html', '/app': 'index.html', '/terms': 'terms.html', '/privacy': 'privacy.html' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function publicUrl(req) {
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

function setUserWorkspaces(db, user, userId, ids = []) {
  db.prepare('DELETE FROM user_workspaces WHERE user_id = ?').run(userId);
  const ins = db.prepare('INSERT OR IGNORE INTO user_workspaces (user_id, workspace_id) SELECT ?, id FROM workspaces WHERE id = ? AND org_id = ?');
  for (const id of ids) ins.run(userId, Number(id), user.org_id);
}

function orgView(db, org) {
  const plan = planOf(org);
  return {
    id: org.id, name: org.name, plan: org.plan, plan_name: plan.name, status: org.status, state: orgState(org),
    billing_cycle: org.billing_cycle, trial_ends_at: org.trial_ends_at, current_period_end: org.current_period_end,
    access_ends_at: accessEndsAt(org), grace_days: GRACE_DAYS,
    limits: { stores: plan.stores, members: plan.members, events: plan.events },
    usage: counts(db, org.id),
  };
}

export function createApp(db) {
  const loginLimit = rateLimiter({ limit: 10, windowMs: 15 * 60_000 });
  const signupLimit = rateLimiter({ limit: 5, windowMs: 60 * 60_000 });
  const collectLimit = rateLimiter({ limit: 600, windowMs: 60_000 });
  const r = new Router();

  // ------------------------------------------------------------- public
  r.get('/health', () => ({ ok: true }));

  r.get('/api/public/config', () => ({
    appName: config.appName, signupEnabled: config.signupEnabled || userCount(db) === 0, needsSetup: userCount(db) === 0,
    trialDays: TRIAL_DAYS, plans: publicPlans(), supportEmail: config.supportEmail,
  }));

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
    let result;
    if (isBot(ua)) result = { stored: null, bot: true };
    else {
      const admit = admitEvent(db, ws.org_id, event.e);
      result = admit.ok ? recordEvent(db, ws, event, { userAgent: ua }) : { stored: null, reason: admit.reason };
    }
    send(res, 200, result, CORS);
  });

  r.post('/webhooks/salla/:siteKey', async ({ req, params }) => {
    const ws = workspaceBySiteKey(db, params.siteKey);
    if (!ws) throw new HttpError(404, 'unknown store');
    const raw = await readBody(req);
    if (!verifySignature(raw, req.headers['x-salla-signature'], ws.webhook_secret)) throw new HttpError(401, 'invalid signature');
    if (!admitEvent(db, ws.org_id, 'purchase').ok) return { stored: null, reason: 'subscription' };
    return recordSallaWebhook(db, ws, parseJson(raw));
  });

  r.post('/webhooks/moyasar', async ({ req }) => handleMoyasarNotification(db, parseJson(await readBody(req))));

  const apiKeyWorkspace = (req) => {
    const ws = workspaceByApiKey(db, req.headers['x-api-key']);
    if (!ws) throw new HttpError(401, 'invalid API key');
    if (!admitEvent(db, ws.org_id, 'purchase').ok) throw new HttpError(402, 'subscription inactive');
    return ws;
  };
  r.post('/api/v1/orders', async ({ req }) => recordOrders(db, apiKeyWorkspace(req), parseJson(await readBody(req))));
  r.post('/api/v1/spend', async ({ req }) => importSpendCsv(db, apiKeyWorkspace(req), (await readBody(req)).toString('utf8')));

  // --------------------------------------------------------------- auth
  r.get('/api/auth/state', ({ req }) => {
    const user = currentUser(db, req);
    return { needsSetup: userCount(db) === 0, user, org: user ? orgView(db, getOrg(db, user.org_id)) : null };
  });

  r.post('/api/auth/signup', async ({ req, res }) => {
    if (!signupLimit(clientIp(req))) throw new HttpError(429, 'محاولات كثيرة، حاول لاحقاً');
    const body = parseJson(await readBody(req));
    const out = signup(db, body);
    const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(out.userId);
    welcomeEmail(publicUrl(req), user);
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(out.token) });
  });

  r.post('/api/auth/login', async ({ req, res }) => {
    if (!loginLimit(clientIp(req))) throw new HttpError(429, 'محاولات كثيرة، حاول بعد ربع ساعة');
    const { email, password } = parseJson(await readBody(req));
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(login(db, email, password)) });
  });

  r.post('/api/auth/forgot', async ({ req }) => {
    if (!loginLimit(clientIp(req))) throw new HttpError(429, 'محاولات كثيرة، حاول بعد ربع ساعة');
    const { email } = parseJson(await readBody(req));
    const reset = createPasswordReset(db, email);
    if (reset) await resetEmail(publicUrl(req), reset.user, reset.token);
    return { ok: true }; // same answer whether or not the email exists
  });

  r.post('/api/auth/reset', async ({ req, res }) => {
    const { token, password } = parseJson(await readBody(req));
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(resetPassword(db, token, password)) });
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
  r.get('/api/meta', () => ({ appName: config.appName, models: MODELS, defaultModel: DEFAULT_MODEL, channels: CHANNELS, platforms: platformInfo() }), { auth: true });

  r.get('/api/users', ({ user }) => {
    requireAdmin(user);
    return db.prepare('SELECT * FROM users WHERE org_id = ? ORDER BY created_at').all(user.org_id).map((u) => userView(db, u));
  }, { auth: true });

  r.post('/api/users', async ({ req, user, org }) => {
    requireAdmin(user);
    assertCanAdd(db, org, 'member');
    const body = parseJson(await readBody(req));
    return transaction(db, () => {
      const id = createUser(db, { ...body, orgId: user.org_id, superadmin: false });
      setUserWorkspaces(db, user, id, body.workspaces);
      return userView(db, db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    });
  }, { auth: true });

  const orgUser = (user, id) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ? AND org_id = ?').get(Number(id), user.org_id);
    if (!target) throw new HttpError(404, 'المستخدم غير موجود');
    return target;
  };

  r.put('/api/users/:id', async ({ req, user, params }) => {
    requireAdmin(user);
    const target = orgUser(user, params.id);
    const body = parseJson(await readBody(req));
    if (body.role && !['admin', 'member'].includes(body.role)) throw new HttpError(400, 'invalid role');
    if (target.id === user.id && body.role && body.role !== 'admin') throw new HttpError(400, 'ما تقدر تشيل صلاحية المدير عن نفسك');
    transaction(db, () => {
      if (body.role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.role, target.id);
      if (body.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(String(body.name).slice(0, 100), target.id);
      if (body.password) {
        validatePassword(body.password);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.password), target.id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
      }
      if (Array.isArray(body.workspaces)) setUserWorkspaces(db, user, target.id, body.workspaces);
    });
    return userView(db, db.prepare('SELECT * FROM users WHERE id = ?').get(target.id));
  }, { auth: true });

  r.delete('/api/users/:id', ({ user, params }) => {
    requireAdmin(user);
    const target = orgUser(user, params.id);
    if (target.id === user.id) throw new HttpError(400, 'ما تقدر تحذف نفسك');
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
    return { ok: true };
  }, { auth: true });

  // --------------------------------------------------------- workspaces
  r.get('/api/workspaces', ({ user }) => listWorkspaces(db, user), { auth: true });
  r.post('/api/workspaces', async ({ req, user, org }) => {
    requireAdmin(user);
    assertCanAdd(db, org, 'store');
    return workspaceView(createWorkspace(db, { ...parseJson(await readBody(req)), orgId: user.org_id }), req);
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
  r.get('/api/agency', ({ user, org, url }) => {
    assertDashboardAccess(org);
    return agencyReport(db, listWorkspaces(db, user).map((w) => getWorkspace(db, w.id)), parseParams(url.searchParams));
  }, { auth: true });

  r.get('/api/w/:id/report/mmm', ({ user, org, params, url }) => {
    assertDashboardAccess(org);
    const w = ws(user, params.id);
    const days = [60, 90, 180, 365].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 90;
    return mmmReport(db, w, { to: parseParams(url.searchParams, w).to, days });
  }, { auth: true });

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
  r.get('/api/w/:id/report/:name', ({ user, org, params, url }) => {
    const fn = REPORTS[params.name];
    if (!fn) throw new HttpError(404, 'unknown report');
    assertDashboardAccess(org);
    const w = ws(user, params.id);
    return fn(w, parseParams(url.searchParams, w));
  }, { auth: true });

  // ----------------------------------------------------- data + platforms
  r.post('/api/w/:id/spend', async ({ req, user, params }) => {
    requireAdmin(user);
    return importSpendCsv(db, ws(user, params.id), (await readBody(req)).toString('utf8'));
  }, { auth: true });

  r.get('/api/w/:id/connections', ({ user, params }) => listConnections(db, ws(user, params.id).id), { auth: true });
  r.post('/api/w/:id/connections', async ({ req, user, org, params }) => {
    requireAdmin(user);
    assertDashboardAccess(org);
    const w = ws(user, params.id);
    const id = saveConnection(db, w.id, parseJson(await readBody(req)));
    return { id, sync: await syncConnection(db, id) };
  }, { auth: true });
  r.post('/api/w/:id/connections/:cid/sync', async ({ user, org, params }) => {
    assertDashboardAccess(org);
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

  // -------------------------------------------------------------- billing
  r.get('/api/billing', ({ user, org }) => ({
    org: orgView(db, org),
    plans: publicPlans(),
    enabled: billingEnabled(),
    payments: user.role === 'admin' ? paymentsOf(db, org.id) : [],
  }), { auth: true });

  r.post('/api/billing/checkout', async ({ req, user, org }) => {
    requireAdmin(user);
    if (org.status === 'suspended') throw new HttpError(403, 'الحساب موقوف. تواصل مع الدعم.');
    return createCheckout(db, org, parseJson(await readBody(req)), publicUrl(req));
  }, { auth: true });

  r.post('/api/billing/verify', async ({ user }) => verifyRecent(db, user.org_id), { auth: true });

  r.put('/api/org', async ({ req, user }) => {
    requireAdmin(user);
    const name = String(parseJson(await readBody(req)).name || '').trim().slice(0, 100);
    if (!name) throw new HttpError(400, 'الاسم مطلوب');
    db.prepare('UPDATE organizations SET name = ? WHERE id = ?').run(name, user.org_id);
    invalidateOrg(user.org_id);
    return { ok: true };
  }, { auth: true });

  // ------------------------------------------------------ platform owner
  r.get('/api/platform/overview', ({ user }) => {
    requireSuperadmin(user);
    return platformOverview(db);
  }, { auth: true });
  r.put('/api/platform/orgs/:id', async ({ req, user, params }) => {
    requireSuperadmin(user);
    return updateOrgAdmin(db, Number(params.id), parseJson(await readBody(req)));
  }, { auth: true });
  r.get('/api/platform/backup', ({ user, res }) => {
    requireSuperadmin(user);
    const file = backupTo(db, 'download');
    return readFile(file).then((data) => send(res, 200, data, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="tracking-${new Date().toISOString().slice(0, 10)}.db"`,
    }));
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
        let org = null;
        if (opts.auth) {
          user = currentUser(db, req);
          if (!user) throw new HttpError(401, 'سجّل دخولك أولاً');
          org = getOrg(db, user.org_id);
          if (orgState(org) === 'suspended' && !user.is_superadmin && pathname !== '/api/meta') throw new HttpError(403, 'الحساب موقوف. تواصل مع الدعم.');
        }
        const out = await m.handler({ req, res, url, params: m.params, user, org });
        if (!res.headersSent && out !== undefined) send(res, 200, out);
        return;
      }
      if (m?.methodNotAllowed) throw new HttpError(405, 'method not allowed');
      if (req.method === 'GET' && !pathname.startsWith('/api/')) return await serveStatic(res, pathname);
      throw new HttpError(404, 'not found');
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) send(res, status, { error: status === 500 ? 'internal error' : err.message }, isCollect ? CORS : {});
    }
  };
}

async function serveStatic(res, pathname) {
  const page = PAGES[pathname.replace(/\/$/, '') || '/'];
  const file = normalize(join(PUBLIC_DIR, page || pathname));
  if (!file.startsWith(PUBLIC_DIR)) throw new HttpError(404, 'not found');
  try {
    const data = await readFile(file);
    const ext = extname(file);
    send(res, 200, data, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      ...(ext === '.html' ? SECURITY_HEADERS : {}),
      ...(config.secureCookies ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
    });
  } catch {
    if (!page && !extname(pathname)) {
      const data = await readFile(join(PUBLIC_DIR, '404.html')).catch(() => 'not found');
      send(res, 404, data, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
      return;
    }
    throw new HttpError(404, 'not found');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') {
    const missing = ['SECRET_KEY', 'PUBLIC_URL'].filter((k) => !process.env[k]);
    if (missing.length) {
      console.error(`Missing required env in production: ${missing.join(', ')}`);
      process.exit(1);
    }
  }
  const db = openDb(config.dbPath);
  bootstrap(db);
  const stopJobs = startJobs(db);
  const server = createServer(createApp(db)).listen(config.port, () => {
    console.log(`${config.appName} on http://localhost:${config.port}`);
  });
  const shutdown = () => {
    console.log('Shutting down…');
    server.close();
    stopJobs();
    db.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

/** Optional first account from env (otherwise the first signup owns the platform). */
function bootstrap(db) {
  if (config.adminEmail && config.adminPassword && userCount(db) === 0) {
    signup(db, { name: 'Admin', email: config.adminEmail, password: config.adminPassword, company: config.appName });
    console.log(`Created platform owner ${config.adminEmail}`);
  }
}

