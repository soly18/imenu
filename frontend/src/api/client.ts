import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

/* ---------- Server address (needed by the installed Android app) ---------- */
const SERVER_KEY = 'imenu.server';
const DEVICE_KEY = 'imenu.deviceId';
export const NOTICE_KEY = 'imenu.notice';

export function getServerUrl(): string {
  try { return localStorage.getItem(SERVER_KEY) || (import.meta.env.VITE_API_URL as string) || ''; } catch { return ''; }
}
export function setServerUrl(url: string) {
  try { url ? localStorage.setItem(SERVER_KEY, url) : localStorage.removeItem(SERVER_KEY); } catch { /* ignore */ }
}
/** Base for API calls: `<server>/api`, or just `/api` when served by the same host. */
export function apiBase(): string {
  const s = getServerUrl().replace(/\/+$/, '').replace(/\/api$/, '');
  return `${s}/api`;
}

/* ---------- Device identity ---------- */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto as any).randomUUID?.() ??
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      localStorage.setItem(DEVICE_KEY, id!);
    }
    return id!;
  } catch { return 'unknown-device'; }
}
export function platform(): string {
  const ua = navigator.userAgent;
  if ((window as any).Capacitor) return 'android-app';
  if (/android/i.test(ua)) return 'android-web';
  if (/iphone|ipad/i.test(ua)) return 'ios-web';
  return 'web';
}

const api = axios.create({ headers: { 'Content-Type': 'application/json' } });

api.interceptors.request.use((config) => {
  config.baseURL = apiBase();
  config.headers['X-Device-Id'] = getDeviceId();
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Sign out and tell the login page why. */
export function signOutWithNotice(code: string) {
  try { sessionStorage.setItem(NOTICE_KEY, code); } catch { /* ignore */ }
  useAuthStore.getState().logout();
}

let isRefreshing = false;
let failedQueue: { resolve: (v: any) => void; reject: (e: any) => void }[] = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const code = error.response?.data?.code;
    const isLogin = original?.url?.includes('/auth/login');

    if (!isLogin && (code === 'USER_DISABLED' || code === 'DEVICE_BLOCKED' || code === 'DEVICE_PENDING')) {
      signOutWithNotice(code);
      return Promise.reject(error);
    }

    if (status === 401 && !isLogin && original && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        const { data } = await axios.post(`${apiBase()}/auth/refresh`, { refreshToken },
          { headers: { 'X-Device-Id': getDeviceId() } });
        useAuthStore.getState().setTokens(data.accessToken, refreshToken);
        failedQueue.forEach((p) => p.resolve(data.accessToken));
        failedQueue = [];
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (err) {
        failedQueue.forEach((p) => p.reject(err));
        failedQueue = [];
        useAuthStore.getState().logout();
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
