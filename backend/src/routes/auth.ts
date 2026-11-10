import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { pool } from '../db/connection';
import { authenticate, AuthRequest } from '../middleware/auth';
import type { JwtPayload } from '@imenu25/shared';

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
       WHERE rt.employee_id = ? AND rt.expires_at > NOW()`,
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
