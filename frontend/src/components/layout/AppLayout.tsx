import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useQuery } from '@tanstack/react-query';
import { authApi, adminApi } from '@/api';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { employee, logout } = useAuthStore();

  const handleLogout = async () => {
    try { await authApi.logout(); } catch {}
    logout();
    navigate('/login');
    toast.success(t('nav.logout'));
  };

  const isAdmin = employee?.role === 'admin';
  const { data: sum } = useQuery({ queryKey: ['admin-summary'], queryFn: adminApi.summary, enabled: isAdmin, refetchInterval: 15_000 });
  const isManager = employee?.role === 'admin' || employee?.role === 'manager';
  const navItems: { to: string; label: string; icon: string; badge?: number }[] = [
    { to: '/dashboard', label: t('nav.dashboard'), icon: '📊' },
    { to: '/tables',    label: t('nav.tables'),    icon: '🍽️' },
    { to: '/pos',       label: t('nav.pos'),       icon: '🛒' },
    { to: '/orders',    label: t('nav.orders'),    icon: '📋' },
    ...(isManager ? [{ to: '/reports', label: t('nav.reports'), icon: '🧾' }] : []),
    ...(isAdmin ? [{ to: '/admin', label: t('nav.admin'), icon: '🛡️', badge: sum?.pendingDevices }] : []),
    ...(isAdmin ? [{ to: '/migration', label: t('nav.migration'), icon: '🔄' }] : []),
    { to: '/backoffice', label: t('nav.backoffice'), icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="h-14 bg-gray-900 dark:bg-gray-950 dark:border-b dark:border-gray-800 text-white flex items-center px-4 gap-4 shadow-lg z-40">
        <div className="font-bold text-brand-400 text-lg me-4">
          iMenu<span className="text-white">25</span>
        </div>

        <nav className="flex gap-1 flex-1 min-w-0 overflow-x-auto">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`px-2 xl:px-3 py-1 rounded-lg font-medium transition-colors flex flex-col xl:flex-row items-center justify-center gap-0 xl:gap-2 whitespace-nowrap flex-shrink-0 min-w-[56px] ${
                location.pathname.startsWith(item.to)
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span className="text-base xl:text-sm leading-none relative">{item.icon}{!!item.badge && <span className="absolute -top-1 -end-2 bg-red-600 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{item.badge}</span>}</span>
              <span className="text-[10px] xl:text-sm leading-tight">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 ms-auto flex-shrink-0">
          <ThemeSwitcher compact />
          {/* Language picker */}
          <select
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            className="bg-gray-800 text-gray-300 text-xs rounded-lg px-2 py-1 border border-gray-700"
          >
            <option value="he">עברית</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
            <option value="ru">Русский</option>
          </select>

          {/* Employee */}
          {employee && (
            <span className="flex items-center gap-2 bg-gray-800 rounded-full ps-1 pe-3 py-1 whitespace-nowrap" title={t(`roles.${employee.role}`)}>
              <span className="w-7 h-7 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                {(employee.firstName[0] || '') + (employee.lastName?.[0] || '')}
              </span>
              <span className="text-sm text-white font-medium truncate max-w-[9rem]">
                {employee.firstName} {employee.lastName}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-brand-300 hidden 2xl:inline">
                {t(`roles.${employee.role}`)}
              </span>
            </span>
          )}

          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
