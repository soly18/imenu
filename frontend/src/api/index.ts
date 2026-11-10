import api from './client';
import type {
  LoginRequest, LoginResponse, DashboardKPIs, MenuGroup, MenuItem, Order,
  PaymentMethod, OrderBoardItem, EodReport, EodStatus, ZReportListItem,
} from '@imenu25/shared';

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  login: (data: LoginRequest) => api.post<LoginResponse>('/auth/login', data).then(r => r.data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me').then(r => r.data),
};

// ── Dashboard ─────────────────────────────────────────────────
export const dashboardApi = {
  kpis: () => api.get<DashboardKPIs>('/dashboard/kpis').then(r => r.data),
  floor: () => api.get('/dashboard/floor').then(r => r.data),
  clockIn: () => api.post('/dashboard/clock', { eventType: 'clock_in' }).then(r => r.data),
  clockOut: () => api.post('/dashboard/clock', { eventType: 'clock_out' }).then(r => r.data),
};

// ── Menu ──────────────────────────────────────────────────────
export const menuApi = {
  groups: () => api.get<MenuGroup[]>('/menu/groups').then(r => r.data),
  items: (groupId?: number) =>
    api.get<MenuItem[]>('/menu/items', { params: groupId ? { groupId } : {} }).then(r => r.data),
  choices: (itemId: number) => api.get(`/menu/items/${itemId}/choices`).then(r => r.data),
  createItem: (data: Partial<MenuItem>) => api.post('/menu/items', data).then(r => r.data),
  updateItem: (id: number, data: Partial<MenuItem>) => api.put(`/menu/items/${id}`, data).then(r => r.data),
};

// ── Orders ────────────────────────────────────────────────────
export const ordersApi = {
  list: (params?: { status?: string; tableId?: number }) =>
    api.get<Order[]>('/orders', { params }).then(r => r.data),
  board: () => api.get<OrderBoardItem[]>('/orders/board').then(r => r.data),
  get: (id: number) => api.get<Order>(`/orders/${id}`).then(r => r.data),
  create: (data: { tableId?: number; orderType?: string; guestCount?: number }) =>
    api.post('/orders', data).then(r => r.data),
  addItem: (orderId: number, item: {
    menuItemId: number; quantity: number; unitPrice: number; choices?: any[]; notes?: string;
  }) => api.post(`/orders/${orderId}/items`, item).then(r => r.data),
  updateItemQty: (orderId: number, itemId: number, quantity: number) =>
    api.put(`/orders/${orderId}/items/${itemId}`, { quantity }).then(r => r.data),
  voidItem: (orderId: number, itemId: number, reason?: string) =>
    api.delete(`/orders/${orderId}/items/${itemId}`, { data: { reason } }).then(r => r.data),
  cancel: (orderId: number) => api.post(`/orders/${orderId}/cancel`).then(r => r.data),
  sendToKitchen: (orderId: number) => api.post(`/orders/${orderId}/send`).then(r => r.data),
  pay: (orderId: number, payments: { method: string; amount: number; reference?: string }[]) =>
    api.post(`/orders/${orderId}/pay`, { payments }).then(r => r.data),
};

// ── Employees ─────────────────────────────────────────────────
export const employeesApi = {
  list: () => api.get('/employees').then(r => r.data),
  create: (data: any) => api.post('/employees', data).then(r => r.data),
  update: (id: number, data: any) => api.put(`/employees/${id}`, data).then(r => r.data),
  clockHistory: (id: number) => api.get(`/employees/${id}/clock-history`).then(r => r.data),
};

// ── End of day (X / Z reports) ────────────────────────────────
export const eodApi = {
  status: () => api.get<EodStatus>('/eod/status').then(r => r.data),
  x: () => api.get<EodReport>('/eod/x').then(r => r.data),
  declaration: () =>
    api.get<{ methods: PaymentMethod[]; declarations: { method: PaymentMethod; amount: number }[] }>(
      '/eod/declaration').then(r => r.data),
  saveDeclaration: (declarations: { method: PaymentMethod; amount: number | null }[]) =>
    api.post('/eod/declaration', { declarations }).then(r => r.data),
  runZ: () => api.post<{ id: number; report: EodReport }>('/eod/z').then(r => r.data),
  zList: () => api.get<ZReportListItem[]>('/eod/z').then(r => r.data),
  zGet: (id: number) => api.get<{ id: number; report: EodReport }>(`/eod/z/${id}`).then(r => r.data),
};
