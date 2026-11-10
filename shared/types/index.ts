// ─────────────────────────────────────────────
//  Shared types used by both frontend & backend
// ─────────────────────────────────────────────

export type Language = 'en' | 'he' | 'ar' | 'ru';
export type Direction = 'ltr' | 'rtl';

export const LANG_DIR: Record<Language, Direction> = {
  en: 'ltr',
  he: 'rtl',
  ar: 'rtl',
  ru: 'ltr',
};

// ── Auth ─────────────────────────────────────
export type UserRole = 'admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen';

export interface JwtPayload {
  userId: number;
  employeeId: number;
  role: UserRole;
  branchId: number;
  iat: number;
  exp: number;
}

export interface LoginRequest { pin: string; terminalId?: number; }
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  employee: EmployeeSummary;
}
export interface EmployeeSummary {
  id: number;
  firstName: string;
  lastName: string;
  role: UserRole;
  branchId: number;
  language: Language;
}

// ── Menu ─────────────────────────────────────
export interface MenuGroup {
  id: number;
  namePrimary: string;
  nameSecondary: string;
  sortOrder: number;
  isActive: boolean;
  color?: string;
  imageUrl?: string;
}

export interface MenuItem {
  id: number;
  groupId: number;
  code: string;
  namePrimary: string;
  nameSecondary: string;
  price: number;
  priceTakeaway?: number;
  vatRate: number;
  isActive: boolean;
  hasChoices: boolean;
  isCombo: boolean;
  isPizza: boolean;
  imageUrl?: string;
  barcode?: string;
  weightItem: boolean;
}

export interface MenuChoice {
  id: number;
  itemId: number;
  namePrimary: string;
  nameSecondary: string;
  extraPrice: number;
  sortOrder: number;
}

// ── Order ─────────────────────────────────────
export type OrderStatus = 'open' | 'sent' | 'paid' | 'cancelled' | 'void';
export type OrderType  = 'dine_in' | 'takeaway' | 'delivery' | 'bar';

export interface Order {
  id: number;
  orderNumber: string;
  tableId?: number;
  tableLabel?: string;
  employeeId: number;
  status: OrderStatus;
  orderType: OrderType;
  guestCount: number;
  items: OrderItem[];
  discounts: OrderDiscount[];
  subtotal: number;
  discountTotal: number;
  vatTotal: number;
  total: number;
  openedAt: string;
  closedAt?: string;
}

export interface OrderItem {
  id: number;
  orderId: number;
  menuItemId: number;
  namePrimary: string;
  nameSecondary: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  choices: OrderItemChoice[];
  notes?: string;
  voidReason?: string;
  isVoided: boolean;
  sentToKitchen: boolean;
}

export interface OrderItemChoice {
  choiceId: number;
  namePrimary: string;
  extraPrice: number;
}

export interface OrderDiscount {
  id: number;
  type: 'percent' | 'fixed' | 'preset';
  value: number;
  label: string;
  appliedBy: number;
}

// ── Payment ───────────────────────────────────
export type PaymentMethod =
  | 'cash' | 'credit_card' | 'cheque' | 'voucher'
  | 'tab_client' | 'member_points' | 'gift_card';

export interface Payment {
  id: number;
  orderId: number;
  method: PaymentMethod;
  amount: number;
  reference?: string;
  processedAt: string;
}

// ── Table / Floor ─────────────────────────────
export interface FloorPlan {
  id: number;
  name: string;
  isActive: boolean;
  tables: TableShape[];
}

export interface TableShape {
  id: number;
  floorPlanId: number;
  label: string;
  shape: 'rect' | 'circle';
  x: number; y: number;
  width: number; height: number;
  capacity: number;
  status?: 'free' | 'occupied' | 'reserved';
  currentOrderId?: number;
}

// ── Employee ──────────────────────────────────
export interface Employee {
  id: number;
  code: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  pin: string;
  branchId: number;
  isActive: boolean;
  language: Language;
  phone?: string;
  email?: string;
}

// ── Dashboard KPIs ────────────────────────────
export interface DashboardKPIs {
  openTables: number;
  totalTables: number;
  activeOrders: number;
  revenueToday: number;
  revenueThisShift: number;
  avgCheckSize: number;
  clockedInEmployees: number;
}

// ── X/Z Report ────────────────────────────────
export interface ZReport {
  reportNumber: number;
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  discounts: number;
  voids: number;
  netSales: number;
  vatByRate: { rate: number; base: number; vat: number }[];
  paymentBreakdown: { method: PaymentMethod; amount: number; count: number }[];
  cashDeclared: number;
  cashExpected: number;
  cashDifference: number;
}
