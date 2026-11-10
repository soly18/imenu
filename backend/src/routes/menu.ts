import { Router, Response } from 'express';
import { pool } from '../db/connection';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/menu/groups
router.get('/groups', authenticate, async (req: AuthRequest, res: Response) => {
  const [rows] = await pool.execute(
    `SELECT id, name_primary AS namePrimary, name_secondary AS nameSecondary,
            sort_order AS sortOrder, color, image_url AS imageUrl, is_active AS isActive
     FROM menu_groups WHERE branch_id = ? AND is_active = 1 ORDER BY sort_order`,
    [req.user!.branchId]
  );
  return res.json(rows);
});

// GET /api/menu/items?groupId=X
router.get('/items', authenticate, async (req: AuthRequest, res: Response) => {
  const { groupId } = req.query;
  const params: any[] = [req.user!.branchId];
  let where = 'mg.branch_id = ? AND mi.is_active = 1';
  if (groupId) { where += ' AND mi.group_id = ?'; params.push(groupId); }

  const [rows] = await pool.execute(
    `SELECT mi.id, mi.group_id AS groupId, mi.code, mi.name_primary AS namePrimary,
            mi.name_secondary AS nameSecondary, mi.price, mi.price_takeaway AS priceTakeaway,
            mi.vat_rate AS vatRate, mi.has_choices AS hasChoices,
            mi.is_combo AS isCombo, mi.is_pizza AS isPizza,
            mi.weight_item AS weightItem, mi.barcode, mi.image_url AS imageUrl, mi.sort_order AS sortOrder
     FROM menu_items mi
     JOIN menu_groups mg ON mg.id = mi.group_id
     WHERE ${where}
     ORDER BY mi.sort_order, mi.name_primary`,
    params
  );
  return res.json(rows);
});

// GET /api/menu/items/:id/choices
router.get('/items/:id/choices', authenticate, async (req: AuthRequest, res: Response) => {
  const [rows] = await pool.execute(
    `SELECT id, name_primary AS namePrimary, name_secondary AS nameSecondary,
            extra_price AS extraPrice, sort_order AS sortOrder
     FROM menu_choices WHERE item_id = ? AND is_active = 1 ORDER BY sort_order`,
    [req.params.id]
  );
  return res.json(rows);
});

// POST /api/menu/items  (back office)
router.post('/items', authenticate, requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  const { groupId, code, namePrimary, nameSecondary, price, priceTakeaway, vatRate, hasChoices, isCombo, isPizza, weightItem, barcode, sortOrder } = req.body;
  const [result]: any = await pool.execute(
    `INSERT INTO menu_items (group_id, code, name_primary, name_secondary, price, price_takeaway,
      vat_rate, has_choices, is_combo, is_pizza, weight_item, barcode, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [groupId, code, namePrimary, nameSecondary, price, priceTakeaway || null, vatRate || 17,
     hasChoices || 0, isCombo || 0, isPizza || 0, weightItem || 0, barcode || null, sortOrder || 0]
  );
  return res.status(201).json({ id: result.insertId });
});

// PUT /api/menu/items/:id
router.put('/items/:id', authenticate, requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  const { namePrimary, nameSecondary, price, priceTakeaway, vatRate, isActive, sortOrder } = req.body;
  await pool.execute(
    `UPDATE menu_items SET name_primary=?, name_secondary=?, price=?, price_takeaway=?,
      vat_rate=?, is_active=?, sort_order=?, updated_at=NOW() WHERE id=?`,
    [namePrimary, nameSecondary, price, priceTakeaway || null, vatRate, isActive ? 1 : 0, sortOrder || 0, req.params.id]
  );
  return res.json({ success: true });
});

export default router;
