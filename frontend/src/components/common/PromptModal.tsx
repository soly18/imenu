import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Small touch-friendly "type a value" dialog (used for PIN and rename). */
export default function PromptModal({ title, hint, initial = '', type = 'text', numeric = false, onSave, onClose }: {
  title: string; hint?: string; initial?: string; type?: 'text' | 'password'; numeric?: boolean;
  onSave: (v: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [v, setV] = useState(initial);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">{title}</h2>
        {hint && <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{hint}</p>}
        <input
          autoFocus dir="ltr" type={type} inputMode={numeric ? 'numeric' : undefined} value={v}
          onChange={(e) => setV(numeric ? e.target.value.replace(/\D/g, '') : e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && v && onSave(v)}
          className="w-full min-h-[48px] rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 text-lg tracking-widest"
        />
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 min-h-[48px] rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold">{t('common.cancel')}</button>
          <button onClick={() => v && onSave(v)} disabled={!v} className="flex-1 min-h-[48px] rounded-xl bg-brand-500 text-white font-semibold disabled:opacity-50">{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
}
