// routes/eod.js
const express = require('express');
const db = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/status', authenticate, requireRole('admin','manager'), async (req, res) => {
  try {
    const [[lastZ]] = await db.query(`SELECT MAX(closedAt) as lastZDate, MAX(zID) as zID FROM z_reports`);
    const [[openOrders]] = await db.query(`SELECT COUNT(*) as count FROM orders WHERE orderStatus = 1`);
    res.json({ lastZDate: lastZ.lastZDate, currentZId: lastZ.zID, openOrders: openOrders.count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/summary', authenticate, requireRole('admin','manager'), async (req, res) => {
  try {
    const [byPayment] = await db.query(
      `SELECT pm.primeLang as method, SUM(p.amount) as total, COUNT(*) as count
       FROM payments p JOIN pay_methods pm ON p.method = pm.type
       WHERE DATE(p.createdAt) = CURDATE() GROUP BY p.method`
    );
    const [byCategory] = await db.query(
      `SELECT ig.primeLang as category, SUM(oi.price * oi.quantity) as total
       FROM order_items oi JOIN items i ON oi.itemID = i.itemID
       JOIN item_groups ig ON i.itemgroupid = ig.groupID
       JOIN orders o ON oi.orderID = o.orderID
       WHERE o.orderStatus = 2 AND DATE(o.closedAt) = CURDATE() AND oi.disabled = 0
       GROUP BY ig.groupID`
    );
    res.json({ byPayment, byCategory });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/z-report', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { terminalId, confirmedBy } = req.body;
    const [result] = await db.query(
      `INSERT INTO z_reports (terminalID, closedAt, closedBy) VALUES (?, NOW(), ?)`,
      [terminalId, confirmedBy]
    );
    res.json({ zId: result.insertId, closedAt: new Date() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
