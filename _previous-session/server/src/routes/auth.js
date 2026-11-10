const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password, pin, terminalId } = req.body;

    let employee;

    if (pin) {
      // PIN login (touchscreen terminals)
      const [rows] = await db.query(
        `SELECT employeeID, empPrimeLang, empSecLang, role, pin, isActive
         FROM employees WHERE pin = ? AND isActive = 1 LIMIT 1`,
        [pin]
      );
      employee = rows[0];
    } else {
      // Username + password login
      const [rows] = await db.query(
        `SELECT employeeID, empPrimeLang, empSecLang, role, passwordHash, isActive
         FROM employees WHERE username = ? AND isActive = 1 LIMIT 1`,
        [username]
      );
      if (rows[0] && await bcrypt.compare(password, rows[0].passwordHash)) {
        employee = rows[0];
      }
    }

    if (!employee) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get permissions
    const [perms] = await db.query(
      `SELECT permission FROM employee_permissions WHERE employeeID = ?`,
      [employee.employeeID]
    );
    const permissions = perms.map(p => p.permission);

    // Generate tokens
    const payload = {
      id: employee.employeeID,
      name: employee.empPrimeLang,
      role: employee.role,
      permissions,
      terminalId: terminalId || null
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h'
    });

    const refreshToken = jwt.sign(
      { id: employee.employeeID },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    // Save refresh token
    await db.query(
      `UPDATE employees SET refreshToken = ? WHERE employeeID = ?`,
      [refreshToken, employee.employeeID]
    );

    res.json({ token, refreshToken, user: payload });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const [rows] = await db.query(
      `SELECT employeeID, empPrimeLang, role, refreshToken FROM employees WHERE employeeID = ?`,
      [decoded.id]
    );

    const employee = rows[0];
    if (!employee || employee.refreshToken !== refreshToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const token = jwt.sign(
      { id: employee.employeeID, name: employee.empPrimeLang, role: employee.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({ token });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    await db.query(
      `UPDATE employees SET refreshToken = NULL WHERE employeeID = ?`,
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
