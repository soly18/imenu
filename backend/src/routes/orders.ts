import { Router, Response } from 'express';
import { pool } from '../db/connection';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

const PAYMENT_METHODS = [
  'cash', 'credit_card', 'cheque', 'voucher', 'tab_client', 'member_points', 'gift_card',
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** True when the order exists in this branch and can still be changed. */
async function isOpenOrder(orderId: string | number, branchId: number): Promise<boolean> {
  const [rows]: any = await pool.execute(
    `SELECT id FROM orders WHERE id = ? AND branch_id = ? AND status IN ('open','sent')`,
    [orderId, branchId]
  );
  return rows.length > 0;
}

const CLOSED = { error: 'Order not found or already closed' };

// GET /api/orders?status=open
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { status, tableId } = req.query;
  const params: any[] = [req.user!.branchId];
  let where = 'o.branch_id = ?';
  if (status) { where += ' AND o.status = ?'; params.push(status); }
  if (tableId) { where += ' AND o.table_id = ?'; params.push(tableId); }

  const [orders]: any = await pool.execute(
    `SELECT o.id, o.order_number AS orderNumber, o.table_id AS tableId, t.label AS tableLabel,
            o.employee_id AS employeeId, o.status, o.order_type AS orderType,
            o.guest_count AS guestCount, o.subtotal, o.discount_total AS discountTotal,
            o.vat_total AS vatTotal, o.total, o.opened_at AS openedAt, o.closed_at AS closedAt
     FROM orders o LEFT JOIN tables t ON t.id = o.table_id
     WHERE ${where} ORDER BY o.opened_at DESC`,
    params
  );
  return res.json(orders);
});

// GET /api/orders/:id  (full order with items)
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const [orders]: any = await pool.execute(
    `SELECT o.*, t.label AS tableLabel FROM orders o
     LEFT JOIN tables t ON t.id = o.table_id
     WHERE o.id = ? AND o.branch_id = ?`,
    [req.params.id, req.user!.branchId]
  );
  if (!orders.length) return res.status(404).json({ error: 'Order not found' });

  const [items]: any = await pool.execute(
    `SELECT oi.id, oi.order_id AS orderId, oi.menu_item_id AS menuItemId,
            oi.name_primary AS namePrimary, oi.name_secondary AS nameSecondary,
            oi.quantity, oi.unit_price AS unitPrice, oi.total_price AS totalPrice,
            oi.notes, oi.is_voided AS isVoided, oi.sent_to_kitchen AS sentToKitchen
     FROM order_items oi WHERE oi.order_id = ? AND oi.is_voided = 0 ORDER BY oi.id`,
    [req.params.id]
  );
  const [choiceRows]: any = await pool.execute(
    `SELECT oic.order_item_id AS orderItemId, oic.choice_id AS choiceId,
            oic.name_primary AS namePrimary, oic.extra_price AS extraPrice
     FROM order_item_choices oic JOIN order_items oi ON oi.id = oic.order_item_id
     WHERE oi.order_id = ?`,
    [req.params.id]
  );
  for (const it of items) it.choices = choiceRows.filter((c: any) => c.orderItemId === it.id);

  const [discounts]: any = await pool.execute(
    `SELECT * FROM order_discounts WHERE order_id = ?`,
    [req.params.id]
  );

  return res.json({ ...orders[0], items, discounts });
});

// POST /api/orders  (open new order)
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { tableId, orderType = 'dine_in', guestCount = 1 } = req.body;
  const orderNumber = `${Date.now()}`;

  const [result]: any = await pool.execute(
    `INSERT INTO orders (branch_id, order_number, table_id, employee_id, order_type, guest_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user!.branchId, orderNumber, tableId || null, req.user!.employeeId, orderType, guestCount]
  );
  return res.status(201).json({ id: result.insertId, orderNumber });
});

// POST /api/orders/:id/items   (the price always comes from the menu, never from the browser)
router.post('/:id/items', authenticate, async (req: AuthRequest, res: Response) => {
  if (!(await isOpenOrder(req.params.id, req.user!.branchId))) return res.status(409).json(CLOSED);

  const { menuItemId, choices, notes } = req.body;
  const quantity = Number(req.body.quantity ?? 1);
  if (!(quantity > 0)) return res.status(400).json({ error: 'Quantity must be positive' });

  const [menu]: any = await pool.execute(
    `SELECT mi.id, mi.name_primary, mi.name_secondary, mi.price
     FROM menu_items mi JOIN menu_groups mg ON mg.id = mi.group_id
     WHERE mi.id = ? AND mi.is_active = 1 AND mg.branch_id = ?`,
    [menuItemId, req.user!.branchId]
  );
  if (!menu.length) return res.status(404).json({ error: 'Menu item not found' });
  const m = menu[0];

  const [itemRes]: any = await pool.execute(
    `INSERT INTO order_items (order_id, menu_item_id, name_primary, name_secondary, quantity, unit_price, total_price, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.params.id, m.id, m.name_primary, m.name_secondary, quantity, m.price,
     round2(Number(m.price) * quantity), notes || null]
  );
  const orderItemId = itemRes.insertId;

  for (const c of Array.isArray(choices) ? choices : []) {
    const [rows]: any = await pool.execute(
      `SELECT id, name_primary, extra_price FROM menu_choices WHERE id = ? AND item_id = ? AND is_active = 1`,
      [c.choiceId, m.id]
    );
    if (rows.length) {
      await pool.execute(
        `INSERT INTO order_item_choices (order_item_id, choice_id, name_primary, extra_price) VALUES (?, ?, ?, ?)`,
        [orderItemId, rows[0].id, rows[0].name_primary, rows[0].extra_price]
      );
    }
  }

  await recalcOrder(req.params.id);
  return res.status(201).json({ id: orderItemId });
});

// PUT /api/orders/:id/items/:itemId  (change quantity)
router.put('/:id/items/:itemId', authenticate, async (req: AuthRequest, res: Response) => {
  if (!(await isOpenOrder(req.params.id, req.user!.branchId))) return res.status(409).json(CLOSED);
  const quantity = Number(req.body.quantity);
  if (!(quantity > 0)) return res.status(400).json({ error: 'Quantity must be positive' });
  await pool.execute(
    `UPDATE order_items SET quantity = ?, total_price = ROUND(unit_price * ?, 2)
     WHERE id = ? AND order_id = ? AND is_voided = 0`,
    [quantity, quantity, req.params.itemId, req.params.id]
  );
  await recalcOrder(req.params.id);
  return res.json({ success: true });
});

// DELETE /api/orders/:id/items/:itemId  (void item)
router.delete('/:id/items/:itemId', authenticate, async (req: AuthRequest, res: Response) => {
  if (!(await isOpenOrder(req.params.id, req.user!.branchId))) return res.status(409).json(CLOSED);
  const { reason } = req.body || {};
  await pool.execute(
    `UPDATE order_items SET is_voided = 1, void_reason = ?, void_by = ?, voided_at = NOW()
     WHERE id = ? AND order_id = ? AND is_voided = 0`,
    [reason || 'voided', req.user!.employeeId, req.params.itemId, req.params.id]
  );
  await recalcOrder(req.params.id);
  return res.json({ success: true });
});

// POST /api/orders/:id/send  (send to kitchen)
router.post('/:id/send', authenticate, async (req: AuthRequest, res: Response) => {
  if (!(await isOpenOrder(req.params.id, req.user!.branchId))) return res.status(409).json(CLOSED);
  await pool.execute(
    `UPDATE order_items SET sent_to_kitchen = 1, sent_at = NOW()
     WHERE order_id = ? AND sent_to_kitchen = 0 AND is_voided = 0`,
    [req.params.id]
  );
  await pool.execute(`UPDATE orders SET status = 'sent', sent_at = NOW() WHERE id = ?`, [req.params.id]);
  return res.json({ success: true });
});

// POST /api/orders/:id/pay
router.post('/:id/pay', authenticate, async (req: AuthRequest, res: Response) => {
  const { payments } = req.body; // [{ method, amount, reference }]
  if (!Array.isArray(payments) || !payments.length) {
    return res.status(400).json({ error: 'No payments given' });
  }

  const branchId = req.user!.branchId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Shared lock on the branch row: an end-of-day Z (which takes it exclusively)
    // can never run half-way through a payment.
    await conn.execute('SELECT id FROM branches WHERE id = ? LOCK IN SHARE MODE', [branchId]);

    const [orders]: any = await conn.execute(
      'SELECT id, total, status FROM orders WHERE id = ? AND branch_id = ? FOR UPDATE',
      [req.params.id, branchId]
    );
    if (!orders.length || !['open', 'sent'].includes(orders[0].status)) {
      await conn.rollback();
      return res.status(409).json(CLOSED);
    }

    const total = Number(orders[0].total);
    if (!(total > 0)) {
      await conn.rollback();
      return res.status(400).json({ error: 'Nothing to pay' });
    }

    let paid = 0;
    for (const p of payments) {
      const amount = Number(p.amount);
      if (!PAYMENT_METHODS.includes(p.method) || !(amount > 0)) {
        await conn.rollback();
        return res.status(400).json({ error: 'Invalid payment' });
      }
      paid += amount;
    }
    if (Math.abs(paid - total) > 0.009) {
      await conn.rollback();
      return res.status(400).json({ error: 'Payments must add up to the order total', total });
    }

    for (const p of payments) {
      await conn.execute(
        `INSERT INTO payments (order_id, method, amount, reference, processed_by) VALUES (?, ?, ?, ?, ?)`,
        [req.params.id, p.method, round2(Number(p.amount)), p.reference || null, req.user!.employeeId]
      );
    }
    await conn.execute(`UPDATE orders SET status = 'paid', closed_at = NOW() WHERE id = ?`, [req.params.id]);
    await conn.commit();
    return res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('Payment failed:', err);
    return res.status(500).json({ error: 'Payment failed' });
  } finally {
    conn.release();
  }
});

/**
 * Recalculate order totals. Prices include VAT: VAT is extracted per item using that
 * item's own rate, then scaled down by any order-level discount.
 */
async function recalcOrder(orderId: string | number) {
  const [[sums]]: any = await pool.execute(
    `SELECT COALESCE(SUM(oi.total_price + COALESCE(ex.extras, 0) * oi.quantity), 0) AS subtotal,
            COALESCE(SUM((oi.total_price + COALESCE(ex.extras, 0) * oi.quantity)
                         * mi.vat_rate / (100 + mi.vat_rate)), 0) AS vatIncluded
     FROM order_items oi
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     LEFT JOIN (SELECT order_item_id, SUM(extra_price) AS extras
                FROM order_item_choices GROUP BY order_item_id) ex ON ex.order_item_id = oi.id
     WHERE oi.order_id = ? AND oi.is_voided = 0`,
    [orderId]
  );
  const subtotal = round2(Number(sums.subtotal));

  const [discs]: any = await pool.execute(
    'SELECT type, value FROM order_discounts WHERE order_id = ?', [orderId]
  );
  let discount = 0;
  for (const d of discs) {
    // 'percent' is a percentage of the subtotal; 'fixed' and 'preset' are amounts
    discount += d.type === 'percent' ? subtotal * Number(d.value) / 100 : Number(d.value);
  }
  discount = round2(Math.min(discount, subtotal));

  const total = round2(subtotal - discount);
  const vat = subtotal > 0 ? round2(Number(sums.vatIncluded) * (total / subtotal)) : 0;

  await pool.execute(
    `UPDATE orders SET subtotal = ?, discount_total = ?, vat_total = ?, total = ? WHERE id = ?`,
    [subtotal, discount, vat, total, orderId]
  );
}


// POST /api/orders/:id/cancel — manager/admin cancels an unpaid open order (e.g. one blocking a Z)
router.post('/:id/cancel', authenticate, requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  const branchId = req.user!.branchId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('SELECT id FROM branches WHERE id = ? LOCK IN SHARE MODE', [branchId]);
    const [r]: any = await conn.execute(
      `UPDATE orders SET status = 'cancelled', closed_at = NOW()
       WHERE id = ? AND branch_id = ? AND status IN ('open','sent')`,
      [req.params.id, branchId]
    );
    if (!r.affectedRows) { await conn.rollback(); return res.status(409).json(CLOSED); }
    await conn.commit();
    return res.json({ success: true });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    return res.status(500).json({ error: 'Cancel failed' });
  } finally {
    conn.release();
  }
});

export default router;
