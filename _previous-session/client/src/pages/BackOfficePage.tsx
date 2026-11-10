import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function BackOfficePage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
      <div className="text-6xl">⚙️</div>
      <h1 className="text-3xl font-bold text-gray-800">Back Office</h1>
      <p className="text-gray-500">Coming in next build — items, employees, discounts, table map</p>
      <button onClick={() => navigate('/dashboard')} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-xl hover:bg-blue-700">
        ← {t('common.cancel')}
      </button>
    </div>
  )
}
