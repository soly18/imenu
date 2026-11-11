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
