const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/pos/groups
router.get('/groups', authenticate, async (req, res) => {
  try {
    const [groups] = await db.query(
      `SELECT groupID, primeLang, secLang, color, sortOrder
       FROM item_groups WHERE isActive = 1 ORDER BY sortOrder`
    );
    res.json(groups);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/pos/items?groupId=
router.get('/items', authenticate, async (req, res) => {
  try {
    const { groupId } = req.query;
    const query = `SELECT itemID, primeLang, secLang, price, clubmemberprice as memberPrice,
                          isWeight, itemActive, iBarcode, itemgroupid as groupId
                   FROM items WHERE itemActive = 1 ${groupId ? 'AND itemgroupid = ?' : ''}
                   ORDER BY primeLang`;
    const [items] = groupId
      ? await db.query(query, [groupId])
      : await db.query(query);
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/pos/items/:id/choices
router.get('/items/:id/choices', authenticate, async (req, res) => {
  try {
    const [choices] = await db.query(
      `SELECT c.choiceID, c.groupID, cg.primeLang as groupName,
              cg.minChoices, cg.maxChoices, c.primeLang as name,
              c.secLang, c.price
       FROM item_choices c
       JOIN choice_groups cg ON c.groupID = cg.groupID
       WHERE c.itemID = ? ORDER BY cg.sortOrder, c.sortOrder`,
      [req.params.id]
    );
    res.json(choices);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/pos/orders  — create new order
router.post('/orders', authenticate, async (req, res) => {
  try {
    const { terminalId, employeeId, tableId, takeAway } = req.body;
    const [result] = await db.query(
      `INSERT INTO orders (terminalID, employeeID, tableID, takeAway, orderStatus, createdAt)
       VALUES (?, ?, ?, ?, 1, NOW())`,
      [terminalId, employeeId, tableId || null, takeAway ? 1 : 0]
    );
    res.json({ orderId: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/pos/orders/:id
router.get('/orders/:id', authenticate, async (req, res) => {
  try {
    const [[order]] = await db.query(
      `SELECT o.*, e.empPrimeLang as employeeName, t.primeLang as tableName
       FROM orders o
       LEFT JOIN employees e ON o.employeeID = e.employeeID
       LEFT JOIN tables t ON o.tableID = t.tableID
       WHERE o.orderID = ?`,
      [req.params.id]
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const [items] = await db.query(
      `SELECT oi.*, i.primeLang as itemName, i.secLang as itemSecName
       FROM order_items oi
       JOIN items i ON oi.itemID = i.itemID
       WHERE oi.orderID = ? AND oi.disabled = 0
       ORDER BY oi.course, oi.order_itemsID`,
      [req.params.id]
    );

    // Calculate totals
    const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const [[paid]] = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE orderID = ?`,
      [req.params.id]
    );

    res.json({
      order,
      items,
      totals: {
        subtotal: subtotal.toFixed(2),
        discount: (order.discountAmount || 0).toFixed(2),
        total: (subtotal - (order.discountAmount || 0)).toFixed(2),
        paid: paid.total.toFixed(2),
        remaining: (subtotal - (order.discountAmount || 0) - paid.total).toFixed(2)
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/pos/orders/:id/items  — add item
router.post('/orders/:id/items', authenticate, async (req, res) => {
  try {
    const { itemId, qty, course, diner, remarks, choices } = req.body;
    const [[item]] = await db.query(
      `SELECT price FROM items WHERE itemID = ?`, [itemId]
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const [result] = await db.query(
      `INSERT INTO order_items (orderID, itemID, quantity, price, course, diner, remarks, printed, disabled, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NOW())`,
      [req.params.id, itemId, qty || 1, item.price, course || 1, diner || 1, remarks || '']
    );

    // Add choices if any
    if (choices && choices.length > 0) {
      for (const choice of choices) {
        await db.query(
          `INSERT INTO order_items (orderID, itemID, quantity, price, parentItem, disabled)
           VALUES (?, ?, 1, ?, ?, 0)`,
          [req.params.id, choice.itemId, choice.price || 0, result.insertId]
        );
      }
    }

    // Emit to kitchen via WebSocket
    const io = req.app.get('io');
    io.to('kitchen').emit('new:item', { orderId: req.params.id, itemId, qty });

    res.json({ order_itemsId: result.insertId, price: item.price });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/pos/orders/:id/items/:iid  — edit item
router.patch('/orders/:id/items/:iid', authenticate, async (req, res) => {
  try {
    const { qty, price, course, diner, remarks } = req.body;
    await db.query(
      `UPDATE order_items SET
         quantity = COALESCE(?, quantity),
         price = COALESCE(?, price),
         course = COALESCE(?, course),
         diner = COALESCE(?, diner),
         remarks = COALESCE(?, remarks)
       WHERE order_itemsID = ? AND orderID = ?`,
      [qty, price, course, diner, remarks, req.params.iid, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/pos/orders/:id/items/:iid  — cancel item
router.delete('/orders/:id/items/:iid', authenticate, async (req, res) => {
  try {
    const { reasonId, cancelledBy } = req.body;
    await db.query(
      `UPDATE order_items SET disabled = 1, reasonID = ?, cancelledBy = ?, cancelledAt = NOW()
       WHERE order_itemsID = ? AND orderID = ?`,
      [reasonId, cancelledBy, req.params.iid, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/pos/orders/:id/discount
router.post('/orders/:id/discount', authenticate, async (req, res) => {
  try {
    const { type, value, discountId, authorizedBy } = req.body;
    const [[order]] = await db.query(
      `SELECT total FROM orders WHERE orderID = ?`, [req.params.id]
    );
    const discountAmount = type === 'pct'
      ? (order.total * value / 100)
      : value;

    await db.query(
      `UPDATE orders SET discountAmount = ?, discountType = ?, discountID = ?, discountBy = ?
       WHERE orderID = ?`,
      [discountAmount, type, discountId || null, authorizedBy || null, req.params.id]
    );
    res.json({ discountAmount, newTotal: order.total - discountAmount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/pos/orders/:id/payments
router.post('/orders/:id/payments', authenticate, async (req, res) => {
  try {
    const { method, amount, reference, clientId, voucherCode } = req.body;
    await db.query(
      `INSERT INTO payments (orderID, method, amount, reference, clientID, voucherCode, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [req.params.id, method, amount, reference || null, clientId || null, voucherCode || null]
    );

    const [[totals]] = await db.query(
      `SELECT o.total, o.discountAmount, COALESCE(SUM(p.amount),0) as paid
       FROM orders o LEFT JOIN payments p ON o.orderID = p.orderID
       WHERE o.orderID = ? GROUP BY o.orderID`,
      [req.params.id]
    );

    const net = (totals.total || 0) - (totals.discountAmount || 0);
    const remaining = net - totals.paid;
    const changeDue = remaining < 0 ? Math.abs(remaining) : 0;

    res.json({ success: true, remaining: Math.max(0, remaining), changeDue });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/pos/orders/:id/close
router.post('/orders/:id/close', authenticate, async (req, res) => {
  try {
    const [[invoiceCount]] = await db.query(
      `SELECT COUNT(*) + 1 as next FROM orders WHERE orderStatus = 2 AND DATE(closedAt) = CURDATE()`
    );
    await db.query(
      `UPDATE orders SET orderStatus = 2, closedAt = NOW(), invoiceNumber = ? WHERE orderID = ?`,
      [invoiceCount.next, req.params.id]
    );

    // Emit update to all terminals
    const io = req.app.get('io');
    io.emit('order:closed', { orderId: req.params.id });

    res.json({ success: true, invoiceNumber: invoiceCount.next });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/pos/cashiers
router.get('/cashiers', authenticate, async (req, res) => {
  try {
    const [cashiers] = await db.query(
      `SELECT e.employeeID, e.empPrimeLang as name, e.empSecLang as secName,
              COUNT(o.orderID) as openOrderCount
       FROM employees e
       LEFT JOIN orders o ON e.employeeID = o.employeeID AND o.orderStatus = 1
       WHERE e.mayOrder = 1 AND e.isActive = 1
       GROUP BY e.employeeID ORDER BY e.empPrimeLang`
    );
    res.json(cashiers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
