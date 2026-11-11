import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/connection';
import { authenticate, requireRole, invalidateAuthCache, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireRole('admin'));

const ROLES = ['admin', 'manager', 'cashier', 'waiter', 'kitchen'];
const DEVICE_STATUS = ['pending', 'allowed', 'blocked'];

async function pinTaken(branchId: number, pin: string, exceptId?: number): Promise<boolean> {
  const [rows]: any = await pool.execute('SELECT id, pin FROM employees WHERE branch_id = ? AND is_active = 1', [branchId]);
  for (const r of rows) if (r.id !== exceptId && (await bcrypt.compare(pin, r.pin))) return true;
  return false;
}
const validPin = (p: any) => typeof p === 'string' && /^\d{4,8}$/.test(p);

// ── summary (badge in the menu) ──────────────────────────────────────────────
router.get('/summary', async (req: AuthRequest, res: Response) => {
  const [[r]]: any = await pool.execute("SELECT COUNT(*) AS n FROM devices WHERE branch_id = ? AND status = 'pending'", [req.user!.branchId]);
  return res.json({ pendingDevices: Number(r.n) });
});

// ── users ────────────────────────────────────────────────────────────────────
router.get('/users', async (req: AuthRequest, res: Response) => {
  const [rows]: any = await pool.execute(
    `SELECT id, code, first_name AS firstName, last_name AS lastName, role, is_active AS isActive, last_login_at AS lastLoginAt
     FROM employees WHERE branch_id = ? ORDER BY is_active DESC, FIELD(role,'admin','manager','cashier','waiter','kitchen'), first_name`,
    [req.user!.branchId]);
  return res.json(rows.map((r: any) => ({ ...r, isActive: !!r.isActive })));
});

router.post('/users', async (req: AuthRequest, res: Response) => {
  const { firstName, lastName, role, pin } = req.body ?? {};
  if (!String(firstName ?? '').trim()) return res.status(400).json({ error: 'First name is required', code: 'NAME_REQUIRED' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role', code: 'BAD_ROLE' });
  if (!validPin(pin)) return res.status(400).json({ error: 'PIN must be 4-8 digits', code: 'BAD_PIN' });
  if (await pinTaken(req.user!.branchId, pin)) return res.status(409).json({ error: 'This PIN is already used', code: 'PIN_TAKEN' });
  const hash = await bcrypt.hash(pin, 10);
  const code = `U${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
  const [r]: any = await pool.execute(
    'INSERT INTO employees (branch_id, code, first_name, last_name, role, pin, is_active) VALUES (?,?,?,?,?,?,1)',
    [req.user!.branchId, code, String(firstName).trim().slice(0, 100), String(lastName ?? '').trim().slice(0, 100) || '-', role, hash]);
  return res.status(201).json({ id: r.insertId });
});

router.patch('/users/:id', async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id); const branchId = req.user!.branchId;
  const [rows]: any = await pool.execute('SELECT id, role, is_active FROM employees WHERE id = ? AND branch_id = ?', [id, branchId]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  const cur = rows[0]; const b = req.body ?? {};
  const sets: string[] = []; const vals: any[] = [];

  const newRole = b.role !== undefined ? b.role : cur.role;
  const newActive = b.isActive !== undefined ? !!b.isActive : !!cur.is_active;
  if (b.role !== undefined && !ROLES.includes(b.role)) return res.status(400).json({ error: 'Invalid role', code: 'BAD_ROLE' });

  // guard rails: you cannot lock yourself out, and the system always keeps one active admin
  if (id === req.user!.employeeId && (newRole !== 'admin' || !newActive)) {
    return res.status(400).json({ error: 'You cannot disable or demote yourself', code: 'SELF' });
  }
  if (cur.role === 'admin' && cur.is_active && (newRole !== 'admin' || !newActive)) {
    const [[n]]: any = await pool.execute("SELECT COUNT(*) AS n FROM employees WHERE branch_id = ? AND role = 'admin' AND is_active = 1", [branchId]);
    if (Number(n.n) <= 1) return res.status(400).json({ error: 'At least one active administrator is required', code: 'LAST_ADMIN' });
  }
  if (b.firstName !== undefined) { if (!String(b.firstName).trim()) return res.status(400).json({ error: 'First name is required', code: 'NAME_REQUIRED' }); sets.push('first_name = ?'); vals.push(String(b.firstName).trim().slice(0, 100)); }
  if (b.lastName !== undefined) { sets.push('last_name = ?'); vals.push(String(b.lastName).trim().slice(0, 100) || '-'); }
  if (b.role !== undefined) { sets.push('role = ?'); vals.push(b.role); }
  if (b.isActive !== undefined) { sets.push('is_active = ?'); vals.push(newActive ? 1 : 0); }
  let pinChanged = false;
  if (b.pin !== undefined) {
    if (!validPin(b.pin)) return res.status(400).json({ error: 'PIN must be 4-8 digits', code: 'BAD_PIN' });
    if (await pinTaken(branchId, b.pin, id)) return res.status(409).json({ error: 'This PIN is already used', code: 'PIN_TAKEN' });
    sets.push('pin = ?'); vals.push(await bcrypt.hash(b.pin, 10)); pinChanged = true;
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to change' });
  await pool.execute(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
  // disabling or a new PIN ends every session of that user
  if ((b.isActive === false) || pinChanged) await pool.execute('DELETE FROM refresh_tokens WHERE employee_id = ?', [id]);
  invalidateAuthCache();
  return res.json({ success: true });
});

// ── devices ──────────────────────────────────────────────────────────────────
router.get('/devices', async (req: AuthRequest, res: Response) => {
  const [rows]: any = await pool.execute(
    `SELECT d.id, d.device_uid AS uid, d.name, d.platform, d.user_agent AS userAgent, d.last_ip AS lastIp, d.status,
            d.first_seen_at AS firstSeenAt, d.last_seen_at AS lastSeenAt,
            CONCAT(e.first_name, ' ', e.last_name) AS lastUser
     FROM devices d LEFT JOIN employees e ON e.id = d.last_employee_id
     WHERE d.branch_id = ? ORDER BY FIELD(d.status,'pending','allowed','blocked'), d.last_seen_at DESC`,
    [req.user!.branchId]);
  return res.json(rows.map((r: any) => ({ ...r, isThisDevice: !!req.deviceUid && r.uid === req.deviceUid })));
});

router.patch('/devices/:id', async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id); const b = req.body ?? {};
  const [rows]: any = await pool.execute('SELECT id, device_uid FROM devices WHERE id = ? AND branch_id = ?', [id, req.user!.branchId]);
  if (!rows.length) return res.status(404).json({ error: 'Device not found' });
  const sets: string[] = []; const vals: any[] = [];
  if (b.status !== undefined) {
    if (!DEVICE_STATUS.includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
    if (b.status === 'blocked' && req.deviceUid && rows[0].device_uid === req.deviceUid) {
      return res.status(400).json({ error: 'You cannot block the device you are using', code: 'SELF_DEVICE' });
    }
    sets.push('status = ?'); vals.push(b.status);
  }
  if (b.name !== undefined) {
    const n = String(b.name).trim().slice(0, 100);
    if (!n) return res.status(400).json({ error: 'Name is required' });
    sets.push('name = ?'); vals.push(n);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to change' });
  await pool.execute(`UPDATE devices SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
  invalidateAuthCache();
  return res.json({ success: true });
});

// forget a device: it registers again (as pending, if approval is on) the next time someone signs in on it
router.delete('/devices/:id', async (req: AuthRequest, res: Response) => {
  const [rows]: any = await pool.execute('SELECT device_uid FROM devices WHERE id = ? AND branch_id = ?', [req.params.id, req.user!.branchId]);
  if (!rows.length) return res.status(404).json({ error: 'Device not found' });
  if (req.deviceUid && rows[0].device_uid === req.deviceUid) return res.status(400).json({ error: 'You cannot remove the device you are using', code: 'SELF_DEVICE' });
  await pool.execute('DELETE FROM devices WHERE id = ?', [req.params.id]);
  invalidateAuthCache();
  return res.json({ success: true });
});

// ── settings ─────────────────────────────────────────────────────────────────
router.get('/settings', async (req: AuthRequest, res: Response) => {
  const [[r]]: any = await pool.execute('SELECT require_device_approval AS requireDeviceApproval FROM branches WHERE id = ?', [req.user!.branchId]);
  return res.json({ requireDeviceApproval: !!r.requireDeviceApproval });
});

router.put('/settings', async (req: AuthRequest, res: Response) => {
  const on = !!req.body?.requireDeviceApproval;
  const branchId = req.user!.branchId;
  await pool.execute('UPDATE branches SET require_device_approval = ? WHERE id = ?', [on ? 1 : 0, branchId]);
  // approval switched off: nobody is waiting any more
  if (!on) await pool.execute("UPDATE devices SET status = 'allowed' WHERE branch_id = ? AND status = 'pending'", [branchId]);
  // the device the admin is using right now stays usable
  if (on && req.deviceUid) await pool.execute("UPDATE devices SET status = 'allowed' WHERE branch_id = ? AND device_uid = ? AND status = 'pending'", [branchId, req.deviceUid]);
  invalidateAuthCache();
  return res.json({ requireDeviceApproval: on });
});

export default router;
