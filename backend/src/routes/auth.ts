import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { pool } from '../db/connection';
import { authenticate, AuthRequest, deviceUidOf, requiresApproval, invalidateAuthCache } from '../middleware/auth';
import type { JwtPayload } from '@imenu25/shared';

/** Friendly device name from the User-Agent, e.g. "Android · Chrome". The admin can rename it. */
function deviceNameFrom(ua: string, platform: string): string {
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'Device';
  const br = platform === 'android-app' ? 'App' : /edg\//i.test(ua) ? 'Edge' : /firefox/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${br}`;
}

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { pin, branchId = 1 } = req.body;

  if (!pin) {
    return res.status(400).json({ error: 'PIN is required' });
  }

  try {
    const [rows]: any = await pool.execute(
      `SELECT id, code, first_name, last_name, role, pin, language, branch_id, is_active
       FROM employees WHERE branch_id = ? AND is_active = 1`,
      [branchId]
    );

    // Find employee with matching PIN
    let matched: any = null;
    for (const emp of rows) {
      const ok = await bcrypt.compare(String(pin), emp.pin);
      if (ok) { matched = emp; break; }
    }

    if (!matched) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    // ── device registration / policy ────────────────────────────────────────
    const uid = deviceUidOf(req);
    if (uid) {
      const ua = String(req.headers['user-agent'] || '').slice(0, 255);
      const platform = ['android-app', 'web'].includes(String(req.body.platform)) ? String(req.body.platform) : 'web';
      const ip = String(req.ip || '').replace('::ffff:', '').slice(0, 64);
      const initial = (await requiresApproval(matched.branch_id)) ? 'pending' : 'allowed';
      await pool.execute(
        `INSERT INTO devices (branch_id, device_uid, name, platform, user_agent, last_ip, last_employee_id, status)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE last_seen_at = NOW(), last_ip = VALUES(last_ip), user_agent = VALUES(user_agent),
           platform = VALUES(platform), last_employee_id = VALUES(last_employee_id)`,
        [matched.branch_id, uid, deviceNameFrom(ua, platform), platform, ua, ip, matched.id, initial]
      );
      invalidateAuthCache();
      const [[dev]]: any = await pool.execute('SELECT status FROM devices WHERE branch_id = ? AND device_uid = ?', [matched.branch_id, uid]);
      if (dev.status === 'blocked') return res.status(403).json({ error: 'This device is blocked', code: 'DEVICE_BLOCKED' });
      // admins may always sign in (so nobody can lock themselves out); everyone else needs an allowed device
      if (dev.status === 'pending' && matched.role !== 'admin' && (await requiresApproval(matched.branch_id))) {
        return res.status(403).json({ error: 'This device is waiting for approval', code: 'DEVICE_PENDING' });
      }
    } else if (matched.role !== 'admin' && (await requiresApproval(matched.branch_id))) {
      return res.status(403).json({ error: 'This device is waiting for approval', code: 'DEVICE_PENDING' });
    }
    await pool.execute('UPDATE employees SET last_login_at = NOW() WHERE id = ?', [matched.id]);

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      userId: matched.id,
      employeeId: matched.id,
      role: matched.role,
      branchId: matched.branch_id,
    };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
      expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as SignOptions['expiresIn'],
    });
    const refreshToken = jwt.sign(
      { employeeId: matched.id },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as SignOptions['expiresIn'] }
    );

    // Store refresh token hash
    const tokenHash = await bcrypt.hash(refreshToken, 8);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.execute(
      `INSERT INTO refresh_tokens (employee_id, token_hash, expires_at) VALUES (?, ?, ?)`,
      [matched.id, tokenHash, expiresAt]
    );

    return res.json({
      accessToken,
      refreshToken,
      employee: {
        id: matched.id,
        firstName: matched.first_name,
        lastName: matched.last_name,
        role: matched.role,
        branchId: matched.branch_id,
        language: matched.language,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  try {
    const decoded: any = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!);
    const [rows]: any = await pool.execute(
      `SELECT rt.*, e.role, e.branch_id FROM refresh_tokens rt
       JOIN employees e ON e.id = rt.employee_id
       WHERE rt.employee_id = ? AND rt.expires_at > NOW() AND e.is_active = 1`,
      [decoded.employeeId]
    );

    if (!rows.length) return res.status(401).json({ error: 'Invalid refresh token' });

    // Verify hash
    let valid = false;
    for (const row of rows) {
      if (await bcrypt.compare(refreshToken, row.token_hash)) { valid = true; break; }
    }
    if (!valid) return res.status(401).json({ error: 'Invalid refresh token' });

    const emp = rows[0];
    const accessToken = jwt.sign(
      { userId: decoded.employeeId, employeeId: decoded.employeeId, role: emp.role, branchId: emp.branch_id },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as SignOptions['expiresIn'] }
    );

    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  await pool.execute(`DELETE FROM refresh_tokens WHERE employee_id = ?`, [req.user!.employeeId]);
  return res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const [rows]: any = await pool.execute(
    `SELECT id, code, first_name, last_name, role, language, branch_id FROM employees WHERE id = ?`,
    [req.user!.employeeId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const e = rows[0];
  return res.json({
    id: e.id, code: e.code,
    firstName: e.first_name, lastName: e.last_name,
    role: e.role, language: e.language, branchId: e.branch_id,
  });
});

export default router;
