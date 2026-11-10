import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { menuApi, ordersApi } from '@/api';
import { DragScroll } from '@/hooks/useDragScroll';
import { usePosStore } from '@/store/posStore';
import type { MenuItem, MenuGroup } from '@imenu25/shared';

// ── Order Item Row ────────────────────────────────────────────
function OrderItemRow({ item, onVoid, onQty }: {
  item: any;
  onVoid: () => void;
  onQty: (qty: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate text-sm">{item.namePrimary}</p>
        {item.choices?.length > 0 && (
          <p className="text-xs text-gray-400">{item.choices.map((c: any) => c.namePrimary).join(', ')}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onQty(item.quantity - 1)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center text-lg font-bold hover:bg-gray-200">−</button>
        <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
        <button onClick={() => onQty(item.quantity + 1)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center text-lg font-bold hover:bg-gray-200">+</button>
      </div>
      <span className="text-sm font-semibold text-gray-700 w-16 text-end">₪{item.totalPrice.toFixed(0)}</span>
      <button onClick={onVoid} className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
    </div>
  );
}

// ── Payment Modal ──────────────────────────────────────────────
function PayModal({ total, onPay, onClose }: { total: number; onPay: (payments: any[]) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [cash, setCash] = useState('');
  const change = cash ? Math.max(0, parseFloat(cash) - total) : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6">
        <h2 className="text-xl font-bold mb-4">{t('pos.pay')}</h2>
        <div className="text-3xl font-bold text-brand-600 mb-6">₪{total.toFixed(2)}</div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => onPay([{ method: 'cash', amount: total }])}
            className="pos-btn bg-green-50 text-green-700 border border-green-200 h-14"
          >💵 {t('pos.cash')}</button>
          <button
            onClick={() => onPay([{ method: 'credit_card', amount: total }])}
            className="pos-btn bg-blue-50 text-blue-700 border border-blue-200 h-14"
          >💳 {t('pos.card')}</button>
        </div>
        <div className="flex gap-2 mb-4">
          <input
            type="number"
            placeholder={t('pos.cash')}
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            className="flex-1 border rounded-xl px-3 py-2 text-lg"
          />
          <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-xl text-sm">
            {t('pos.change')}: <strong className="ms-1">₪{change.toFixed(2)}</strong>
          </div>
        </div>
        <button onClick={onClose} className="w-full pos-btn bg-gray-100 text-gray-700 h-12">{t('common.cancel')}</button>
      </div>
    </div>
  );
}

// ── Main POS ───────────────────────────────────────────────────
export default function PosPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  const [showPay, setShowPay] = useState(false);
  const { items, orderId, clearOrder, setOrderId, setItems, subtotal } = usePosStore();
  const [params, setParams] = useSearchParams();

  // "?order=ID" (from the Z report) opens an existing unpaid order
  useEffect(() => {
    const id = Number(params.get('order'));
    if (!id) return;
    (async () => {
      try {
        const o: any = await ordersApi.get(id);
        if (['open', 'sent'].includes(o.status)) { setOrderId(id); setItems(o.items); }
        else toast.error(t('pos.orderClosed'));
      } catch { toast.error(t('common.error')); }
      setParams({}, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: groups = [] } = useQuery<MenuGroup[]>({
    queryKey: ['menu-groups'],
    queryFn: menuApi.groups,
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ['menu-items', activeGroup],
    queryFn: () => menuApi.items(activeGroup ?? undefined),
    enabled: !!activeGroup,
  });

  const sendToKitchen = useMutation({
    mutationFn: () => ordersApi.sendToKitchen(orderId!),
    onSuccess: () => toast.success(t('pos.sendToKitchen')),
  });

  const payMutation = useMutation({
    mutationFn: (payments: any[]) => ordersApi.pay(orderId!, payments),
    onSuccess: () => {
      toast.success('✅ ' + t('pos.pay'));
      clearOrder();
      setShowPay(false);
    },
  });

  const refresh = async (id: number) => {
    const order: any = await ordersApi.get(id);
    setItems(order.items);
  };

  const handleAddItem = async (item: MenuItem) => {
    try {
      let currentOrderId = orderId;
      if (!currentOrderId) {
        const res = await ordersApi.create({ orderType: 'dine_in', guestCount: 1 });
        currentOrderId = res.id as number;
        setOrderId(currentOrderId);
      }
      await ordersApi.addItem(currentOrderId, { menuItemId: item.id, quantity: 1, unitPrice: item.price });
      await refresh(currentOrderId);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleVoid = async (itemId: number) => {
    if (!orderId) return;
    try { await ordersApi.voidItem(orderId, itemId); await refresh(orderId); }
    catch { toast.error(t('common.error')); }
  };

  const handleQty = async (itemId: number, qty: number) => {
    if (!orderId) return;
    if (qty <= 0) return handleVoid(itemId);
    try { await ordersApi.updateItemQty(orderId, itemId, qty); await refresh(orderId); }
    catch { toast.error(t('common.error')); }
  };

  const total = subtotal();

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* ── Left: Menu ─────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
        {/* Group bar */}
        <DragScroll className="flex gap-2 p-3 overflow-x-auto bg-white border-b border-gray-100">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setActiveGroup(g.id)}
              className={`group-btn flex-shrink-0 ${
                activeGroup === g.id
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={activeGroup !== g.id && g.color ? { borderLeft: `4px solid ${g.color}` } : {}}
            >
              {g.namePrimary}
            </button>
          ))}
        </DragScroll>

        {/* Items grid */}
        <DragScroll className="flex-1 overflow-y-auto p-3">
          {!activeGroup ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <div className="text-5xl mb-3">☝️</div>
                <p>{t('pos.selectCategory')}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAddItem(item)}
                  className="menu-item-card"
                >
                  <p className="font-semibold text-gray-800 text-xs leading-tight mb-1 line-clamp-2">
                    {item.namePrimary}
                  </p>
                  <p className="text-brand-600 font-bold text-sm">₪{item.price}</p>
                </button>
              ))}
            </div>
          )}
        </DragScroll>
      </div>

      {/* ── Right: Order ───────────────────────────── */}
      <div className="w-72 xl:w-80 flex flex-col bg-white border-s border-gray-200 shadow-lg">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">{t('pos.title')}</h2>
          {orderId && <p className="text-xs text-gray-400">#{orderId}</p>}
        </div>

        {/* Order items */}
        <DragScroll className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-300 text-sm">
              {t('pos.newOrder')}
            </div>
          ) : (
            items.map((item) => (
              <OrderItemRow
                key={item.id}
                item={item}
                onVoid={() => handleVoid(item.id)}
                onQty={(q) => handleQty(item.id, q)}
              />
            ))
          )}
        </DragScroll>

        {/* Totals & actions */}
        <div className="p-4 border-t border-gray-100 space-y-3">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t('pos.subtotal')}</span>
            <span>₪{total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-lg">
            <span>{t('pos.total')}</span>
            <span className="text-brand-600">₪{total.toFixed(2)}</span>
          </div>
          <button
            onClick={() => orderId && sendToKitchen.mutate()}
            disabled={!orderId || items.length === 0 || sendToKitchen.isPending}
            className="w-full pos-btn bg-orange-500 text-white h-12 hover:bg-orange-600 disabled:opacity-40"
          >
            🍽️ {t('pos.sendToKitchen')}
          </button>
          <button
            onClick={() => setShowPay(true)}
            disabled={items.length === 0}
            className="w-full pos-btn bg-brand-500 text-white h-14 text-base hover:bg-brand-600 disabled:opacity-40"
          >
            💳 {t('pos.pay')} ₪{total.toFixed(0)}
          </button>
        </div>
      </div>

      {/* Pay modal */}
      {showPay && (
        <PayModal
          total={total}
          onPay={(payments) => payMutation.mutate(payments)}
          onClose={() => setShowPay(false)}
        />
      )}
    </div>
  );
}
