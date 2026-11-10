const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.post('/clock', authenticate, async (req, res) => {
  try {
    const { employeeId, pin, action, terminalId } = req.body;

    // Verify employee by ID or PIN
    let empId = employeeId;
    if (pin && !employeeId) {
      const [[emp]] = await db.query(
        `SELECT employeeID FROM employees WHERE pin = ? AND isActive = 1`, [pin]
      );
      if (!emp) return res.status(404).json({ error: 'Employee not found' });
      empId = emp.employeeID;
    }

    if (action === 'in') {
      const [result] = await db.query(
        `INSERT INTO employee_hours (employeeID, clockIn, terminalID) VALUES (?, NOW(), ?)`,
        [empId, terminalId]
      );
      res.json({ success: true, clockId: result.insertId, clockTime: new Date() });
    } else {
      // Find open shift
      const [[openShift]] = await db.query(
        `SELECT clockID, clockIn FROM employee_hours
         WHERE employeeID = ? AND clockOut IS NULL ORDER BY clockIn DESC LIMIT 1`,
        [empId]
      );
      if (!openShift) return res.status(400).json({ error: 'No open shift found' });

      await db.query(
        `UPDATE employee_hours SET clockOut = NOW() WHERE clockID = ?`,
        [openShift.clockID]
      );
      const duration = Math.round((Date.now() - new Date(openShift.clockIn)) / 60000);
      res.json({ success: true, clockTime: new Date(), shiftDuration: duration });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clock/status/:id', authenticate, async (req, res) => {
  try {
    const [[shift]] = await db.query(
      `SELECT clockID, clockIn FROM employee_hours
       WHERE employeeID = ? AND clockOut IS NULL ORDER BY clockIn DESC LIMIT 1`,
      [req.params.id]
    );
    res.json({
      isClockedIn: !!shift,
      clockInTime: shift?.clockIn || null,
      currentShiftMinutes: shift
        ? Math.round((Date.now() - new Date(shift.clockIn)) / 60000) : 0
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
