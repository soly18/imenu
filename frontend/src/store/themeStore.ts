import { create } from 'zustand';

/** "system" = follow the device (the default), "light" = day, "dark" = night. */
export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'imenu.theme';

const read = (): ThemeMode => {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark' || v === 'system') return v; } catch { /* private mode */ }
  return 'system';
};

export function isDark(mode: ThemeMode): boolean {
  return mode === 'dark' || (mode === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

export function applyTheme(mode: ThemeMode) {
  const dark = isDark(mode);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  // colours the Android/Chrome status bar
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111827' : '#111827');
}

interface ThemeState { mode: ThemeMode; setMode: (m: ThemeMode) => void; }
export const useThemeStore = create<ThemeState>((set) => ({
  mode: read(),
  setMode: (mode) => {
    try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
    applyTheme(mode);
    set({ mode });
  },
}));

/** Call once at start-up: applies the saved theme and follows the device setting while on "system". */
export function initTheme() {
  applyTheme(useThemeStore.getState().mode);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (useThemeStore.getState().mode === 'system') applyTheme('system');
  });
}
