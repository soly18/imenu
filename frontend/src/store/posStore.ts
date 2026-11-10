import { create } from 'zustand';
import type { OrderItem } from '@imenu25/shared';

interface OrderDraft {
  orderId: number | null;
  tableId: number | null;
  tableLabel: string | null;
  orderType: string;
  guestCount: number;
  items: OrderItem[];
}

interface PosState extends OrderDraft {
  setOrderId: (id: number) => void;
  setTable: (tableId: number, label: string) => void;
  setItems: (items: OrderItem[]) => void;
  addItem: (item: OrderItem) => void;
  removeItem: (itemId: number) => void;
  updateQuantity: (itemId: number, qty: number) => void;
  clearOrder: () => void;
  subtotal: () => number;
  total: () => number;
}

const EMPTY: OrderDraft = {
  orderId: null,
  tableId: null,
  tableLabel: null,
  orderType: 'dine_in',
  guestCount: 1,
  items: [],
};

export const usePosStore = create<PosState>()((set, get) => ({
  ...EMPTY,

  setOrderId: (id) => set({ orderId: id }),
  setTable: (tableId, tableLabel) => set({ tableId, tableLabel }),

  setItems: (items) => set({ items }),

  addItem: (item) => set((s) => {
    const existing = s.items.find(i => i.menuItemId === item.menuItemId && !i.choices?.length);
    if (existing && !item.choices?.length) {
      return {
        items: s.items.map(i =>
          i.id === existing.id
            ? { ...i, quantity: i.quantity + 1, totalPrice: i.unitPrice * (i.quantity + 1) }
            : i
        ),
      };
    }
    return { items: [...s.items, item] };
  }),

  removeItem: (itemId) => set((s) => ({ items: s.items.filter(i => i.id !== itemId) })),

  updateQuantity: (itemId, qty) => set((s) => ({
    items: qty <= 0
      ? s.items.filter(i => i.id !== itemId)
      : s.items.map(i => i.id === itemId
          ? { ...i, quantity: qty, totalPrice: i.unitPrice * qty }
          : i
      ),
  })),

  clearOrder: () => set({ ...EMPTY }),

  subtotal: () => get().items.reduce((sum, i) => sum + i.totalPrice, 0),
  total: () => get().items.reduce((sum, i) => sum + i.totalPrice, 0),
}));
