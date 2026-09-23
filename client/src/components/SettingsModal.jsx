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
  const [antiCheatLocked, setAntiCheatLocked] = useState(() => localStorage.getItem('parent_anti_cheat_locked') !== 'false');
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showExportGate, setShowExportGate] = useState(false);

  // DeepSeek & Domestic Provider Keys State
  const [deepseekKey, setDeepseekKey] = useState(() => localStorage.getItem('ai_tutor_deepseek_key') || '');
  const [deepseekUrl, setDeepseekUrl] = useState(() => localStorage.getItem('ai_tutor_deepseek_url') || 'https://api.deepseek.com/v1');
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [llmTestStatus, setLlmTestStatus] = useState(null); // { testing, success, message, latencyMs }

  // Google Gemini Key State
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('ai_tutor_gemini_key') || '');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiTestStatus, setGeminiTestStatus] = useState(null);

  // TypeSafe Jev Decision Engine State
  const [typesafeKey, setTypesafeKey] = useState(() => localStorage.getItem('ai_tutor_typesafe_key') || '');
  const [jevEnabled, setJevEnabled] = useState(() => localStorage.getItem('ai_tutor_jev_enabled') !== 'false');
  const [showTypesafeKey, setShowTypesafeKey] = useState(false);
  const [jevTestStatus, setJevTestStatus] = useState(null);

  // App Update & Version State
  const [updateCheckStatus, setUpdateCheckStatus] = useState(null);

  // TTS Engine preference ('local' | 'cloud')
  const [ttsEngine, setTtsEngineState] = useState(() => localStorage.getItem('tts_engine') || 'local');

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
          if (data.jev?.enabled !== undefined && localStorage.getItem('ai_tutor_jev_enabled') === null) {
            setJevEnabled(data.jev.enabled);
          }
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
    localStorage.setItem('parent_anti_cheat_locked', antiCheatLocked ? 'true' : 'false');

    // Save keys locally in browser/device storage
    if (geminiKey.trim()) {
      localStorage.setItem('ai_tutor_gemini_key', geminiKey.trim());
    } else {
      localStorage.removeItem('ai_tutor_gemini_key');
    }
    if (deepseekKey.trim()) {
      localStorage.setItem('ai_tutor_deepseek_key', deepseekKey.trim());
    } else {
      localStorage.removeItem('ai_tutor_deepseek_key');
    }
    if (deepseekUrl.trim()) {
      localStorage.setItem('ai_tutor_deepseek_url', deepseekUrl.trim());
    }
    if (typesafeKey.trim()) {
      localStorage.setItem('ai_tutor_typesafe_key', typesafeKey.trim());
    } else {
      localStorage.removeItem('ai_tutor_typesafe_key');
    }
    localStorage.setItem('ai_tutor_jev_enabled', jevEnabled ? 'true' : 'false');

    // Persist DeepSeek, Gemini, or Jev key to server if entered
    if (geminiKey.trim() || deepseekKey.trim() || deepseekUrl.trim() || typesafeKey.trim() || jevEnabled !== undefined) {
      try {
        await authFetch('/api/config/update-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            geminiApiKey: geminiKey.trim() || undefined,
            deepseekApiKey: deepseekKey.trim() || undefined,
            deepseekApiUrl: deepseekUrl.trim() || undefined,
            typesafeApiKey: typesafeKey.trim() || undefined,
            jevEnabled: jevEnabled
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
    localStorage.setItem('tts_engine', ttsEngine);
    onClose();
  };

  const handleTestConnection = async () => {
    setTestResult('testing');
    try {
      const targetBase = url.trim() || '';
      const testEndpoint = targetBase ? `${targetBase.replace(/\/+$/, '')}/api/health` : '/api/health';
      const res = await fetch(testEndpoint);
      if (res.ok) {
        const data = await res.json();
        setTestResult({
          success: true,
          message: language === 'zh-CN'
            ? `连接成功！服务器运行正常 (状态: ${data.status || 'OK'})`
            : `Connected! Server is healthy (${data.status || 'OK'})`
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

      const targetBase = url.trim() || '';
      const testEndpoint = targetBase ? `${targetBase.replace(/\/+$/, '')}/api/config/test-llm` : '/api/config/test-llm';

      const res = await authFetch(testEndpoint, {
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

  // Ping test Gemini provider
  const handleTestGemini = async () => {
    setGeminiTestStatus({ testing: true });
    try {
      const payload = {
        provider: 'gemini',
        apiKey: geminiKey.trim() || undefined,
        model: chatModel && chatModel.startsWith('gemini') ? chatModel : 'gemini-3.6-flash'
      };

      const targetBase = url.trim() || '';
      const testEndpoint = targetBase ? `${targetBase.replace(/\/+$/, '')}/api/config/test-llm` : '/api/config/test-llm';

      const res = await authFetch(testEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setGeminiTestStatus({
          testing: false,
          success: true,
          message: `⚡ ${data.message || 'Gemini 连通正常！'}`
        });
      } else {
        setGeminiTestStatus({
          testing: false,
          success: false,
          message: `❌ 连通失败: ${data.error || '无法访问'} ${data.details ? '(' + data.details + ')' : ''}`
        });
      }
    } catch (err) {
      setGeminiTestStatus({
        testing: false,
        success: false,
        message: `❌ 测试异常: ${err.message}`
      });
    }
  };

  // Ping test Jev / TypeSafe provider
  const handleTestJev = async () => {
    setJevTestStatus({ testing: true });
    try {
      const payload = {
        provider: 'jev',
        apiKey: typesafeKey.trim() || undefined
      };

      const targetBase = url.trim() || '';
      const testEndpoint = targetBase ? `${targetBase.replace(/\/+$/, '')}/api/config/test-llm` : '/api/config/test-llm';

      const res = await authFetch(testEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setJevTestStatus({
          testing: false,
          success: true,
          message: `⚡ ${data.message || 'Jev 决策模型连通正常！'}`
        });
      } else {
        setJevTestStatus({
          testing: false,
          success: false,
          message: `❌ 连通失败: ${data.error || '无法访问'} ${data.details ? '(' + data.details + ')' : ''}`
        });
      }
    } catch (err) {
      setJevTestStatus({
        testing: false,
        success: false,
        message: `❌ 测试异常: ${err.message}`
      });
    }
  };

  // Check for app updates
  const handleCheckUpdate = async () => {
    setUpdateCheckStatus({ checking: true, message: '正在检查更新...' });
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update().catch(() => {});
        }
      }
      const targetBase = url.trim() || '';
      const versionEndpoint = targetBase ? `${targetBase.replace(/\/+$/, '')}/api/system/version` : '/api/system/version';
      const res = await fetch(versionEndpoint);
      if (res.ok) {
        const data = await res.json();
        setUpdateCheckStatus({
          checking: false,
          success: true,
          message: `已连接服务端 (v${data.version || '1.2.0'} - ${data.buildDate})！若有新界面，刷新后立即生效。`
        });
      } else {
        setUpdateCheckStatus({
          checking: false,
          success: true,
          message: '已触发前端与 Service Worker 资源检测！'
        });
      }
    } catch (e) {
      setUpdateCheckStatus({
        checking: false,
        success: false,
        message: '无法连通服务端版本检测，若界面未刷新可尝试【清除缓存强刷】。'
      });
    }
  };

  // Clear offline cache and reload
  const handleHardRefresh = async () => {
    if (window.confirm('确定要清除本地缓存并强制重新加载应用吗？')) {
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            await reg.unregister();
          }
        }
      } catch (e) {
        console.warn('Cache clear error:', e);
      }
      window.location.reload(true);
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

          {/* Parent Anti-Cheat Strict Lock */}
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '10px',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, color: '#fca5a5', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🛡️</span>
                <span>家长防抄题监督锁</span>
              </span>
              <input
                type="checkbox"
                checked={antiCheatLocked}
                onChange={e => setAntiCheatLocked(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#ef4444' }}
              />
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>
              开启后，学生端强制使用苏格拉底启发引导；若要切换至【直接解答】或查看 A4 试卷答案，必须输入家长密码，彻底杜绝应付作业偷抄答案。
            </p>
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
              <option value="default">{language === 'zh-CN' ? '⚡ 系统智能路由 (国内优先/海外自动容灾)' : 'System Smart Route'}</option>
              <option value="qwen2.5-vl-72b-instruct">🇨🇳 阿里通义千问 Qwen2.5-VL (国内免代理·试卷OCR与秒批之王)</option>
              <option value="glm-4v-plus">🇨🇳 智谱 GLM-4V-Plus (国内免代理·图文综合推理)</option>
              <option value="deepseek-chat">🇨🇳 DeepSeek-V3 (国内免代理直连·通识与语文英语)</option>
              <option value="deepseek-reasoner">🇨🇳 DeepSeek-R1 (顶尖慢思考·数理化深度推理名师)</option>
              <option value="gemini-3.6-flash">🌐 Google Gemini 3.6 Flash (最新多模态·试卷秒批推荐)</option>
              <option value="gemini-2.5-flash">🌐 Google Gemini 2.5 Flash (经典多模态·高稳定度)</option>
              <option value="gemini-pro-latest">🌐 Google Gemini Pro Latest (满血全能大模型)</option>
            </select>
          </div>

          {/* 🇨🇳 国内免代理配置卡片 (通义千问 / 智谱 / DeepSeek / 硅基流动) */}
          <div style={{
            background: 'rgba(37, 99, 235, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#60a5fa' }}>
                🇨🇳 中国大陆免代理通道 (通义千问 / 智谱 / DeepSeek / 硅基流动)
              </span>
              {serverProviderInfo?.deepseek?.configured && (
                <span style={{ fontSize: '0.75rem', background: '#10b981', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>
                  已激活
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>API Key (国内服务商密钥)</label>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>API Base URL (国内免代理端点)</label>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setDeepseekUrl('https://dashscope.aliyuncs.com/compatible-mode/v1')}
                    style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#93c5fd', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
                    title="阿里云百炼·通义千问官方兼容端点"
                  >
                    +阿里百炼
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeepseekUrl('https://api.siliconflow.cn/v1')}
                    style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#93c5fd', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
                    title="硅基流动·汇聚Qwen2.5-VL与DeepSeek"
                  >
                    +硅基流动
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeepseekUrl('https://open.bigmodel.cn/api/paas/v4')}
                    style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#93c5fd', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
                    title="智谱AI官方开放平台"
                  >
                    +智谱AI
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeepseekUrl('https://api.deepseek.com/v1')}
                    style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#93c5fd', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
                    title="DeepSeek官方端点"
                  >
                    +DeepSeek
                  </button>
                </div>
              </div>
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

          {/* 🌐 Google Gemini API 密钥配置 */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#34d399' }}>
                🌐 Google Gemini 官方通道 (Gemini 3.6 Flash / 2.5 Flash / Pro)
              </span>
              {serverProviderInfo?.gemini?.configured && (
                <span style={{ fontSize: '0.75rem', background: '#10b981', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>
                  已激活 {serverProviderInfo.gemini.keyCount > 0 ? `(${serverProviderInfo.gemini.keyCount}个密钥)` : ''}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>Gemini API Key (Google 官方密钥)</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  placeholder={serverProviderInfo?.gemini?.maskedKey || '输入 AIzaSy... (不填保留服务器现有Key)'}
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.85rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.05)', color: 'white', cursor: 'pointer' }}
                >
                  {showGeminiKey ? '🙈' : '👁️'}
                </button>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
                Google AI Studio 申请的 API Key（通常为 AIzaSy 开头），支持最新 Gemini 3.6 Flash 与 2.5 Flash。
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
              <button
                type="button"
                onClick={handleTestGemini}
                disabled={geminiTestStatus?.testing}
                style={{
                  padding: '6px 12px', borderRadius: '6px', border: 'none',
                  background: '#059669', color: 'white', fontWeight: 500, fontSize: '0.8rem', cursor: 'pointer'
                }}
              >
                {geminiTestStatus?.testing ? '⏳ 测试连通性中...' : '⚡ 诊断 Gemini 连通性'}
              </button>
            </div>

            {geminiTestStatus && !geminiTestStatus.testing && (
              <span style={{ fontSize: '0.8rem', color: geminiTestStatus.success ? '#34d399' : '#f87171' }}>
                {geminiTestStatus.message}
              </span>
            )}
          </div>

          {/* 🧠 Jev (TypeSafe) 系统一决策引擎配置 */}
          <div style={{
            background: 'rgba(249, 115, 22, 0.12)', border: '1px solid rgba(249, 115, 22, 0.3)',
            borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fb923c' }}>
                🧠 Jev 系统一决策引擎 (TypeSafe 70ms 意图路由 / 智能护栏)
              </span>
              {serverProviderInfo?.jev?.configured && (
                <span style={{ fontSize: '0.75rem', background: '#ea580c', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>
                  {serverProviderInfo.jev.enabled ? '已激活 (超速决策)' : '已配置 (已暂停)'}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: 500 }}>启用 Jev 决策分流加速</span>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>自动识别简单记忆题、拦截脱纲闲聊，节省 50% 大模型 Token 消耗</span>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px' }}>
                <input
                  type="checkbox"
                  checked={jevEnabled}
                  onChange={e => setJevEnabled(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: jevEnabled ? '#ea580c' : '#475569',
                  borderRadius: '22px', transition: '.3s'
                }}>
                  <span style={{
                    position: 'absolute', content: '""', height: '16px', width: '16px', left: jevEnabled ? '20px' : '3px', bottom: '3px',
                    backgroundColor: 'white', borderRadius: '50%', transition: '.3s'
                  }} />
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>TypeSafe API Key (Jev 决策密钥)</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type={showTypesafeKey ? 'text' : 'password'}
                  placeholder={serverProviderInfo?.jev?.maskedKey || '输入 sk-typesafe... (不填保留现有Key)'}
                  value={typesafeKey}
                  onChange={e => setTypesafeKey(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.85rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowTypesafeKey(!showTypesafeKey)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.05)', color: 'white', cursor: 'pointer' }}
                >
                  {showTypesafeKey ? '🙈' : '👁️'}
                </button>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
                由 TypeSafe AI 提供的 System One 极速决策引擎，输入 state 直接返回结构化路由与打分。
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
              <button
                type="button"
                onClick={handleTestJev}
                disabled={jevTestStatus?.testing}
                style={{
                  padding: '6px 12px', borderRadius: '6px', border: 'none',
                  background: '#ea580c', color: 'white', fontWeight: 500, fontSize: '0.8rem', cursor: 'pointer'
                }}
              >
                {jevTestStatus?.testing ? '⏳ 测试连通性中...' : '⚡ 诊断 Jev 连通性'}
              </button>
            </div>

            {jevTestStatus && !jevTestStatus.testing && (
              <span style={{ fontSize: '0.8rem', color: jevTestStatus.success ? '#34d399' : '#f87171' }}>
                {jevTestStatus.message}
              </span>
            )}
          </div>

          {/* 🎙️ 语音朗读模式 (TTS Engine) */}
          <div style={{
            background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#a5b4fc' }}>
                🎙️ 语音朗读模式 (TTS Engine)
              </span>
              <span style={{ fontSize: '0.75rem', background: '#6366f1', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>
                {ttsEngine === 'cloud' ? '⚡ 高清原声' : '💻 设备原声'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setTtsEngineState('cloud')}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: '8px',
                  border: ttsEngine === 'cloud' ? '2px solid #6366f1' : '1px solid var(--glass-border)',
                  background: ttsEngine === 'cloud' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(0,0,0,0.2)',
                  color: 'white', fontSize: '0.82rem', fontWeight: ttsEngine === 'cloud' ? 600 : 400,
                  cursor: 'pointer', textAlign: 'center'
                }}
              >
                ⚡ 高清网络原声 (推荐)<br />
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>100% 适配所有机型 · 清晰稳定</span>
              </button>

              <button
                type="button"
                onClick={() => setTtsEngineState('local')}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: '8px',
                  border: ttsEngine === 'local' ? '2px solid #6366f1' : '1px solid var(--glass-border)',
                  background: ttsEngine === 'local' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(0,0,0,0.2)',
                  color: 'white', fontSize: '0.82rem', fontWeight: ttsEngine === 'local' ? 600 : 400,
                  cursor: 'pointer', textAlign: 'center'
                }}
              >
                💻 设备本地朗读<br />
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>0流量 · 依赖手机自带语音包</span>
              </button>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
              推荐使用【高清网络原声】：通过通用高品质音频通道播放，适配包括三星、小米、华为在内的所有手机和平板。
            </span>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                {t('settings.backend_note')}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setUrl('');
                    setToken('');
                    setTestResult({ success: true, message: '已切换为本地电脑服务！点击保存即刻生效。' });
                  }}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                  title="清空地址，直接使用当前电脑的本地服务器"
                >
                  💻 使用本地电脑服务
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUrl('https://ai-tutor-release.onrender.com');
                    setTestResult({ success: true, message: '已填入官方云端服务地址！请填入管理员分配的访问令牌后保存。' });
                  }}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#60a5fa',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  🔄 填入官方云端地址
                </button>
              </div>
            </div>
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

          {/* 🔄 应用版本与自动更新 */}
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📱</span>
                <span>应用版本与更新状态</span>
              </span>
              <span style={{ fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.2)', color: '#c7d2fe', padding: '2px 8px', borderRadius: '12px' }}>
                v1.3.1 (Build 2026.09.21)
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.4 }}>
              {typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()
                ? '当前运行于 Android 原生安装包 (APK)。最新 v1.3.1 已内置全机型通用的高保真独立语音通道与秒级朗读。'
                : '当前运行于 Web PWA 渐进式应用，已开启 Service Worker 自动热更新 (无感知后台静默升级)。'}
            </p>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={updateCheckStatus?.checking}
                style={{
                  flex: 1, minWidth: '120px', padding: '7px 12px', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.4)',
                  background: 'rgba(99, 102, 241, 0.2)', color: '#e0e7ff', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer'
                }}
              >
                {updateCheckStatus?.checking ? '⏳ 正在检测...' : '🔄 检查最新更新'}
              </button>
              <button
                type="button"
                onClick={handleHardRefresh}
                style={{
                  padding: '7px 12px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)',
                  background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: '0.8rem', cursor: 'pointer'
                }}
                title="清除离线缓存与陈旧 ServiceWorker 并强制重新载入"
              >
                🧹 清除缓存强刷
              </button>
              <a
                href="https://github.com/Zenglian990/AI_Tutor_Release/releases/download/v1.3.1/ZengLian_AI_Tutor_v1.3.1.apk"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  padding: '7px 12px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.5)',
                  background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', fontSize: '0.8rem', textDecoration: 'none', fontWeight: 500
                }}
              >
                📥 下载最新 v1.3.1 APK
              </a>
            </div>

            {updateCheckStatus && (
              <span style={{ fontSize: '0.75rem', color: updateCheckStatus.success ? '#34d399' : '#f87171' }}>
                {updateCheckStatus.message}
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
