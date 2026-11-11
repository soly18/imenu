import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UtensilsCrossed, FolderOpen, Users, Armchair, Tag, BarChart3, User, Printer, Settings, type LucideIcon } from 'lucide-react';

const SECTIONS: { key: string; icon: LucideIcon }[] = [
  { key: 'items',     icon: UtensilsCrossed },
  { key: 'groups',    icon: FolderOpen },
  { key: 'employees', icon: Users },
  { key: 'tables',    icon: Armchair },
  { key: 'discounts', icon: Tag },
  { key: 'reports',   icon: BarChart3 },
  { key: 'members',   icon: User },
  { key: 'printers',  icon: Printer },
  { key: 'settings',  icon: Settings },
];

export default function BackOfficePage() {
  const { t } = useTranslation();
  const [active, setActive] = useState<string>('items');

  return (
    <div className="flex h-[calc(100dvh-112px)] md:h-[calc(100dvh-56px)]">
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
            <s.icon className="w-5 h-5 flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {t(`backoffice.${s.key}`)}
          </button>
        ))}
      </nav>

      {/* Content area */}
      <main className="flex-1 p-6 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
          {t(`backoffice.${active}`)}
        </h1>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center text-gray-400">
          <div className="mb-4 flex justify-center">
            {(() => { const Ic = SECTIONS.find((s) => s.key === active)?.icon; return Ic ? <Ic className="w-14 h-14 text-gray-400 dark:text-gray-500" strokeWidth={1.25} aria-hidden="true" /> : null; })()}
          </div>
          <p className="text-lg font-medium">{t(`backoffice.${active}`)}</p>
          <p className="text-sm mt-2">{t('backoffice.comingSoon')}</p>
        </div>
      </main>
    </div>
  );
}
