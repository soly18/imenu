import bcrypt from 'bcryptjs';
import type { LegacyQuery } from './legacyDb';
import type { LegacyProfile } from './profile';

type Db = { execute: (sql: string, p?: any[]) => Promise<any> };

export interface EntityReport {
  entity: string;
  source?: string;                     // legacy table used
  columns?: Record<string, string>;    // new field -> legacy column used
  found: number; created: number; updated: number; deactivated: number; skipped: number;
  notes: string[];
  samples: Record<string, any>[];      // first rows as they will look in the new system
}
export interface ImportReport {
  startedAt: string; dryRun: boolean; signature: string;
  ok: boolean; entities: EntityReport[];
}

// ── column detection ────────────────────────────────────────────────────────
// The legacy schema is only partly known, so each field lists the column names it may have had.
// Names seen in the Delphi sources come first (EmployeeID, empPrimeLang, zoneID, OrdersPrice, ...).
// If a REQUIRED column cannot be found the entity is skipped and reported: nothing is guessed.
const TABLES = {
  zones:     ['zones'],
  tables:    ['storetables', 'store_tables', 'tables'],
  groups:    ['itemgroups', 'item_groups', 'groups', 'itemcategories', 'categories', 'menugroups'],
  items:     ['items'],
  employees: ['employees'],
};
const COLS = {
  zones:     { id: ['zoneID', 'id'], name: ['primeLang', 'zoneName', 'name'] },
  tables:    { id: ['storeTableID', 'tableID', 'id'], zone: ['zoneID'], label: ['tableNumber', 'tableNum', 'tableName', 'number', 'name', 'primeLang'],
               x: ['posX', 'xPos', 'x', 'left'], y: ['posY', 'yPos', 'y', 'top'], w: ['width'], h: ['height'],
               seats: ['seats', 'capacity', 'diners'], active: ['active', 'isActive'] },
  groups:    { id: ['groupID', 'itemGroupID', 'categoryID', 'id'], name: ['primeLang', 'groupName', 'name', 'groupPrimeLang'],
               name2: ['secondLang', 'secondaryLang', 'groupSecondLang'], color: ['color', 'colour'],
               sort: ['sortOrder', 'orderBy', 'sort', 'position'], active: ['active', 'isActive'] },
  items:     { id: ['itemID', 'id'], group: ['groupID', 'itemGroupID', 'categoryID'], name: ['primeLang', 'itemName', 'name', 'itemPrimeLang'],
               name2: ['secondLang', 'secondaryLang'], price: ['OrdersPrice', 'Price', 'itemPrice'], takeaway: ['TakeawayPrice'],
               vat: ['vatRate', 'vat', 'taxRate'], barcode: ['barcode', 'barCode'], sort: ['sortOrder', 'orderBy', 'sort', 'position'],
               active: ['active', 'isActive'] },
  employees: { id: ['EmployeeID', 'id'], name: ['empPrimeLang', 'empName', 'name'], pin: ['pinCode', 'pin', 'empPassword', 'password', 'empCode', 'code'],
               active: ['active', 'isActive', 'enabled'] },
} as const;

const REQUIRED: Record<string, string[]> = {
  zones: ['id', 'name'], tables: ['id', 'label'], groups: ['id', 'name'], items: ['id', 'name', 'price'], employees: ['id', 'name'],
};

function findTable(profile: LegacyProfile, names: readonly string[]) {
  for (const n of names) { const t = profile.tables.find((x) => x.name.toLowerCase() === n.toLowerCase()); if (t) return t; }
  return undefined;
}
function mapColumns(entity: keyof typeof COLS, cols: string[]) {
  const out: Record<string, string> = {};
  for (const [field, cands] of Object.entries(COLS[entity])) {
    const hit = (cands as readonly string[]).map((c) => cols.find((x) => x.toLowerCase() === c.toLowerCase())).find(Boolean);
    if (hit) out[field] = hit;
  }
  return out;
}
const truthy = (v: any) => v === undefined || v === null || v === '' ? true : !['0', 'false', 'no', 'n'].includes(String(v).toLowerCase());
const num = (v: any) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const str = (v: any, max = 200) => (v === null || v === undefined ? '' : String(v)).trim().slice(0, max);

class Mapper {
  constructor(private db: Db, private branchId: number, private dry: boolean) {}
  async get(entity: string, legacyId: string): Promise<number | null> {
    const [r]: any = await this.db.execute('SELECT new_id FROM legacy_map WHERE branch_id=? AND entity=? AND legacy_id=?', [this.branchId, entity, legacyId]);
    return r.length ? r[0].new_id : null;
  }
  async set(entity: string, legacyId: string, newId: number) {
    if (this.dry) return;
    await this.db.execute(
      'INSERT INTO legacy_map (branch_id, entity, legacy_id, new_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE new_id=VALUES(new_id)',
      [this.branchId, entity, legacyId, newId]);
  }
  async allMapped(entity: string): Promise<{ legacy_id: string; new_id: number }[]> {
    const [r]: any = await this.db.execute('SELECT legacy_id, new_id FROM legacy_map WHERE branch_id=? AND entity=?', [this.branchId, entity]);
    return r;
  }
}

const blank = (entity: string): EntityReport =>
  ({ entity, found: 0, created: 0, updated: 0, deactivated: 0, skipped: 0, notes: [], samples: [] });

/**
 * Imports the master data (floor plan, menu, employees) from the old database.
 * - Never writes to the legacy database (only SELECT).
 * - Repeatable: every imported row is remembered in legacy_map, so a second run updates instead of duplicating.
 * - Only rows that came from the legacy database are ever changed; rows created in the new system are left alone.
 * - dryRun: reads and reports exactly what would happen, writes nothing.
 */
export async function importMasters(opts: {
  q: LegacyQuery; profile: LegacyProfile; db: Db; branchId: number; dryRun: boolean; defaultVat: number;
}): Promise<ImportReport> {
  const { q, profile, db, branchId, dryRun } = opts;
  const map = new Mapper(db, branchId, dryRun);
  const report: ImportReport = { startedAt: new Date().toISOString(), dryRun, signature: profile.signature, ok: true, entities: [] };

  // Reads one legacy table, returning rows + the detected column mapping, or null (reported) if it can't be used.
  const read = async (entity: keyof typeof COLS, label: string) => {
    const r = blank(label); report.entities.push(r);
    const t = findTable(profile, TABLES[entity]);
    if (!t) { r.notes.push(`No legacy table found (looked for: ${TABLES[entity].join(', ')})`); return null; }
    const cols = mapColumns(entity, t.columns.map((c) => c.name));
    const missing = REQUIRED[entity].filter((f) => !cols[f]);
    r.source = t.name; r.columns = cols;
    if (missing.length) { r.notes.push(`Skipped: could not find column(s) for: ${missing.join(', ')}. Columns present: ${t.columns.map((c) => c.name).join(', ')}`); return null; }
    const rows = await q(`SELECT * FROM \`${t.name}\``);
    r.found = rows.length;
    return { r, cols, rows };
  };
  const sample = (r: EntityReport, o: Record<string, any>) => { if (r.samples.length < 5) r.samples.push(o); };
  const deactivateMissing = async (r: EntityReport, entity: string, seen: Set<string>, table: string) => {
    for (const m of await map.allMapped(entity)) {
      if (seen.has(m.legacy_id)) continue;
      r.deactivated++;
      if (!dryRun) await db.execute(`UPDATE ${table} SET is_active = 0 WHERE id = ?`, [m.new_id]);
    }
  };

  // ── Floor plans + tables ──────────────────────────────────────────────────
  const zones = await read('zones', 'zones → floor plans');
  const planIds = new Map<string, number>();
  if (zones) {
    const { r, cols, rows } = zones; const seen = new Set<string>();
    for (const row of rows) {
      const id = str(row[cols.id]), name = str(row[cols.name], 100) || `Zone ${id}`;
      seen.add(id);
      let nid = await map.get('zone', id);
      if (nid) { r.updated++; if (!dryRun) await db.execute('UPDATE floor_plans SET name=? WHERE id=?', [name, nid]); }
      else { r.created++; if (!dryRun) { const [ins]: any = await db.execute('INSERT INTO floor_plans (branch_id, name) VALUES (?,?)', [branchId, name]); nid = ins.insertId; } }
      if (nid) { planIds.set(id, nid); await map.set('zone', id, nid); }
      sample(r, { zone: id, name });
    }
    await deactivateMissing(r, 'zone', seen, 'floor_plans');
  }
  const tabs = await read('tables', 'tables');
  if (tabs) {
    const { r, cols, rows } = tabs; const seen = new Set<string>();
    let fallbackPlan: number | null = null;
    const ensureFallback = async () => {
      if (fallbackPlan || dryRun) return fallbackPlan;
      const [ex]: any = await db.execute("SELECT id FROM floor_plans WHERE branch_id=? AND name='Imported' LIMIT 1", [branchId]);
      if (ex.length) return (fallbackPlan = ex[0].id);
      const [ins]: any = await db.execute("INSERT INTO floor_plans (branch_id, name) VALUES (?, 'Imported')", [branchId]);
      return (fallbackPlan = ins.insertId);
    };
    const hasPos = !!(cols.x && cols.y);
    if (!hasPos) r.notes.push('No position columns found: tables are laid out in a grid, adjust them later.');
    let i = 0;
    for (const row of rows) {
      const id = str(row[cols.id]); const label = str(row[cols.label], 50) || id;
      seen.add(id);
      const plan = cols.zone && planIds.has(str(row[cols.zone])) ? planIds.get(str(row[cols.zone]))! : (zones && cols.zone ? null : await ensureFallback());
      if (!plan && !dryRun) { r.skipped++; r.notes.push(`Table ${label}: its zone was not imported`); continue; }
      const x = hasPos ? Math.round(num(row[cols.x])) || 0 : 50 + (i % 6) * 130;
      const y = hasPos ? Math.round(num(row[cols.y])) || 0 : 50 + Math.floor(i / 6) * 130;
      const w = cols.w ? Math.round(num(row[cols.w])) || 80 : 80, h = cols.h ? Math.round(num(row[cols.h])) || 80 : 80;
      const seats = cols.seats ? Math.round(num(row[cols.seats])) || 4 : 4;
      const active = cols.active ? truthy(row[cols.active]) : true;
      i++;
      let nid = await map.get('table', id);
      if (nid) { r.updated++; if (!dryRun) await db.execute('UPDATE tables SET label=?, pos_x=?, pos_y=?, width=?, height=?, capacity=?, is_active=? WHERE id=?', [label, x, y, w, h, seats, active ? 1 : 0, nid]); }
      else { r.created++; if (!dryRun) { const [ins]: any = await db.execute('INSERT INTO tables (floor_plan_id, label, pos_x, pos_y, width, height, capacity, is_active) VALUES (?,?,?,?,?,?,?,?)', [plan, label, x, y, w, h, seats, active ? 1 : 0]); nid = ins.insertId; } }
      if (nid) await map.set('table', id, nid);
      sample(r, { table: label, x, y });
    }
    await deactivateMissing(r, 'table', seen, 'tables');
  }

  // ── Menu groups + items ───────────────────────────────────────────────────
  const groups = await read('groups', 'menu groups');
  const groupIds = new Map<string, number>();
  if (groups) {
    const { r, cols, rows } = groups; const seen = new Set<string>();
    for (const row of rows) {
      const id = str(row[cols.id]); const name = str(row[cols.name]) || `Group ${id}`;
      const name2 = cols.name2 ? str(row[cols.name2]) || null : null;
      const sort = cols.sort ? Math.round(num(row[cols.sort])) || 0 : 0;
      const color = cols.color && /^#[0-9a-f]{6}$/i.test(str(row[cols.color])) ? str(row[cols.color]) : null;
      const active = cols.active ? truthy(row[cols.active]) : true;
      seen.add(id);
      let nid = await map.get('group', id);
      if (nid) { r.updated++; if (!dryRun) await db.execute('UPDATE menu_groups SET name_primary=?, name_secondary=?, sort_order=?, color=COALESCE(?, color), is_active=? WHERE id=?', [name, name2, sort, color, active ? 1 : 0, nid]); }
      else { r.created++; if (!dryRun) { const [ins]: any = await db.execute('INSERT INTO menu_groups (branch_id, name_primary, name_secondary, sort_order, color, is_active) VALUES (?,?,?,?,?,?)', [branchId, name, name2, sort, color, active ? 1 : 0]); nid = ins.insertId; } }
      if (nid) { groupIds.set(id, nid); await map.set('group', id, nid); }
      sample(r, { group: name, secondary: name2 });
    }
    await deactivateMissing(r, 'group', seen, 'menu_groups');
  }
  const items = await read('items', 'menu items');
  if (items) {
    const { r, cols, rows } = items; const seen = new Set<string>();
    let fallbackGroup: number | null = null;
    const ensureFallback = async () => {
      if (fallbackGroup || dryRun) return fallbackGroup;
      const [ex]: any = await db.execute("SELECT id FROM menu_groups WHERE branch_id=? AND name_primary='Imported' LIMIT 1", [branchId]);
      if (ex.length) return (fallbackGroup = ex[0].id);
      const [ins]: any = await db.execute("INSERT INTO menu_groups (branch_id, name_primary) VALUES (?, 'Imported')", [branchId]);
      return (fallbackGroup = ins.insertId);
    };
    if (!cols.group || !groups) r.notes.push('Groups could not be linked: all items go to a group called "Imported".');
    for (const row of rows) {
      const id = str(row[cols.id]); const name = str(row[cols.name]);
      const price = num(row[cols.price]);
      if (!name) { r.skipped++; continue; }
      if (!Number.isFinite(price) || price < 0) { r.skipped++; r.notes.push(`Item ${id} "${name}": unreadable price "${row[cols.price]}"`); continue; }
      const gid = cols.group && groupIds.has(str(row[cols.group])) ? groupIds.get(str(row[cols.group]))! : await ensureFallback();
      if (!gid && !dryRun) { r.skipped++; continue; }
      const takeaway = cols.takeaway && Number.isFinite(num(row[cols.takeaway])) ? num(row[cols.takeaway]) : null;
      const vat = cols.vat && Number.isFinite(num(row[cols.vat])) ? num(row[cols.vat]) : opts.defaultVat;
      const name2 = cols.name2 ? str(row[cols.name2]) || null : null;
      const barcode = cols.barcode ? str(row[cols.barcode], 100) || null : null;
      const sort = cols.sort ? Math.round(num(row[cols.sort])) || 0 : 0;
      const active = cols.active ? truthy(row[cols.active]) : true;
      seen.add(id);
      let nid = await map.get('item', id);
      if (nid) { r.updated++; if (!dryRun) await db.execute('UPDATE menu_items SET group_id=?, name_primary=?, name_secondary=?, price=?, price_takeaway=?, vat_rate=?, barcode=?, sort_order=?, is_active=? WHERE id=?', [gid, name, name2, price, takeaway, vat, barcode, sort, active ? 1 : 0, nid]); }
      else { r.created++; if (!dryRun) { const [ins]: any = await db.execute('INSERT INTO menu_items (group_id, code, name_primary, name_secondary, price, price_takeaway, vat_rate, barcode, sort_order, is_active) VALUES (?,?,?,?,?,?,?,?,?,?)', [gid, `L${id}`, name, name2, price, takeaway, vat, barcode, sort, active ? 1 : 0]); nid = ins.insertId; } }
      if (nid) await map.set('item', id, nid);
      sample(r, { item: name, price });
    }
    await deactivateMissing(r, 'item', seen, 'menu_items');
  }

  // ── Employees ─────────────────────────────────────────────────────────────
  const emps = await read('employees', 'employees');
  if (emps) {
    const { r, cols, rows } = emps; const seen = new Set<string>();
    if (!cols.pin) r.notes.push('No PIN column found: employees are imported INACTIVE and need a PIN in Back Office.');
    r.notes.push('Roles are not copied (unknown in the old system): everyone is imported as waiter; promote managers after the import.');
    const usedPins = new Set<string>();
    // a PIN that an existing (new-system) employee already uses would make logins ambiguous
    const [existing]: any = await db.execute('SELECT pin FROM employees WHERE branch_id = ? AND is_active = 1', [branchId]);
    const clashes = (pin: string) => existing.some((e: any) => bcrypt.compareSync(pin, e.pin));
    for (const row of rows) {
      const id = str(row[cols.id]); const full = str(row[cols.name], 200) || `Employee ${id}`;
      const [first, ...rest] = full.split(/\s+/); const last = rest.join(' ') || '-';
      let active = cols.active ? truthy(row[cols.active]) : true;
      const pinRaw = cols.pin ? str(row[cols.pin], 20) : '';
      let pinOk = /^\d{3,8}$/.test(pinRaw) && !usedPins.has(pinRaw) && (!!(await map.get('employee', id)) || !clashes(pinRaw));
      if (cols.pin && !pinOk) { r.notes.push(`Employee ${id} "${full}": PIN missing, not numeric, or used twice: imported inactive`); }
      if (!pinOk) active = false; else usedPins.add(pinRaw);
      seen.add(id);
      let nid = await map.get('employee', id);
      if (nid) {
        r.updated++;
        // never overwrite an existing PIN/role here: staff may have changed them in the new system
        if (!dryRun) await db.execute('UPDATE employees SET first_name=?, last_name=? WHERE id=?', [first, last, nid]);
      } else {
        r.created++;
        if (!dryRun) {
          const hash = await bcrypt.hash(pinOk ? pinRaw : `x${Math.random()}${Date.now()}`, 10);
          const [ins]: any = await db.execute('INSERT INTO employees (branch_id, code, first_name, last_name, role, pin, is_active) VALUES (?,?,?,?,?,?,?)', [branchId, `L${id}`, first, last, 'waiter', hash, active ? 1 : 0]);
          nid = ins.insertId;
        }
      }
      if (nid) await map.set('employee', id, nid);
      sample(r, { employee: full, canLogin: pinOk });
    }
    await deactivateMissing(r, 'employee', seen, 'employees');
  }

  report.ok = report.entities.some((e) => e.found > 0);
  return report;
}
