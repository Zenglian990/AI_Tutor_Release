import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Register PWA service worker with auto-update capability
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] New version detected, updating service worker...');
    updateSW(true);
  },
  onOfflineReady() {
    console.log('[PWA] App is ready for offline usage');
  },
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // Check for updates periodically (every 15 minutes)
      setInterval(() => {
        registration.update().catch(() => {});
      }, 15 * 60 * 1000);
    }
  }
});

// Check for updates when user switches back to the tab/app
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => reg.update()).catch(() => {});
    }
  });
}

createRoot(document.getElementById('root')).render(
  <App />
)
