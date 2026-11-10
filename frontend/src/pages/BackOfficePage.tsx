import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const SECTIONS = [
  { key: 'items',     icon: '🍽️' },
  { key: 'groups',    icon: '📁' },
  { key: 'employees', icon: '👥' },
  { key: 'tables',    icon: '🪑' },
  { key: 'discounts', icon: '🏷️' },
  { key: 'reports',   icon: '📊' },
  { key: 'members',   icon: '👤' },
  { key: 'printers',  icon: '🖨️' },
  { key: 'settings',  icon: '⚙️' },
] as const;

export default function BackOfficePage() {
  const { t } = useTranslation();
  const [active, setActive] = useState<string>('items');

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <nav className="w-52 bg-gray-900 text-white flex flex-col py-4 gap-1 overflow-y-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors rounded-lg mx-2 ${
              active === s.key
                ? 'bg-brand-500 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <span className="text-lg">{s.icon}</span>
            {t(`backoffice.${s.key}`)}
          </button>
        ))}
      </nav>

      {/* Content area */}
      <main className="flex-1 p-6 overflow-y-auto bg-gray-50">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {t(`backoffice.${active}`)}
        </h1>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
          <div className="text-5xl mb-4">
            {SECTIONS.find(s => s.key === active)?.icon}
          </div>
          <p className="text-lg font-medium">{t(`backoffice.${active}`)}</p>
          <p className="text-sm mt-2">Module coming soon — specs documented in Module 3</p>
        </div>
      </main>
    </div>
  );
}
