import { Router, Response } from 'express';
import { pool } from '../db/connection';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

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

// POST /api/orders/:id/items
router.post('/:id/items', authenticate, async (req: AuthRequest, res: Response) => {
  const { menuItemId, quantity, unitPrice, choices, notes } = req.body;
  const totalPrice = unitPrice * quantity;

  const [itemRes]: any = await pool.execute(
    `INSERT INTO order_items (order_id, menu_item_id, name_primary, name_secondary, quantity, unit_price, total_price, notes)
     SELECT ?, mi.id, mi.name_primary, mi.name_secondary, ?, ?, ?, ?
     FROM menu_items mi WHERE mi.id = ?`,
    [req.params.id, quantity, unitPrice, totalPrice, notes || null, menuItemId]
  );
  const orderItemId = itemRes.insertId;

  if (choices?.length) {
    for (const c of choices) {
      await pool.execute(
        `INSERT INTO order_item_choices (order_item_id, choice_id, name_primary, extra_price)
         VALUES (?, ?, ?, ?)`,
        [orderItemId, c.choiceId, c.namePrimary, c.extraPrice || 0]
      );
    }
  }

  await recalcOrder(req.params.id);
  return res.status(201).json({ id: orderItemId });
});

// PUT /api/orders/:id/items/:itemId  (change quantity)
router.put('/:id/items/:itemId', authenticate, async (req: AuthRequest, res: Response) => {
  const quantity = Number(req.body.quantity);
  if (!(quantity > 0)) return res.status(400).json({ error: 'Quantity must be positive' });
  await pool.execute(
    `UPDATE order_items SET quantity=?, total_price=unit_price*? WHERE id=? AND order_id=?`,
    [quantity, quantity, req.params.itemId, req.params.id]
  );
  await recalcOrder(req.params.id);
  return res.json({ success: true });
});

// DELETE /api/orders/:id/items/:itemId  (void item)
router.delete('/:id/items/:itemId', authenticate, async (req: AuthRequest, res: Response) => {
  const { reason } = req.body;
  await pool.execute(
    `UPDATE order_items SET is_voided=1, void_reason=?, void_by=? WHERE id=? AND order_id=?`,
    [reason || 'voided', req.user!.employeeId, req.params.itemId, req.params.id]
  );
  await recalcOrder(req.params.id);
  return res.json({ success: true });
});

// POST /api/orders/:id/send  (send to kitchen)
router.post('/:id/send', authenticate, async (req: AuthRequest, res: Response) => {
  await pool.execute(
    `UPDATE order_items SET sent_to_kitchen=1, sent_at=NOW()
     WHERE order_id=? AND sent_to_kitchen=0 AND is_voided=0`,
    [req.params.id]
  );
  await pool.execute(`UPDATE orders SET status='sent', sent_at=NOW() WHERE id=?`, [req.params.id]);
  return res.json({ success: true });
});

// POST /api/orders/:id/pay
router.post('/:id/pay', authenticate, async (req: AuthRequest, res: Response) => {
  const { payments } = req.body; // [{ method, amount, reference }]
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const p of payments) {
      await conn.execute(
        `INSERT INTO payments (order_id, method, amount, reference, processed_by)
         VALUES (?, ?, ?, ?, ?)`,
        [req.params.id, p.method, p.amount, p.reference || null, req.user!.employeeId]
      );
    }
    await conn.execute(
      `UPDATE orders SET status='paid', closed_at=NOW() WHERE id=?`,
      [req.params.id]
    );
    await conn.commit();
    return res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// Recalculate order totals (prices are VAT-inclusive)
async function recalcOrder(orderId: string | number) {
  const [[items]]: any = await pool.execute(
    `SELECT COALESCE(SUM(total_price), 0) AS itemsTotal
     FROM order_items WHERE order_id = ? AND is_voided = 0`,
    [orderId]
  );
  const [[extras]]: any = await pool.execute(
    `SELECT COALESCE(SUM(oic.extra_price * oi.quantity), 0) AS extrasTotal
     FROM order_item_choices oic
     JOIN order_items oi ON oi.id = oic.order_item_id
     WHERE oi.order_id = ? AND oi.is_voided = 0`,
    [orderId]
  );
  const [[disc]]: any = await pool.execute(
    `SELECT COALESCE(SUM(CASE WHEN type='percent' THEN 0 ELSE value END), 0) AS fixedTotal
     FROM order_discounts WHERE order_id = ?`,
    [orderId]
  );
  const subtotal = Number(items.itemsTotal) + Number(extras.extrasTotal);
  const discountTotal = Math.min(Number(disc.fixedTotal), subtotal);
  const total = subtotal - discountTotal;
  const vatTotal = total * 0.17 / 1.17; // extract VAT from price-inclusive total
  await pool.execute(
    `UPDATE orders SET subtotal=?, discount_total=?, vat_total=?, total=? WHERE id=?`,
    [subtotal, discountTotal, vatTotal, total, orderId]
  );
}

export default router;
