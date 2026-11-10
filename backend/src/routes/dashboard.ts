import { Router, Response } from 'express';
import { pool } from '../db/connection';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/dashboard/kpis
router.get('/kpis', authenticate, requireRole('admin', 'manager', 'cashier'), async (req: AuthRequest, res: Response) => {
  const branchId = req.user!.branchId;

  const [[tables]]: any = await pool.execute(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN o.status IN ('open','sent') THEN 1 ELSE 0 END) AS occupied
     FROM tables t
     LEFT JOIN orders o ON o.table_id = t.id AND o.status IN ('open','sent')
     JOIN floor_plans fp ON fp.id = t.floor_plan_id
     WHERE fp.branch_id = ? AND t.is_active = 1`,
    [branchId]
  );

  // Sales of the current period = paid orders no Z report has claimed yet (like the X report)
  const [[revenue]]: any = await pool.execute(
    `SELECT COALESCE(SUM(total), 0) AS today,
            COALESCE(AVG(total), 0) AS avg_check
     FROM orders WHERE branch_id = ? AND status = 'paid' AND z_report_id IS NULL`,
    [branchId]
  );

  const [[activeOrders]]: any = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM orders WHERE branch_id = ? AND status IN ('open','sent')`,
    [branchId]
  );

  const [[clocked]]: any = await pool.execute(
    `SELECT COUNT(DISTINCT e.id) AS cnt FROM employees e
     JOIN (
       SELECT employee_id, MAX(event_time) AS last_event FROM employee_clock_events GROUP BY employee_id
     ) last ON last.employee_id = e.id
     JOIN employee_clock_events ce ON ce.employee_id = e.id AND ce.event_time = last.last_event
     WHERE e.branch_id = ? AND ce.event_type = 'clock_in'`,
    [branchId]
  );

  return res.json({
    openTables: Number(tables.occupied) || 0,
    totalTables: Number(tables.total) || 0,
    activeOrders: Number(activeOrders.cnt),
    revenueToday: Number(revenue.today),
    avgCheckSize: Number(revenue.avg_check),
    clockedInEmployees: Number(clocked.cnt),
  });
});

// GET /api/dashboard/floor
router.get('/floor', authenticate, async (req: AuthRequest, res: Response) => {
  const [tables]: any = await pool.execute(
    `SELECT t.id, t.label, t.shape, t.pos_x AS x, t.pos_y AS y, t.width, t.height, t.capacity,
            CASE WHEN o.id IS NOT NULL THEN 'occupied' ELSE 'free' END AS status,
            o.id AS currentOrderId, o.guest_count AS guestCount, o.opened_at AS openedAt
     FROM tables t
     JOIN floor_plans fp ON fp.id = t.floor_plan_id
     LEFT JOIN orders o ON o.table_id = t.id AND o.status IN ('open','sent')
     WHERE fp.branch_id = ? AND t.is_active = 1 AND fp.is_active = 1
     ORDER BY t.label`,
    [req.user!.branchId]
  );
  return res.json(tables);
});

// POST /api/dashboard/clock
router.post('/clock', authenticate, async (req: AuthRequest, res: Response) => {
  const { eventType } = req.body; // 'clock_in' | 'clock_out'
  await pool.execute(
    `INSERT INTO employee_clock_events (employee_id, event_type) VALUES (?, ?)`,
    [req.user!.employeeId, eventType]
  );
  return res.json({ success: true, eventType, time: new Date().toISOString() });
});

export default router;
