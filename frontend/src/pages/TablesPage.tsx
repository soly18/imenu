import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { FloorPlanWithOrders, FloorTable } from '@imenu25/shared';
import { ordersApi, tablesApi } from '@/api';
import { usePosStore } from '@/store/posStore';
import { useAuthStore } from '@/store/authStore';
import { DragScroll } from '@/hooks/useDragScroll';
import { fmtMoney } from '@/utils/format';

// Same colours as the orders board: free = white, open = blue, sent to kitchen = amber.
const LOOK: Record<string, string> = {
  free: 'bg-white border-gray-300 text-gray-700',
  open: 'bg-blue-50 border-blue-500 text-blue-900',
  sent: 'bg-amber-50 border-amber-500 text-amber-900',
};

export default function TablesPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.employee);
  const { clearOrder, setOrderId, setTable } = usePosStore();
  const [planId, setPlanId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: plans = [], isLoading } = useQuery<FloorPlanWithOrders[]>({
    queryKey: ['tables'], queryFn: tablesApi.list, refetchInterval: 8_000,
  });
  useEffect(() => { if (planId === null && plans.length) setPlanId(plans[0].id); }, [plans, planId]);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];

  const time = (iso: string) =>
    new Intl.DateTimeFormat(`${lng}-u-nu-latn`, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  const pick = async (tb: FloorTable) => {
    if (busy) return;
    setBusy(true);
    try {
      clearOrder();
      // For a free table this creates the order; for an occupied one the server returns the existing order.
      const { id } = tb.order ? { id: tb.order.id } : await ordersApi.create({ tableId: tb.id, guestCount: 1 });
      setOrderId(id); setTable(tb.id, tb.label);
      navigate(`/pos?order=${id}`);
    } catch { toast.error(t('common.error')); }
    finally { setBusy(false); }
  };

  // canvas size = furthest table edge + margin
  const w = Math.max(600, ...(plan?.tables.map((x) => x.x + x.width) ?? [0])) + 60;
  const h = Math.max(400, ...(plan?.tables.map((x) => x.y + x.height) ?? [0])) + 60;

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      <div className="px-4 py-3 bg-white border-b border-gray-200 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900 me-2">{t('tables.title')}</h1>
        <DragScroll className="flex gap-2 overflow-x-auto flex-1 min-w-0 py-1">
          {plans.map((p) => (
            <button key={p.id} onClick={() => setPlanId(p.id)}
              className={`flex-shrink-0 min-h-[44px] px-4 rounded-full border text-sm font-semibold ${
                plan?.id === p.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'}`}>
              {p.name}
            </button>
          ))}
        </DragScroll>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          {(['free', 'open', 'sent'] as const).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`w-3 h-3 rounded border-2 ${LOOK[k]}`} />{t(`tables.${k}`)}
            </span>
          ))}
        </div>
      </div>

      <DragScroll dir="ltr" className="flex-1 min-h-0 overflow-auto bg-gray-50">
        {isLoading && <p className="p-6 text-gray-400">{t('common.loading')}</p>}
        {!isLoading && !plan && <p className="p-6 text-gray-400">{t('tables.empty')}</p>}
        {plan && (
          // The plan is drawn left-to-right in every language: it mirrors the real room, not the text.
          <div className="relative" style={{ width: w, height: h }}>
            {plan.tables.map((tb) => {
              const o = tb.order;
              const mine = o && o.employeeId === me?.id;
              return (
                <button
                  key={tb.id}
                  onClick={() => pick(tb)}
                  disabled={busy}
                  style={{ left: tb.x, top: tb.y, width: Math.max(tb.width, 96), height: Math.max(tb.height, 96) }}
                  className={`absolute border-4 shadow-sm flex flex-col items-center justify-center p-1 text-center active:scale-95 transition-transform
                    ${tb.shape === 'circle' ? 'rounded-full' : 'rounded-2xl'}
                    ${LOOK[o ? o.status : 'free']} ${mine ? 'ring-4 ring-brand-400 ring-offset-1' : ''}`}
                >
                  <span className="text-xl font-extrabold leading-none">{tb.label}</span>
                  {o ? (
                    <>
                      <span className="text-[11px] leading-tight truncate max-w-full mt-1">{o.employeeName}</span>
                      <span className="text-xs font-bold tabular-nums">{fmtMoney(o.total, lng, t('common.currency'))}</span>
                      <span className="text-[10px] opacity-70">{time(o.openedAt)}{o.orderCount > 1 ? ` · ×${o.orderCount}` : ''}</span>
                    </>
                  ) : (
                    <span className="text-[11px] text-gray-400 mt-1">👤 {tb.capacity}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </DragScroll>
    </div>
  );
}
