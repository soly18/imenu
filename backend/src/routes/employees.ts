import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/connection';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/employees
router.get('/', authenticate, requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  const [rows] = await pool.execute(
    `SELECT id, code, first_name AS firstName, last_name AS lastName, role,
            language, phone, email, is_active AS isActive, hire_date AS hireDate
     FROM employees WHERE branch_id = ? ORDER BY last_name, first_name`,
    [req.user!.branchId]
  );
  return res.json(rows);
});

// POST /api/employees
router.post('/', authenticate, requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  const { code, firstName, lastName, role, pin, language, phone, email } = req.body;
  const pinHash = await bcrypt.hash(String(pin), 10);
  const [result]: any = await pool.execute(
    `INSERT INTO employees (branch_id, code, first_name, last_name, role, pin, language, phone, email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user!.branchId, code, firstName, lastName, role, pinHash, language || 'he', phone || null, email || null]
  );
  return res.status(201).json({ id: result.insertId });
});

// PUT /api/employees/:id
router.put('/:id', authenticate, requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  const { firstName, lastName, role, language, phone, email, isActive, pin } = req.body;
  let pinUpdate = '';
  const params: any[] = [firstName, lastName, role, language, phone || null, email || null, isActive ? 1 : 0];
  if (pin) {
    pinUpdate = ', pin=?';
    params.push(await bcrypt.hash(String(pin), 10));
  }
  params.push(req.params.id, req.user!.branchId);
  await pool.execute(
    `UPDATE employees SET first_name=?, last_name=?, role=?, language=?, phone=?, email=?, is_active=?${pinUpdate}
     WHERE id=? AND branch_id=?`,
    params
  );
  return res.json({ success: true });
});

// GET /api/employees/:id/clock-history
router.get('/:id/clock-history', authenticate, requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  const [rows] = await pool.execute(
    `SELECT event_type AS eventType, event_time AS eventTime FROM employee_clock_events
     WHERE employee_id = ? ORDER BY event_time DESC LIMIT 100`,
    [req.params.id]
  );
  return res.json(rows);
});

export default router;
