import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { config, DAY } from './config.js';
import { HttpError, parseCookies } from './http.js';

const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'wt_session';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split(':');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'كلمة المرور لازم تكون 8 أحرف على الأقل');
}

export function createUser(db, { email, name, password, role = 'member' }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'البريد غير صحيح');
  validatePassword(password);
  if (!['admin', 'member'].includes(role)) throw new HttpError(400, 'invalid role');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'البريد مستخدم من قبل');
  const res = db.prepare('INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(email, String(name || email).trim().slice(0, 100), hashPassword(password), role, Date.now());
  return Number(res.lastInsertRowid);
}

export function userCount(db) {
  return db.prepare('SELECT COUNT(*) n FROM users').get().n;
}

export function login(db, email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  // Hash anyway so response time doesn't reveal whether the email exists.
  const ok = user ? verifyPassword(String(password || ''), user.password_hash) : (hashPassword('x'), false);
  if (!ok) throw new HttpError(401, 'البريد أو كلمة المرور غير صحيحة');
  return createSession(db, user.id);
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(tokenHash(token), userId, Date.now() + SESSION_DAYS * DAY);
  return token;
}

export function sessionCookie(token, maxAgeSeconds = SESSION_DAYS * 86400) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${config.secureCookies ? '; Secure' : ''}`;
}

export function logout(db, req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

/** Returns the signed-in user, or null. */
export function currentUser(db, req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
                          WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash(token), Date.now());
  return row ? { ...row } : null;
}

export function canAccessWorkspace(db, user, workspaceId) {
  if (user.role === 'admin') return true;
  return !!db.prepare('SELECT 1 FROM user_workspaces WHERE user_id = ? AND workspace_id = ?').get(user.id, workspaceId);
}

export function requireAdmin(user) {
  if (user.role !== 'admin') throw new HttpError(403, 'هذي العملية للمدير فقط');
}

export function bootstrapAdmin(db) {
  if (config.adminEmail && config.adminPassword && userCount(db) === 0) {
    createUser(db, { email: config.adminEmail, name: 'Admin', password: config.adminPassword, role: 'admin' });
    console.log(`Created admin user ${config.adminEmail}`);
  }
}
