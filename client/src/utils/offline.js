import { useState, useEffect } from 'react';

export function useOfflineStatus() {
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator !== 'undefined') {
      return !navigator.onLine;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOffline;
}

export const OFFLINE_FALLBACK_RESPONSE = "当前处于离线状态。请检查您的网络连接以访问 AI 助教，进行深度教材互动和图像识别答疑。";
export const OFFLINE_FALLBACK_RESPONSE_EN = "Currently running offline. Please check your internet connection to access the AI tutor for interactive RAG tutoring and image recognition.";
