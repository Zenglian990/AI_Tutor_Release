import { Component } from 'react'
import { authFetch } from '../store/useStore'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    try {
      const activeProfileId = localStorage.getItem('ai_tutor_active_profile') || 'unknown';
      authFetch('/api/admin/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error?.message || String(error),
          stack: error?.stack || errorInfo?.componentStack || '',
          url: window.location.href,
          profile_id: activeProfileId
        })
      }).catch(err => console.warn('Failed to send error log to APM:', err));
    } catch (err) {
      console.warn('Failed to report error to APM:', err);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0f172a',
          color: '#f8fafc',
          padding: 24,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠</div>
          <h2 style={{ marginBottom: 8 }}>页面遇到了问题</h2>
          <p style={{ color: '#94a3b8', marginBottom: 20 }}>请尝试刷新页面，系统将自动清除历史旧缓存以恢复最新版本。</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={async () => {
                this.setState({ hasError: false, error: null });
                try {
                  if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (const r of registrations) {
                      await r.unregister();
                    }
                  }
                  if ('caches' in window) {
                    const keys = await caches.keys();
                    for (const k of keys) {
                      await caches.delete(k);
                    }
                  }
                } catch (err) {
                  console.warn('Cache clear error:', err);
                }
                window.location.href = window.location.origin + window.location.pathname + '?_t=' + Date.now();
              }}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '10px 24px',
                fontSize: '1rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              清除旧缓存并刷新
            </button>
          </div>
          {this.state.error && (
            <details style={{ marginTop: 24, textAlign: 'left', maxWidth: 600, color: '#64748b', fontSize: '0.8rem', background: '#1e293b', padding: 12, borderRadius: 6 }}>
              <summary style={{ cursor: 'pointer', color: '#94a3b8' }}>查看技术诊断详情</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 8 }}>
                {this.state.error.message || String(this.state.error)}
              </pre>
            </details>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
