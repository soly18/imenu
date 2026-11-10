const express = require('express');
const db = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const isManager = [authenticate, requireRole('admin', 'manager')];

// ─── ITEMS ───────────────────────────────────────────────
router.get('/items', ...isManager, async (req, res) => {
  try {
    const { groupId, search, active } = req.query;
    let sql = `SELECT itemID, primeLang, secLang, price, clubmemberprice, deliveryprice,
                      itemActive, isWeight, iBarcode, itemgroupid as groupId, iProperty
               FROM items WHERE itemID > 0`;
    const params = [];
    if (groupId) { sql += ' AND itemgroupid = ?'; params.push(groupId); }
    if (search)  { sql += ' AND primeLang LIKE ?'; params.push(`%${search}%`); }
    if (active !== undefined) { sql += ' AND itemActive = ?'; params.push(active); }
    sql += ' ORDER BY primeLang';
    const [items] = await db.query(sql, params);
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/items', ...isManager, async (req, res) => {
  try {
    const { primeLang, secLang, price, memberPrice, deliveryPrice, groupId,
            isWeight, barcode, isActive, iProperty } = req.body;
    const [result] = await db.query(
      `INSERT INTO items (primeLang, secLang, price, clubmemberprice, deliveryprice,
                          itemgroupid, isWeight, iBarcode, itemActive, iProperty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [primeLang, secLang || '', price, memberPrice || price,
       deliveryPrice || price, groupId, isWeight ? 1 : 0,
       barcode || '', isActive ? 1 : 0, iProperty || 0]
    );
    res.json({ itemId: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/items/:id', ...isManager, async (req, res) => {
  try {
    const [[item]] = await db.query(
      `SELECT * FROM items WHERE itemID = ?`, [req.params.id]
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/items/:id', ...isManager, async (req, res) => {
  try {
    const { primeLang, secLang, price, memberPrice, deliveryPrice,
            groupId, isWeight, barcode, isActive, iProperty } = req.body;
    await db.query(
      `UPDATE items SET primeLang=?, secLang=?, price=?, clubmemberprice=?,
          deliveryprice=?, itemgroupid=?, isWeight=?, iBarcode=?, itemActive=?, iProperty=?
       WHERE itemID=?`,
      [primeLang, secLang || '', price, memberPrice || price,
       deliveryPrice || price, groupId, isWeight ? 1 : 0,
       barcode || '', isActive ? 1 : 0, iProperty || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/items/:id', ...isManager, async (req, res) => {
  try {
    await db.query(`UPDATE items SET itemActive = 0 WHERE itemID = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ITEM GROUPS ─────────────────────────────────────────
router.get('/item-groups', ...isManager, async (req, res) => {
  try {
    const [groups] = await db.query(
      `SELECT groupID, primeLang, secLang, color, sortOrder, isActive
       FROM item_groups ORDER BY sortOrder`
    );
    res.json(groups);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/item-groups', ...isManager, async (req, res) => {
  try {
    const { primeLang, secLang, color, sortOrder } = req.body;
    const [result] = await db.query(
      `INSERT INTO item_groups (primeLang, secLang, color, sortOrder, isActive)
       VALUES (?, ?, ?, ?, 1)`,
      [primeLang, secLang || '', color || '#3B82F6', sortOrder || 0]
    );
    res.json({ groupId: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/item-groups/:id', ...isManager, async (req, res) => {
  try {
    const { primeLang, secLang, color, sortOrder, isActive } = req.body;
    await db.query(
      `UPDATE item_groups SET primeLang=?, secLang=?, color=?, sortOrder=?, isActive=?
       WHERE groupID=?`,
      [primeLang, secLang || '', color, sortOrder, isActive ? 1 : 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── EMPLOYEES ───────────────────────────────────────────
router.get('/employees', ...isManager, async (req, res) => {
  try {
    const { search, active, group } = req.query;
    let sql = `SELECT employeeID, empPrimeLang, empSecLang, role, empGroupID,
                      mayOrder, mayDelivery, isActive, phone, email
               FROM employees WHERE 1=1`;
    const params = [];
    if (search) { sql += ' AND empPrimeLang LIKE ?'; params.push(`%${search}%`); }
    if (active !== undefined) { sql += ' AND isActive = ?'; params.push(active); }
    if (group)  { sql += ' AND empGroupID = ?'; params.push(group); }
    sql += ' ORDER BY empPrimeLang';
    const [employees] = await db.query(sql, params);
    res.json(employees);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/employees/:id', ...isManager, async (req, res) => {
  try {
    const [[emp]] = await db.query(
      `SELECT * FROM employees WHERE employeeID = ?`, [req.params.id]
    );
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    delete emp.passwordHash;
    delete emp.refreshToken;
    res.json(emp);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/employees', ...isManager, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { empPrimeLang, empSecLang, role, pin, password, phone, email,
            empGroupID, mayOrder, mayDelivery, isActive } = req.body;
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const [result] = await db.query(
      `INSERT INTO employees (empPrimeLang, empSecLang, role, pin, passwordHash,
                              phone, email, empGroupID, mayOrder, mayDelivery, isActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [empPrimeLang, empSecLang || '', role || 'waiter', pin || null,
       passwordHash, phone || '', email || '', empGroupID || null,
       mayOrder ? 1 : 0, mayDelivery ? 1 : 0, isActive ? 1 : 0]
    );
    res.json({ employeeId: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/employees/:id', ...isManager, async (req, res) => {
  try {
    const { empPrimeLang, empSecLang, role, phone, email,
            empGroupID, mayOrder, mayDelivery, isActive } = req.body;
    await db.query(
      `UPDATE employees SET empPrimeLang=?, empSecLang=?, role=?, phone=?,
          email=?, empGroupID=?, mayOrder=?, mayDelivery=?, isActive=?
       WHERE employeeID=?`,
      [empPrimeLang, empSecLang || '', role, phone || '', email || '',
       empGroupID || null, mayOrder ? 1 : 0, mayDelivery ? 1 : 0,
       isActive ? 1 : 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DISCOUNTS ───────────────────────────────────────────
router.get('/discounts', ...isManager, async (req, res) => {
  try {
    const [discounts] = await db.query(
      `SELECT DiscountID, ActiveDiscount, primeLang, secLang, fromDate, toDate,
              fromTime, toTime, pctDiscount, nisDiscount,
              Day1,Day2,Day3,Day4,Day5,Day6,Day7
       FROM discounts ORDER BY primeLang`
    );
    res.json(discounts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/discounts', ...isManager, async (req, res) => {
  try {
    const { primeLang, secLang, pctDiscount, nisDiscount, fromDate, toDate,
            fromTime, toTime, days } = req.body;
    const [result] = await db.query(
      `INSERT INTO discounts (primeLang, secLang, pctDiscount, nisDiscount,
                              fromDate, toDate, fromTime, toTime,
                              Day1,Day2,Day3,Day4,Day5,Day6,Day7, ActiveDiscount)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
      [primeLang, secLang || '', pctDiscount || 0, nisDiscount || 0,
       fromDate || null, toDate || null, fromTime || '00:00', toTime || '23:59',
       days?.[0]?1:0, days?.[1]?1:0, days?.[2]?1:0, days?.[3]?1:0,
       days?.[4]?1:0, days?.[5]?1:0, days?.[6]?1:0]
    );
    res.json({ discountId: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PARAMETERS ──────────────────────────────────────────
router.get('/parameters', ...isManager, async (req, res) => {
  try {
    const [params] = await db.query(`SELECT * FROM parameters ORDER BY paramGroup, paramKey`);
    res.json(params);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/parameters', ...isManager, async (req, res) => {
  try {
    const { params } = req.body;
    for (const p of params) {
      await db.query(
        `UPDATE parameters SET paramValue = ? WHERE paramKey = ?`,
        [p.value, p.key]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PAY METHODS ─────────────────────────────────────────
router.get('/pay-methods', ...isManager, async (req, res) => {
  try {
    const [methods] = await db.query(
      `SELECT payMethodID, primeLang, secLang, type, isActive, sortOrder
       FROM pay_methods ORDER BY sortOrder`
    );
    res.json(methods);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
