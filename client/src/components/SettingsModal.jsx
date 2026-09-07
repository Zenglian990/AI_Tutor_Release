import { useState, useEffect } from 'react';
import { authFetch, useAppStore } from '../store/useStore';
import ParentalGate from './ParentalGate';

export default function SettingsModal({
  isOpen,
  onClose,
  backendUrl,
  onSaveBackendUrl,
  apiToken,
  onSaveApiToken,
  socraticLevel,
  onSocraticToggle,
  autoRead,
  onAutoReadToggle,
  currentProfileId,
  currentProfileEdition,
  onEditionChange
}) {
  const { language, setLanguage, t, chatModel, setChatModel, settings, setSettings } = useAppStore();
  const [url, setUrl] = useState(backendUrl);
  const [token, setToken] = useState(apiToken);
  const [parentName, setParentName] = useState(settings?.parentName || '家长');
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showExportGate, setShowExportGate] = useState(false);

  // DeepSeek & Domestic Provider Keys State
  const [deepseekKey, setDeepseekKey] = useState('');
  const [deepseekUrl, setDeepseekUrl] = useState('https://api.deepseek.com/v1');
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [llmTestStatus, setLlmTestStatus] = useState(null); // { testing, success, message, latencyMs }
  const [serverProviderInfo, setServerProviderInfo] = useState(null);

  // Load existing provider configs
  useEffect(() => {
    if (!isOpen) return;
    authFetch('/api/config/providers')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setServerProviderInfo(data);
          if (data.deepseek?.apiUrl) setDeepseekUrl(data.deepseek.apiUrl);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const SOCRATIC_OPTIONS = [
    { value: 'direct', label: t('mode.direct'), desc: language === 'zh-CN' ? 'AI直接给出完整答案和解析' : 'AI directly provides answers and explanations' },
    { value: 'guided', label: t('mode.guided'), desc: language === 'zh-CN' ? 'AI先给提示引导学生自己思考（推荐）' : 'AI prompts student to think first (Recommended)' },
    { value: 'strict', label: t('mode.strict'), desc: language === 'zh-CN' ? 'AI只用提问引导，绝不直接给答案' : 'AI only asks questions, never gives direct answers' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    onSaveBackendUrl(url.trim());
    onSaveApiToken(token.trim());

    // Persist DeepSeek key if entered
    if (deepseekKey.trim() || deepseekUrl.trim()) {
      try {
        await authFetch('/api/config/update-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deepseekApiKey: deepseekKey.trim() || undefined,
            deepseekApiUrl: deepseekUrl.trim() || undefined
          })
        });
      } catch (err) {
        console.warn('Failed to persist keys to server:', err);
      }
    }

    const newSettings = {
      ...settings,
      parentName: parentName.trim() || '家长',
      deepseekUrl: deepseekUrl.trim()
    };
    setSettings(newSettings);
    localStorage.setItem('ai_tutor_settings', JSON.stringify(newSettings));
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

  // Ping test selected AI provider
  const handleTestLlm = async (providerType) => {
    setLlmTestStatus({ testing: true });
    try {
      const payload = {
        provider: providerType,
        apiKey: providerType === 'deepseek' ? deepseekKey.trim() : undefined,
        apiUrl: providerType === 'deepseek' ? deepseekUrl.trim() : undefined,
        model: chatModel !== 'default' ? chatModel : undefined
      };

      const res = await authFetch('/api/config/test-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLlmTestStatus({
          testing: false,
          success: true,
          message: `⚡ ${data.message || '连通正常！'}`
        });
      } else {
        setLlmTestStatus({
          testing: false,
          success: false,
          message: `❌ 连通失败: ${data.error || '无法访问'} ${data.details ? '(' + data.details + ')' : ''}`
        });
      }
    } catch (err) {
      setLlmTestStatus({
        testing: false,
        success: false,
        message: `❌ 测试异常: ${err.message}`
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
        width: '95%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto',
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
              aria-label="选择语言"
              value={language}
              onChange={e => setLanguage(e.target.value)}
              style={{
                padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)',
                background: '#1e293b', color: 'white', outline: 'none', fontSize: '0.9rem', cursor: 'pointer'
              }}
            >
              <option value="zh-CN">🇨🇳 简体中文 (Simplified Chinese)</option>
              <option value="en-US">🇺🇸 English (US)</option>
            </select>
          </div>

          {/* Parent Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
              {language === 'zh-CN' ? '家长称呼 (用于报告卡片)' : 'Parent Name (for reports)'}
            </label>
            <input
              type="text"
              placeholder={language === 'zh-CN' ? '例如: 爸爸, 妈妈' : 'e.g. Dad, Mom'}
              value={parentName}
              onChange={e => setParentName(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none', fontSize: '0.9rem' }}
            />
          </div>

          {/* Textbook Edition Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
              📚 {language === 'zh-CN' ? '教材版本' : 'Textbook Edition'}
            </label>
            <select
              aria-label="选择教材版本"
              value={currentProfileEdition || '人教版'}
              onChange={e => onEditionChange(e.target.value)}
              style={{
                padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)',
                background: '#1e293b', color: 'white', outline: 'none', fontSize: '0.9rem', cursor: 'pointer'
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
              aria-label="选择AI辅导模型"
              value={chatModel}
              onChange={e => setChatModel(e.target.value)}
              style={{
                padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)',
                background: '#1e293b', color: 'white', outline: 'none', fontSize: '0.9rem', cursor: 'pointer'
              }}
            >
              <option value="default">{language === 'zh-CN' ? '系统智能路由 (Gemini/DeepSeek自动容灾)' : 'System Smart Route'}</option>
              <option value="deepseek-chat">🇨🇳 DeepSeek-V3 (国内免代理直连·推荐)</option>
              <option value="deepseek-reasoner">🇨🇳 DeepSeek-R1 (深度推理·慢思考名师)</option>
              <option value="gemini-2.0-flash">🌐 Google Gemini 2.0 Flash (海外极速)</option>
              <option value="gemini-1.5-flash">🌐 Google Gemini 1.5 Flash (极速稳定)</option>
              <option value="gemini-1.5-pro">🌐 Google Gemini 1.5 Pro (全功能高阶)</option>
            </select>
          </div>

          {/* 🇨🇳 DeepSeek 国内免代理配置卡片 */}
          <div style={{
            background: 'rgba(37, 99, 235, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#60a5fa' }}>
                🇨🇳 中国大陆免代理通道 (DeepSeek / OpenAI兼容)
              </span>
              {serverProviderInfo?.deepseek?.configured && (
                <span style={{ fontSize: '0.75rem', background: '#10b981', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>
                  已激活
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>DeepSeek API Key (可选)</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type={showDeepseekKey ? 'text' : 'password'}
                  placeholder={serverProviderInfo?.deepseek?.maskedKey || '输入 sk-... (不填保留服务器现有Key)'}
                  value={deepseekKey}
                  onChange={e => setDeepseekKey(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.85rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowDeepseekKey(!showDeepseekKey)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.05)', color: 'white', cursor: 'pointer' }}
                >
                  {showDeepseekKey ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>API Base URL (支持智谱/通义/硅基流动等端点)</label>
              <input
                type="text"
                placeholder="https://api.deepseek.com/v1"
                value={deepseekUrl}
                onChange={e => setDeepseekUrl(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => handleTestLlm('deepseek')}
                disabled={llmTestStatus?.testing}
                style={{
                  padding: '6px 12px', borderRadius: '6px', border: 'none',
                  background: '#2563eb', color: 'white', fontWeight: 500, fontSize: '0.8rem', cursor: 'pointer'
                }}
              >
                {llmTestStatus?.testing ? '⏳ 测试连通性中...' : '⚡ 诊断大模型连通性'}
              </button>
            </div>

            {llmTestStatus && !llmTestStatus.testing && (
              <span style={{ fontSize: '0.8rem', color: llmTestStatus.success ? '#34d399' : '#f87171' }}>
                {llmTestStatus.message}
              </span>
            )}
          </div>

          {/* Backend URL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>{t('settings.backend')}</label>
            <input
              aria-label="后端API地址"
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
                aria-label="系统API密钥"
                type={showToken ? 'text' : 'password'}
                placeholder={t('settings.token_hint')}
                value={token}
                onChange={e => setToken(e.target.value)}
                style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', outline: 'none', fontSize: '0.9rem' }}
              />
              <button type="button" aria-label={showToken ? '隐藏密钥' : '显示密钥'} onClick={() => setShowToken(!showToken)}
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

          {/* Socratic options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ color: 'white', fontSize: '0.95rem' }}>📖 {language === 'zh-CN' ? '教学风格设置' : 'Tutoring Style'}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {SOCRATIC_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onSocraticToggle(opt.value)}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: '8px',
                    border: `1px solid ${socraticLevel === opt.value ? 'var(--accent-color, #3b82f6)' : 'var(--glass-border)'}`,
                    background: socraticLevel === opt.value ? 'rgba(59, 130, 246, 0.2)' : 'rgba(0,0,0,0.2)',
                    color: socraticLevel === opt.value ? '#60a5fa' : 'white', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'center'
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>{opt.label}</div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.9rem' }}>
              {t('settings.cancel')}
            </button>
            <button type="submit"
              style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'var(--accent-color, #3b82f6)', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
              {t('settings.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
