import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLicenceStore } from '@/store/licenceStore';
import { getDeviceId } from '@/api/client';

/** Wraps the whole app. A device the supplier has blocked / not approved / whose licence ended sees only this screen. */
export default function LicenceGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { enabled, status, message, check } = useLicenceStore();

  useEffect(() => {
    check();
    const id = setInterval(check, 5 * 60 * 1000);
    const onVis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [check]);

  if (!enabled || status === 'allowed') return <>{children}</>;
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
        <div className="text-5xl">{status === 'expired' ? '⏳' : status === 'pending' ? '🕓' : '🚫'}</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t(`licence.${status}`)}</h1>
        {message && <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>}
        <p className="text-xs text-gray-400">{t('licence.deviceId')}: <span className="font-mono" dir="ltr">{getDeviceId().slice(0, 8)}</span></p>
        <button onClick={check} className="w-full min-h-[48px] rounded-xl bg-brand-500 text-white font-semibold">{t('licence.retry')}</button>
      </div>
    </div>
  );
}
