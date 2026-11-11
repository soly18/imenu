import { useTranslation } from 'react-i18next';
import { Monitor, Sun, Moon, type LucideIcon } from 'lucide-react';
import { useThemeStore, type ThemeMode } from '@/store/themeStore';

const ORDER: ThemeMode[] = ['system', 'light', 'dark'];
const ICON: Record<ThemeMode, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };
const KEY: Record<ThemeMode, string> = { system: 'theme.system', light: 'theme.light', dark: 'theme.dark' };

/** compact: one button that cycles Default → Day → Night (header). Otherwise three buttons (login screen). */
export default function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { mode, setMode } = useThemeStore();
  if (compact) {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    return (
      <button
        onClick={() => setMode(next)}
        title={`${t('theme.title')}: ${t(KEY[mode])}`}
        aria-label={`${t('theme.title')}: ${t(KEY[mode])}`}
        className="w-11 h-11 rounded-lg bg-gray-800 flex items-center justify-center hover:bg-gray-700 flex-shrink-0"
      >
        {(() => { const I = ICON[mode]; return <I className="w-5 h-5 text-gray-100" strokeWidth={1.75} aria-hidden="true" />; })()}
      </button>
    );
  }
  return (
    <div className="flex justify-center gap-2" role="group" aria-label={t('theme.title')}>
      {ORDER.map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`min-h-[44px] px-3 rounded-full text-xs font-medium ${
            mode === m ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200'
          }`}
        >
          {(() => { const I = ICON[m]; return <I className="w-4 h-4 inline-block -mt-0.5 me-1" strokeWidth={1.75} aria-hidden="true" />; })()}{t(KEY[m])}
        </button>
      ))}
    </div>
  );
}
