/**
 * Database Migration — iMenu25
 * Run with: npm run migrate (from backend/)
 * Creates all tables in the correct order (respects FK constraints)
 */

import { pool } from './connection';

const migrations: string[] = [

  // ── Core config ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS branches (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    address       VARCHAR(255),
    phone         VARCHAR(50),
    tax_id        VARCHAR(50),
    primary_lang  VARCHAR(5)  DEFAULT 'he',
    secondary_lang VARCHAR(5) DEFAULT 'en',
    currency_code VARCHAR(5)  DEFAULT 'ILS',
    vat_rate      DECIMAL(5,2) DEFAULT 17.00,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS terminals (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    branch_id   INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    ip_address  VARCHAR(45),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Employees ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS employees (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    branch_id     INT NOT NULL,
    code          VARCHAR(20) NOT NULL UNIQUE,
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    role          ENUM('admin','manager','cashier','waiter','kitchen') DEFAULT 'waiter',
    pin           VARCHAR(255) NOT NULL COMMENT 'bcrypt hash',
    language      VARCHAR(5) DEFAULT 'he',
    phone         VARCHAR(50),
    email         VARCHAR(255),
    is_active     BOOLEAN DEFAULT TRUE,
    hourly_rate   DECIMAL(8,2),
    hire_date     DATE,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS employee_clock_events (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    employee_id   INT NOT NULL,
    event_type    ENUM('clock_in','clock_out') NOT NULL,
    event_time    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    terminal_id   INT,
    notes         VARCHAR(255),
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (terminal_id) REFERENCES terminals(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    employee_id   INT NOT NULL,
    token_hash    VARCHAR(255) NOT NULL,
    expires_at    DATETIME NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Menu ────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS menu_groups (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    branch_id       INT NOT NULL,
    name_primary    VARCHAR(200) NOT NULL,
    name_secondary  VARCHAR(200),
    sort_order      INT DEFAULT 0,
    color           VARCHAR(7) COMMENT 'hex color',
    image_url       VARCHAR(500),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS menu_items (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    group_id          INT NOT NULL,
    code              VARCHAR(50) NOT NULL,
    name_primary      VARCHAR(200) NOT NULL,
    name_secondary    VARCHAR(200),
    description       TEXT,
    price             DECIMAL(10,2) NOT NULL DEFAULT 0,
    price_takeaway    DECIMAL(10,2),
    vat_rate          DECIMAL(5,2) DEFAULT 17.00,
    is_active         BOOLEAN DEFAULT TRUE,
    has_choices       BOOLEAN DEFAULT FALSE,
    is_combo          BOOLEAN DEFAULT FALSE,
    is_pizza          BOOLEAN DEFAULT FALSE,
    weight_item       BOOLEAN DEFAULT FALSE,
    barcode           VARCHAR(100),
    image_url         VARCHAR(500),
    kitchen_printer   INT DEFAULT 1,
    prep_time_min     INT DEFAULT 0,
    sort_order        INT DEFAULT 0,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES menu_groups(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS menu_choices (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    item_id         INT NOT NULL,
    name_primary    VARCHAR(200) NOT NULL,
    name_secondary  VARCHAR(200),
    extra_price     DECIMAL(8,2) DEFAULT 0,
    sort_order      INT DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS combo_components (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    combo_item_id   INT NOT NULL,
    component_item_id INT NOT NULL,
    quantity        INT DEFAULT 1,
    sort_order      INT DEFAULT 0,
    FOREIGN KEY (combo_item_id)     REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (component_item_id) REFERENCES menu_items(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Floor plan & Tables ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS floor_plans (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    branch_id   INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS tables (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    floor_plan_id INT NOT NULL,
    label         VARCHAR(50) NOT NULL,
    shape         ENUM('rect','circle') DEFAULT 'rect',
    pos_x         INT DEFAULT 0,
    pos_y         INT DEFAULT 0,
    width         INT DEFAULT 80,
    height        INT DEFAULT 80,
    capacity      INT DEFAULT 4,
    is_active     BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (floor_plan_id) REFERENCES floor_plans(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Orders ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS orders (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    branch_id       INT NOT NULL,
    order_number    VARCHAR(50) NOT NULL UNIQUE,
    table_id        INT,
    employee_id     INT NOT NULL,
    status          ENUM('open','sent','paid','cancelled','void') DEFAULT 'open',
    order_type      ENUM('dine_in','takeaway','delivery','bar') DEFAULT 'dine_in',
    guest_count     INT DEFAULT 1,
    subtotal        DECIMAL(10,2) DEFAULT 0,
    discount_total  DECIMAL(10,2) DEFAULT 0,
    vat_total       DECIMAL(10,2) DEFAULT 0,
    total           DECIMAL(10,2) DEFAULT 0,
    notes           TEXT,
    opened_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at         DATETIME,
    closed_at       DATETIME,
    FOREIGN KEY (branch_id)   REFERENCES branches(id),
    FOREIGN KEY (table_id)    REFERENCES tables(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS order_items (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    order_id        INT NOT NULL,
    menu_item_id    INT NOT NULL,
    name_primary    VARCHAR(200) NOT NULL,
    name_secondary  VARCHAR(200),
    quantity        DECIMAL(8,3) NOT NULL DEFAULT 1,
    unit_price      DECIMAL(10,2) NOT NULL,
    total_price     DECIMAL(10,2) NOT NULL,
    notes           TEXT,
    is_voided       BOOLEAN DEFAULT FALSE,
    void_reason     VARCHAR(255),
    void_by         INT,
    sent_to_kitchen BOOLEAN DEFAULT FALSE,
    sent_at         DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id)      REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id)  REFERENCES menu_items(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS order_item_choices (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    order_item_id   INT NOT NULL,
    choice_id       INT,
    name_primary    VARCHAR(200) NOT NULL,
    extra_price     DECIMAL(8,2) DEFAULT 0,
    FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS order_discounts (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    order_id    INT NOT NULL,
    type        ENUM('percent','fixed','preset') NOT NULL,
    value       DECIMAL(8,2) NOT NULL,
    label       VARCHAR(100),
    applied_by  INT NOT NULL,
    applied_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (applied_by) REFERENCES employees(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Payments ─────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS payments (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    order_id        INT NOT NULL,
    method          ENUM('cash','credit_card','cheque','voucher','tab_client','member_points','gift_card') NOT NULL,
    amount          DECIMAL(10,2) NOT NULL,
    reference       VARCHAR(100),
    processed_by    INT,
    processed_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id)      REFERENCES orders(id),
    FOREIGN KEY (processed_by)  REFERENCES employees(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Discounts config ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS discount_presets (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    branch_id       INT NOT NULL,
    name_primary    VARCHAR(100) NOT NULL,
    name_secondary  VARCHAR(100),
    type            ENUM('percent','fixed') NOT NULL,
    value           DECIMAL(8,2) NOT NULL,
    requires_manager BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Loyalty members ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS members (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    branch_id       INT NOT NULL,
    card_number     VARCHAR(50) UNIQUE,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    phone           VARCHAR(50),
    email           VARCHAR(255),
    points_balance  DECIMAL(10,2) DEFAULT 0,
    total_spent     DECIMAL(12,2) DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    joined_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Tab clients ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS tab_clients (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    branch_id       INT NOT NULL,
    name            VARCHAR(100) NOT NULL,
    phone           VARCHAR(50),
    credit_limit    DECIMAL(10,2) DEFAULT 0,
    balance         DECIMAL(10,2) DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Z Reports ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS z_reports (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    branch_id       INT NOT NULL,
    report_number   INT NOT NULL,
    period_start    DATETIME NOT NULL,
    period_end      DATETIME NOT NULL,
    gross_sales     DECIMAL(12,2) DEFAULT 0,
    discounts       DECIMAL(12,2) DEFAULT 0,
    voids           DECIMAL(12,2) DEFAULT 0,
    net_sales       DECIMAL(12,2) DEFAULT 0,
    vat_total       DECIMAL(12,2) DEFAULT 0,
    cash_declared   DECIMAL(12,2) DEFAULT 0,
    cash_expected   DECIMAL(12,2) DEFAULT 0,
    cash_difference DECIMAL(12,2) DEFAULT 0,
    generated_by    INT NOT NULL,
    generated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    report_data     JSON COMMENT 'Full breakdown as JSON',
    FOREIGN KEY (branch_id)    REFERENCES branches(id),
    FOREIGN KEY (generated_by) REFERENCES employees(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Cash declarations ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS cash_declarations (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    branch_id       INT NOT NULL,
    employee_id     INT NOT NULL,
    declaration_type ENUM('x_report','z_report','shift_open') NOT NULL,
    c_5             INT DEFAULT 0,
    c_10            INT DEFAULT 0,
    c_50            INT DEFAULT 0,
    c_100           INT DEFAULT 0,
    c_200           INT DEFAULT 0,
    c_1             INT DEFAULT 0,
    c_2             INT DEFAULT 0,
    total_declared  DECIMAL(10,2) DEFAULT 0,
    declared_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id)   REFERENCES branches(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

];

async function migrate() {
  console.log('🚀 Starting migration...');
  const conn = await pool.getConnection();
  try {
    for (const sql of migrations) {
      const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
      await conn.execute(sql);
      console.log(`  ✓ ${tableName}`);
    }
    console.log('✅ Migration complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
