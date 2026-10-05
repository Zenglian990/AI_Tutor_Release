import React, { useState, useEffect } from 'react';
import { useAppStore, getApiUrl, authFetch, getApiToken, DEFAULT_API_TOKEN } from '../store/useStore';
import { encryptData, decryptData } from '../utils/crypto_helper';

const EDITIONS = [
  { value: '人教版', label: '📖 人民教育出版社 (人教版 - 推荐)' },
  { value: '北师大版', label: '📖 北京师范大学出版社 (北师大版)' },
  { value: '苏教版', label: '📖 江苏凤凰教育出版社 (苏教版)' },
  { value: '华东师大版', label: '📖 华东师范大学出版社 (华东师大版)' },
  { value: '沪教版', label: '📖 上海教育出版社 (沪教版)' },
  { value: '鲁教版', label: '📖 山东教育出版社 (鲁教版)' },
  { value: '冀教版', label: '📖 河北教育出版社 (冀教版)' },
  { value: '仁爱版', label: '📖 仁爱教育版 (英语专版)' },
];

const PERSONAS = [
  {
    id: 'owl',
    name: '🦉 智多星老师',
    tag: '逻辑推导 · 独立思考',
    desc: '擅长苏格拉底式连续发问，步步拆解题目骨架，引导孩子自主得出答案，培养严密逻辑。'
  },
  {
    id: 'lion',
    name: '🦁 聪聪狮老师',
    tag: '生动趣味 · 耐心鼓励',
    desc: '语言风趣生动，擅长用生活实物做比喻，耐心肯定孩子的每一步尝试，推荐 1-4 低年级使用。'
  },
  {
    id: 'sister',
    name: '🌸 晓晴姐',
    tag: '温柔细腻 · 错题心理疏导',
    desc: '温柔亲切的大姐姐风格，像在草稿纸上并肩验算，善于帮孩子缓解做错题时的焦虑与沮丧。'
  }
];

export default function SettingsModal({
  isOpen,
  onClose,
  socraticLevel,
  onSocraticToggle,
  autoRead,
  onAutoReadToggle,
  currentProfileId,
  currentProfileEdition,
  onEditionChange,
  backendUrl: propBackendUrl,
  onSaveBackendUrl,
  apiToken: propApiToken,
  onSaveApiToken
}) {
  const {
    language,
    setLanguage,
    t,
    isEinkMode,
    toggleEinkMode,
    tutorPersona,
    setTutorPersona,
    currentProfile,
    chatModel,
    setChatModel,
    backendUrl: storeBackendUrl,
    setBackendUrl: storeSetBackendUrl,
    apiToken: storeApiToken,
    setApiToken: storeSetApiToken
  } = useAppStore();

  const [activeTab, setActiveTab] = useState('preferences'); // 'preferences' | 'ai_keys'
  const [ttsEngine, setTtsEngine] = useState(() => localStorage.getItem('tts_engine') || 'local');
  const [selectedEdition, setSelectedEdition] = useState(currentProfileEdition || '人教版');
  const [saveToast, setSaveToast] = useState(false);

  // AI Keys & Tokens state
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('ai_tutor_gemini_key') || '');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiTestStatus, setGeminiTestStatus] = useState(null);

  const [deepseekKey, setDeepseekKey] = useState(() => localStorage.getItem('ai_tutor_deepseek_key') || '');
  const [deepseekUrl, setDeepseekUrl] = useState(() => localStorage.getItem('ai_tutor_deepseek_url') || 'https://api.deepseek.com/v1');
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [deepseekTestStatus, setDeepseekTestStatus] = useState(null);

  const [localApiToken, setLocalApiToken] = useState(() => {
    return propApiToken || getApiToken() || '';
  });
  const [showApiToken, setShowApiToken] = useState(false);

  const [localBackendUrl, setLocalBackendUrl] = useState(() => {
    return propBackendUrl !== undefined ? propBackendUrl : (localStorage.getItem('ai_tutor_backend_url') || '');
  });
  const [serverHealthStatus, setServerHealthStatus] = useState(null);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedEdition(currentProfileEdition || '人教版');
      setTtsEngine(localStorage.getItem('tts_engine') || 'local');
      setGeminiKey(localStorage.getItem('ai_tutor_gemini_key') || '');
      setDeepseekKey(localStorage.getItem('ai_tutor_deepseek_key') || '');
      setDeepseekUrl(localStorage.getItem('ai_tutor_deepseek_url') || 'https://api.deepseek.com/v1');
      setLocalApiToken(propApiToken || getApiToken() || '');
      setLocalBackendUrl(propBackendUrl !== undefined ? propBackendUrl : (localStorage.getItem('ai_tutor_backend_url') || ''));
      setGeminiTestStatus(null);
      setDeepseekTestStatus(null);
      setServerHealthStatus(null);
    }
  }, [isOpen, currentProfileEdition, propApiToken, propBackendUrl]);

  if (!isOpen) return null;

  // Diagnostic Test Handlers
  const handleTestGemini = async () => {
    setGeminiTestStatus({ testing: true });
    try {
      const tokenToUse = (localApiToken.trim() || getApiToken() || DEFAULT_API_TOKEN).trim();
      const headers = { 'Content-Type': 'application/json' };
      if (tokenToUse) {
        headers['Authorization'] = `Bearer ${tokenToUse}`;
      }

      const res = await authFetch('/api/config/test-llm', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider: 'gemini',
          apiKey: geminiKey.trim() || undefined,
          model: 'gemini-2.5-flash'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (geminiKey.trim()) localStorage.setItem('ai_tutor_gemini_key', geminiKey.trim());
        setGeminiTestStatus({ testing: false, success: true, message: `⚡ ${data.message || 'Gemini 连通正常！'} (响应: ${data.latencyMs}ms)` });
      } else {
        const detailText = data.details ? ` (${data.details})` : '';
        setGeminiTestStatus({ testing: false, success: false, message: `❌ 失败: ${data.error || '连通失败'}${detailText}` });
      }
    } catch (e) {
      setGeminiTestStatus({ testing: false, success: false, message: '❌ 网络异常: ' + e.message });
    }
  };

  const handleTestDeepSeek = async () => {
    setDeepseekTestStatus({ testing: true });
    try {
      const tokenToUse = (localApiToken.trim() || getApiToken() || DEFAULT_API_TOKEN).trim();
      const headers = { 'Content-Type': 'application/json' };
      if (tokenToUse) {
        headers['Authorization'] = `Bearer ${tokenToUse}`;
      }

      const res = await authFetch('/api/config/test-llm', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider: 'deepseek',
          apiKey: deepseekKey.trim() || undefined,
          apiUrl: deepseekUrl.trim() || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (deepseekKey.trim()) localStorage.setItem('ai_tutor_deepseek_key', deepseekKey.trim());
        if (deepseekUrl.trim()) localStorage.setItem('ai_tutor_deepseek_url', deepseekUrl.trim());
        setDeepseekTestStatus({ testing: false, success: true, message: `⚡ ${data.message || 'DeepSeek 连通正常！'} (响应: ${data.latencyMs}ms)` });
      } else {
        const detailText = data.details ? ` (${data.details})` : '';
        setDeepseekTestStatus({ testing: false, success: false, message: `❌ 失败: ${data.error || '连通失败'}${detailText}` });
      }
    } catch (e) {
      setDeepseekTestStatus({ testing: false, success: false, message: '❌ 网络异常: ' + e.message });
    }
  };

  const handleTestServer = async () => {
    setServerHealthStatus({ testing: true });
    try {
      const targetBase = (localBackendUrl.trim() || getApiUrl()).replace(/\/+$/, '');
      const healthRes = await fetch(`${targetBase}/api/health`);
      if (!healthRes.ok) {
        setServerHealthStatus({ testing: false, success: false, message: `🔴 后端无响应: HTTP ${healthRes.status}` });
        return;
      }

      const currentToken = (localApiToken.trim() || getApiToken() || DEFAULT_API_TOKEN).trim();
      if (!currentToken) {
        setServerHealthStatus({ testing: false, success: true, message: `🟡 服务器在线，但未填写访问令牌` });
        return;
      }

      const authCheckRes = await fetch(`${targetBase}/api/mistakes?profile_id=default`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });

      if (authCheckRes.ok) {
        setServerHealthStatus({ testing: false, success: true, message: `🟢 后端服务在线，访问令牌校验通过！` });
      } else if (authCheckRes.status === 403 || authCheckRes.status === 401) {
        setServerHealthStatus({ testing: false, success: false, message: `🔴 服务器在线，但访问令牌无效 (403)` });
      } else {
        setServerHealthStatus({ testing: false, success: false, message: `🟡 鉴权接口响应状态: ${authCheckRes.status}` });
      }
    } catch (e) {
      setServerHealthStatus({ testing: false, success: false, message: '🔴 无法连接服务器: ' + e.message });
    }
  };

  const handleResetToken = () => {
    setLocalApiToken(DEFAULT_API_TOKEN);
  };

  const handleSave = () => {
    // 1. Textbook edition
    if (onEditionChange && selectedEdition !== currentProfileEdition) {
      onEditionChange(selectedEdition);
    }

    // 2. TTS engine
    localStorage.setItem('tts_engine', ttsEngine);

    // 3. Chat model
    localStorage.setItem('ai_tutor_chat_model', chatModel);
    if (setChatModel) setChatModel(chatModel);

    // 4. Gemini Key
    const trimmedGemini = geminiKey.trim();
    if (trimmedGemini) {
      localStorage.setItem('ai_tutor_gemini_key', trimmedGemini);
    } else {
      localStorage.removeItem('ai_tutor_gemini_key');
    }

    // 5. DeepSeek Key & URL
    const trimmedDeepseekKey = deepseekKey.trim();
    if (trimmedDeepseekKey) {
      localStorage.setItem('ai_tutor_deepseek_key', trimmedDeepseekKey);
    } else {
      localStorage.removeItem('ai_tutor_deepseek_key');
    }

    const trimmedDeepseekUrl = deepseekUrl.trim();
    if (trimmedDeepseekUrl) {
      localStorage.setItem('ai_tutor_deepseek_url', trimmedDeepseekUrl);
    }

    // 6. API Token
    const trimmedToken = localApiToken.trim();
    if (trimmedToken) {
      localStorage.setItem('ai_tutor_api_token', encryptData(trimmedToken));
      if (storeSetApiToken) storeSetApiToken(trimmedToken);
      if (onSaveApiToken) onSaveApiToken(trimmedToken);
    } else {
      localStorage.removeItem('ai_tutor_api_token');
      if (storeSetApiToken) storeSetApiToken('');
      if (onSaveApiToken) onSaveApiToken('');
    }

    // 7. Backend URL
    const trimmedBackendUrl = localBackendUrl.trim();
    if (trimmedBackendUrl) {
      localStorage.setItem('ai_tutor_backend_url', trimmedBackendUrl);
      if (storeSetBackendUrl) storeSetBackendUrl(trimmedBackendUrl);
      if (onSaveBackendUrl) onSaveBackendUrl(trimmedBackendUrl);
    } else {
      localStorage.removeItem('ai_tutor_backend_url');
      if (storeSetBackendUrl) storeSetBackendUrl('');
      if (onSaveBackendUrl) onSaveBackendUrl('');
    }

    setSaveToast(true);
    setTimeout(() => {
      setSaveToast(false);
      onClose();
    }, 600);
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        height: '100dvh',
        background: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 99999,
        padding: '12px 14px',
        paddingBottom: 'max(env(safe-area-inset-bottom, 24px), 36px)',
        boxSizing: 'border-box'
      }}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: '640px',
          width: '95%',
          maxHeight: 'calc(100dvh - max(env(safe-area-inset-bottom, 24px), 36px) - 40px)',
          display: 'flex',
          flexDirection: 'column',
          padding: '0',
          borderRadius: '20px',
          overflow: 'hidden',
          background: 'var(--bg-secondary, #1e293b)',
          color: 'var(--text-primary, #f8fafc)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxSizing: 'border-box'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.03)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>⚙️</span>
            <div>
              <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 700 }}>系统与偏好设置</h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                学习大纲、AI 模型驱动与系统访问凭证
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.25)',
            padding: '0 16px'
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('preferences')}
            style={{
              padding: '12px 18px',
              border: 'none',
              background: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              color: activeTab === 'preferences' ? '#38bdf8' : '#94a3b8',
              borderBottom: activeTab === 'preferences' ? '2.5px solid #38bdf8' : '2.5px solid transparent',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📚 学习与偏好设置</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai_keys')}
            style={{
              padding: '12px 18px',
              border: 'none',
              background: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              color: activeTab === 'ai_keys' ? '#c084fc' : '#94a3b8',
              borderBottom: activeTab === 'ai_keys' ? '2.5px solid #a855f7' : '2.5px solid transparent',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>🤖 AI模型与系统密钥</span>
            <span
              style={{
                fontSize: '0.7rem',
                background: 'rgba(168, 85, 247, 0.2)',
                color: '#c084fc',
                padding: '1px 6px',
                borderRadius: '8px',
                fontWeight: 600
              }}
            >
              核心配置
            </span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* ============================================================== */}
          {/* TAB 1: 学习与偏好设置 */}
          {/* ============================================================== */}
          {activeTab === 'preferences' && (
            <>
              {/* Section 1: 教材版本 */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '8px', color: '#60a5fa' }}>
                  📚 当前教材版本 ({currentProfile?.name || '当前档案'})
                </label>
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 10px' }}>
                  根据所在学校选择课本版本，智能问答将精准对齐该版本的单元章节与知识点大纲。
                </p>
                <select
                  value={selectedEdition}
                  onChange={(e) => setSelectedEdition(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: 'white',
                    fontSize: '0.95rem',
                    outline: 'none'
                  }}
                >
                  {EDITIONS.map(ed => (
                    <option key={ed.value} value={ed.value} style={{ background: '#1e293b', color: 'white' }}>
                      {ed.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Section 2: AI 问答对话大模型引擎 */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.95rem', color: '#38bdf8' }}>
                    🚀 AI 问答对话大模型引擎
                  </label>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                    自主切换 · 严格执行
                  </span>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 12px' }}>
                  根据网络环境与辅导偏好自由切换驱动大模型，系统将严格调用所选引擎：
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* DeepSeek V3 */}
                  <div
                    onClick={() => setChatModel('deepseek-chat')}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: (chatModel === 'deepseek-chat') ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: (chatModel === 'deepseek-chat') ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <input
                      type="radio"
                      name="chatModelOption"
                      checked={chatModel === 'deepseek-chat'}
                      onChange={() => setChatModel('deepseek-chat')}
                      style={{ marginTop: '4px', accentColor: '#38bdf8' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '0.95rem', color: (chatModel === 'deepseek-chat') ? '#38bdf8' : '#f8fafc' }}>
                          ⚡ DeepSeek-V3（极速模式 · 国内直连推荐）
                        </strong>
                        <span style={{ fontSize: '0.7rem', background: '#0284c7', color: 'white', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          毫秒极速
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>
                        国内毫秒级首字吐出，打字机超高速流式输出！中文自然语言辅导与数理逻辑极强，告别卡顿与延迟。
                      </p>
                    </div>
                  </div>

                  {/* Gemini 2.5 Flash */}
                  <div
                    onClick={() => setChatModel('gemini-2.5-flash')}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: (chatModel === 'gemini-2.5-flash') ? '1.5px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: (chatModel === 'gemini-2.5-flash') ? 'rgba(168, 85, 247, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <input
                      type="radio"
                      name="chatModelOption"
                      checked={chatModel === 'gemini-2.5-flash'}
                      onChange={() => setChatModel('gemini-2.5-flash')}
                      style={{ marginTop: '4px', accentColor: '#a855f7' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '0.95rem', color: (chatModel === 'gemini-2.5-flash') ? '#c084fc' : '#f8fafc' }}>
                          🧠 Google Gemini 2.5 Flash（官方大模型 · 多模态图文）
                        </strong>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>
                        谷歌官方大模型，已关闭长思考延迟直接极速出字，擅长复杂几何图形感知与课本全册跨学科检索。
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: AI 名师形象 */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '10px', color: '#a78bfa' }}>
                  🦉 专属伴学名师形象
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {PERSONAS.map(p => {
                    const isSelected = (tutorPersona || 'owl') === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => setTutorPersona(p.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          padding: '12px 14px',
                          borderRadius: '12px',
                          border: isSelected ? '1.5px solid #a78bfa' : '1px solid rgba(255, 255, 255, 0.08)',
                          background: isSelected ? 'rgba(167, 139, 250, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <input
                          type="radio"
                          name="tutorPersona"
                          checked={isSelected}
                          onChange={() => setTutorPersona(p.id)}
                          style={{ marginTop: '4px', accentColor: '#a78bfa' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <strong style={{ fontSize: '0.95rem', color: isSelected ? '#c4b5fd' : '#f8fafc' }}>{p.name}</strong>
                            <span style={{ fontSize: '0.72rem', background: 'rgba(255, 255, 255, 0.08)', padding: '1px 6px', borderRadius: '6px', color: '#94a3b8' }}>
                              {p.tag}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>
                            {p.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 4: 语音朗读与引擎 */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '12px', color: '#34d399' }}>
                  🔊 语音朗读偏好
                </label>
                
                {/* 自动语音朗读 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>回答完成后自动语音朗读</div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>名师解答生成完毕后，自动出声朗读解题思路</div>
                  </div>
                  <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
                    <input
                      type="checkbox"
                      checked={!!autoRead}
                      onChange={onAutoReadToggle}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span
                      style={{
                        position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                        background: autoRead ? '#10b981' : 'rgba(255, 255, 255, 0.2)',
                        borderRadius: '24px', transition: '.3s'
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute', content: '""', height: '18px', width: '18px', left: autoRead ? '22px' : '3px',
                          bottom: '3px', background: 'white', borderRadius: '50%', transition: '.3s'
                        }}
                      />
                    </span>
                  </label>
                </div>

                {/* 朗读引擎选择 */}
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: '8px' }}>发音音色引擎</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setTtsEngine('local')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: ttsEngine === 'local' ? '1.5px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: ttsEngine === 'local' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        color: ttsEngine === 'local' ? '#34d399' : '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: ttsEngine === 'local' ? 600 : 400
                      }}
                    >
                      ⚡ 本地原声 (0秒即读)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTtsEngine('cloud')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: ttsEngine === 'cloud' ? '1.5px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: ttsEngine === 'cloud' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        color: ttsEngine === 'cloud' ? '#34d399' : '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: ttsEngine === 'cloud' ? 600 : 400
                      }}
                    >
                      🎙️ 云端高清名师原声
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 5: 默认教学模式 */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '8px', color: '#fbbf24' }}>
                  💡 教学启发模式偏好
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { key: 'guided', label: '🤔 启发式', desc: '给思路不透题' },
                    { key: 'strict', label: '🦉 提问式', desc: '纯苏氏发问' },
                    { key: 'direct', label: '💡 直接解析', desc: '全步骤透析' },
                  ].map(m => {
                    const isSelected = (socraticLevel || 'guided') === m.key;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => onSocraticToggle && onSocraticToggle(m.key)}
                        style={{
                          padding: '10px 8px',
                          borderRadius: '10px',
                          border: isSelected ? '1.5px solid #fbbf24' : '1px solid rgba(255, 255, 255, 0.08)',
                          background: isSelected ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                          color: isSelected ? '#fbbf24' : '#94a3b8',
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{m.label}</div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.8, marginTop: '2px' }}>{m.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 6: 界面语言与护眼模式 */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', marginBottom: '12px', color: '#38bdf8' }}>
                  🌐 语言与视力健康
                </label>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>纸质墨水屏护眼模式</div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>无频闪高对比度黑白纸质排版，保护中小学生视力</div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleEinkMode}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '12px',
                      border: isEinkMode ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.15)',
                      background: isEinkMode ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      color: isEinkMode ? '#38bdf8' : '#cbd5e1',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.85rem'
                    }}
                  >
                    {isEinkMode ? '✅ 墨水屏生效中' : '点击开启护眼'}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '10px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>界面语言</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setLanguage('zh-CN')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '8px',
                        border: language === 'zh-CN' ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                        background: language === 'zh-CN' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        color: language === 'zh-CN' ? '#38bdf8' : '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '0.82rem'
                      }}
                    >
                      中文
                    </button>
                    <button
                      type="button"
                      onClick={() => setLanguage('en')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '8px',
                        border: language === 'en' ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                        background: language === 'en' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        color: language === 'en' ? '#38bdf8' : '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '0.82rem'
                      }}
                    >
                      English
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ============================================================== */}
          {/* TAB 2: AI模型与系统密钥 */}
          {/* ============================================================== */}
          {activeTab === 'ai_keys' && (
            <>
              {/* Informative Banner */}
              <div
                style={{
                  background: 'rgba(168, 85, 247, 0.08)',
                  border: '1px solid rgba(168, 85, 247, 0.25)',
                  padding: '14px 16px',
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}
              >
                <span style={{ fontSize: '1.4rem', marginTop: '-2px' }}>🔑</span>
                <div style={{ fontSize: '0.82rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                  <strong style={{ color: '#c084fc' }}>大模型密钥与系统通信令牌配置中心</strong>
                  <div style={{ color: '#94a3b8', marginTop: '2px' }}>
                    在此配置的模型密钥与访问令牌在本地安全加密保存，并在智能问答、拍照解题和试卷分析中立即生效。留空时将自动使用云端默认官方密钥。
                  </div>
                </div>
              </div>

              {/* Card 1: Google Gemini API 密钥 */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  padding: '16px',
                  borderRadius: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.95rem', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🤖 Google Gemini API 密钥</span>
                  </label>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(192, 132, 252, 0.15)', color: '#c084fc', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                    多模态解题 · 语音转录
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 10px', lineHeight: 1.4 }}>
                  用于课本试卷拍照识别、麦克风语音转录与全科苏格拉底名师辅导。留空将使用云端已配置的官方 Key。
                </p>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="输入 Google Gemini API Key (如 AIzaSy...)"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                      fontFamily: 'monospace',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: '#cbd5e1',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {showGeminiKey ? '隐藏' : '显示'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTestGemini}
                    disabled={geminiTestStatus?.testing}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                      color: '#ffffff',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: geminiTestStatus?.testing ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {geminiTestStatus?.testing ? '测速中...' : '⚡ 诊断 Gemini'}
                  </button>
                </div>

                {geminiTestStatus?.message && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      background: geminiTestStatus.success ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: geminiTestStatus.success ? '#4ade80' : '#f87171',
                      border: geminiTestStatus.success ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
                    }}
                  >
                    {geminiTestStatus.message}
                  </div>
                )}
              </div>

              {/* Card 2: DeepSeek API 密钥与端点 */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  padding: '16px',
                  borderRadius: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.95rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🧠 DeepSeek API 密钥与服务端点</span>
                  </label>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                    国内免翻墙 · 毫秒级推理
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 10px', lineHeight: 1.4 }}>
                  支持 deepseek-chat 及 deepseek-reasoner (R1) 深度数理推导。留空将使用云端已配置的官方 Key。
                </p>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <input
                    type={showDeepseekKey ? 'text' : 'password'}
                    value={deepseekKey}
                    onChange={(e) => setDeepseekKey(e.target.value)}
                    placeholder="输入 DeepSeek API Key (如 sk-...)"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                      fontFamily: 'monospace',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeepseekKey(!showDeepseekKey)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: '#cbd5e1',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {showDeepseekKey ? '隐藏' : '显示'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTestDeepSeek}
                    disabled={deepseekTestStatus?.testing}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                      color: '#ffffff',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: deepseekTestStatus?.testing ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {deepseekTestStatus?.testing ? '测速中...' : '⚡ 诊断 DeepSeek'}
                  </button>
                </div>

                <input
                  type="text"
                  value={deepseekUrl}
                  onChange={(e) => setDeepseekUrl(e.target.value)}
                  placeholder="DeepSeek API 接口地址 (默认: https://api.deepseek.com/v1)"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                    fontSize: '0.82rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />

                {deepseekTestStatus?.message && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      background: deepseekTestStatus.success ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: deepseekTestStatus.success ? '#4ade80' : '#f87171',
                      border: deepseekTestStatus.success ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
                    }}
                  >
                    {deepseekTestStatus.message}
                  </div>
                )}
              </div>

              {/* Card 3: 系统访问令牌 (API Token) */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  padding: '16px',
                  borderRadius: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.95rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔑 系统通信访问令牌 (API Token)</span>
                  </label>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                    安全通信鉴权
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 10px', lineHeight: 1.4 }}>
                  保障学生端与后端 API 安全通信的身份凭据。留空或点击右侧按钮可填入出厂官方标准令牌。
                </p>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type={showApiToken ? 'text' : 'password'}
                    value={localApiToken}
                    onChange={(e) => setLocalApiToken(e.target.value)}
                    placeholder="API Token (如: ait_...)"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                      fontFamily: 'monospace',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiToken(!showApiToken)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: '#cbd5e1',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {showApiToken ? '隐藏' : '显示'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetToken}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#34d399',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                    title="填入系统出厂官方标准令牌"
                  >
                    🔑 填入官方标准
                  </button>
                </div>
              </div>

              {/* Card 4: 后端服务连接地址 (Backend URL) */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  padding: '16px',
                  borderRadius: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🌐 后端服务地址 (Backend URL)</span>
                  </label>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                    服务器与云端
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 10px', lineHeight: 1.4 }}>
                  留空默认为当前同源相对路径；打包为原生移动端 App 或跨域局域网时，可填写云端 Render 或内网 IP 地址。
                </p>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={localBackendUrl}
                    onChange={(e) => setLocalBackendUrl(e.target.value)}
                    placeholder="如: https://ai-tutor-release.onrender.com (留空为同源)"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                      fontFamily: 'monospace',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleTestServer}
                    disabled={serverHealthStatus?.testing}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #d97706, #b45309)',
                      color: '#ffffff',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: serverHealthStatus?.testing ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {serverHealthStatus?.testing ? '检测中...' : '🔍 诊断连接与鉴权'}
                  </button>
                </div>

                {serverHealthStatus?.message && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      background: serverHealthStatus.success ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: serverHealthStatus.success ? '#4ade80' : '#f87171',
                      border: serverHealthStatus.success ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
                    }}
                  >
                    {serverHealthStatus.message}
                  </div>
                )}
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.95)',
            flexShrink: 0,
            gap: '10px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>曾练专属私教 v1.5.5</span>
            <span style={{ opacity: 0.7 }}>· 人教版全科</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: 'auto' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#cbd5e1',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
                touchAction: 'manipulation',
                minHeight: '42px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                padding: '9px 24px',
                borderRadius: '10px',
                border: 'none',
                background: saveToast ? '#10b981' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                color: 'white',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: saveToast ? '0 0 15px rgba(16, 185, 129, 0.5)' : '0 4px 12px rgba(59, 130, 246, 0.3)',
                touchAction: 'manipulation',
                minHeight: '42px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {saveToast ? '✅ 已保存生效' : '💾 保存并应用设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
