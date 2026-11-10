import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function POSPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4">
      <div className="text-6xl">🛒</div>
      <h1 className="text-3xl font-bold">POS Module</h1>
      <p className="text-gray-400">Coming in next build — cashier, orders, payments</p>
      <button onClick={() => navigate('/dashboard')} className="mt-4 bg-blue-600 px-6 py-2 rounded-xl hover:bg-blue-700">
        ← {t('common.cancel')}
      </button>
    </div>
  )
}
