import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import ThemeSwitcher from '@/components/common/ThemeSwitcher';
import { authApi } from '@/api';
import { NOTICE_KEY, getServerUrl, setServerUrl } from '@/api/client';
import { useAuthStore } from '@/store/authStore';

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [serverOpen, setServerOpen] = useState(false);

  useEffect(() => {
    try { const n = sessionStorage.getItem(NOTICE_KEY); if (n) { setNotice(n); sessionStorage.removeItem(NOTICE_KEY); } } catch { /* ignore */ }
  }, []);

  const handleKey = (key: string) => {
    if (key === 'DEL') { setPin((p) => p.slice(0, -1)); return; }
    if (pin.length >= 6) return;
    setPin((p) => p + key);
  };

  const handleLogin = async () => {
    if (!pin || loading) return;
    setLoading(true);
    try {
      const res = await authApi.login({ pin });
      setAuth({ accessToken: res.accessToken, refreshToken: res.refreshToken }, res.employee);
      // Set app language to employee's preferred language
      await i18n.changeLanguage(res.employee.language);
      toast.success(`${t('auth.welcome')} ${res.employee.firstName}!`);
      navigate('/dashboard');
    } catch (e: any) {
      const code = e?.response?.data?.code;
      if (code === 'DEVICE_PENDING' || code === 'DEVICE_BLOCKED') setNotice(code);
      else if (!e?.response) { setNotice('UNREACHABLE'); setServerOpen(true); }
      else if (e.response.status === 429) toast.error(t('auth.tooMany'));
      else toast.error(t('auth.invalidPin'));
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const keys = ['1','2','3','4','5','6','7','8','9','DEL','0','OK'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 to-brand-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-3xl shadow-2xl p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl font-bold text-brand-600 dark:text-brand-400 dark:text-brand-400 mb-1">iMenu<span className="text-brand-400">25</span></div>
          <p className="text-gray-500 dark:text-gray-400 dark:text-gray-400 text-sm">{t('auth.enterPin')}</p>
        </div>

        {/* PIN display */}
        <div className="flex justify-center gap-3 mb-8 h-12 items-center">
          {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all ${
                i < pin.length ? 'bg-brand-500 scale-110' : 'bg-gray-200 dark:bg-gray-600 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>

        {notice && (
          <div className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 text-sm p-3">
            {t(`auth.notice.${notice}`)}
          </div>
        )}

        {/* PIN pad */}
        <div className="grid grid-cols-3 gap-3">
          {keys.map((key) => (
            <button
              key={key}
              onClick={() => key === 'OK' ? handleLogin() : handleKey(key)}
              disabled={loading}
              className={`pin-key ${
                key === 'OK'
                  ? '!bg-brand-500 !text-white hover:!bg-brand-600 col-span-1'
                  : key === 'DEL'
                  ? 'bg-gray-100 dark:bg-gray-700 dark:bg-gray-700 text-gray-600 dark:text-gray-300 dark:text-gray-300 text-base'
                  : 'bg-white dark:bg-gray-800 dark:bg-gray-800 text-gray-800 dark:text-gray-100 dark:text-gray-100'
              }`}
            >
              {loading && key === 'OK' ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : key === 'DEL' ? '⌫' : key}
            </button>
          ))}
        </div>

        {/* Language switcher */}
        <div className="flex justify-center gap-2 mt-6">
          {(['he','en','ar','ru'] as const).map((lng) => (
            <button
              key={lng}
              onClick={() => i18n.changeLanguage(lng)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                i18n.language === lng
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 dark:bg-gray-700 text-gray-600 dark:text-gray-300 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500 dark:hover:bg-gray-500'
              }`}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="mt-3"><ThemeSwitcher /></div>

        <button onClick={() => setServerOpen(true)} className="mt-4 w-full min-h-[44px] text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600">
          🌐 {t('server.title')}: <bdi dir="ltr">{getServerUrl() || t('server.sameSite')}</bdi>
        </button>
        {serverOpen && <ServerDialog onClose={() => setServerOpen(false)} />}
      </div>
    </div>
  );
}

/** Where is the iMenu25 server? Needed once on an installed app (APK). */
function ServerDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(getServerUrl());
  const [result, setResult] = useState<'ok' | 'fail' | 'busy' | null>(null);
  const clean = () => url.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  const test = async () => {
    setResult('busy');
    try {
      const base = clean();
      if (base && !/^https?:\/\//i.test(base)) throw new Error('scheme');
      const r = await fetch(`${base}/api/ping`, { cache: 'no-store' });
      setResult((await r.json()).app === 'iMenu25' ? 'ok' : 'fail');
    } catch { setResult('fail'); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">🌐 {t('server.title')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('server.help')}</p>
        <input dir="ltr" value={url} onChange={(e) => { setUrl(e.target.value); setResult(null); }} placeholder="http://192.168.1.20:3001"
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
          className="w-full min-h-[48px] rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3" />
        {result && <p className={`text-sm ${result === 'ok' ? 'text-green-700 dark:text-green-300' : result === 'fail' ? 'text-red-700 dark:text-red-300' : 'text-gray-500'}`}>
          {result === 'ok' ? '✅ ' + t('server.ok') : result === 'fail' ? '❌ ' + t('server.fail') : '…'}
        </p>}
        <div className="flex gap-2 pt-1">
          <button onClick={test} className="flex-1 min-h-[48px] rounded-xl border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 font-semibold">{t('server.test')}</button>
          <button onClick={() => { setServerUrl(clean()); onClose(); }} className="flex-1 min-h-[48px] rounded-xl bg-brand-500 text-white font-semibold">{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
}
