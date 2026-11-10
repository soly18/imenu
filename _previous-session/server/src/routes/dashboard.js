const express = require('express');
const db = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/stats  — live KPIs
router.get('/stats', authenticate, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const [[openTables]] = await db.query(
      `SELECT COUNT(DISTINCT tableID) as count FROM orders WHERE orderStatus = 1`
    );
    const [[activeOrders]] = await db.query(
      `SELECT COUNT(*) as count FROM orders WHERE orderStatus = 1`
    );
    const [[todaySales]] = await db.query(
      `SELECT COALESCE(SUM(total), 0) as total FROM orders
       WHERE orderStatus = 2 AND DATE(closedAt) = CURDATE()`
    );
    const [[openBills]] = await db.query(
      `SELECT COUNT(*) as count FROM orders WHERE orderStatus = 1 AND total > 0`
    );

    res.json({
      openTables: openTables.count,
      activeOrders: activeOrders.count,
      todaySales: todaySales.total,
      openBills: openBills.count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/status  — system status
router.get('/status', authenticate, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const [[lastZ]] = await db.query(
      `SELECT MAX(closedAt) as lastZDate FROM z_reports`
    );
    const [terminals] = await db.query(
      `SELECT terminalID, termPrimeLang, lastSeen, isActive FROM terminals`
    );

    res.json({
      dbConnected: true,
      lastZDate: lastZ.lastZDate,
      terminals
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
