import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api';

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

  const isManager = employee?.role === 'admin' || employee?.role === 'manager';
  const navItems = [
    { to: '/dashboard', label: t('nav.dashboard'), icon: '📊' },
    { to: '/pos',       label: t('nav.pos'),       icon: '🛒' },
    { to: '/orders',    label: t('nav.orders'),    icon: '📋' },
    ...(isManager ? [{ to: '/reports', label: t('nav.reports'), icon: '🧾' }] : []),
    { to: '/backoffice', label: t('nav.backoffice'), icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="h-14 bg-gray-900 text-white flex items-center px-4 gap-4 shadow-lg z-40">
        <div className="font-bold text-brand-400 text-lg me-4">
          iMenu<span className="text-white">25</span>
        </div>

        <nav className="flex gap-1 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                location.pathname.startsWith(item.to)
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span>{item.icon}</span>
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 ms-auto">
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
            <span className="text-sm text-gray-300 hidden md:inline">
              {employee.firstName}
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
