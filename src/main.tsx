import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import {installGlobalJsonSafetyGuard} from './lib/httpClient.ts';
import App from './App.tsx';
import './index.css';

// Prevent raw JSON SyntaxError if any module receives plain-text/HTML server error pages
installGlobalJsonSafetyGuard();

const SW_RELOAD_SESSION_KEY = 'wt_sw_updated_once';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    try {
      if (!sessionStorage.getItem(SW_RELOAD_SESSION_KEY)) {
        sessionStorage.setItem(SW_RELOAD_SESSION_KEY, '1');
        refreshing = true;
        window.location.reload();
      }
    } catch {
      // Ignore storage access restrictions in private/iframe contexts
    }
  });
}

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      registration.update().catch(() => {});
    }
  },
  onRegisterError() {
    // Gracefully ignore SW registration restrictions in sandboxed preview iframes
  },
});

createRoot(document.getElementById('root')!).render(<App />);
