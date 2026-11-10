-- iMenu25 Database Schema
-- MySQL 8.0+  |  charset utf8mb4 (full Hebrew, Arabic, emoji support)
-- Run: mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS imenu25
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE imenu25;

-- ─── EMPLOYEES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  employeeID    INT AUTO_INCREMENT PRIMARY KEY,
  empPrimeLang  VARCHAR(100) NOT NULL,
  empSecLang    VARCHAR(100) DEFAULT '',
  username      VARCHAR(50) UNIQUE,
  passwordHash  VARCHAR(255),
  pin           VARCHAR(10),
  role          ENUM('admin','manager','cashier','waiter','kitchen','delivery') DEFAULT 'waiter',
  empGroupID    INT DEFAULT NULL,
  phone         VARCHAR(30) DEFAULT '',
  email         VARCHAR(100) DEFAULT '',
  mayOrder      TINYINT(1) DEFAULT 0,
  mayDelivery   TINYINT(1) DEFAULT 0,
  isActive      TINYINT(1) DEFAULT 1,
  refreshToken  TEXT,
  createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_permissions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  employeeID    INT NOT NULL,
  permission    VARCHAR(100) NOT NULL,
  FOREIGN KEY (employeeID) REFERENCES employees(employeeID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_hours (
  clockID       INT AUTO_INCREMENT PRIMARY KEY,
  employeeID    INT NOT NULL,
  clockIn       DATETIME NOT NULL,
  clockOut      DATETIME DEFAULT NULL,
  terminalID    INT DEFAULT NULL,
  FOREIGN KEY (employeeID) REFERENCES employees(employeeID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── TERMINALS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS terminals (
  terminalID    INT AUTO_INCREMENT PRIMARY KEY,
  termPrimeLang VARCHAR(100) NOT NULL,
  termSecLang   VARCHAR(100) DEFAULT '',
  terminalIP    VARCHAR(45) DEFAULT '',
  type          ENUM('pos','tables','delivery','kitchen') DEFAULT 'pos',
  isActive      TINYINT(1) DEFAULT 1,
  lastSeen      DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── ZONES & TABLES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zones (
  zoneID        INT AUTO_INCREMENT PRIMARY KEY,
  primeLang     VARCHAR(100) NOT NULL,
  secLang       VARCHAR(100) DEFAULT '',
  sortOrder     INT DEFAULT 0,
  isActive      TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `tables` (
  tableID       INT AUTO_INCREMENT PRIMARY KEY,
  primeLang     VARCHAR(50) NOT NULL,
  zoneID        INT DEFAULT NULL,
  seats         INT DEFAULT 4,
  posX          INT DEFAULT 0,
  posY          INT DEFAULT 0,
  width         INT DEFAULT 80,
  height        INT DEFAULT 80,
  shape         ENUM('square','round') DEFAULT 'square',
  isActive      TINYINT(1) DEFAULT 1,
  FOREIGN KEY (zoneID) REFERENCES zones(zoneID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── ITEM GROUPS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_groups (
  groupID       INT AUTO_INCREMENT PRIMARY KEY,
  primeLang     VARCHAR(100) NOT NULL,
  secLang       VARCHAR(100) DEFAULT '',
  color         VARCHAR(20) DEFAULT '#3B82F6',
  sortOrder     INT DEFAULT 0,
  isActive      TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── ITEMS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items (
  itemID        INT AUTO_INCREMENT PRIMARY KEY,
  primeLang     VARCHAR(200) NOT NULL,
  secLang       VARCHAR(200) DEFAULT '',
  price         DECIMAL(10,2) DEFAULT 0,
  clubmemberprice DECIMAL(10,2) DEFAULT 0,
  deliveryprice DECIMAL(10,2) DEFAULT 0,
  itemActive    TINYINT(1) DEFAULT 1,
  isWeight      TINYINT(1) DEFAULT 0,
  iBarcode      VARCHAR(50) DEFAULT '',
  itemgroupid   INT DEFAULT NULL,
  iProperty     INT DEFAULT 0,
  imageUrl      VARCHAR(500) DEFAULT NULL,
  createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (itemgroupid) REFERENCES item_groups(groupID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── ITEM CHOICES (combos/pizza) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS choice_groups (
  groupID       INT AUTO_INCREMENT PRIMARY KEY,
  itemID        INT NOT NULL,
  primeLang     VARCHAR(100) NOT NULL,
  minChoices    INT DEFAULT 0,
  maxChoices    INT DEFAULT 1,
  sortOrder     INT DEFAULT 0,
  FOREIGN KEY (itemID) REFERENCES items(itemID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS item_choices (
  choiceID      INT AUTO_INCREMENT PRIMARY KEY,
  itemID        INT NOT NULL,
  groupID       INT NOT NULL,
  primeLang     VARCHAR(200) NOT NULL,
  secLang       VARCHAR(200) DEFAULT '',
  price         DECIMAL(10,2) DEFAULT 0,
  sortOrder     INT DEFAULT 0,
  isActive      TINYINT(1) DEFAULT 1,
  FOREIGN KEY (itemID) REFERENCES items(itemID) ON DELETE CASCADE,
  FOREIGN KEY (groupID) REFERENCES choice_groups(groupID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── PAY METHODS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_methods (
  payMethodID   INT AUTO_INCREMENT PRIMARY KEY,
  primeLang     VARCHAR(100) NOT NULL,
  secLang       VARCHAR(100) DEFAULT '',
  type          VARCHAR(50) NOT NULL,
  isActive      TINYINT(1) DEFAULT 1,
  sortOrder     INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── DISCOUNTS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discounts (
  DiscountID    INT AUTO_INCREMENT PRIMARY KEY,
  ActiveDiscount TINYINT(1) DEFAULT 1,
  primeLang     VARCHAR(200) NOT NULL,
  secLang       VARCHAR(200) DEFAULT '',
  fromDate      DATE DEFAULT NULL,
  toDate        DATE DEFAULT NULL,
  fromTime      TIME DEFAULT '00:00:00',
  toTime        TIME DEFAULT '23:59:59',
  pctDiscount   DECIMAL(5,2) DEFAULT 0,
  nisDiscount   DECIMAL(10,2) DEFAULT 0,
  Day1          TINYINT(1) DEFAULT 1,
  Day2          TINYINT(1) DEFAULT 1,
  Day3          TINYINT(1) DEFAULT 1,
  Day4          TINYINT(1) DEFAULT 1,
  Day5          TINYINT(1) DEFAULT 1,
  Day6          TINYINT(1) DEFAULT 1,
  Day7          TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── MEMBERS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS members (
  memberID      INT AUTO_INCREMENT PRIMARY KEY,
  primeLang     VARCHAR(100) NOT NULL,
  phone         VARCHAR(30) DEFAULT '',
  email         VARCHAR(100) DEFAULT '',
  points        DECIMAL(10,2) DEFAULT 0,
  discountPct   DECIMAL(5,2) DEFAULT 0,
  isActive      TINYINT(1) DEFAULT 1,
  createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── TAB CLIENTS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tab_clients (
  clientID      INT AUTO_INCREMENT PRIMARY KEY,
  primeLang     VARCHAR(100) NOT NULL,
  phone         VARCHAR(30) DEFAULT '',
  email         VARCHAR(100) DEFAULT '',
  balance       DECIMAL(10,2) DEFAULT 0,
  creditLimit   DECIMAL(10,2) DEFAULT 0,
  isActive      TINYINT(1) DEFAULT 1,
  createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── ORDERS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  orderID       INT AUTO_INCREMENT PRIMARY KEY,
  terminalID    INT DEFAULT NULL,
  employeeID    INT DEFAULT NULL,
  tableID       INT DEFAULT NULL,
  takeAway      TINYINT(1) DEFAULT 0,
  orderStatus   TINYINT DEFAULT 1 COMMENT '1=open, 2=closed, 3=cancelled',
  total         DECIMAL(10,2) DEFAULT 0,
  discountAmount DECIMAL(10,2) DEFAULT 0,
  discountType  VARCHAR(20) DEFAULT NULL,
  discountID    INT DEFAULT NULL,
  discountBy    INT DEFAULT NULL,
  invoiceNumber INT DEFAULT NULL,
  memberID      INT DEFAULT NULL,
  createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
  closedAt      DATETIME DEFAULT NULL,
  INDEX idx_status (orderStatus),
  INDEX idx_date (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── ORDER ITEMS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  order_itemsID INT AUTO_INCREMENT PRIMARY KEY,
  orderID       INT NOT NULL,
  itemID        INT NOT NULL,
  quantity      DECIMAL(10,3) DEFAULT 1,
  price         DECIMAL(10,2) DEFAULT 0,
  course        INT DEFAULT 1,
  diner         INT DEFAULT 1,
  remarks       VARCHAR(500) DEFAULT '',
  status        TINYINT DEFAULT 0,
  printed       TINYINT DEFAULT 0,
  disabled      TINYINT(1) DEFAULT 0,
  parentItem    INT DEFAULT NULL,
  reasonID      INT DEFAULT NULL,
  cancelledBy   INT DEFAULT NULL,
  cancelledAt   DATETIME DEFAULT NULL,
  createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (orderID) REFERENCES orders(orderID),
  INDEX idx_order (orderID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── PAYMENTS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  paymentID     INT AUTO_INCREMENT PRIMARY KEY,
  orderID       INT NOT NULL,
  method        VARCHAR(50) NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  reference     VARCHAR(200) DEFAULT NULL,
  clientID      INT DEFAULT NULL,
  voucherCode   VARCHAR(100) DEFAULT NULL,
  createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (orderID) REFERENCES orders(orderID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── EOD ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS z_reports (
  zID           INT AUTO_INCREMENT PRIMARY KEY,
  terminalID    INT DEFAULT NULL,
  closedAt      DATETIME DEFAULT CURRENT_TIMESTAMP,
  closedBy      INT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cash_declarations (
  declID        INT AUTO_INCREMENT PRIMARY KEY,
  zID           INT DEFAULT NULL,
  denomination  DECIMAL(10,2) NOT NULL,
  qty           INT NOT NULL DEFAULT 0,
  total         DECIMAL(10,2) NOT NULL DEFAULT 0,
  createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── PARAMETERS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parameters (
  paramID       INT AUTO_INCREMENT PRIMARY KEY,
  paramGroup    VARCHAR(50) NOT NULL,
  paramKey      VARCHAR(100) NOT NULL UNIQUE,
  paramValue    TEXT,
  paramType     ENUM('text','number','boolean','color','select') DEFAULT 'text',
  paramLabel    VARCHAR(200) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── SEED DATA ───────────────────────────────────────────────────────────────

-- Default admin user (password: admin123)
INSERT IGNORE INTO employees (empPrimeLang, empSecLang, username, passwordHash, pin, role, mayOrder, isActive)
VALUES ('מנהל ראשי', 'Admin', 'admin',
        '$2a$10$rBV2JDeWW3.vKyeCtBOWA.8RL5/4YMb5Q4p1SL8kN1q1/W9z5qj.y',
        '1234', 'admin', 1, 1);

-- Default payment methods
INSERT IGNORE INTO pay_methods (primeLang, secLang, type, isActive, sortOrder) VALUES
('מזומן',        'Cash',        'cash',    1, 1),
('כרטיס אשראי', 'Credit Card', 'card',    1, 2),
('שיק',          'Cheque',      'cheque',  1, 3),
('שובר',         'Voucher',     'voucher', 1, 4),
('חשבון',        'Tab',         'tab',     1, 5);

-- Default parameters
INSERT IGNORE INTO parameters (paramGroup, paramKey, paramValue, paramType, paramLabel) VALUES
('general',  'businessName',   'iMenu Restaurant',  'text',    'Business Name'),
('general',  'defaultLanguage','he',                 'select',  'Default Language'),
('tax',      'vatRate',        '17',                 'number',  'VAT Rate (%)'),
('tax',      'serviceCharge',  '0',                  'number',  'Service Charge (%)'),
('security', 'pinLength',      '4',                  'number',  'PIN Length'),
('security', 'sessionTimeout', '480',                'number',  'Session Timeout (minutes)');

-- Default zone and table for quick start
INSERT IGNORE INTO zones (zoneID, primeLang, secLang, sortOrder) VALUES (1, 'אולם ראשי', 'Main Hall', 1);
INSERT IGNORE INTO `tables` (tableID, primeLang, zoneID, seats) VALUES
(1,'שולחן 1',1,4),(2,'שולחן 2',1,4),(3,'שולחן 3',1,4),(4,'שולחן 4',1,2),(5,'שולחן 5',1,6);

-- Default item group
INSERT IGNORE INTO item_groups (groupID, primeLang, secLang, color, sortOrder) VALUES
(1, 'ראשונות',  'Starters',    '#EF4444', 1),
(2, 'עיקריות',  'Main Course', '#3B82F6', 2),
(3, 'קינוחים',  'Desserts',    '#F59E0B', 3),
(4, 'משקאות',   'Drinks',      '#10B981', 4);

-- Sample items
INSERT IGNORE INTO items (itemID, primeLang, secLang, price, itemgroupid, itemActive) VALUES
(1, 'סלט ירקות',   'Vegetable Salad', 35, 1, 1),
(2, 'שניצל',       'Schnitzel',       65, 2, 1),
(3, 'פסטה',        'Pasta',           58, 2, 1),
(4, 'עוגת שוקולד', 'Chocolate Cake',  32, 3, 1),
(5, 'מיץ תפוזים',  'Orange Juice',    18, 4, 1);

SELECT 'iMenu25 database ready!' AS status;
