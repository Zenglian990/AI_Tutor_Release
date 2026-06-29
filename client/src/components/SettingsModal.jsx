import { useState } from 'react';
import { authFetch, useAppStore } from '../store/useStore';

export default function SettingsModal({
  isOpen,
  onClose,
  backendUrl,
  onSaveBackendUrl,
  apiToken,
  onSaveApiToken,
  isSocratic,
  onSocraticToggle,
  autoRead,
  onAutoReadToggle,
  currentProfileId,
  currentProfileEdition,
  onEditionChange
}) {
  const { language, setLanguage, t, chatModel, setChatModel } = useAppStore();
  const [url, setUrl] = useState(backendUrl);
  const [token, setToken] = useState(apiToken);
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState(null);

  if (!isOpen) return null;

  const SOCRATIC_OPTIONS = [
    { value: 'direct', label: t('mode.direct'), desc: language === 'zh-CN' ? 'AI直接给出完整答案和解析' : 'AI directly provides answers and explanations' },
    { value: 'guided', label: t('mode.guided'), desc: language === 'zh-CN' ? 'AI先给提示引导学生自己思考（推荐）' : 'AI prompts student to think first (Recommended)' },
    { value: 'strict', label: t('mode.strict'), desc: language === 'zh-CN' ? 'AI只用提问引导，绝不直接给答案' : 'AI only asks questions, never gives direct answers' },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    onSaveBackendUrl(url.trim());
    onSaveApiToken(token.trim());
    onClose();
  };

  const handleTestConnection = async () => {
    setTestResult('testing');
    try {
      const res = await authFetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setTestResult({
          success: true,
          message: language === 'zh-CN'
            ? `连接成功！服务器运行正常 (运行时间: ${Math.floor(data.uptime)}秒)`
            : `Connected! Server is running normally (Uptime: ${Math.floor(data.uptime)}s)`
        });
      } else if (res.status === 401 || res.status === 403) {
        setTestResult({
          success: false,
          message: language === 'zh-CN' ? '认证失败！请检查访问令牌是否正确。' : 'Authentication failed! Invalid API token.'
        });
      } else {
        setTestResult({
          success: false,
          message: language === 'zh-CN' ? `服务器返回错误 (${res.status})` : `Server error (${res.status})`
        });
      }
    } catch (e) {
      setTestResult({
        success: false,
        message: language === 'zh-CN' ? '无法连接到服务器，请检查地址和网络。' : 'Cannot connect to server. Check URL and network.'
      });
    }
  };

  return (
    <div className="modal-overlay no-print" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
    }}>
      <div className="glass-panel" style={{
        width: '95%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto',
        padding: '24px', borderRadius: '16px',
        border: '1px solid var(--glass-border)', background: 'var(--card-bg)',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '20px'
      }}>
        <h3 style={{ margin: 0, color: 'white', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          ⚙️ {t('settings.title')}
        </h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Language Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>{t('settings.language')}</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--glass-border)',
                background: '#1e293b',
                color: 'white',
                outline: 'none',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              <option value="zh-CN">🇨🇳 简体中文 (Simplified Chinese)</option>
              <option value="en-US">🇺🇸 English (US)</option>
            </select>
          </div>

          {/* Textbook Edition Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
              📚 {language === 'zh-CN' ? '教材版本' : 'Textbook Edition'}
            </label>
            <select
              value={currentProfileEdition || '人教版'}
              onChange={e => onEditionChange(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--glass-border)',
                background: '#1e293b',
                color: 'white',
                outline: 'none',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              <option value="人教版">人教版 (PEP / 全国通用)</option>
              <option value="西南大学版">西南大学版 (西教版 2024新版)</option>
              <option value="西师大版">西师大版 (西师版 / 川渝数学旧版)</option>
            </select>
          </div>

          {/* AI Model Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
              🤖 {language === 'zh-CN' ? 'AI 辅导模型' : 'AI Model'}
            </label>
            <select
              value={chatModel}
              onChange={e => setChatModel(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--glass-border)',
                background: '#1e293b',
                color: 'white',
                outline: 'none',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              <option value="default">{language === 'zh-CN' ? '系统默认配置' : 'System Default'}</option>
              <option value="gemini-3.5-flash">Google Gemini 3.5 Flash (极速推荐)</option>
              <option value="gemini-2.5-flash">Google Gemini 2.5 Flash (稳定流畅)</option>
              <option value="gemini-3.1-pro-preview">Google Gemini 3.1 Pro (高推理旗舰)</option>
              <option value="deepseek-v4-pro">DeepSeek-V4-Pro (深度思考)</option>
              <option value="deepseek-v4-flash">DeepSeek-V4-Flash (极速备用)</option>
            </select>
          </div>

          {/* Backend URL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>{t('settings.backend')}</label>
            <input
              type="text"
              placeholder={t('settings.backend_hint')}
              value={url}
              onChange={e => setUrl(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none', fontSize: '0.9rem' }}
            />
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '2px' }}>
              {t('settings.backend_note')}
            </span>
          </div>

          {/* API Token */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>{t('settings.token')}</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type={showToken ? 'text' : 'password'}
                placeholder={t('settings.token_hint')}
                value={token}
                onChange={e => setToken(e.target.value)}
                style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none', fontSize: '0.9rem' }}
              />
              <button type="button" onClick={() => setShowToken(!showToken)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.85rem' }}>
                {showToken ? '🙈' : '👁️'}
              </button>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '2px' }}>
              {t('settings.token_note')}
            </span>
          </div>

          {/* Connection test */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button type="button" onClick={handleTestConnection}
              style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.4)', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', cursor: 'pointer', fontSize: '0.85rem' }}>
              {t('settings.test')}
            </button>
            {testResult && (
              <span style={{
                color: testResult === 'testing' ? '#f59e0b' : (testResult.success ? '#10b981' : '#ef4444'),
                fontSize: '0.8rem', flex: 1
              }}>
                {testResult === 'testing' ? (language === 'zh-CN' ? '⏳ 测试中...' : '⏳ Testing...') : testResult.message}
              </span>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '4px 0' }} />



          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ color: 'white', fontSize: '0.95rem' }}>📖 {language === 'zh-CN' ? '教学风格设置' : 'Tutoring Style'}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {SOCRATIC_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onSocraticToggle(opt.value)}
                  title={opt.desc}
                  style={{
                    flex: 1,
                    padding: '10px 8px',
                    borderRadius: '10px',
                    border: isSocratic === opt.value ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                    background: isSocratic === opt.value ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.05)',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: isSocratic === opt.value ? 'bold' : 'normal',
                    transition: 'all 0.2s'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button type="button" onClick={async () => {
              try {
                const res = await authFetch(`/api/export/data?profile_id=${currentProfileId}`);
                if (!res.ok) { alert((language === 'zh-CN' ? '导出失败：' : 'Export failed: ') + res.status); return; }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `AI_Tutor_Backup_${currentProfileId}_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (e) { alert(language === 'zh-CN' ? '导出失败：网络错误' : 'Export failed: Network error'); }
            }}
              style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', cursor: 'pointer', marginRight: 'auto' }}>
              📥 {language === 'zh-CN' ? '导出全量数据' : 'Export All Data'}
            </button>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
              {t('settings.close')}
            </button>
            <button type="submit" style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
              {t('settings.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ToggleSetting({ label, desc, isOn, onToggle, lang }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ color: 'white', fontSize: '0.95rem' }}>{label}</span>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>{desc}</span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        style={{ background: isOn ? '#3b82f6' : 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
      >
        {isOn ? (lang === 'zh-CN' ? '已开启' : 'On') : (lang === 'zh-CN' ? '已关闭' : 'Off')}
      </button>
    </div>
  );
}
