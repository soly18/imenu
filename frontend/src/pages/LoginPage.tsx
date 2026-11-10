import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { authApi } from '@/api';
import { useAuthStore } from '@/store/authStore';

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

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
    } catch {
      toast.error(t('auth.invalidPin'));
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const keys = ['1','2','3','4','5','6','7','8','9','DEL','0','OK'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 to-brand-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl font-bold text-brand-600 mb-1">iMenu<span className="text-brand-400">25</span></div>
          <p className="text-gray-500 text-sm">{t('auth.enterPin')}</p>
        </div>

        {/* PIN display */}
        <div className="flex justify-center gap-3 mb-8 h-12 items-center">
          {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all ${
                i < pin.length ? 'bg-brand-500 scale-110' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

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
                  ? 'bg-gray-100 text-gray-600 text-base'
                  : 'bg-white text-gray-800'
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
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
