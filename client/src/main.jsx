import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Register PWA service worker without forced mid-exam reloads (防切屏强刷丢答卷)
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] New version ready; deferring activation until user confirms or next reload.');
    if (typeof window !== 'undefined') {
      window.__AI_TUTOR_UPDATE_SW__ = () => updateSW(true);
      window.dispatchEvent(new CustomEvent('ai-tutor-sw-update-available'));
    }
  },
  onOfflineReady() {
    console.log('[PWA] App is ready for offline usage');
  },
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // Check for updates periodically (every 30 minutes) without forcing reload
      setInterval(() => {
        registration.update().catch(() => {});
      }, 30 * 60 * 1000);
    }
  }
});

createRoot(document.getElementById('root')).render(
  <App />
)
