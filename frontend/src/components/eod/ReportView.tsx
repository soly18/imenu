import { useTranslation } from 'react-i18next';
import type { EodReport } from '@imenu25/shared';
import { fmtMoney, fmtDateTime } from '@/utils/format';

function Money({ value, signed }: { value: number; signed?: boolean }) {
  const { t, i18n } = useTranslation();
  // For differences: shortage red, surplus amber, exact green
  const tone = signed ? (value < 0 ? 'text-red-600 dark:text-red-400 dark:text-red-400' : value > 0 ? 'text-amber-600 dark:text-amber-400 dark:text-amber-400' : 'text-green-600 dark:text-green-400 dark:text-green-400') : '';
  return (
    <span dir="ltr" className={`tabular-nums ${tone}`}>
      {fmtMoney(value, i18n.language, t('common.currency'))}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 dark:border-gray-700 shadow-sm overflow-hidden break-inside-avoid">
      <h3 className="px-5 py-3 font-semibold text-gray-800 dark:text-gray-100 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 dark:border-gray-700">{title}</h3>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

const TH = 'px-5 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-400 text-start';
const NUM = 'px-5 py-2 text-end tabular-nums';
const TXT = 'px-5 py-2 text-start';
const ROW = 'border-t border-gray-100 dark:border-gray-700 dark:border-gray-700';
const TOTAL = 'border-t-2 border-gray-200 dark:border-gray-700 dark:border-gray-700 font-semibold bg-gray-50 dark:bg-gray-900 dark:bg-gray-900';

export default function ReportView({ report }: { report: EodReport }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const s = report.summary;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const title = report.kind === 'Z'
    ? t('eod.zReport', { number: report.reportNumber })
    : t('eod.xReport');

  const cards: { label: string; value: React.ReactNode; strong?: boolean }[] = [
    { label: t('eod.summary.gross'), value: <Money value={s.gross} /> },
    { label: t('eod.summary.discounts'), value: <Money value={s.discounts} /> },
    { label: t('eod.summary.net'), value: <Money value={s.net} />, strong: true },
    { label: t('eod.summary.vat'), value: <Money value={s.vat} /> },
    { label: t('eod.summary.orders'), value: s.orders },
    { label: t('eod.summary.guests'), value: s.guests },
    { label: t('eod.summary.avgCheck'), value: <Money value={s.avgCheck} /> },
    {
      label: t('eod.summary.voids'),
      value: <>{s.voidsCount} · <Money value={s.voidsTotal} /></>,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Heading */}
      <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 dark:border-gray-700 shadow-sm p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 dark:text-gray-100">{title}</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-400">{report.branchName}</span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 dark:text-gray-300 mt-1">
          {t('eod.from')} <bdi>{fmtDateTime(report.periodStart, lng)}</bdi>{' '}
          {t('eod.to')} <bdi>{fmtDateTime(report.periodEnd, lng)}</bdi>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {t('eod.generatedBy')}: {report.generatedBy} · <bdi>{fmtDateTime(report.generatedAt, lng)}</bdi>
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 break-inside-avoid">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-2xl border p-4 ${c.strong ? 'bg-brand-50 dark:bg-brand-900/30 dark:bg-brand-900/30 border-brand-100' : 'bg-white dark:bg-gray-800 dark:bg-gray-800 border-gray-100 dark:border-gray-700 dark:border-gray-700'}`}
          >
            <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-400">{c.label}</p>
            <p className={`mt-1 font-bold ${c.strong ? 'text-2xl text-brand-700 dark:text-brand-300 dark:text-brand-300' : 'text-xl text-gray-900 dark:text-gray-100 dark:text-gray-100'}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {s.orders === 0 && s.voidsCount === 0 && (
        <p className="text-center text-gray-400 py-6">{t('eod.noData')}</p>
      )}

      {/* Payment methods */}
      {report.byPayment.length > 0 && (
        <Section title={t('eod.sections.byPayment')}>
          <table className="w-full text-sm">
            <thead><tr><th className={TH}>{t('eod.cols.method')}</th><th className={`${TH} text-end`}>{t('eod.cols.count')}</th><th className={`${TH} text-end`}>{t('eod.cols.amount')}</th></tr></thead>
            <tbody>
              {report.byPayment.map((r) => (
                <tr key={r.method} className={ROW}>
                  <td className={TXT}>{t(`payments.${r.method}`)}</td>
                  <td className={NUM}>{r.count}</td>
                  <td className={NUM}><Money value={r.amount} /></td>
                </tr>
              ))}
              <tr className={TOTAL}>
                <td className={TXT}>{t('eod.cols.total')}</td>
                <td className={NUM}>{sum(report.byPayment.map((r) => r.count))}</td>
                <td className={NUM}><Money value={sum(report.byPayment.map((r) => r.amount))} /></td>
              </tr>
            </tbody>
          </table>
        </Section>
      )}

      {/* Categories */}
      {report.byGroup.length > 0 && (
        <Section title={t('eod.sections.byGroup')}>
          <table className="w-full text-sm">
            <thead><tr><th className={TH}>{t('eod.cols.category')}</th><th className={`${TH} text-end`}>{t('eod.cols.quantity')}</th><th className={`${TH} text-end`}>{t('eod.cols.amount')}</th></tr></thead>
            <tbody>
              {report.byGroup.map((g) => (
                <tr key={g.groupId} className={ROW}>
                  <td className={TXT}>
                    {g.namePrimary}
                    {g.nameSecondary && <span className="text-xs text-gray-400 ms-2">{g.nameSecondary}</span>}
                  </td>
                  <td className={NUM}>{g.quantity}</td>
                  <td className={NUM}><Money value={g.amount} /></td>
                </tr>
              ))}
              <tr className={TOTAL}>
                <td className={TXT}>{t('eod.cols.total')}</td>
                <td className={NUM}>{sum(report.byGroup.map((g) => g.quantity))}</td>
                <td className={NUM}><Money value={sum(report.byGroup.map((g) => g.amount))} /></td>
              </tr>
            </tbody>
          </table>
        </Section>
      )}

      {/* Employees */}
      {report.byEmployee.length > 0 && (
        <Section title={t('eod.sections.byEmployee')}>
          <table className="w-full text-sm">
            <thead><tr><th className={TH}>{t('eod.cols.employee')}</th><th className={`${TH} text-end`}>{t('eod.cols.orders')}</th><th className={`${TH} text-end`}>{t('eod.cols.amount')}</th></tr></thead>
            <tbody>
              {report.byEmployee.map((e) => (
                <tr key={e.employeeId} className={ROW}>
                  <td className={TXT}>{e.name}</td>
                  <td className={NUM}>{e.orders}</td>
                  <td className={NUM}><Money value={e.amount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Discounts */}
      {report.discounts.length > 0 && (
        <Section title={t('eod.sections.discounts')}>
          <table className="w-full text-sm">
            <thead><tr><th className={TH}>{t('eod.cols.label')}</th><th className={`${TH} text-end`}>{t('eod.cols.count')}</th><th className={`${TH} text-end`}>{t('eod.cols.amount')}</th></tr></thead>
            <tbody>
              {report.discounts.map((d, i) => (
                <tr key={i} className={ROW}>
                  <td className={TXT}>{d.label}</td>
                  <td className={NUM}>{d.count}</td>
                  <td className={NUM}><Money value={d.amount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* VAT */}
      {report.vat.length > 0 && (
        <Section title={t('eod.sections.vat')}>
          <table className="w-full text-sm">
            <thead><tr>
              <th className={TH}>{t('eod.cols.rate')}</th>
              <th className={`${TH} text-end`}>{t('eod.cols.base')}</th>
              <th className={`${TH} text-end`}>{t('eod.cols.vat')}</th>
              <th className={`${TH} text-end`}>{t('eod.cols.gross')}</th>
            </tr></thead>
            <tbody>
              {report.vat.map((v) => (
                <tr key={v.rate} className={ROW}>
                  <td className={TXT}><bdi>{v.rate}%</bdi></td>
                  <td className={NUM}><Money value={v.base} /></td>
                  <td className={NUM}><Money value={v.vat} /></td>
                  <td className={NUM}><Money value={v.gross} /></td>
                </tr>
              ))}
              <tr className={TOTAL}>
                <td className={TXT}>{t('eod.cols.total')}</td>
                <td className={NUM}><Money value={sum(report.vat.map((v) => v.base))} /></td>
                <td className={NUM}><Money value={sum(report.vat.map((v) => v.vat))} /></td>
                <td className={NUM}><Money value={sum(report.vat.map((v) => v.gross))} /></td>
              </tr>
            </tbody>
          </table>
        </Section>
      )}

      {/* Voids */}
      {report.voids.length > 0 && (
        <Section title={t('eod.sections.voids')}>
          <table className="w-full text-sm">
            <thead><tr>
              <th className={TH}>{t('eod.cols.reason')}</th>
              <th className={TH}>{t('eod.cols.employee')}</th>
              <th className={`${TH} text-end`}>{t('eod.cols.count')}</th>
              <th className={`${TH} text-end`}>{t('eod.cols.amount')}</th>
            </tr></thead>
            <tbody>
              {report.voids.map((v, i) => (
                <tr key={i} className={ROW}>
                  <td className={TXT}>{v.reason ?? t('eod.voidReasonNone')}</td>
                  <td className={TXT}>{v.employeeName ?? '—'}</td>
                  <td className={NUM}>{v.count}</td>
                  <td className={NUM}><Money value={v.amount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Declarations vs expected */}
      <Section title={t('eod.sections.declarations')}>
        {!report.declarationsEntered && (
          <p className="px-5 py-3 text-sm text-amber-700 dark:text-amber-300 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-900/30">{t('eod.declarationsMissing')}</p>
        )}
        <table className="w-full text-sm">
          <thead><tr>
            <th className={TH}>{t('eod.cols.method')}</th>
            <th className={`${TH} text-end`}>{t('eod.cols.expected')}</th>
            <th className={`${TH} text-end`}>{t('eod.cols.declared')}</th>
            <th className={`${TH} text-end`}>{t('eod.cols.difference')}</th>
          </tr></thead>
          <tbody>
            {report.declarations.map((d) => (
              <tr key={d.method} className={ROW}>
                <td className={TXT}>{t(`payments.${d.method}`)}</td>
                <td className={NUM}><Money value={d.expected} /></td>
                <td className={NUM}>
                  {d.declared === null
                    ? <span className="text-gray-400">{t('eod.declaration.notDeclared')}</span>
                    : <Money value={d.declared} />}
                </td>
                <td className={NUM}>
                  {d.difference === null ? '—' : <Money value={d.difference} signed />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* What the Z did */}
      {report.kind === 'Z' && (report.autoClockedOut.length > 0 || report.autoCancelledOrders > 0) && (
        <Section title={t('eod.zActions')}>
          <ul className="px-5 py-3 text-sm text-gray-700 dark:text-gray-200 dark:text-gray-200 space-y-1">
            {report.autoClockedOut.length > 0 && (
              <li>{t('eod.autoClockedOut')}: {report.autoClockedOut.join(', ')}</li>
            )}
            {report.autoCancelledOrders > 0 && (
              <li>{t('eod.autoCancelled')}: {report.autoCancelledOrders}</li>
            )}
          </ul>
        </Section>
      )}
    </div>
  );
}
