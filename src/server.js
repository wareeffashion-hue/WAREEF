import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { openDb } from './db.js';
import { MODELS, DEFAULT_MODEL } from './attribution.js';
import { CHANNELS } from './channels.js';
import { HttpError, importSpendCsv, recordEvent, recordSallaWebhook, upsertOrder, verifySallaSignature } from './ingest.js';
import { buildJourneys, buildReport, parseReportParams } from './report.js';
import { TRACKER_SOURCE } from './tracker.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const MAX_BODY = 5 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseJson(buf) {
  try {
    return JSON.parse(buf.toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
}

function send(res, status, body, headers = {}) {
  const isString = typeof body === 'string' || Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isString ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', ...headers });
  res.end(isString ? body : JSON.stringify(body));
}

function isAuthorized(req) {
  if (!config.adminPassword) return true;
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const password = Buffer.from(m[1], 'base64').toString().split(':').slice(1).join(':');
  const a = Buffer.from(password);
  const b = Buffer.from(config.adminPassword);
  return a.length === b.length && timingSafeEqual(a, b);
}

function publicUrl(req) {
  if (config.publicUrl) return config.publicUrl;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}`;
}

async function serveStatic(res, pathname) {
  const file = normalize(join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC_DIR)) throw new HttpError(404, 'not found');
  try {
    const data = await readFile(file);
    send(res, 200, data, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  } catch {
    throw new HttpError(404, 'not found');
  }
}

export function createApp(db) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    try {
      // --- Public endpoints (called from the store) ---
      if (pathname === '/t.js' && req.method === 'GET') {
        return send(res, 200, TRACKER_SOURCE.replace('__ENDPOINT__', publicUrl(req)), {
          'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600',
        });
      }
      if (pathname === '/collect') {
        if (req.method === 'OPTIONS') return send(res, 204, '', cors);
        if (req.method !== 'POST') throw new HttpError(405, 'method not allowed');
        const result = recordEvent(db, parseJson(await readBody(req)));
        return send(res, 200, result, cors);
      }
      if (pathname === '/webhooks/salla' && req.method === 'POST') {
        const raw = await readBody(req);
        if (!verifySallaSignature(raw, req.headers['x-salla-signature'], config.sallaWebhookSecret)) {
          throw new HttpError(401, 'invalid signature');
        }
        return send(res, 200, recordSallaWebhook(db, parseJson(raw)));
      }
      if (pathname === '/health') return send(res, 200, { ok: true });

      // --- Admin: dashboard + API ---
      if (!isAuthorized(req)) {
        return send(res, 401, 'authentication required', { 'WWW-Authenticate': 'Basic realm="tracking"' });
      }
      if (pathname === '/api/meta' && req.method === 'GET') {
        return send(res, 200, { models: MODELS, defaultModel: DEFAULT_MODEL, channels: CHANNELS, currency: config.currency, snippetUrl: `${publicUrl(req)}/t.js`, webhookUrl: `${publicUrl(req)}/webhooks/salla` });
      }
      if (pathname === '/api/report' && req.method === 'GET') {
        return send(res, 200, buildReport(db, parseReportParams(url.searchParams)));
      }
      if (pathname === '/api/journeys' && req.method === 'GET') {
        return send(res, 200, buildJourneys(db, parseReportParams(url.searchParams)));
      }
      if (pathname === '/api/spend' && req.method === 'POST') {
        return send(res, 200, importSpendCsv(db, (await readBody(req)).toString('utf8')));
      }
      if (pathname === '/api/orders' && req.method === 'POST') {
        // Generic order import for non-Salla stores: {order_id, value, status?, ts?, visitor_id?}
        const body = parseJson(await readBody(req));
        const orders = Array.isArray(body) ? body : [body];
        for (const o of orders) {
          if (!o.order_id) throw new HttpError(400, 'order_id is required');
          upsertOrder(db, {
            orderId: String(o.order_id), visitorId: o.visitor_id || null, ts: Date.parse(o.ts || '') || Date.now(),
            value: Number(o.value) || 0, currency: o.currency || null, status: o.status || null, confirmed: true,
          });
        }
        return send(res, 200, { imported: orders.length });
      }
      if (req.method === 'GET' && !pathname.startsWith('/api/')) return await serveStatic(res, pathname);
      throw new HttpError(404, 'not found');
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      return send(res, status, { error: status === 500 ? 'internal error' : err.message }, pathname === '/collect' ? cors : {});
    }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb(config.dbPath);
  createServer(createApp(db)).listen(config.port, () => {
    console.log(`Tracking server on http://localhost:${config.port}`);
  });
}
