import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const MODULES = [
  { key: 'tables',     icon: '🪑', path: '/tables',     roles: ['admin','manager','waiter'] },
  { key: 'pos',        icon: '🛒', path: '/pos',         roles: ['admin','manager','cashier'] },
  { key: 'backoffice', icon: '⚙️', path: '/backoffice',  roles: ['admin','manager'] },
  { key: 'delivery',   icon: '🛵', path: '/delivery',    roles: ['admin','manager','delivery'] },
  { key: 'reports',    icon: '📊', path: '/reports',     roles: ['admin','manager'] },
  { key: 'clock',      icon: '🕐', path: '/clock',       roles: ['admin','manager','cashier','waiter'] },
]

interface Stats {
  openTables: number
  activeOrders: number
  todaySales: number
  openBills: number
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, logout, hasRole } = useAuthStore()
  const [stats, setStats] = useState<Stats | null>(null)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    // Load stats
    const loadStats = async () => {
      try {
        const { data } = await axios.get('/api/dashboard/stats')
        setStats(data)
      } catch {}
    }
    loadStats()
    const statsInterval = setInterval(loadStats, 30000)

    // Clock
    const clockInterval = setInterval(() => setTime(new Date()), 1000)

    return () => { clearInterval(statsInterval); clearInterval(clockInterval) }
  }, [])

  const handleLogout = async () => { await logout(); navigate('/login') }

  const visibleModules = MODULES.filter(m => m.roles.some(r => hasRole(r)))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <header className="bg-blue-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍽️</span>
            <span className="font-bold text-xl">iMenu25</span>
          </div>
          <div className="text-center">
            <div className="text-xl font-mono font-bold">
              {time.toLocaleTimeString(i18n.language === 'he' ? 'he-IL' : 'en-US')}
            </div>
            <div className="text-blue-200 text-xs">
              {time.toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-end">
              <div className="font-semibold">{user?.name}</div>
              <div className="text-blue-200 text-xs capitalize">{user?.role}</div>
            </div>
            <button onClick={handleLogout}
              className="bg-blue-800 hover:bg-blue-900 px-3 py-2 rounded-lg text-sm transition-colors">
              {t('common.logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: t('dashboard.openTables'),  value: stats.openTables,  icon: '🪑', color: 'blue' },
              { label: t('dashboard.activeOrders'), value: stats.activeOrders, icon: '📋', color: 'orange' },
              { label: t('dashboard.todaySales'),   value: `₪${Number(stats.todaySales).toFixed(0)}`, icon: '💰', color: 'green' },
              { label: t('dashboard.openBills'),    value: stats.openBills,   icon: '🧾', color: 'purple' },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4">
                <div className="text-3xl">{stat.icon}</div>
                <div>
                  <div className="text-2xl font-bold text-gray-800">{stat.value}</div>
                  <div className="text-gray-500 text-sm">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Module Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {visibleModules.map(mod => (
            <button key={mod.key} onClick={() => navigate(mod.path)}
              className="bg-white hover:bg-blue-50 border-2 border-transparent hover:border-blue-200
                         rounded-2xl shadow-sm p-8 flex flex-col items-center gap-3
                         transition-all hover:shadow-md active:scale-95 group">
              <span className="text-5xl group-hover:scale-110 transition-transform">
                {mod.icon}
              </span>
              <span className="text-lg font-semibold text-gray-700 group-hover:text-blue-700">
                {t(`dashboard.modules.${mod.key}`)}
              </span>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
