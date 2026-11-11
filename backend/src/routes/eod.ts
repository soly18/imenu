import { Router, Response } from 'express';
import { pool } from '../db/connection';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import {
  buildReport, dbNow, getPeriodStart, round2, DECLARABLE_METHODS,
} from '../services/eodReport';
import type {
  EodStatus, EodOpenOrder, ZReportListItem, EodReport,
} from '@imenu25/shared';

const router = Router();
const MANAGERS = requireRole('admin', 'manager', 'cashier');

type Db = typeof pool | import('mysql2/promise').PoolConnection;

async function employeeName(db: Db, id: number): Promise<string> {
  const [rows]: any = await db.execute(
    `SELECT CONCAT(first_name, ' ', last_name) AS name FROM employees WHERE id = ?`, [id]
  );
  return rows[0]?.name ?? '';
}

/** Open orders that still contain items: these block a Z. */
async function openOrdersWithItems(db: Db, branchId: number): Promise<EodOpenOrder[]> {
  const [rows]: any = await db.execute(
    `SELECT o.id, o.order_number AS orderNumber, t.label AS tableLabel,
            CONCAT(e.first_name, ' ', e.last_name) AS employeeName, o.total
     FROM orders o
     LEFT JOIN tables t ON t.id = o.table_id
     JOIN employees e ON e.id = o.employee_id
     WHERE o.branch_id = ? AND o.status IN ('open','sent')
       AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.is_voided = 0)
     ORDER BY o.opened_at`,
    [branchId]
  );
  return rows.map((r: any) => ({
    id: r.id, orderNumber: r.orderNumber, tableLabel: r.tableLabel ?? null,
    employeeName: r.employeeName, total: Number(r.total),
  }));
}

/** Employees whose most recent clock event is a clock-in. */
async function clockedInEmployees(db: Db, branchId: number): Promise<{ id: number; name: string }[]> {
  const [rows]: any = await db.execute(
    `SELECT e.id, CONCAT(e.first_name, ' ', e.last_name) AS name
     FROM employees e
     WHERE e.branch_id = ?
       AND (SELECT ce.event_type FROM employee_clock_events ce
            WHERE ce.employee_id = e.id ORDER BY ce.event_time DESC, ce.id DESC LIMIT 1) = 'clock_in'
     ORDER BY e.first_name`,
    [branchId]
  );
  return rows;
}

// GET /api/eod/status  — what a Z would do right now
router.get('/status', authenticate, MANAGERS, async (req: AuthRequest, res: Response) => {
  const branchId = req.user!.branchId;
  const [zs]: any = await pool.execute(
    `SELECT id, report_number, period_end FROM z_reports WHERE branch_id = ?
     ORDER BY report_number DESC LIMIT 1`, [branchId]
  );
  const openOrders = await openOrdersWithItems(pool, branchId);
  const [[empty]]: any = await pool.execute(
    `SELECT COUNT(*) AS n FROM orders o
     WHERE o.branch_id = ? AND o.status IN ('open','sent')
       AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.is_voided = 0)`,
    [branchId]
  );
  const status: EodStatus = {
    periodStart: (await getPeriodStart(pool, branchId)).toISOString(),
    lastZ: zs.length
      ? { id: zs[0].id, reportNumber: zs[0].report_number, closedAt: zs[0].period_end.toISOString() }
      : null,
    openOrders,
    emptyOpenOrders: Number(empty.n),
    clockedIn: (await clockedInEmployees(pool, branchId)).map((e) => e.name),
    isZRunnable: openOrders.length === 0,
  };
  return res.json(status);
});

// GET /api/eod/x  — live X report for the current period. Read-only: changes nothing.
router.get('/x', authenticate, MANAGERS, async (req: AuthRequest, res: Response) => {
  const branchId = req.user!.branchId;
  const now = await dbNow(pool);
  const report: EodReport = await buildReport(pool, {
    kind: 'X', branchId,
    from: await getPeriodStart(pool, branchId), to: now,
    generatedBy: await employeeName(pool, req.user!.employeeId), generatedAt: now,
  });
  return res.json(report);
});

// GET /api/eod/declaration  — the amounts entered so far in this period
router.get('/declaration', authenticate, MANAGERS, async (req: AuthRequest, res: Response) => {
  const [rows]: any = await pool.execute(
    'SELECT method, amount FROM declarations WHERE branch_id = ? AND z_report_id IS NULL',
    [req.user!.branchId]
  );
  return res.json({
    methods: DECLARABLE_METHODS,
    declarations: rows.map((r: any) => ({ method: r.method, amount: Number(r.amount) })),
  });
});

// POST /api/eod/declaration  { declarations: [{ method, amount }] }  — replaces the pending set
router.post('/declaration', authenticate, MANAGERS, async (req: AuthRequest, res: Response) => {
  const input = req.body?.declarations;
  if (!Array.isArray(input)) return res.status(400).json({ error: 'declarations must be a list' });

  const byMethod = new Map<string, number>();
  for (const d of input) {
    if (d.amount === null || d.amount === undefined || d.amount === '') continue; // not declared
    const amount = Number(d.amount);
    if (!DECLARABLE_METHODS.includes(d.method) || !Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: 'Invalid declaration' });
    }
    byMethod.set(d.method, round2(amount));
  }

  const branchId = req.user!.branchId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM declarations WHERE branch_id = ? AND z_report_id IS NULL', [branchId]);
    for (const [method, amount] of byMethod) {
      await conn.execute(
        'INSERT INTO declarations (branch_id, method, amount, declared_by) VALUES (?, ?, ?, ?)',
        [branchId, method, amount, req.user!.employeeId]
      );
    }
    await conn.commit();
    return res.json({ success: true, saved: byMethod.size });
  } catch (err) {
    await conn.rollback();
    console.error('Declaration failed:', err);
    return res.status(500).json({ error: 'Could not save the declaration' });
  } finally {
    conn.release();
  }
});

// POST /api/eod/z  — close the period. Cannot be undone.
router.post('/z', authenticate, MANAGERS, async (req: AuthRequest, res: Response) => {
  const branchId = req.user!.branchId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Exclusive lock on the branch: waits for payments in progress, blocks new ones,
    // and stops two people running a Z at the same time.
    await conn.execute('SELECT id FROM branches WHERE id = ? FOR UPDATE', [branchId]);

    // A double-click must not create a second (empty) Z report
    const [recent]: any = await conn.execute(
      `SELECT report_number FROM z_reports
       WHERE branch_id = ? AND period_end > DATE_SUB(NOW(), INTERVAL 10 SECOND) LIMIT 1`,
      [branchId]
    );
    if (recent.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'Z_JUST_RUN', reportNumber: recent[0].report_number });
    }

    const blocking = await openOrdersWithItems(conn, branchId);
    if (blocking.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'OPEN_ORDERS', orders: blocking });
    }

    const now = await dbNow(conn);
    const from = await getPeriodStart(conn, branchId);

    // Empty open orders (table opened, nothing ordered) are cancelled by the Z
    const [cancelled]: any = await conn.execute(
      `UPDATE orders o SET o.status = 'cancelled', o.closed_at = ?
       WHERE o.branch_id = ? AND o.status IN ('open','sent')
         AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.is_voided = 0)`,
      [now, branchId]
    );

    // Anyone still clocked in is clocked out at the moment of the Z
    const clocked = await clockedInEmployees(conn, branchId);
    for (const e of clocked) {
      await conn.execute(
        `INSERT INTO employee_clock_events (employee_id, event_type, event_time, notes)
         VALUES (?, 'clock_out', ?, 'Auto clock-out at Z')`,
        [e.id, now]
      );
    }

    const [[next]]: any = await conn.execute(
      'SELECT COALESCE(MAX(report_number), 0) + 1 AS n FROM z_reports WHERE branch_id = ?', [branchId]
    );
    const reportNumber = Number(next.n);

    const report = await buildReport(conn, {
      kind: 'Z', branchId, from, to: now,
      generatedBy: await employeeName(conn, req.user!.employeeId), generatedAt: now,
      reportNumber,
      autoClockedOut: clocked.map((e) => e.name),
      autoCancelledOrders: Number(cancelled.affectedRows),
    });

    const cash = report.declarations.find((d) => d.method === 'cash');
    const [ins]: any = await conn.execute(
      `INSERT INTO z_reports
         (branch_id, report_number, period_start, period_end, gross_sales, discounts, voids,
          net_sales, vat_total, cash_declared, cash_expected, cash_difference,
          generated_by, generated_at, report_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branchId, reportNumber, from, now,
       report.summary.gross, report.summary.discounts, report.summary.voidsTotal,
       report.summary.net, report.summary.vat,
       cash?.declared ?? null, cash?.expected ?? 0, cash?.difference ?? null,
       req.user!.employeeId, now, JSON.stringify(report)]
    );

    // Claim everything this Z reported, so the next period starts clean
    const [claimed]: any = await conn.execute(
      `UPDATE orders SET z_report_id = ?
       WHERE branch_id = ? AND status = 'paid' AND z_report_id IS NULL`,
      [ins.insertId, branchId]
    );
    if (Number(claimed.affectedRows) !== report.summary.orders) {
      throw new Error(`Z claimed ${claimed.affectedRows} orders but reported ${report.summary.orders}`);
    }
    await conn.execute(
      `UPDATE order_items oi JOIN orders o ON o.id = oi.order_id
       SET oi.z_report_id = ?
       WHERE o.branch_id = ? AND oi.is_voided = 1 AND oi.z_report_id IS NULL`,
      [ins.insertId, branchId]
    );
    await conn.execute(
      'UPDATE declarations SET z_report_id = ? WHERE branch_id = ? AND z_report_id IS NULL',
      [ins.insertId, branchId]
    );

    await conn.commit();
    return res.status(201).json({ id: ins.insertId, report });
  } catch (err) {
    await conn.rollback();
    console.error('Z report failed:', err);
    return res.status(500).json({ error: 'Z report failed — nothing was changed' });
  } finally {
    conn.release();
  }
});

// GET /api/eod/z  — history of Z reports (newest first)
router.get('/z', authenticate, MANAGERS, async (req: AuthRequest, res: Response) => {
  const [rows]: any = await pool.execute(
    `SELECT z.id, z.report_number AS reportNumber, z.period_start AS periodStart,
            z.period_end AS periodEnd, z.net_sales AS net, z.discounts, z.vat_total AS vat,
            z.cash_difference AS cashDifference,
            CONCAT(e.first_name, ' ', e.last_name) AS generatedBy, z.generated_at AS generatedAt
     FROM z_reports z JOIN employees e ON e.id = z.generated_by
     WHERE z.branch_id = ? ORDER BY z.report_number DESC LIMIT 100`,
    [req.user!.branchId]
  );
  const list: ZReportListItem[] = rows.map((r: any) => ({
    id: r.id, reportNumber: r.reportNumber,
    periodStart: r.periodStart.toISOString(), periodEnd: r.periodEnd.toISOString(),
    net: Number(r.net), discounts: Number(r.discounts), vat: Number(r.vat),
    cashDifference: r.cashDifference === null ? null : Number(r.cashDifference),
    generatedBy: r.generatedBy, generatedAt: r.generatedAt.toISOString(),
  }));
  return res.json(list);
});

// GET /api/eod/z/:id  — the frozen snapshot of one Z report
router.get('/z/:id', authenticate, MANAGERS, async (req: AuthRequest, res: Response) => {
  const [rows]: any = await pool.execute(
    'SELECT id, report_data FROM z_reports WHERE id = ? AND branch_id = ?',
    [req.params.id, req.user!.branchId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Z report not found' });
  const data = rows[0].report_data;
  const report: EodReport = typeof data === 'string' ? JSON.parse(data) : data; // MariaDB returns text
  return res.json({ id: rows[0].id, report });
});

export default router;
