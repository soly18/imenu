import { create } from 'zustand';
import { getDeviceId, platform } from '@/api/client';

/**
 * Talks to the supplier's central console (see /console): reports this device, and receives
 * whether it may run plus which modules are switched on. Disabled (everything allowed) when no
 * console address is configured, so local development is unaffected.
 */
const CONSOLE_KEY = 'imenu.console';
const ENROL_KEY = 'imenu.enrol';
const CACHE_KEY = 'imenu.licence';
const GRACE_MS = 14 * 24 * 3600 * 1000;      // keep working this long when the console can't be reached

export type LicenceStatus = 'allowed' | 'blocked' | 'expired' | 'pending';
interface Cached { status: LicenceStatus; message: string; licenceUntil: string | null; features: Record<string, boolean>; at: number }

const rd = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const wr = (k: string, v: string) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* ignore */ } };

export const getConsoleUrl = () => rd(CONSOLE_KEY) || ((import.meta.env.VITE_CONSOLE_URL as string) || '');
export const setConsoleUrl = (v: string) => wr(CONSOLE_KEY, v);
export const getEnrol = () => rd(ENROL_KEY) || ((import.meta.env.VITE_CONSOLE_ENROL as string) || '');
export const setEnrol = (v: string) => wr(ENROL_KEY, v.trim().toUpperCase());

interface State {
  enabled: boolean; checked: boolean;
  status: LicenceStatus; message: string; licenceUntil: string | null; features: Record<string, boolean>;
  check: () => Promise<void>;
}

const readCache = (): Cached | null => { try { return JSON.parse(rd(CACHE_KEY)) as Cached; } catch { return null; } };

async function deviceInfo() {
  const info: Record<string, string> = {};
  try {
    if ((window as any).Capacitor?.isNativePlatform?.()) {
      const { Device } = await import('@capacitor/device');
      const [id, i] = await Promise.all([Device.getId(), Device.getInfo()]);
      Object.assign(info, { androidId: id.identifier, brand: i.manufacturer, model: i.model, osVersion: i.osVersion });
    }
  } catch { /* plain browser */ }
  return info;
}

export const useLicenceStore = create<State>((set, get) => ({
  enabled: !!getConsoleUrl(), checked: false,
  status: 'allowed', message: '', licenceUntil: null, features: {},

  check: async () => {
    const url = getConsoleUrl().replace(/\/+$/, '');
    if (!url) { set({ enabled: false, checked: true, status: 'allowed', features: {}, message: '' }); return; }
    set({ enabled: true });
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(`${url}/api/v1/checkin`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ installId: getDeviceId(), platform: platform(), appVersion: (import.meta.env.VITE_APP_VERSION as string) || '1.0.0',
          enrol: getEnrol() || undefined, ...(await deviceInfo()) }),
      });
      clearTimeout(to);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const c: Cached = { status: j.status, message: j.message || '', licenceUntil: j.licenceUntil, features: j.features || {}, at: Date.now() };
      wr(CACHE_KEY, JSON.stringify(c));
      set({ checked: true, status: c.status, message: c.message, licenceUntil: c.licenceUntil, features: c.features });
    } catch {
      // Console unreachable (offline): carry on with the last answer for a while.
      const c = readCache();
      if (c && Date.now() - c.at < GRACE_MS) {
        const expired = c.licenceUntil && c.licenceUntil < new Date().toISOString().slice(0, 10);
        set({ checked: true, status: expired ? 'expired' : c.status, message: c.message, licenceUntil: c.licenceUntil, features: c.features });
      } else if (!get().checked) {
        set({ checked: true });                      // never reached it: do not brick a working till
      }
    }
  },
}));

/** Is a module switched on for this device? Missing = on. */
export const useFeature = (key: string) => useLicenceStore((s) => s.features[key] !== false);
