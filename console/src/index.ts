import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import { initDb, pool } from './db';
import { FEATURES, cleanFeatures, effectiveFeatures } from './features';

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT) || 4000;
const ADMIN_USER = process.env.CONSOLE_ADMIN_USER || 'owner';
const ADMIN_PASS = process.env.CONSOLE_ADMIN_PASSWORD || 'change-me-now';
const SECRET = process.env.CONSOLE_JWT_SECRET || crypto.randomBytes(32).toString('hex'); // random = logins end on restart
const NEW_STATUS = process.env.CONSOLE_NEW_DEVICE_STATUS === 'pending' ? 'pending' : 'allowed';

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());                       // devices call from the app (any origin); the panel uses a bearer token
app.use(express.json({ limit: '100kb' }));
app.use(morgan('dev'));

const safeEq = (a: string, b: string) => {
  const x = crypto.createHash('sha256').update(a).digest(), y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
};
const ymd = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const dateOrNull = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

/* ------------------------------------------------------------------ */
/* Device check-in (public: called by every installed app)             */
/* ------------------------------------------------------------------ */
app.post('/api/v1/checkin', rateLimit({ windowMs: 60_000, limit: 120 }), wrap(async (req, res) => {
  const b = req.body || {};
  const installId = String(b.installId || '');
  if (!/^[\w-]{8,64}$/.test(installId)) return res.status(400).json({ error: 'installId required' });
  const s = (v: any, n: number) => (v == null ? null : String(v).slice(0, n));
  const ip = (req.ip || '').slice(0, 64);

  await pool.query(
    `INSERT INTO devices (install_id, android_id, brand, model, platform, os_version, app_version, last_ip, status, last_seen_at)
     VALUES (?,?,?,?,?,?,?,?,?,NOW())
     ON DUPLICATE KEY UPDATE android_id=VALUES(android_id), brand=VALUES(brand), model=VALUES(model), platform=VALUES(platform),
       os_version=VALUES(os_version), app_version=VALUES(app_version), last_ip=VALUES(last_ip), last_seen_at=NOW()`,
    [installId, s(b.androidId, 64), s(b.brand, 60), s(b.model, 80), s(b.platform, 30), s(b.osVersion, 40), s(b.appVersion, 30), ip, NEW_STATUS]);

  // Attach to a customer with the enrolment code, but only while the device has none.
  const enrol = s(b.enrol, 40);
  if (enrol) {
    await pool.query(
      `UPDATE devices d JOIN customers c ON c.code = ? SET d.customer_id = c.id WHERE d.install_id = ? AND d.customer_id IS NULL`,
      [enrol, installId]);
  }

  const [rows] = await pool.query<any[]>(
    `SELECT d.status, d.licence_until AS dl, d.features AS df, c.is_active, c.licence_until AS cl, c.features AS cf, c.name AS customer
       FROM devices d LEFT JOIN customers c ON c.id = d.customer_id WHERE d.install_id = ?`, [installId]);
  const r = rows[0];
  const until = ymd(r.dl) || ymd(r.cl);
  const today = new Date().toISOString().slice(0, 10);
  let status: 'allowed' | 'blocked' | 'expired' | 'pending' = r.status;
  let message = '';
  if (r.status === 'blocked' || r.is_active === 0) { status = 'blocked'; message = 'This device is blocked. Contact your supplier.'; }
  else if (r.status === 'pending') { message = 'This device is waiting for approval by your supplier.'; }
  else if (until && until < today) { status = 'expired'; message = `Licence expired on ${until}. Contact your supplier.`; }

  res.json({ status, message, licenceUntil: until, customer: r.customer || null,
    features: effectiveFeatures(r.cf, r.df), serverTime: new Date().toISOString() });
}));

/* ------------------------------------------------------------------ */
/* Panel (owner only)                                                  */
/* ------------------------------------------------------------------ */
app.post('/api/panel/login', rateLimit({ windowMs: 15 * 60_000, limit: 20 }), (req, res) => {
  const { username = '', password = '' } = req.body || {};
  if (safeEq(String(username), ADMIN_USER) && safeEq(String(password), ADMIN_PASS))
    return res.json({ token: jwt.sign({ owner: true }, SECRET, { expiresIn: '12h' }) });
  res.status(401).json({ error: 'Wrong username or password' });
});

const auth = (req: Request, res: Response, next: NextFunction) => {
  try { jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), SECRET); next(); }
  catch { res.status(401).json({ error: 'Not signed in' }); }
};
const panel = express.Router();
panel.use(auth);

panel.get('/features', (_req, res) => res.json(FEATURES));

panel.get('/devices', wrap(async (_req, res) => {
  const [rows] = await pool.query<any[]>(
    `SELECT d.*, c.name AS customer_name FROM devices d LEFT JOIN customers c ON c.id = d.customer_id ORDER BY d.last_seen_at DESC, d.id DESC`);
  res.json(rows.map((d) => ({ ...d, licence_until: ymd(d.licence_until) })));
}));

panel.patch('/devices/:id', wrap(async (req, res) => {
  const b = req.body || {}, sets: string[] = [], vals: any[] = [];
  const put = (col: string, v: any) => { sets.push(`${col} = ?`); vals.push(v); };
  if ('label' in b) put('label', String(b.label || '').slice(0, 120) || null);
  if ('serial' in b) put('serial', String(b.serial || '').trim().slice(0, 80) || null);
  if ('notes' in b) put('notes', String(b.notes || '').slice(0, 2000) || null);
  if ('status' in b) { if (!['pending', 'allowed', 'blocked'].includes(b.status)) return res.status(400).json({ error: 'bad status' }); put('status', b.status); }
  if ('customerId' in b) put('customer_id', b.customerId ? Number(b.customerId) : null);
  if ('licenceUntil' in b) put('licence_until', dateOrNull(b.licenceUntil));
  if ('features' in b) { const f = cleanFeatures(b.features); put('features', f ? JSON.stringify(f) : null); }
  if (!sets.length) return res.status(400).json({ error: 'nothing to change' });
  const [r] = await pool.query<any>(`UPDATE devices SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
  res.json({ ok: r.affectedRows > 0 });
}));

panel.delete('/devices/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM devices WHERE id = ?', [req.params.id]); res.json({ ok: true });
}));

panel.get('/customers', wrap(async (_req, res) => {
  const [rows] = await pool.query<any[]>(
    `SELECT c.*, (SELECT COUNT(*) FROM devices d WHERE d.customer_id = c.id) AS device_count FROM customers c ORDER BY c.name`);
  res.json(rows.map((c) => ({ ...c, licence_until: ymd(c.licence_until) })));
}));

const newCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

panel.post('/customers', wrap(async (req, res) => {
  const b = req.body || {}; const name = String(b.name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'name required' });
  const code = String(b.code || '').trim().toUpperCase().slice(0, 40) || newCode();
  try {
    const [r] = await pool.query<any>('INSERT INTO customers (name, code, notes, licence_until, features) VALUES (?,?,?,?,?)',
      [name, code, String(b.notes || '').slice(0, 2000) || null, dateOrNull(b.licenceUntil),
       cleanFeatures(b.features) ? JSON.stringify(cleanFeatures(b.features)) : null]);
    res.status(201).json({ id: r.insertId, code });
  } catch (e: any) { if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'code already used' }); throw e; }
}));

panel.patch('/customers/:id', wrap(async (req, res) => {
  const b = req.body || {}, sets: string[] = [], vals: any[] = [];
  const put = (col: string, v: any) => { sets.push(`${col} = ?`); vals.push(v); };
  if ('name' in b) { const n = String(b.name || '').trim(); if (!n) return res.status(400).json({ error: 'name required' }); put('name', n.slice(0, 120)); }
  if ('code' in b) { const c = String(b.code || '').trim().toUpperCase(); if (!c) return res.status(400).json({ error: 'code required' }); put('code', c.slice(0, 40)); }
  if ('notes' in b) put('notes', String(b.notes || '').slice(0, 2000) || null);
  if ('isActive' in b) put('is_active', b.isActive ? 1 : 0);
  if ('licenceUntil' in b) put('licence_until', dateOrNull(b.licenceUntil));
  if ('features' in b) { const f = cleanFeatures(b.features); put('features', f ? JSON.stringify(f) : null); }
  if (!sets.length) return res.status(400).json({ error: 'nothing to change' });
  try {
    const [r] = await pool.query<any>(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    res.json({ ok: r.affectedRows > 0 });
  } catch (e: any) { if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'code already used' }); throw e; }
}));

panel.delete('/customers/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM customers WHERE id = ?', [req.params.id]); res.json({ ok: true }); // devices stay, unassigned
}));

app.use('/api/panel', panel);
app.get('/api/ping', (_req, res) => res.json({ ok: true, app: 'iMenu25-console' }));
app.use('/', express.static(path.join(__dirname, '..', 'public')));

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err); res.status(500).json({ error: 'Server error' });
});

initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`iMenu25 console on http://localhost:${PORT}`));
  if (ADMIN_PASS === 'change-me-now') console.warn('⚠️  CONSOLE_ADMIN_PASSWORD is still the default — change it in .env');
}).catch((e) => { console.error('Cannot start console:', e.message); process.exit(1); });
