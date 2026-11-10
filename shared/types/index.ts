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

// ── X / Z end-of-day reports ──────────────────
export interface EodSummary {
  orders: number;
  guests: number;
  gross: number;       // item total before discounts (VAT included)
  discounts: number;
  net: number;         // gross - discounts = what was actually charged
  vat: number;         // VAT contained in net
  avgCheck: number;
  voidsCount: number;
  voidsTotal: number;
}
export interface EodPaymentRow { method: PaymentMethod; count: number; amount: number; }
export interface EodGroupRow {
  groupId: number; namePrimary: string; nameSecondary: string | null;
  quantity: number; amount: number;
}
export interface EodEmployeeRow { employeeId: number; name: string; orders: number; amount: number; }
export interface EodDiscountRow { label: string; type: string; count: number; amount: number; }
export interface EodVatRow { rate: number; gross: number; base: number; vat: number; }
export interface EodVoidRow { reason: string | null; employeeName: string | null; count: number; amount: number; }
export interface EodDeclarationRow {
  method: PaymentMethod;
  expected: number;
  declared: number | null;     // null = nobody declared this method
  difference: number | null;   // declared - expected
}
export interface EodReport {
  kind: 'X' | 'Z';
  reportNumber: number | null; // only Z reports are numbered
  branchName: string;
  periodStart: string;         // ISO, inclusive
  periodEnd: string;           // ISO, exclusive
  generatedAt: string;
  generatedBy: string;
  summary: EodSummary;
  byPayment: EodPaymentRow[];
  byGroup: EodGroupRow[];
  byEmployee: EodEmployeeRow[];
  discounts: EodDiscountRow[];
  vat: EodVatRow[];
  voids: EodVoidRow[];
  declarations: EodDeclarationRow[];
  declarationsEntered: boolean;
  autoClockedOut: string[];    // Z only: employees clocked out by the Z
  autoCancelledOrders: number; // Z only: empty open orders cancelled by the Z
}
export interface EodOpenOrder {
  id: number; orderNumber: string; tableLabel: string | null;
  employeeName: string; total: number;
}
export interface EodStatus {
  periodStart: string;
  lastZ: { id: number; reportNumber: number; closedAt: string } | null;
  openOrders: EodOpenOrder[];  // open orders WITH items: these block a Z
  emptyOpenOrders: number;     // empty open orders: a Z cancels them
  clockedIn: string[];         // a Z clocks these employees out
  isZRunnable: boolean;
}
export interface ZReportListItem {
  id: number; reportNumber: number;
  periodStart: string; periodEnd: string;
  net: number; discounts: number; vat: number;
  cashDifference: number | null;
  generatedBy: string; generatedAt: string;
}
