import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { PaymentMethod } from '@imenu25/shared';
import { eodApi, ordersApi } from '@/api';
import ReportView from '@/components/eod/ReportView';
import { fmtDateTime, fmtMoney } from '@/utils/format';

type Tab = 'x' | 'declaration' | 'history';

// ── Cash declaration ───────────────────────────────────────────
function DeclarationTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['eod-decl'], queryFn: eodApi.declaration });
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    const v: Record<string, string> = {};
    data.declarations.forEach((d) => { v[d.method] = String(d.amount); });
    setValues(v);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      eodApi.saveDeclaration(
        data!.methods.map((m: PaymentMethod) => ({
          method: m,
          amount: values[m] === undefined || values[m] === '' ? null : Number(values[m]),
        }))
      ),
    onSuccess: () => {
      toast.success(t('eod.declaration.saved'));
      qc.invalidateQueries({ queryKey: ['eod-decl'] });
      qc.invalidateQueries({ queryKey: ['eod-x'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  if (!data) return <p className="text-gray-400">{t('common.loading')}</p>;

  return (
    <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 dark:border-gray-700 shadow-sm p-6 max-w-xl">
      <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100 dark:text-gray-100">{t('eod.declaration.title')}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-400 mt-1 mb-5">{t('eod.declaration.hint')}</p>
      <div className="space-y-3">
        {data.methods.map((m: PaymentMethod) => (
          <label key={m} className="flex items-center gap-3">
            <span className="w-40 text-sm font-medium text-gray-700 dark:text-gray-200 dark:text-gray-200">{t(`payments.${m}`)}</span>
            <input
              type="number" min="0" step="0.01" inputMode="decimal" dir="ltr"
              value={values[m] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))}
              placeholder="0.00"
              className="flex-1 border border-gray-200 dark:border-gray-700 dark:border-gray-700 rounded-xl px-3 py-2 text-lg tabular-nums"
            />
          </label>
        ))}
      </div>
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="pos-btn bg-brand-500 text-white hover:bg-brand-600 w-full mt-6 disabled:opacity-40"
      >
        {t('eod.declaration.save')}
      </button>
    </div>
  );
}

// ── Z history ──────────────────────────────────────────────────
function HistoryTab({ openId, setOpenId }: { openId: number | null; setOpenId: (id: number | null) => void }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const cur = t('common.currency');
  const list = useQuery({ queryKey: ['eod-history'], queryFn: eodApi.zList });
  const detail = useQuery({
    queryKey: ['eod-z', openId],
    queryFn: () => eodApi.zGet(openId!),
    enabled: openId !== null,
  });

  if (openId !== null) {
    return (
      <div className="space-y-4">
        <button onClick={() => setOpenId(null)} className="no-print text-sm text-brand-600 dark:text-brand-400 dark:text-brand-400 hover:underline">
          ← {t('eod.history.back')}
        </button>
        {detail.data ? <ReportView report={detail.data.report} /> : <p className="text-gray-400">{t('common.loading')}</p>}
      </div>
    );
  }

  if (!list.data) return <p className="text-gray-400">{t('common.loading')}</p>;
  if (list.data.length === 0) return <p className="text-gray-400 text-center py-10">{t('eod.history.empty')}</p>;

  const th = 'px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-400 text-start';
  return (
    <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 dark:border-gray-700 shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>{t('eod.cols.number')}</th>
            <th className={th}>{t('eod.cols.closedAt')}</th>
            <th className={`${th} text-end`}>{t('eod.cols.net')}</th>
            <th className={`${th} text-end`}>{t('eod.cols.cashDiff')}</th>
            <th className={th}>{t('eod.generatedBy')}</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {list.data.map((z) => (
            <tr key={z.id} className="border-t border-gray-100 dark:border-gray-700 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 dark:hover:bg-gray-700">
              <td className="px-4 py-2 font-semibold">#{z.reportNumber}</td>
              <td className="px-4 py-2"><bdi>{fmtDateTime(z.periodEnd, lng)}</bdi></td>
              <td className="px-4 py-2 text-end tabular-nums"><span dir="ltr">{fmtMoney(z.net, lng, cur)}</span></td>
              <td className="px-4 py-2 text-end tabular-nums">
                {z.cashDifference === null
                  ? <span className="text-gray-400">—</span>
                  : <span dir="ltr" className={z.cashDifference === 0 ? 'text-green-600 dark:text-green-400 dark:text-green-400' : z.cashDifference < 0 ? 'text-red-600 dark:text-red-400 dark:text-red-400' : 'text-amber-600 dark:text-amber-400 dark:text-amber-400'}>
                      {fmtMoney(z.cashDifference, lng, cur)}
                    </span>}
              </td>
              <td className="px-4 py-2">{z.generatedBy}</td>
              <td className="px-4 py-2 text-end">
                <button onClick={() => setOpenId(z.id)} className="text-brand-600 dark:text-brand-400 dark:text-brand-400 hover:underline">{t('eod.history.view')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'x');
  const [confirmZ, setConfirmZ] = useState(params.get('run') === 'z');
  const [openZ, setOpenZ] = useState<number | null>(null);

  // "?run=z" (from the dashboard) opens the confirmation once, then is forgotten
  useEffect(() => {
    if (params.get('run')) { params.delete('run'); setParams(params, { replace: true }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const status = useQuery({ queryKey: ['eod-status'], queryFn: eodApi.status, refetchInterval: 15_000 });
  const x = useQuery({ queryKey: ['eod-x'], queryFn: eodApi.x, enabled: tab === 'x', refetchInterval: 30_000 });

  const runZ = useMutation({
    mutationFn: eodApi.runZ,
    onSuccess: (res) => {
      toast.success(t('eod.zSuccess', { number: res.report.reportNumber }));
      setConfirmZ(false);
      setTab('history');
      setOpenZ(res.id);
      qc.invalidateQueries();
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error;
      toast.error(code === 'OPEN_ORDERS' ? t('eod.zBlocked') : code === 'Z_JUST_RUN' ? t('eod.zJustRun') : t('common.error'));
      qc.invalidateQueries({ queryKey: ['eod-status'] });
      if (code === 'OPEN_ORDERS') setConfirmZ(true);
    },
  });

  const st = status.data;
  const tabs: { key: Tab; label: string }[] = [
    { key: 'x', label: t('eod.tabX') },
    { key: 'declaration', label: t('eod.tabDeclaration') },
    { key: 'history', label: t('eod.tabHistory') },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Title + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 no-print">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 dark:text-gray-100">{t('eod.title')}</h1>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="pos-btn px-4 bg-white dark:bg-gray-800 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 dark:border-gray-700 text-gray-700 dark:text-gray-200 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 dark:hover:bg-gray-700">
            🖨️ {t('eod.print')}
          </button>
          <button onClick={() => { setConfirmZ(true); }} className="pos-btn px-4 bg-red-600 text-white hover:bg-red-700">
            {t('eod.runZ')}
          </button>
        </div>
      </div>

      {/* Status strip */}
      {st && (
        <div className="no-print mb-4 text-sm text-gray-600 dark:text-gray-300 dark:text-gray-300 flex flex-wrap gap-x-6 gap-y-1">
          <span>{t('eod.periodStarted')}: <bdi>{fmtDateTime(st.periodStart, lng)}</bdi></span>
          <span>
            {t('eod.lastZ')}:{' '}
            {st.lastZ ? <bdi>#{st.lastZ.reportNumber} · {fmtDateTime(st.lastZ.closedAt, lng)}</bdi> : t('eod.noZYet')}
          </span>
          {st.openOrders.length > 0 && (
            <span className="text-amber-700 dark:text-amber-300 dark:text-amber-300 font-medium">
              {t('eod.openOrdersBlock', { count: st.openOrders.length })}
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="no-print flex gap-1 border-b border-gray-200 dark:border-gray-700 dark:border-gray-700 mb-5">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => { setTab(tb.key); if (tb.key === 'history') setOpenZ(null); }}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === tb.key ? 'border-brand-500 text-brand-600 dark:text-brand-400 dark:text-brand-400' : 'border-transparent text-gray-500 dark:text-gray-400 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'x' && (x.data ? <ReportView report={x.data} /> : <p className="text-gray-400">{t('common.loading')}</p>)}
      {tab === 'declaration' && <DeclarationTab />}
      {tab === 'history' && <HistoryTab openId={openZ} setOpenId={setOpenZ} />}

      {/* Z confirmation */}
      {confirmZ && (
        <div className="no-print fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-3xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            {st && st.openOrders.length > 0 ? (
              <>
                <h2 className="text-xl font-bold text-red-700 dark:text-red-300 dark:text-red-300 mb-2">{t('eod.zModal.blockedTitle')}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300 dark:text-gray-300 mb-3">{t('eod.zModal.blockedHelp')}</p>
                <ul className="text-sm divide-y divide-gray-100 dark:divide-gray-700 dark:divide-gray-700 border border-gray-100 dark:border-gray-700 dark:border-gray-700 rounded-xl mb-5">
                  {st.openOrders.map((o) => (
                    <li key={o.id} className="px-3 py-2">
                      <div className="flex justify-between gap-3">
                        <span>
                          {o.tableLabel ? `${t('eod.table')} ${o.tableLabel}` : `${t('eod.order')} #${o.orderNumber.slice(-5)}`}
                          <span className="text-gray-400"> · {o.employeeName}</span>
                        </span>
                        <span dir="ltr" className="tabular-nums">{fmtMoney(o.total, lng, t('common.currency'))}</span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => navigate(`/pos?order=${o.id}`)}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-semibold">
                          {t('eod.zModal.openOrder')}
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm(t('eod.zModal.cancelConfirm'))) return;
                            try { await ordersApi.cancel(o.id); qc.invalidateQueries(); }
                            catch { toast.error(t('common.error')); }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 dark:bg-red-900/30 text-red-700 dark:text-red-300 dark:text-red-300 text-xs font-semibold">
                          {t('eod.zModal.cancelOrder')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <button onClick={() => setConfirmZ(false)} className="pos-btn w-full bg-gray-100 dark:bg-gray-700 dark:bg-gray-700 text-gray-700 dark:text-gray-200 dark:text-gray-200">
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 dark:text-gray-100 mb-2">{t('eod.zModal.title')}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300 dark:text-gray-300 mb-4">{t('eod.zModal.warning')}</p>
                <ul className="text-sm text-gray-700 dark:text-gray-200 dark:text-gray-200 space-y-2 mb-5">
                  {st && st.emptyOpenOrders > 0 && (
                    <li>• {t('eod.zModal.willCancel', { count: st.emptyOpenOrders })}</li>
                  )}
                  {st && st.clockedIn.length > 0 && (
                    <li>• {t('eod.zModal.willClockOut', { names: st.clockedIn.join(', ') })}</li>
                  )}
                  {x.data && !x.data.declarationsEntered && (
                    <li className="text-amber-700 dark:text-amber-300 dark:text-amber-300">• {t('eod.zModal.missingDeclaration')}</li>
                  )}
                </ul>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmZ(false)} className="pos-btn flex-1 bg-gray-100 dark:bg-gray-700 dark:bg-gray-700 text-gray-700 dark:text-gray-200 dark:text-gray-200">
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => runZ.mutate()}
                    disabled={runZ.isPending}
                    className="pos-btn flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                  >
                    {t('eod.zModal.confirm')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
