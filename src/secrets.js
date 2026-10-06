// Encrypts ad-platform credentials at rest (AES-256-GCM).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from './config.js';

let key;

function getKey() {
  if (key) return key;
  let secret = config.secretKey;
  if (!secret) {
    // Dev fallback: a random key persisted next to the database.
    const file = config.dbPath === ':memory:' ? null : join(dirname(config.dbPath), '.secret-key');
    if (file && existsSync(file)) secret = readFileSync(file, 'utf8').trim();
    else {
      secret = randomBytes(32).toString('hex');
      if (file) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, secret, { mode: 0o600 });
      }
    }
  }
  key = createHash('sha256').update(secret).digest();
  return key;
}

export function encrypt(obj) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(text) {
  const [iv, tag, data] = text.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}
