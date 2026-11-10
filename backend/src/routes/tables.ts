import { Router, Response } from 'express';
import { pool } from '../db/connection';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/tables — floor plans with every table and its current open order (if any)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const branchId = req.user!.branchId;
  const [plans]: any = await pool.execute(
    'SELECT id, name FROM floor_plans WHERE branch_id = ? AND is_active = 1 ORDER BY id', [branchId]);
  const [tables]: any = await pool.execute(
    `SELECT t.id, t.floor_plan_id AS floorPlanId, t.label, t.shape, t.pos_x AS x, t.pos_y AS y,
            t.width, t.height, t.capacity
     FROM tables t JOIN floor_plans f ON f.id = t.floor_plan_id
     WHERE f.branch_id = ? AND t.is_active = 1 ORDER BY t.id`, [branchId]);
  // the newest open/sent order of each table; "orderCount" > 1 means a split / extra order
  const [orders]: any = await pool.execute(
    `SELECT o.id, o.table_id AS tableId, o.status, o.total, o.guest_count AS guestCount,
            o.opened_at AS openedAt, o.employee_id AS employeeId,
            CONCAT(e.first_name, ' ', e.last_name) AS employeeName
     FROM orders o JOIN employees e ON e.id = o.employee_id
     WHERE o.branch_id = ? AND o.table_id IS NOT NULL AND o.status IN ('open','sent')
     ORDER BY o.opened_at DESC`, [branchId]);

  const byTable = new Map<number, any>();
  for (const o of orders) {
    const cur = byTable.get(o.tableId);
    if (!cur) byTable.set(o.tableId, { ...o, total: Number(o.total), orderCount: 1 });
    else cur.orderCount += 1;
  }
  return res.json(plans.map((p: any) => ({
    id: p.id, name: p.name,
    tables: tables.filter((t: any) => t.floorPlanId === p.id)
      .map((t: any) => ({ ...t, order: byTable.get(t.id) ?? null })),
  })));
});

export default router;
