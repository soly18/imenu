import crypto from 'crypto';

// The legacy DB password is stored encrypted (AES-256-GCM), never in clear text.
// Key = LEGACY_SECRET if set, else JWT_SECRET. If the key changes, re-enter the password.
function key(): Buffer {
  const secret = process.env.LEGACY_SECRET || process.env.JWT_SECRET || 'dev-only-secret';
  return crypto.scryptSync(secret, 'imenu25-legacy-connection', 32);
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
