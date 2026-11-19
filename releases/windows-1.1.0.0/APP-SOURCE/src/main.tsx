import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Windows-only responsive layout. Web production CSS is unchanged.
if (import.meta.env.MODE === 'desktop') {
  void import('./desktop-window.css');
}

// The PWA install UI must not run in the Windows/Tauri desktop client.
if (import.meta.env.MODE !== 'desktop') {
  void import('./pwaInstall.mjs');
}
const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
