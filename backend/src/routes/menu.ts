import { Router, Response } from 'express';
import { pool } from '../db/connection';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import fs from 'fs';
import path from 'path';
import { MENU_IMG_DIR, UPLOAD_DIR } from '../uploads';

const router = Router();

// GET /api/menu/groups
const isEditor = (req: AuthRequest) => ['admin', 'manager'].includes(req.user!.role);

router.get('/groups', authenticate, async (req: AuthRequest, res: Response) => {
  const [rows] = await pool.execute(
    `SELECT id, name_primary AS namePrimary, name_secondary AS nameSecondary, name_ar AS nameAr, name_ru AS nameRu,
            sort_order AS sortOrder, color, image_url AS imageUrl, icon, is_active AS isActive
     FROM menu_groups WHERE branch_id = ? ${isEditor(req) && req.query.all ? '' : 'AND is_active = 1'} ORDER BY sort_order, id`,
    [req.user!.branchId]
  );
  return res.json(rows);
});

// GET /api/menu/items?groupId=X
router.get('/items', authenticate, async (req: AuthRequest, res: Response) => {
  const { groupId } = req.query;
  const params: any[] = [req.user!.branchId];
  let where = `mg.branch_id = ?${isEditor(req) && req.query.all ? '' : ' AND mi.is_active = 1'}`;
  if (groupId) { where += ' AND mi.group_id = ?'; params.push(groupId); }

  const [rows] = await pool.execute(
    `SELECT mi.id, mi.group_id AS groupId, mi.code, mi.name_primary AS namePrimary,
            mi.name_secondary AS nameSecondary, mi.name_ar AS nameAr, mi.name_ru AS nameRu, mi.price, mi.price_takeaway AS priceTakeaway,
            mi.vat_rate AS vatRate, mi.has_choices AS hasChoices,
            mi.is_combo AS isCombo, mi.is_pizza AS isPizza,
            mi.weight_item AS weightItem, mi.barcode, mi.image_url AS imageUrl, mi.icon, mi.is_active AS isActive, mi.sort_order AS sortOrder
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
    `SELECT id, name_primary AS namePrimary, name_secondary AS nameSecondary, name_ar AS nameAr, name_ru AS nameRu,
            extra_price AS extraPrice, sort_order AS sortOrder
     FROM menu_choices WHERE item_id = ? AND is_active = 1 ORDER BY sort_order`,
    [req.params.id]
  );
  return res.json(rows);
});

const clip = (v: any, n: number) => { const t = String(v ?? '').trim().slice(0, n); return t || null; };
const ICONS = new Set(['utensils', 'pizza', 'salad', 'soup', 'sandwich', 'fish', 'beef', 'drumstick', 'egg', 'cake', 'ice-cream', 'cookie',
  'coffee', 'cup-soda', 'wine', 'beer', 'glass-water', 'martini', 'baby', 'leaf', 'flame', 'star', 'gift', 'package']);
const iconOf = (v: any) => (ICONS.has(String(v)) ? String(v) : null);
const colorOf = (v: any) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : null);

// POST /api/menu/groups  (back office)
router.post('/groups', authenticate, requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  const b = req.body || {}; const name = clip(b.namePrimary, 100);
  if (!name) return res.status(400).json({ code: 'NAME_REQUIRED' });
  const [r]: any = await pool.execute(
    `INSERT INTO menu_groups (branch_id, name_primary, name_secondary, name_ar, name_ru, color, icon, sort_order) VALUES (?,?,?,?,?,?,?,?)`,
    [req.user!.branchId, name, clip(b.nameSecondary, 100), clip(b.nameAr, 200), clip(b.nameRu, 200), colorOf(b.color), iconOf(b.icon), Number(b.sortOrder) || 0]);
  return res.status(201).json({ id: r.insertId });
});

// PUT /api/menu/groups/:id
router.put('/groups/:id', authenticate, requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  const b = req.body || {}; const name = clip(b.namePrimary, 100);
  if (!name) return res.status(400).json({ code: 'NAME_REQUIRED' });
  await pool.execute(
    `UPDATE menu_groups SET name_primary=?, name_secondary=?, name_ar=?, name_ru=?, color=?, icon=?, sort_order=?, is_active=? WHERE id=? AND branch_id=?`,
    [name, clip(b.nameSecondary, 100), clip(b.nameAr, 200), clip(b.nameRu, 200), colorOf(b.color), iconOf(b.icon), Number(b.sortOrder) || 0,
     b.isActive === false ? 0 : 1, req.params.id, req.user!.branchId]);
  return res.json({ success: true });
});

// POST /api/menu/items  (back office)
router.post('/items', authenticate, requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  const b = req.body || {}; const name = clip(b.namePrimary, 100); const price = Number(b.price);
  if (!name) return res.status(400).json({ code: 'NAME_REQUIRED' });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ code: 'BAD_PRICE' });
  const [g]: any = await pool.execute('SELECT id FROM menu_groups WHERE id = ? AND branch_id = ?', [b.groupId, req.user!.branchId]);
  if (!g.length) return res.status(400).json({ code: 'BAD_GROUP' });
  const code = clip(b.code, 30) || `N${Date.now().toString(36).toUpperCase()}`;
  const [r]: any = await pool.execute(
    `INSERT INTO menu_items (group_id, code, name_primary, name_secondary, name_ar, name_ru, price, price_takeaway, vat_rate, barcode, icon, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [b.groupId, code, name, clip(b.nameSecondary, 100), clip(b.nameAr, 200), clip(b.nameRu, 200), price,
     b.priceTakeaway === '' || b.priceTakeaway == null ? null : Number(b.priceTakeaway), Number(b.vatRate) || 17, clip(b.barcode, 100), iconOf(b.icon), Number(b.sortOrder) || 0]);
  return res.status(201).json({ id: r.insertId });
});

// PUT /api/menu/items/:id
router.put('/items/:id', authenticate, requireRole('admin', 'manager'), async (req: AuthRequest, res: Response) => {
  const b = req.body || {}; const name = clip(b.namePrimary, 100); const price = Number(b.price);
  if (!name) return res.status(400).json({ code: 'NAME_REQUIRED' });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ code: 'BAD_PRICE' });
  await pool.execute(
    `UPDATE menu_items mi JOIN menu_groups mg ON mg.id = mi.group_id AND mg.branch_id = ?
        SET mi.group_id = COALESCE(?, mi.group_id), mi.name_primary=?, mi.name_secondary=?, mi.name_ar=?, mi.name_ru=?, mi.price=?, mi.price_takeaway=?,
            mi.vat_rate=COALESCE(?, mi.vat_rate), mi.barcode=?, mi.icon=?, mi.is_active=?, mi.sort_order=?, mi.updated_at=NOW()
      WHERE mi.id = ?`,
    [req.user!.branchId, b.groupId || null, name, clip(b.nameSecondary, 100), clip(b.nameAr, 200), clip(b.nameRu, 200), price,
     b.priceTakeaway === '' || b.priceTakeaway == null ? null : Number(b.priceTakeaway), b.vatRate ? Number(b.vatRate) : null,
     clip(b.barcode, 100), iconOf(b.icon), b.isActive === false ? 0 : 1, Number(b.sortOrder) || 0, req.params.id]);
  return res.json({ success: true });
});

// Pictures: the browser resizes the photo (max 640 px) and sends it as a data URL.
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
async function savePicture(req: AuthRequest, res: Response, table: 'menu_groups' | 'menu_items', kind: 'g' | 'i') {
  const m = IMG_RE.exec(String(req.body?.dataUrl || ''));
  if (!m) return res.status(400).json({ code: 'BAD_IMAGE' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 1_500_000) return res.status(413).json({ code: 'IMAGE_TOO_BIG' });
  const own = table === 'menu_items'
    ? 'SELECT mi.id, mi.image_url FROM menu_items mi JOIN menu_groups mg ON mg.id = mi.group_id WHERE mi.id = ? AND mg.branch_id = ?'
    : 'SELECT id, image_url FROM menu_groups WHERE id = ? AND branch_id = ?';
  const [rows]: any = await pool.execute(own, [req.params.id, req.user!.branchId]);
  if (!rows.length) return res.status(404).json({ code: 'NOT_FOUND' });
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const file = `${kind}-${req.params.id}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(MENU_IMG_DIR, file), buf);
  removePicture(rows[0].image_url);
  const url = `/uploads/menu/${file}`;
  await pool.execute(`UPDATE ${table} SET image_url = ? WHERE id = ?`, [url, req.params.id]);
  return res.json({ imageUrl: url });
}
function removePicture(url?: string | null) {
  if (!url || !url.startsWith('/uploads/menu/')) return;
  const f = path.join(UPLOAD_DIR, url.replace('/uploads/', ''));
  if (f.startsWith(MENU_IMG_DIR)) fs.rm(f, () => {});
}
async function clearPicture(req: AuthRequest, res: Response, table: 'menu_groups' | 'menu_items') {
  const [rows]: any = await pool.execute(`SELECT image_url FROM ${table} WHERE id = ?`, [req.params.id]);
  if (rows.length) { removePicture(rows[0].image_url); await pool.execute(`UPDATE ${table} SET image_url = NULL WHERE id = ?`, [req.params.id]); }
  return res.json({ success: true });
}
router.post('/groups/:id/image', authenticate, requireRole('admin', 'manager'), (req: AuthRequest, res: Response) => savePicture(req, res, 'menu_groups', 'g'));
router.post('/items/:id/image', authenticate, requireRole('admin', 'manager'), (req: AuthRequest, res: Response) => savePicture(req, res, 'menu_items', 'i'));
router.delete('/groups/:id/image', authenticate, requireRole('admin', 'manager'), (req: AuthRequest, res: Response) => clearPicture(req, res, 'menu_groups'));
router.delete('/items/:id/image', authenticate, requireRole('admin', 'manager'), (req: AuthRequest, res: Response) => clearPicture(req, res, 'menu_items'));

export default router;
