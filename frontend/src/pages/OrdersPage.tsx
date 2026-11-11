import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { OrderBoardItem, OrderStatus } from '@imenu25/shared';
import { ordersApi } from '@/api';
import { usePosStore } from '@/store/posStore';
import { useAuthStore } from '@/store/authStore';
import { DragScroll } from '@/hooks/useDragScroll';
import { fmtMoney } from '@/utils/format';

/**
 * One colour set per status. To add a future status (e.g. "ready", "served"),
 * add it to OrderStatus in shared/types, add a line here and a label under
 * orders.status.* in the 4 locale files. Unknown statuses fall back to FALLBACK.
 */
const STYLE: Record<string, { bar: string; badge: string; chip: string; chipOn: string }> = {
  open:      { bar: 'border-s-blue-500',  badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200',   chip: 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800',     chipOn: 'bg-blue-600 text-white border-blue-600' },
  sent:      { bar: 'border-s-amber-500', badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200', chip: 'bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800',  chipOn: 'bg-amber-500 text-white border-amber-500' },
  paid:      { bar: 'border-s-green-500', badge: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200', chip: 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800',  chipOn: 'bg-green-600 text-white border-green-600' },
  cancelled: { bar: 'border-s-gray-400',  badge: 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200',   chip: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600',    chipOn: 'bg-gray-600 text-white border-gray-600' },
  void:      { bar: 'border-s-red-500',   badge: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200',     chip: 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800',        chipOn: 'bg-red-600 text-white border-red-600' },
};
const FALLBACK = { bar: 'border-s-purple-500', badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200', chip: 'bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800', chipOn: 'bg-purple-600 text-white border-purple-600' };
const st = (s: string) => STYLE[s] ?? FALLBACK;

const ORDER: string[] = ['open', 'sent', 'paid', 'cancelled', 'void'];
const RANK = (s: string) => { const i = ORDER.indexOf(s); return i < 0 ? 99 : i; };

export default function OrdersPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.employee);
  const clearOrder = usePosStore((s) => s.clearOrder);
  const [filter, setFilter] = useState<OrderStatus | 'all' | 'active'>('active');
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data = [], isLoading } = useQuery<OrderBoardItem[]>({
    queryKey: ['orders-board'],
    queryFn: ordersApi.board,
    refetchInterval: 10_000,   // live board
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    data.forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; });
    return c;
  }, [data]);

  const visible = data.filter((o) =>
    filter === 'all' ? true : filter === 'active' ? ['open', 'sent'].includes(o.status) : o.status === filter);

  // One column per employee: me first, then by name. Inside a column: by status, newest first.
  const columns = useMemo(() => {
    const m = new Map<number, { id: number; name: string; orders: OrderBoardItem[] }>();
    visible.forEach((o) => {
      if (!m.has(o.employeeId)) m.set(o.employeeId, { id: o.employeeId, name: o.employeeName, orders: [] });
      m.get(o.employeeId)!.orders.push(o);
    });
    const cols = [...m.values()];
    cols.forEach((c) => c.orders.sort((a, b) => RANK(a.status) - RANK(b.status) || +new Date(b.openedAt) - +new Date(a.openedAt)));
    cols.sort((a, b) => (b.id === me?.id ? 1 : 0) - (a.id === me?.id ? 1 : 0) || a.name.localeCompare(b.name));
    return cols;
  }, [visible, me?.id]);

  const time = (iso: string) =>
    new Intl.DateTimeFormat(`${lng}-u-nu-latn`, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  const openCard = (o: OrderBoardItem) => {
    if (o.status === 'open' || o.status === 'sent') navigate(`/pos?order=${o.id}`);
    else setDetailId(o.id);
  };

  const chips: { key: OrderStatus | 'all' | 'active'; label: string; n: number; cls: string; on: string }[] = [
    { key: 'active', label: t('orders.active'), n: (counts.open || 0) + (counts.sent || 0), cls: 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600', on: 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100' },
    ...ORDER.map((s) => ({ key: s as OrderStatus, label: t(`orders.status.${s}`), n: counts[s] || 0, cls: st(s).chip, on: st(s).chipOn })),
    { key: 'all', label: t('orders.all'), n: data.length, cls: 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600', on: 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100' },
  ];

  return (
    <div className="h-[calc(100dvh-112px)] md:h-[calc(100dvh-56px)] flex flex-col">
      <div className="px-4 pt-4 pb-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 me-2">{t('orders.title')}</h1>
        <DragScroll className="flex gap-2 overflow-x-auto flex-1 min-w-0 py-1">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`flex-shrink-0 min-h-[44px] px-4 rounded-full border text-sm font-semibold transition-colors ${filter === c.key ? c.on : c.cls}`}
            >
              {c.label} <span className="opacity-80">· {c.n}</span>
            </button>
          ))}
        </DragScroll>
        <button
          onClick={() => { clearOrder(); navigate('/pos'); }}
          className="min-h-[44px] px-5 rounded-xl bg-brand-500 text-white font-bold text-sm"
        >
          + {t('orders.newOrder')}
        </button>
      </div>

      <DragScroll className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 flex gap-4 items-stretch">
        {isLoading && <p className="text-gray-400">{t('common.loading')}</p>}
        {!isLoading && columns.length === 0 && (
          <p className="m-auto text-gray-400 text-lg">{t('orders.empty')}</p>
        )}
        {columns.map((col) => (
          <section key={col.id} className="w-72 flex-shrink-0 flex flex-col bg-gray-100 dark:bg-gray-700 rounded-2xl min-h-0">
            <header className="px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 dark:text-gray-100 truncate">
                {col.name}{col.id === me?.id && <span className="text-xs text-brand-600 dark:text-brand-400 font-medium"> · {t('orders.me')}</span>}
              </h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">{col.orders.length}</span>
            </header>
            <div data-vscroll className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-2">
              {col.orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => openCard(o)}
                  className={`w-full text-start bg-white dark:bg-gray-800 rounded-xl border-s-8 ${st(o.status).bar} shadow-sm p-3 min-h-[76px] active:scale-[0.99]`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-gray-900 dark:text-gray-100">
                      {o.tableLabel ? `${t('eod.table')} ${o.tableLabel}` : `#${o.orderNumber.slice(-5)}`}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st(o.status).badge}`}>
                      {t(`orders.status.${o.status}`, { defaultValue: o.status })}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
                    <span>{o.itemCount} {t('orders.items')} · <bdi>{time(o.openedAt)}</bdi></span>
                    <span dir="ltr" className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {fmtMoney(o.total, lng, t('common.currency'))}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </DragScroll>

      {detailId && <OrderDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function OrderDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { data } = useQuery<any>({ queryKey: ['order', id], queryFn: () => ordersApi.get(id) });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md p-6 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {!data ? <p className="text-gray-400">{t('common.loading')}</p> : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">
                {data.tableLabel ? `${t('eod.table')} ${data.tableLabel}` : `#${String(data.orderNumber).slice(-5)}`}
              </h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st(data.status).badge}`}>
                {t(`orders.status.${data.status}`, { defaultValue: data.status })}
              </span>
            </div>
            <DragScroll className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 border border-gray-100 dark:border-gray-700 rounded-xl">
              {data.items.map((it: any) => (
                <div key={it.id} className="px-3 py-2 flex justify-between gap-3 text-sm">
                  <span>{it.quantity} × {it.namePrimary}</span>
                  <span dir="ltr" className="tabular-nums">{fmtMoney(it.totalPrice, i18n.language, t('common.currency'))}</span>
                </div>
              ))}
            </DragScroll>
            <div className="flex justify-between font-bold text-lg mt-3">
              <span>{t('pos.total')}</span>
              <span dir="ltr">{fmtMoney(data.total, i18n.language, t('common.currency'))}</span>
            </div>
          </>
        )}
        <button onClick={onClose} className="pos-btn w-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 mt-4">{t('common.close')}</button>
      </div>
    </div>
  );
}
