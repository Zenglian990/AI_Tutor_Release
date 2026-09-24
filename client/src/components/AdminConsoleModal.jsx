import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import { useAppStore, getApiUrl, authFetch } from '../store/useStore';
import { decryptData } from '../utils/crypto_helper';
import { ZENG_WECHAT_QR_DATA_URL } from '../assets/zeng_wechat_qr_base64.js';
import ParentalGate from './ParentalGate';

const MASTER_PIN_HASH = '92925488b28ab12584ac8fcaa8a27a0f497b2c62940c8f4fbc8ef19ebc87c43e';

function getAdminPinHash() {
  const sessionHash = sessionStorage.getItem('parent_gate_verified_pin_hash');
  if (sessionHash) return sessionHash;
  try {
    const localHash = localStorage.getItem('parent_gate_pin_hash_v2');
    if (localHash) {
      const dec = decryptData(localHash);
      if (dec) return dec;
    }
  } catch (_) {}
  return MASTER_PIN_HASH;
}

function getAdminAuthHeaders() {
  const pinHash = getAdminPinHash();
  return {
    'Content-Type': 'application/json',
    'x-parent-pin-hash': pinHash
  };
}

const loadAnyImage = (src) => new Promise((resolve) => {
  if (!src) return resolve(null);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
  if (img.complete && img.naturalWidth > 0) resolve(img);
});

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }
}

export default function AdminConsoleModal({
  isOpen,
  onClose,
  backendUrl,
  onSaveBackendUrl,
  apiToken,
  onSaveApiToken
}) {
  const { currentProfile, settings, setSettings, chatModel } = useAppStore();
  const [activeTab, setActiveTab] = useState('poster'); // 'poster' | 'cards' | 'ai_keys' | 'security'

  // -------------------------------------------------------------
  // Tab 1: 营销获客海报 (搞钱裂变)
  // -------------------------------------------------------------
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [posterTemplate, setPosterTemplate] = useState('primary');
  const [posterQrType, setPosterQrType] = useState(() => localStorage.getItem('parent_poster_qr_type') || 'custom_image');
  const [customQrImage, setCustomQrImage] = useState(() => localStorage.getItem('parent_poster_custom_qr_img') || ZENG_WECHAT_QR_DATA_URL);
  const [targetUrl, setTargetUrl] = useState(() => localStorage.getItem('parent_poster_target_url') || '');
  const [posterContactName, setPosterContactName] = useState(() => localStorage.getItem('parent_poster_contact_name') || '私教微信：扫码添加曾先生');
  const [posterSaving, setPosterSaving] = useState(false);

  const drawPoster = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = 540;
    const height = 960;
    canvas.width = width;
    canvas.height = height;

    // 1. Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    if (posterTemplate === 'primary') {
      bgGrad.addColorStop(0, '#fef3c7');
      bgGrad.addColorStop(0.4, '#fffbeb');
      bgGrad.addColorStop(1, '#fed7aa');
    } else {
      bgGrad.addColorStop(0, '#0f172a');
      bgGrad.addColorStop(0.5, '#1e1b4b');
      bgGrad.addColorStop(1, '#312e81');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Top Header Brand
    ctx.save();
    ctx.fillStyle = posterTemplate === 'primary' ? '#78350f' : '#38bdf8';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('曾先生智慧私教 · 1-9年级AI深度辅导', width / 2, 55);

    ctx.fillStyle = posterTemplate === 'primary' ? '#92400e' : '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('国家教材知识图谱 · 苏格拉底启发引导 · 39,114+真题密卷', width / 2, 85);
    ctx.restore();

    // 3. Central Card
    ctx.save();
    drawRoundedRect(ctx, 36, 120, width - 72, 600, 20);
    ctx.fillStyle = posterTemplate === 'primary' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(30, 41, 59, 0.95)';
    ctx.fill();
    ctx.strokeStyle = posterTemplate === 'primary' ? '#f59e0b' : '#6366f1';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();

    if (posterTemplate === 'primary') {
      ctx.fillStyle = '#b45309';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('告别辅导作业“鸡飞狗跳”', width / 2, 175);

      ctx.fillStyle = '#d97706';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('从扳手指到十进制具象积木', width / 2, 215);

      ctx.fillStyle = '#334155';
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'left';
      const lines = [
        `🎒 宝贝【${currentProfile?.name || '曾练'}】今日自主探究打卡`,
        '✨ 动态实物积木 + 苹果糖果均分具象化',
        '⚖️ 物理天平模型，秒懂等式守恒原理',
        '🦁 聪聪小狮子导师，兴趣式趣味闯关激励',
        '📝 电子草稿纸 + 智能消除涂改字迹',
        '🖨️ 一键抹除红墨水笔迹，翻新空白卷重做'
      ];
      lines.forEach((line, idx) => {
        ctx.fillText(line, 66, 275 + idx * 45);
      });

      // Highlight Box
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(66, 560, width - 132, 120);
      ctx.strokeStyle = '#fde68a';
      ctx.strokeRect(66, 560, width - 132, 120);

      ctx.fillStyle = '#92400e';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔥 家长好评率 99.2%: 孩子主动想学了！', width / 2, 605);
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#b45309';
      ctx.fillText('纯离线端侧推理兜底，无需盯梢，培养终身自学习惯', width / 2, 645);
    } else {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('中考压轴 20 分 · 冲刺逆袭特训', width / 2, 175);

      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('秒杀动点几何与二次函数综合题', width / 2, 215);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'left';
      const lines = [
        `📐 学员【${currentProfile?.name || '曾练'}】今日压轴沙盘攻坚`,
        '💡 动点拖拽可视化轨迹，参数突变一目了然',
        '🦉 苏格拉底反问链：绝不直接给答案，逼出思路',
        '🎯 39,114 道全国百强名校密卷分类母题精析',
        '🖨️ 局域网 A4 打印机一键出卷，真实考场模拟',
        '📊 错题自动归入艾宾浩斯抗遗忘记忆曲线'
      ];
      lines.forEach((line, idx) => {
        ctx.fillText(line, 66, 275 + idx * 45);
      });

      // Highlight Box
      ctx.fillStyle = 'rgba(51, 65, 85, 0.6)';
      ctx.fillRect(66, 560, width - 132, 120);
      ctx.strokeStyle = '#475569';
      ctx.strokeRect(66, 560, width - 132, 120);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚀 提分见证：从不及格到单科 110+ 逆袭', width / 2, 605);
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('用名师启发式思维替代死记硬背，做一道题通一类题', width / 2, 645);
    }
    ctx.restore();

    // 4. Bottom Footer & QR Box
    ctx.save();
    drawRoundedRect(ctx, 36, 750, width - 72, 175, 18);
    ctx.fillStyle = posterTemplate === 'primary' ? '#ffffff' : '#1e293b';
    ctx.fill();
    ctx.strokeStyle = posterTemplate === 'primary' ? '#fde68a' : '#334155';
    ctx.stroke();
    ctx.beginPath();

    let qrImageSrc = customQrImage;
    if (posterQrType === 'url') {
      try {
        qrImageSrc = await QRCode.toDataURL(targetUrl || window.location.origin, {
          margin: 1,
          width: 140,
          color: { dark: '#000000', light: '#ffffff' }
        });
      } catch (err) {}
    }

    const qrImg = await loadAnyImage(qrImageSrc);
    if (qrImg) {
      ctx.drawImage(qrImg, 56, 768, 140, 140);
    }

    ctx.fillStyle = posterTemplate === 'primary' ? '#1e293b' : '#f8fafc';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('微信扫码添加私教', 215, 805);

    ctx.fillStyle = posterTemplate === 'primary' ? '#d97706' : '#38bdf8';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('送 7 天名校全真模考体验', 215, 835);

    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.fillText('全国 1-9 年级教材同步深度辅导', 215, 862);

    ctx.fillStyle = posterTemplate === 'primary' ? '#78350f' : '#cbd5e1';
    ctx.font = '12px sans-serif';
    ctx.fillText(posterContactName, 215, 890);
    ctx.restore();
  }, [posterTemplate, posterQrType, customQrImage, targetUrl, posterContactName, currentProfile]);

  useEffect(() => {
    if (isOpen && activeTab === 'poster') {
      drawPoster();
    }
  }, [isOpen, activeTab, drawPoster]);

  const handleSavePoster = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPosterSaving(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `曾先生私教获客海报_${posterTemplate === 'primary' ? '小学版' : '初中版'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      alert('保存海报失败：' + e.message);
    } finally {
      setPosterSaving(false);
    }
  };

  const handleQrUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setCustomQrImage(dataUrl);
      setPosterQrType('custom_image');
      localStorage.setItem('parent_poster_custom_qr_img', dataUrl);
      localStorage.setItem('parent_poster_qr_type', 'custom_image');
    };
    reader.readAsDataURL(file);
  };

  // -------------------------------------------------------------
  // Tab 2: 批量发卡后台 (搞钱变现)
  // -------------------------------------------------------------
  const [genCount, setGenCount] = useState(5);
  const [genDays, setGenDays] = useState(30);
  const [genBatch, setGenBatch] = useState('微信社群/小红书学员精选');
  const [generating, setGenerating] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState([]);
  const [cardsMsg, setCardsMsg] = useState({ type: '', text: '' });
  const [copySuccess, setCopySuccess] = useState(false);

  const handleGenerateKeys = async () => {
    setGenerating(true);
    setCardsMsg({ type: '', text: '' });
    try {
      const pinHash = getAdminPinHash();
      const res = await authFetch('/api/membership/admin/generate-keys', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          count: genCount,
          days: genDays,
          batch_name: genBatch,
          pin_hash: pinHash
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setGeneratedKeys(data.keys || []);
        setCardsMsg({ type: 'success', text: `🎉 成功生成 ${data.count} 张 ${data.days} 天 VIP 卡密！` });
      } else {
        setCardsMsg({ type: 'error', text: data.error || '生成失败，请确认管理员权限有效' });
      }
    } catch (err) {
      setCardsMsg({ type: 'error', text: '请求失败：' + err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyAllKeys = () => {
    if (generatedKeys.length === 0) return;
    navigator.clipboard.writeText(generatedKeys.join('\n')).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    });
  };

  // -------------------------------------------------------------
  // Tab 3: AI 决策与模型密钥配置
  // -------------------------------------------------------------
  const [url, setUrl] = useState(backendUrl || '');
  const [token, setToken] = useState(apiToken || '');
  const [showToken, setShowToken] = useState(false);
  const [typesafeKey, setTypesafeKey] = useState(() => localStorage.getItem('ai_tutor_typesafe_key') || '');
  const [jevEnabled, setJevEnabled] = useState(() => localStorage.getItem('ai_tutor_jev_enabled') !== 'false');
  const [showTypesafeKey, setShowTypesafeKey] = useState(false);
  const [jevTestStatus, setJevTestStatus] = useState(null);

  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('ai_tutor_gemini_key') || '');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiTestStatus, setGeminiTestStatus] = useState(null);

  const [deepseekKey, setDeepseekKey] = useState(() => localStorage.getItem('ai_tutor_deepseek_key') || '');
  const [deepseekUrl, setDeepseekUrl] = useState(() => localStorage.getItem('ai_tutor_deepseek_url') || 'https://api.deepseek.com/v1');
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [deepseekTestStatus, setDeepseekTestStatus] = useState(null);

  const [serverHealthStatus, setServerHealthStatus] = useState(null);
  const [saveKeysMsg, setSaveKeysMsg] = useState({ type: '', text: '' });

  const handleSaveAllKeys = async () => {
    onSaveBackendUrl(url.trim());
    onSaveApiToken(token.trim());

    if (geminiKey.trim()) localStorage.setItem('ai_tutor_gemini_key', geminiKey.trim());
    else localStorage.removeItem('ai_tutor_gemini_key');

    if (deepseekKey.trim()) localStorage.setItem('ai_tutor_deepseek_key', deepseekKey.trim());
    else localStorage.removeItem('ai_tutor_deepseek_key');

    if (deepseekUrl.trim()) localStorage.setItem('ai_tutor_deepseek_url', deepseekUrl.trim());

    if (typesafeKey.trim()) localStorage.setItem('ai_tutor_typesafe_key', typesafeKey.trim());
    else localStorage.removeItem('ai_tutor_typesafe_key');

    localStorage.setItem('ai_tutor_jev_enabled', jevEnabled ? 'true' : 'false');

    try {
      await authFetch('/api/config/update-keys', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          geminiApiKey: geminiKey.trim() || undefined,
          deepseekApiKey: deepseekKey.trim() || undefined,
          deepseekApiUrl: deepseekUrl.trim() || undefined,
          typesafeApiKey: typesafeKey.trim() || undefined,
          jevEnabled: jevEnabled,
          pin_hash: getAdminPinHash()
        })
      });
      setSaveKeysMsg({ type: 'success', text: '✅ AI 密钥与服务器设置已保存并同步热重载！' });
    } catch (e) {
      setSaveKeysMsg({ type: 'warning', text: '本地设置已保存，但服务端密钥同步提示：' + e.message });
    }
    setTimeout(() => setSaveKeysMsg({ type: '', text: '' }), 4000);
  };

  const handleTestJev = async () => {
    setJevTestStatus({ testing: true });
    try {
      const res = await authFetch('/api/config/test-llm', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          provider: 'jev',
          apiKey: typesafeKey.trim() || undefined,
          pin_hash: getAdminPinHash()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setJevTestStatus({ testing: false, success: true, message: `⚡ ${data.message || 'Jev 决策引擎连接正常！'}` });
      } else {
        const detailText = data.details ? ` (${data.details})` : '';
        setJevTestStatus({ testing: false, success: false, message: `❌ 失败: ${data.error || '连通失败'}${detailText}` });
      }
    } catch (e) {
      setJevTestStatus({ testing: false, success: false, message: '❌ 网络异常: ' + e.message });
    }
  };

  const handleTestGemini = async () => {
    setGeminiTestStatus({ testing: true });
    try {
      const res = await authFetch('/api/config/test-llm', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          provider: 'gemini',
          apiKey: geminiKey.trim() || undefined,
          model: 'gemini-2.5-flash',
          pin_hash: getAdminPinHash()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGeminiTestStatus({ testing: false, success: true, message: `⚡ ${data.message || 'Gemini 连通正常！'}` });
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
      const res = await authFetch('/api/config/test-llm', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          provider: 'deepseek',
          apiKey: deepseekKey.trim() || undefined,
          apiUrl: deepseekUrl.trim() || undefined,
          pin_hash: getAdminPinHash()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDeepseekTestStatus({ testing: false, success: true, message: `⚡ ${data.message || 'DeepSeek 连通正常！'}` });
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
      const targetBase = (url.trim() || getApiUrl()).replace(/\/+$/, '');
      const res = await fetch(`${targetBase}/api/health`);
      if (res.ok) {
        const d = await res.json();
        setServerHealthStatus({ testing: false, success: true, message: `🟢 服务器在线，状态: ${d.status || 'OK'}` });
      } else {
        setServerHealthStatus({ testing: false, success: false, message: `🔴 服务器响应码: ${res.status}` });
      }
    } catch (e) {
      setServerHealthStatus({ testing: false, success: false, message: '🔴 无法连接服务器: ' + e.message });
    }
  };

  // -------------------------------------------------------------
  // Tab 4: 安全防作弊与密码管理
  // -------------------------------------------------------------
  const [antiCheatLocked, setAntiCheatLocked] = useState(() => localStorage.getItem('parent_anti_cheat_locked') !== 'false');
  const [showPinSetupGate, setShowPinSetupGate] = useState(false);
  const [pinChangeMsg, setPinChangeMsg] = useState('');

  const handleToggleAntiCheat = () => {
    const nextVal = !antiCheatLocked;
    setAntiCheatLocked(nextVal);
    localStorage.setItem('parent_anti_cheat_locked', nextVal ? 'true' : 'false');
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(10px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        width: '100%', maxWidth: '780px', maxHeight: '92vh', background: '#ffffff',
        borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #0f172a 100%)',
          color: '#ffffff', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.5rem' }}>🛡️</span>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.02em' }}>
                曾先生 · 专属管理控制台 (Admin Console)
              </h2>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '4px' }}>
              商业变现 · 获客海报 · 批量发卡 · AI决策引擎与系统底层密钥（仅限本人使用）
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭管理控制台"
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#ffffff',
              width: '32px', height: '32px', borderRadius: '50%', fontSize: '1rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 12px', overflowX: 'auto' }}>
          <button
            onClick={() => setActiveTab('poster')}
            style={{
              padding: '13px 18px', border: 'none', background: 'none',
              fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', whiteSpace: 'nowrap',
              color: activeTab === 'poster' ? '#4f46e5' : '#64748b',
              borderBottom: activeTab === 'poster' ? '2px solid #4f46e5' : '2px solid transparent'
            }}
          >
            📣 获客营销海报 (搞钱裂变)
          </button>
          <button
            onClick={() => setActiveTab('cards')}
            style={{
              padding: '13px 18px', border: 'none', background: 'none',
              fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', whiteSpace: 'nowrap',
              color: activeTab === 'cards' ? '#059669' : '#64748b',
              borderBottom: activeTab === 'cards' ? '2px solid #059669' : '2px solid transparent'
            }}
          >
            🔑 批量发卡后台 (搞钱变现)
          </button>
          <button
            onClick={() => setActiveTab('ai_keys')}
            style={{
              padding: '13px 18px', border: 'none', background: 'none',
              fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', whiteSpace: 'nowrap',
              color: activeTab === 'ai_keys' ? '#d97706' : '#64748b',
              borderBottom: activeTab === 'ai_keys' ? '2px solid #d97706' : '2px solid transparent'
            }}
          >
            ⚙️ AI 决策与模型密钥
          </button>
          <button
            onClick={() => setActiveTab('security')}
            style={{
              padding: '13px 18px', border: 'none', background: 'none',
              fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', whiteSpace: 'nowrap',
              color: activeTab === 'security' ? '#7c3aed' : '#64748b',
              borderBottom: activeTab === 'security' ? '2px solid #7c3aed' : '2px solid transparent'
            }}
          >
            🛡️ 安全锁与 PIN 码
          </button>
        </div>

        {/* Tab Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#f8fafc' }}>
          
          {/* TAB 1: 营销获客海报 */}
          {activeTab === 'poster' && (
            <div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setPosterTemplate('primary')}
                    style={{
                      padding: '8px 16px', borderRadius: '10px', border: '1px solid',
                      borderColor: posterTemplate === 'primary' ? '#d97706' : '#cbd5e1',
                      background: posterTemplate === 'primary' ? '#fef3c7' : '#ffffff',
                      color: posterTemplate === 'primary' ? '#92400e' : '#475569',
                      fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                    }}
                  >
                    🎒 低年级启蒙版 (1-3年级)
                  </button>
                  <button
                    onClick={() => setPosterTemplate('junior')}
                    style={{
                      padding: '8px 16px', borderRadius: '10px', border: '1px solid',
                      borderColor: posterTemplate === 'junior' ? '#2563eb' : '#cbd5e1',
                      background: posterTemplate === 'junior' ? '#dbeafe' : '#ffffff',
                      color: posterTemplate === 'junior' ? '#1e40af' : '#475569',
                      fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                    }}
                  >
                    📐 中考压轴冲刺版 (7-9年级)
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <label style={{
                    padding: '8px 14px', borderRadius: '10px', border: '1px solid #cbd5e1',
                    background: '#ffffff', color: '#334155', fontWeight: 600, fontSize: '0.82rem',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                  }}>
                    <span>🖼️ 更换微信二维码</span>
                    <input type="file" ref={fileInputRef} accept="image/*" onChange={handleQrUpload} style={{ display: 'none' }} />
                  </label>
                  <button
                    onClick={handleSavePoster}
                    disabled={posterSaving}
                    style={{
                      padding: '8px 18px', borderRadius: '10px', border: 'none',
                      background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                      color: '#ffffff', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    <span>💾</span> {posterSaving ? '生成中...' : '保存高清海报发圈'}
                  </button>
                </div>
              </div>

              {/* Poster Canvas Preview */}
              <div style={{
                background: '#334155', borderRadius: '16px', padding: '16px',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2)'
              }}>
                <canvas
                  ref={canvasRef}
                  style={{
                    maxWidth: '100%', maxHeight: '520px', width: 'auto', height: 'auto',
                    borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.35)'
                  }}
                />
              </div>

              {/* Copywriting Tip */}
              <div style={{ marginTop: '14px', padding: '12px 16px', background: '#e0f2fe', borderRadius: '10px', border: '1px solid #bae6fd', fontSize: '0.82rem', color: '#0369a1' }}>
                💡 <b>曾先生获客私域秘籍</b>：保存海报后直接发送到家长微信朋友圈、小红书或班级互助群，精准吸引有“作业鸡飞狗跳”或“中考压轴攻坚”痛点的目标家长主动加微。
              </div>
            </div>
          )}

          {/* TAB 2: 批量发卡后台 */}
          {activeTab === 'cards' && (
            <div>
              <div style={{
                background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '14px',
                padding: '18px 20px', marginBottom: '18px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#0f172a', marginBottom: '12px' }}>
                  🔑 批量生成 VIP 兑换卡密 (用于付费变现分发)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                      发卡张数：
                    </label>
                    <select
                      value={genCount}
                      onChange={e => setGenCount(parseInt(e.target.value, 10))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    >
                      <option value={1}>1 张 (单客测试)</option>
                      <option value={5}>5 张 (小规模试销)</option>
                      <option value={10}>10 张 (标准批次)</option>
                      <option value={20}>20 张 (活动热卖)</option>
                      <option value={50}>50 张 (代理/社群分销)</option>
                      <option value={100}>100 张 (大型批量)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                      会员有效期：
                    </label>
                    <select
                      value={genDays}
                      onChange={e => setGenDays(parseInt(e.target.value, 10))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    >
                      <option value={7}>7 天 (体验尝鲜卡)</option>
                      <option value={30}>30 天 (月度提分卡 - 推荐)</option>
                      <option value={90}>90 天 (学期攻坚季卡)</option>
                      <option value={365}>365 天 (全年中考年度至尊卡)</option>
                      <option value={3650}>永久尊享 (终身卡)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                      批次备注名称：
                    </label>
                    <input
                      type="text"
                      value={genBatch}
                      onChange={e => setGenBatch(e.target.value)}
                      placeholder="如：朋友圈付费批次"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <button
                    disabled={generating}
                    onClick={handleGenerateKeys}
                    style={{
                      background: 'linear-gradient(135deg, #059669, #047857)',
                      color: '#ffffff', border: 'none', padding: '10px 24px', borderRadius: '8px',
                      fontWeight: 'bold', fontSize: '0.88rem', cursor: generating ? 'wait' : 'pointer'
                    }}
                  >
                    {generating ? '生成中...' : '🚀 立即批量生成卡密'}
                  </button>
                  {cardsMsg.text && (
                    <div style={{
                      fontSize: '0.85rem', fontWeight: 600,
                      color: cardsMsg.type === 'success' ? '#059669' : '#dc2626'
                    }}>
                      {cardsMsg.text}
                    </div>
                  )}
                </div>
              </div>

              {/* Generated Keys Display */}
              {generatedKeys.length > 0 && (
                <div style={{
                  background: '#ffffff', border: '1px solid #a7f3d0', borderRadius: '14px',
                  padding: '18px 20px', boxShadow: '0 4px 12px rgba(5, 150, 105, 0.08)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#065f46' }}>
                      📋 本次生成的 VIP 卡密清单 ({generatedKeys.length} 个)
                    </div>
                    <button
                      onClick={handleCopyAllKeys}
                      style={{
                        background: copySuccess ? '#15803d' : '#059669',
                        color: '#ffffff', border: 'none', padding: '6px 14px', borderRadius: '6px',
                        fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      {copySuccess ? '✓ 已复制全部！' : '📄 一键复制全部卡密'}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={generatedKeys.join('\n')}
                    rows={Math.min(generatedKeys.length, 10)}
                    style={{
                      width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1',
                      fontFamily: 'monospace', fontSize: '0.88rem', background: '#f8fafc',
                      color: '#0f172a', resize: 'vertical', boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '6px' }}>
                    * 家长在手机端打开【会员中心】输入卡密即可瞬间激活，无需任何复杂认证。
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AI 决策与模型密钥 */}
          {activeTab === 'ai_keys' && (
            <div>
              {/* Jev System One Card */}
              <div style={{
                background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '14px',
                padding: '16px 20px', marginBottom: '14px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>⚡</span>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
                      TypeSafe Jev System One 极速决策引擎
                    </span>
                    <span style={{
                      fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px',
                      background: jevEnabled ? '#dcfce7' : '#f1f5f9',
                      color: jevEnabled ? '#15803d' : '#64748b', fontWeight: 600
                    }}>
                      {jevEnabled ? '毫秒级决策运行中' : '已停用'}
                    </span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '6px', fontSize: '0.82rem', color: '#475569' }}>
                    <input
                      type="checkbox"
                      checked={jevEnabled}
                      onChange={e => setJevEnabled(e.target.checked)}
                    />
                    <span>启用 Jev 意图识别分流</span>
                  </label>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '10px' }}>
                  70ms 拦截闲聊无意义提问（0 Token），精准分流中考压轴难题并自动注入启发式教学策略。
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type={showTypesafeKey ? 'text' : 'password'}
                    value={typesafeKey}
                    onChange={e => setTypesafeKey(e.target.value)}
                    placeholder="输入 TypeSafe / Jev API Key (如: ts_live_...)"
                    style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontFamily: 'monospace', fontSize: '0.85rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowTypesafeKey(!showTypesafeKey)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    {showTypesafeKey ? '隐藏' : '显示'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTestJev}
                    disabled={jevTestStatus?.testing}
                    style={{
                      padding: '8px 14px', borderRadius: '8px', border: 'none',
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#ffffff',
                      fontSize: '0.82rem', fontWeight: 600, cursor: jevTestStatus?.testing ? 'wait' : 'pointer'
                    }}
                  >
                    {jevTestStatus?.testing ? '测速中...' : '⚡ 诊断 Jev 连通性'}
                  </button>
                </div>
                {jevTestStatus?.message && (
                  <div style={{ marginTop: '8px', fontSize: '0.82rem', color: jevTestStatus.success ? '#15803d' : '#dc2626', fontWeight: 600 }}>
                    {jevTestStatus.message}
                  </div>
                )}
              </div>

              {/* Google Gemini Card */}
              <div style={{
                background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '14px',
                padding: '16px 20px', marginBottom: '14px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', marginBottom: '4px' }}>
                  🤖 Google Gemini API 密钥 (用于多模态视觉解题与语音转录)
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '10px' }}>
                  拍照识别课本试卷、麦克风语音转录及苏格拉底名师启发主模型。
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    value={geminiKey}
                    onChange={e => setGeminiKey(e.target.value)}
                    placeholder="输入 Google Gemini API Key (AIzaSy...)"
                    style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontFamily: 'monospace', fontSize: '0.85rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    {showGeminiKey ? '隐藏' : '显示'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTestGemini}
                    disabled={geminiTestStatus?.testing}
                    style={{
                      padding: '8px 14px', borderRadius: '8px', border: 'none',
                      background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#ffffff',
                      fontSize: '0.82rem', fontWeight: 600, cursor: geminiTestStatus?.testing ? 'wait' : 'pointer'
                    }}
                  >
                    {geminiTestStatus?.testing ? '测试中...' : '⚡ 测试 Gemini 连通性'}
                  </button>
                </div>
                {geminiTestStatus?.message && (
                  <div style={{ marginTop: '8px', fontSize: '0.82rem', color: geminiTestStatus.success ? '#15803d' : '#dc2626', fontWeight: 600 }}>
                    {geminiTestStatus.message}
                  </div>
                )}
              </div>

              {/* DeepSeek Card */}
              <div style={{
                background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '14px',
                padding: '16px 20px', marginBottom: '14px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', marginBottom: '4px' }}>
                  🧠 DeepSeek 备用大模型 (国内免翻墙高速推理通道)
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '10px' }}>
                  支持 deepseek-chat 及 deepseek-reasoner (R1) 深度逻辑推演。
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <input
                    type={showDeepseekKey ? 'text' : 'password'}
                    value={deepseekKey}
                    onChange={e => setDeepseekKey(e.target.value)}
                    placeholder="输入 DeepSeek API Key (sk-...)"
                    style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontFamily: 'monospace', fontSize: '0.85rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeepseekKey(!showDeepseekKey)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    {showDeepseekKey ? '隐藏' : '显示'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTestDeepSeek}
                    disabled={deepseekTestStatus?.testing}
                    style={{
                      padding: '8px 14px', borderRadius: '8px', border: 'none',
                      background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#ffffff',
                      fontSize: '0.82rem', fontWeight: 600, cursor: deepseekTestStatus?.testing ? 'wait' : 'pointer'
                    }}
                  >
                    {deepseekTestStatus?.testing ? '测试中...' : '⚡ 测试 DeepSeek 连通性'}
                  </button>
                </div>
                <input
                  type="text"
                  value={deepseekUrl}
                  onChange={e => setDeepseekUrl(e.target.value)}
                  placeholder="DeepSeek API 地址 (默认: https://api.deepseek.com/v1)"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                />
                {deepseekTestStatus?.message && (
                  <div style={{ marginTop: '8px', fontSize: '0.82rem', color: deepseekTestStatus.success ? '#15803d' : '#dc2626', fontWeight: 600 }}>
                    {deepseekTestStatus.message}
                  </div>
                )}
              </div>

              {/* Backend URL & Server Health */}
              <div style={{
                background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '14px',
                padding: '16px 20px', marginBottom: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', marginBottom: '4px' }}>
                  🌐 后端服务器地址与访问令牌 (Cloud & Render)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="后端 API 地址 (留空为相对路径，或云端 Render 部署地址)"
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  />
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    placeholder="API Token (认证令牌)"
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleTestServer}
                    disabled={serverHealthStatus?.testing}
                    style={{
                      padding: '6px 14px', borderRadius: '8px', border: '1px solid #cbd5e1',
                      background: '#f8fafc', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600
                    }}
                  >
                    {serverHealthStatus?.testing ? '测速中...' : '⚡ 测试服务器连接'}
                  </button>
                  {serverHealthStatus?.message && (
                    <span style={{ fontSize: '0.8rem', color: serverHealthStatus.success ? '#15803d' : '#dc2626', fontWeight: 600 }}>
                      {serverHealthStatus.message}
                    </span>
                  )}
                </div>
              </div>

              {/* Save All Keys Button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <button
                  type="button"
                  onClick={handleSaveAllKeys}
                  style={{
                    background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
                    color: '#ffffff', border: 'none', padding: '12px 28px', borderRadius: '10px',
                    fontWeight: 'bold', fontSize: '0.92rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(30, 27, 75, 0.2)'
                  }}
                >
                  💾 保存并应用全部 AI 密钥设置
                </button>
                {saveKeysMsg.text && (
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: saveKeysMsg.type === 'success' ? '#15803d' : '#d97706' }}>
                    {saveKeysMsg.text}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: 安全锁与 PIN 码设置 */}
          {activeTab === 'security' && (
            <div>
              {/* Anti-cheat Switch */}
              <div style={{
                background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '14px',
                padding: '18px 20px', marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
                      🔒 家长防抄题监督锁
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                      开启后，学生在主界面无法自行切换至“💡 直答答案”模式，只能接受苏格拉底启发引导。
                    </div>
                  </div>
                  <button
                    onClick={handleToggleAntiCheat}
                    style={{
                      padding: '8px 16px', borderRadius: '20px', border: 'none',
                      background: antiCheatLocked ? '#10b981' : '#94a3b8',
                      color: '#ffffff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                    }}
                  >
                    {antiCheatLocked ? '✓ 监督锁已开启' : '✕ 已停用'}
                  </button>
                </div>
              </div>

              {/* PIN Code Setup Trigger */}
              <div style={{
                background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '14px',
                padding: '18px 20px'
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', marginBottom: '6px' }}>
                  🔑 管理员 6 位安全 PIN 码管理
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '14px' }}>
                  该 PIN 码用于保护本管理控制台及防抄题监督锁，防止学员未经授权进入修改密钥或生成卡密。
                </div>

                <button
                  type="button"
                  onClick={() => setShowPinSetupGate(true)}
                  style={{
                    padding: '9px 18px', borderRadius: '8px', border: '1px solid #7c3aed',
                    background: '#faf5ff', color: '#6d28d9', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                  }}
                >
                  🛠️ 重设管理员 6 位安全 PIN 码 / 密保问题
                </button>

                {pinChangeMsg && (
                  <div style={{ marginTop: '10px', fontSize: '0.85rem', color: '#15803d', fontWeight: 600 }}>
                    {pinChangeMsg}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid #e2e8f0', background: '#fafafa', padding: '12px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#94a3b8'
        }}>
          <span>曾先生智慧私教专属管理系统 · 搞钱与系统配置集成中心</span>
          <span>当前授权: 管理员 (曾先生本人)</span>
        </div>
      </div>

      {showPinSetupGate && (
        <ParentalGate
          isOpen={showPinSetupGate}
          reason="重置管理员 6 位安全 PIN 码"
          onVerify={() => {
            setShowPinSetupGate(false);
            setPinChangeMsg('✓ 管理员 PIN 码与密保已更新成功！');
            setTimeout(() => setPinChangeMsg(''), 4000);
          }}
          onClose={() => setShowPinSetupGate(false)}
        />
      )}
    </div>
  );
}
