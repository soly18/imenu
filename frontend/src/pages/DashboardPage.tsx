import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { dashboardApi } from '@/api';
import { useAuthStore } from '@/store/authStore';

function KPICard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100 ${color || ''}`}>
      <p className="text-sm text-gray-500 font-medium">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const employee = useAuthStore((s) => s.employee);

  const { data: kpis, isLoading } = useQuery({
    queryKey: ['kpis'],
    queryFn: dashboardApi.kpis,
    refetchInterval: 30_000,
  });

  const clockIn = useMutation({
    mutationFn: dashboardApi.clockIn,
    onSuccess: () => toast.success(t('dashboard.clockIn')),
  });
  const clockOut = useMutation({
    mutationFn: dashboardApi.clockOut,
    onSuccess: () => toast.success(t('dashboard.clockOut')),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currency = t('common.currency');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
        <p className="text-gray-500 mt-1">
          {employee?.firstName} {employee?.lastName} — {employee?.role}
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        <KPICard
          label={t('dashboard.openTables')}
          value={`${kpis?.openTables ?? 0} / ${kpis?.totalTables ?? 0}`}
        />
        <KPICard
          label={t('dashboard.activeOrders')}
          value={kpis?.activeOrders ?? 0}
        />
        <KPICard
          label={t('dashboard.revenueToday')}
          value={`${currency}${(kpis?.revenueToday ?? 0).toFixed(0)}`}
        />
        <KPICard
          label={t('dashboard.avgCheck')}
          value={`${currency}${(kpis?.avgCheckSize ?? 0).toFixed(0)}`}
        />
        <KPICard
          label={t('dashboard.clockedIn')}
          value={kpis?.clockedInEmployees ?? 0}
        />
      </div>

      {/* Clock In/Out */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">{t('dashboard.clockedIn')}</h2>
        <div className="flex gap-3">
          <button
            onClick={() => clockIn.mutate()}
            disabled={clockIn.isPending}
            className="pos-btn bg-green-500 text-white px-6 hover:bg-green-600"
          >
            {t('dashboard.clockIn')}
          </button>
          <button
            onClick={() => clockOut.mutate()}
            disabled={clockOut.isPending}
            className="pos-btn bg-red-500 text-white px-6 hover:bg-red-600"
          >
            {t('dashboard.clockOut')}
          </button>
        </div>
      </div>

      {/* Report shortcuts */}
      <div className="grid grid-cols-2 gap-4">
        <button className="pos-btn bg-blue-50 text-blue-700 border border-blue-200 h-16 text-base hover:bg-blue-100">
          📊 {t('dashboard.xReport')}
        </button>
        <button className="pos-btn bg-purple-50 text-purple-700 border border-purple-200 h-16 text-base hover:bg-purple-100">
          📋 {t('dashboard.zReport')}
        </button>
      </div>
    </div>
  );
}
