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
          <p style={{ color: '#94a3b8', marginBottom: 20 }}>请尝试刷新页面，如果问题持续出现请联系我们。</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            刷新页面
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
