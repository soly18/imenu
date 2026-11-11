import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n/index';
import './index.css';
import { initTheme } from './store/themeStore';

initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Installable web app (Windows / Linux / macOS / Android / iOS browsers): offline shell. Not inside the native wrappers.
if ('serviceWorker' in navigator && import.meta.env.PROD && !(window as any).Capacitor?.isNativePlatform?.() && !(window as any).imenuDesktop) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
