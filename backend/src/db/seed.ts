/**
 * Seed script — creates demo branch, employees, and menu items
 * Run with: npm run seed (from backend/)
 */
import bcrypt from 'bcryptjs';
import { pool } from './connection';

async function seed() {
  console.log('🌱 Seeding demo data...');
  const conn = await pool.getConnection();
  try {
    const [existing]: any = await conn.execute('SELECT id FROM branches LIMIT 1');
    if (existing.length) {
      console.log('ℹ️  Data already seeded — nothing to do. (Drop and recreate the database to reseed.)');
      return;
    }

    // Branch
    const [branchRes]: any = await conn.execute(
      `INSERT INTO branches (name, address, phone, primary_lang, secondary_lang, vat_rate)
       VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      ['iMenu25 Demo', 'Tel Aviv, Israel', '03-1234567', 'he', 'en', 17.00]
    );
    const branchId = branchRes.insertId;
    console.log(`  ✓ branch id=${branchId}`);

    // Terminal
    await conn.execute(
      `INSERT INTO terminals (branch_id, name, ip_address) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE id=id`,
      [branchId, 'Cashier 1', '192.168.1.100']
    );

    // Employees
    const employees = [
      { code: 'ADM01', first: 'Admin',   last: 'User',    role: 'admin',    pin: '1111' },
      { code: 'MGR01', first: 'Michael', last: 'Cohen',   role: 'manager',  pin: '2222' },
      { code: 'CSH01', first: 'Sarah',   last: 'Levi',    role: 'cashier',  pin: '3333' },
      { code: 'WTR01', first: 'David',   last: 'Ben-Ami', role: 'waiter',   pin: '4444' },
      { code: 'KIT01', first: 'Kitchen', last: 'Staff',   role: 'kitchen',  pin: '5555' },
    ];
    for (const emp of employees) {
      const hash = await bcrypt.hash(emp.pin, 10);
      await conn.execute(
        `INSERT INTO employees (branch_id, code, first_name, last_name, role, pin)
         VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=id`,
        [branchId, emp.code, emp.first, emp.last, emp.role, hash]
      );
      console.log(`  ✓ employee ${emp.code} (PIN: ${emp.pin})`);
    }

    // Floor plan
    const [fpRes]: any = await conn.execute(
      `INSERT INTO floor_plans (branch_id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
      [branchId, 'Main Hall']
    );
    const fpId = fpRes.insertId;

    // Tables
    const tables = [
      { label: '1', x: 50,  y: 50  }, { label: '2', x: 200, y: 50  },
      { label: '3', x: 350, y: 50  }, { label: '4', x: 50,  y: 200 },
      { label: '5', x: 200, y: 200 }, { label: 'B', x: 350, y: 200, shape: 'circle' },
    ];
    for (const t of tables) {
      await conn.execute(
        `INSERT INTO tables (floor_plan_id, label, shape, pos_x, pos_y, width, height)
         VALUES (?, ?, ?, ?, ?, 80, 80) ON DUPLICATE KEY UPDATE id=id`,
        [fpId, t.label, (t as any).shape || 'rect', t.x, t.y]
      );
    }
    console.log(`  ✓ ${tables.length} tables`);

    // Menu groups
    const groups = [
      { name: 'Starters',   nameHe: 'מנות ראשונות', color: '#FF6B6B' },
      { name: 'Mains',      nameHe: 'עיקריות',       color: '#4ECDC4' },
      { name: 'Pizzas',     nameHe: 'פיצות',         color: '#FFE66D' },
      { name: 'Desserts',   nameHe: 'קינוחים',       color: '#A8E6CF' },
      { name: 'Beverages',  nameHe: 'משקאות',        color: '#DDA0DD' },
    ];
    const groupIds: number[] = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const [res]: any = await conn.execute(
        `INSERT INTO menu_groups (branch_id, name_primary, name_secondary, sort_order, color)
         VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
        [branchId, g.nameHe, g.name, i, g.color]
      );
      groupIds.push(res.insertId);
    }
    console.log(`  ✓ ${groups.length} menu groups`);

    // Menu items
    const items = [
      // Starters
      { g: 0, code: 'S01', name: 'חומוס',          nameEn: 'Hummus',         price: 38 },
      { g: 0, code: 'S02', name: 'סלט ירקות',       nameEn: 'Vegetable Salad',price: 32 },
      { g: 0, code: 'S03', name: 'פלאפל',           nameEn: 'Falafel',        price: 35 },
      // Mains
      { g: 1, code: 'M01', name: 'שניצל עוף',       nameEn: 'Chicken Schnitzel', price: 68 },
      { g: 1, code: 'M02', name: 'בשר טחון',        nameEn: 'Ground Beef',    price: 72 },
      { g: 1, code: 'M03', name: 'דג מוסר',         nameEn: 'Sea Bass',       price: 95 },
      { g: 1, code: 'M04', name: 'פסטה קרבונרה',    nameEn: 'Pasta Carbonara',price: 62 },
      // Pizzas
      { g: 2, code: 'P01', name: 'פיצה מרגריטה',   nameEn: 'Margherita Pizza', price: 58, isPizza: true },
      { g: 2, code: 'P02', name: 'פיצה פרמה',       nameEn: 'Parma Pizza',    price: 72, isPizza: true },
      // Desserts
      { g: 3, code: 'D01', name: 'עוגת שוקולד',     nameEn: 'Chocolate Cake', price: 42 },
      { g: 3, code: 'D02', name: 'גלידה',           nameEn: 'Ice Cream',      price: 28 },
      // Beverages
      { g: 4, code: 'B01', name: 'מים מינרל',       nameEn: 'Mineral Water',  price: 12 },
      { g: 4, code: 'B02', name: 'קולה',            nameEn: 'Cola',           price: 15 },
      { g: 4, code: 'B03', name: 'קפה שחור',        nameEn: 'Black Coffee',   price: 14 },
      { g: 4, code: 'B04', name: 'כוס יין אדום',    nameEn: 'Red Wine Glass', price: 38 },
    ];
    for (const item of items) {
      await conn.execute(
        `INSERT INTO menu_items (group_id, code, name_primary, name_secondary, price, is_pizza, vat_rate)
         VALUES (?, ?, ?, ?, ?, ?, 17) ON DUPLICATE KEY UPDATE id=id`,
        [groupIds[item.g], item.code, item.name, item.nameEn, item.price, (item as any).isPizza ? 1 : 0]
      );
    }
    console.log(`  ✓ ${items.length} menu items`);

    console.log('\n🎉 Seed complete! Login PINs:');
    console.log('   Admin: 1111 | Manager: 2222 | Cashier: 3333 | Waiter: 4444');
  } catch (err) {
    console.error('❌ Seed failed:', err);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
