import React, { useState, useEffect } from 'react';
import { authFetch, useAppStore } from '../store/useStore';

export default function MembershipModal({ isOpen, onClose }) {
  const { currentProfile, membershipStatus, checkMembership } = useAppStore();
  const profileId = currentProfile?.id || 'default';

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'redeem'
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Redeem states
  const [keyCodeInput, setKeyCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState({ type: '', text: '' });

  // Admin generator states
  const [adminPin, setAdminPin] = useState('');
  const [genCount, setGenCount] = useState(5);
  const [genDays, setGenDays] = useState(30);
  const [genBatch, setGenBatch] = useState('官方精选会员批次');
  const [generating, setGenerating] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState([]);
  const [adminMsg, setAdminMsg] = useState({ type: '', text: '' });
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkMembership();
      setRedeemMsg({ type: '', text: '' });
      setAdminMsg({ type: '', text: '' });
    }
  }, [isOpen, checkMembership]);

  const handleRedeem = async () => {
    if (!keyCodeInput.trim()) {
      setRedeemMsg({ type: 'error', text: '请输入有效的 VIP 激活卡密' });
      return;
    }
    setRedeeming(true);
    setRedeemMsg({ type: '', text: '' });

    try {
      const res = await authFetch('/api/membership/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profileId,
          key_code: keyCodeInput.trim().toUpperCase()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setRedeemMsg({ type: 'success', text: data.message || 'VIP 激活成功！' });
        setKeyCodeInput('');
        checkMembership();
      } else {
        setRedeemMsg({ type: 'error', text: data.error || '激活失败，请检查卡密是否正确或已被使用' });
      }
    } catch (err) {
      setRedeemMsg({ type: 'error', text: '网络异常，请稍后重试' });
    } finally {
      setRedeeming(false);
    }
  };

  const handleGenerateKeys = async () => {
    setGenerating(true);
    setAdminMsg({ type: '', text: '' });
    try {
      let pinHash = adminPin;
      if (adminPin) {
        const msgBuffer = new TextEncoder().encode(adminPin);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        pinHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      }

      const res = await authFetch('/api/membership/admin/generate-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        setAdminMsg({ type: 'success', text: `成功生成 ${data.count} 张 ${data.days} 天 VIP 卡密！` });
      } else {
        setAdminMsg({ type: 'error', text: data.error || '生成失败，请确认家长/管理员安全 PIN 是否正确' });
      }
    } catch (err) {
      setAdminMsg({ type: 'error', text: '请求失败：' + err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyAllKeys = () => {
    if (generatedKeys.length === 0) return;
    const text = generatedKeys.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    });
  };

  if (!isOpen) return null;

  const isVip = membershipStatus?.is_vip;
  const daysRemaining = membershipStatus?.days_remaining || 0;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        width: '100%', maxWidth: '680px', maxHeight: '90vh', background: '#ffffff',
        borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #3730a3 100%)',
          color: '#ffffff', padding: '22px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.6rem' }}>👑</span>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.02em' }}>
                曾先生智慧私教 · VIP 会员中心
              </h2>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#c7d2fe', marginTop: '6px' }}>
              1-9年级全学科教材题库 · 全国名校中考真卷 · 局域网真机打印 · 家长微信免密看板
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', color: '#e0e7ff',
              width: '32px', height: '32px', borderRadius: '50%', fontSize: '1.1rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s'
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 16px' }}>
          <button
            onClick={() => { setActiveTab('overview'); setShowAdminPanel(false); }}
            style={{
              padding: '14px 20px', border: 'none', background: 'none',
              fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer',
              color: (activeTab === 'overview' && !showAdminPanel) ? '#4f46e5' : '#64748b',
              borderBottom: (activeTab === 'overview' && !showAdminPanel) ? '2px solid #4f46e5' : '2px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            💎 会员特权与方案
          </button>
          <button
            onClick={() => { setActiveTab('redeem'); setShowAdminPanel(false); }}
            style={{
              padding: '14px 20px', border: 'none', background: 'none',
              fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer',
              color: (activeTab === 'redeem' && !showAdminPanel) ? '#4f46e5' : '#64748b',
              borderBottom: (activeTab === 'redeem' && !showAdminPanel) ? '2px solid #4f46e5' : '2px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            🔑 激活码兑换
          </button>
          {showAdminPanel && (
            <button
              style={{
                padding: '14px 20px', border: 'none', background: 'none',
                fontWeight: 600, fontSize: '0.92rem', cursor: 'default',
                color: '#059669', borderBottom: '2px solid #059669'
              }}
            >
              🔐 管理员卡密分发
            </button>
          )}
        </div>

        {/* Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
          {showAdminPanel ? (
            /* Admin Batch Key Generator Panel (PIN Gated) */
            <div>
              <div style={{
                background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '12px',
                padding: '14px 18px', marginBottom: '18px', fontSize: '0.85rem', color: '#065f46',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div>
                  🛡️ <b>管理员/家长授权通道</b>：用于批量生成卡密以分发给微信、小红书付费学员。
                </div>
                <button
                  onClick={() => setShowAdminPanel(false)}
                  style={{
                    background: '#d1fae5', border: '1px solid #6ee7b7', color: '#047857',
                    padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer'
                  }}
                >
                  返回学员端
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#334155', fontWeight: 600, marginBottom: '6px' }}>
                    发卡张数：
                  </label>
                  <select
                    value={genCount}
                    onChange={e => setGenCount(Number(e.target.value))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  >
                    <option value="1">1 张 (单卡交付)</option>
                    <option value="5">5 张 (标准包)</option>
                    <option value="10">10 张 (批量销售)</option>
                    <option value="20">20 张 (活动推广)</option>
                    <option value="50">50 张 (大促批次)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#334155', fontWeight: 600, marginBottom: '6px' }}>
                    VIP 有效期：
                  </label>
                  <select
                    value={genDays}
                    onChange={e => setGenDays(Number(e.target.value))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  >
                    <option value="30">30 天 (月度冲刺卡)</option>
                    <option value="90">90 天 (季度攻坚卡)</option>
                    <option value="365">365 天 (全年中考直通卡)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#334155', fontWeight: 600, marginBottom: '6px' }}>
                  批次备注名称：
                </label>
                <input
                  type="text"
                  value={genBatch}
                  onChange={e => setGenBatch(e.target.value)}
                  placeholder="例如：小红书学员转化批次 / 闲鱼专项"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#334155', fontWeight: 600, marginBottom: '6px' }}>
                  家长/管理员安全 PIN 码（如系统未配置 PIN 需使用主 API_TOKEN）：
                </label>
                <input
                  type="password"
                  value={adminPin}
                  onChange={e => setAdminPin(e.target.value)}
                  placeholder="请输入安全 PIN"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>

              <button
                disabled={generating}
                onClick={handleGenerateKeys}
                style={{
                  width: '100%', background: 'linear-gradient(135deg, #059669, #047857)',
                  color: '#ffffff', border: 'none', padding: '12px 0', borderRadius: '10px',
                  fontWeight: 'bold', fontSize: '0.95rem', cursor: generating ? 'wait' : 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.3)'
                }}
              >
                {generating ? '批量生成中...' : `🚀 确认生成 ${genCount} 张 ${genDays} 天 VIP 卡密`}
              </button>

              {adminMsg.text && (
                <div style={{
                  marginTop: '12px', fontSize: '0.85rem',
                  color: adminMsg.type === 'success' ? '#15803d' : '#b91c1c', fontWeight: 600
                }}>
                  {adminMsg.text}
                </div>
              )}

              {generatedKeys.length > 0 && (
                <div style={{ marginTop: '18px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#1e293b' }}>
                      📋 本次生成的激活卡密 ({generatedKeys.length} 张)：
                    </span>
                    <button
                      onClick={handleCopyAllKeys}
                      style={{
                        background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd',
                        padding: '4px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600
                      }}
                    >
                      {copySuccess ? '✓ 已复制到剪贴板' : '📋 一键复制全部卡密'}
                    </button>
                  </div>
                  <div style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
                    padding: '12px', maxHeight: '160px', overflowY: 'auto', fontFamily: 'monospace',
                    fontSize: '0.88rem', lineHeight: '1.6'
                  }}>
                    {generatedKeys.map((k, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{k}</span>
                        <span style={{ color: '#059669', fontWeight: 600 }}>[{genDays}天VIP]</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'overview' ? (
            /* VIP Rights & Plans Showcase */
            <div>
              {/* Current Status Banner */}
              <div style={{
                background: isVip ? 'linear-gradient(135deg, #eff6ff, #dbeafe)' : '#f8fafc',
                border: isVip ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                borderRadius: '12px', padding: '16px 20px', marginBottom: '20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    当前学员档案：<b>{currentProfile?.name || '默认学员'}</b>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span style={{
                      fontSize: '1.05rem', fontWeight: 'bold',
                      color: isVip ? '#1e40af' : '#334155'
                    }}>
                      {isVip ? '👑 Pro 尊享年度/季度会员' : '⚡ 免费基础体验版'}
                    </span>
                    {isVip && (
                      <span style={{
                        background: '#10b981', color: '#fff', fontSize: '0.75rem',
                        padding: '2px 8px', borderRadius: '12px', fontWeight: 600
                      }}>
                        剩余 {daysRemaining} 天
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#64748b' }}>
                  {isVip ? `到期时间: ${new Date(membershipStatus.expire_at).toLocaleDateString()}` : '每日限额 5 次互动'}
                </div>
              </div>

              {/* VIP Plans Grid */}
              <div style={{ marginBottom: '22px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.92rem', color: '#1e293b' }}>
                  🌟 会员进阶方案推荐
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {/* Plan 1 */}
                  <div style={{
                    border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px',
                    background: '#ffffff', textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>考前冲刺</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>月度冲刺卡</div>
                    <div style={{ fontSize: '0.78rem', color: '#4f46e5', margin: '6px 0', fontWeight: 600 }}>30天畅学</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>
                      单科考前速查<br />名卷无限下载
                    </div>
                  </div>

                  {/* Plan 2: Recommended */}
                  <div style={{
                    border: '2px solid #4f46e5', borderRadius: '12px', padding: '14px',
                    background: 'linear-gradient(180deg, #f5f3ff 0%, #ffffff 100%)', textAlign: 'center',
                    position: 'relative'
                  }}>
                    <span style={{
                      position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                      background: '#4f46e5', color: '#fff', fontSize: '0.68rem', padding: '2px 8px',
                      borderRadius: '10px', fontWeight: 700
                    }}>
                      热门首选
                    </span>
                    <div style={{ fontSize: '0.82rem', color: '#4f46e5', fontWeight: 600 }}>学期攻坚</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>季度拔高卡</div>
                    <div style={{ fontSize: '0.78rem', color: '#4f46e5', margin: '6px 0', fontWeight: 600 }}>90天全程</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>
                      错题翻新打印<br />微信学情免密看
                    </div>
                  </div>

                  {/* Plan 3 */}
                  <div style={{
                    border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px',
                    background: '#ffffff', textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>全年中考直通</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e293b', marginTop: '4px' }}>年度尊享卡</div>
                    <div style={{ fontSize: '0.78rem', color: '#059669', margin: '6px 0', fontWeight: 600 }}>365天全通</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>
                      1-9年级9门学科<br />39,114套题库
                    </div>
                  </div>
                </div>
              </div>

              {/* Privilege Comparison Table */}
              <div style={{ marginBottom: '22px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#1e293b' }}>
                  ✨ VIP 权益对照一览
                </h4>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', fontSize: '0.84rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', background: '#f1f5f9', padding: '10px 14px', fontWeight: 'bold', color: '#475569' }}>
                    <span>功能特权</span>
                    <span style={{ textAlign: 'center' }}>免费体验</span>
                    <span style={{ textAlign: 'center', color: '#4f46e5' }}>VIP 尊享</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>名师苏格拉底启发辅导</span>
                    <span style={{ textAlign: 'center', color: '#94a3b8' }}>5次/天</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>无限次</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>全国名校中考真卷库 (海淀/黄冈/启东等)</span>
                    <span style={{ textAlign: 'center', color: '#94a3b8' }}>基础样卷</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>39,114+套名卷</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>错题抹除红批 & 一键翻新空白卷</span>
                    <span style={{ textAlign: 'center', color: '#94a3b8' }}>✕</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>✓ 支持</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>家庭物理打印机局域网秒级出纸</span>
                    <span style={{ textAlign: 'center', color: '#94a3b8' }}>✕</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>✓ 支持</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>家长微信随身学情免密看板</span>
                    <span style={{ textAlign: 'center', color: '#94a3b8' }}>✕</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>✓ 30天免密实时查</span>
                  </div>
                </div>
              </div>

              {/* Purchase / Customer Service Box */}
              <div style={{
                background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                border: '1px solid #cbd5e1', borderRadius: '12px', padding: '16px 20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.92rem' }}>
                    💬 激活码选购与家庭方案定制
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                    添加导师【曾先生】微信或关注小红书官方店，获取专属激活码与 1 对 1 学情规划
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('redeem')}
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5, #4338ca)',
                    color: '#ffffff', border: 'none', padding: '9px 18px', borderRadius: '8px',
                    fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0
                  }}
                >
                  去输入卡密兑换 ➔
                </button>
              </div>
            </div>
          ) : (
            /* Redeem View */
            <div>
              <div style={{
                background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '14px', padding: '24px 22px'
              }}>
                <div style={{ fontWeight: 'bold', color: '#6b21a8', fontSize: '1.05rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🔑</span> 输入 VIP 激活卡密兑换权益
                </div>
                <div style={{ fontSize: '0.82rem', color: '#7e22ce', marginBottom: '16px' }}>
                  卡密格式为 VIP-XXXX-XXXX-XXXX（不区分大小写，激活后会员时间自动累加）
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    value={keyCodeInput}
                    onChange={e => setKeyCodeInput(e.target.value)}
                    placeholder="请输入您的激活卡密，如：VIP-A1B2-C3D4-E5F6"
                    style={{
                      flex: 1, padding: '12px 14px', borderRadius: '10px', border: '1px solid #c084fc',
                      fontSize: '0.95rem', fontFamily: 'monospace', textTransform: 'uppercase', outline: 'none'
                    }}
                  />
                  <button
                    disabled={redeeming}
                    onClick={handleRedeem}
                    style={{
                      background: 'linear-gradient(135deg, #7e22ce, #6b21a8)',
                      color: '#ffffff', border: 'none', padding: '0 24px', borderRadius: '10px',
                      fontWeight: 'bold', fontSize: '0.92rem', cursor: redeeming ? 'wait' : 'pointer'
                    }}
                  >
                    {redeeming ? '核销中...' : '立即兑换'}
                  </button>
                </div>

                {redeemMsg.text && (
                  <div style={{
                    marginTop: '12px', fontSize: '0.88rem',
                    color: redeemMsg.type === 'success' ? '#15803d' : '#b91c1c',
                    fontWeight: 600
                  }}>
                    {redeemMsg.text}
                  </div>
                )}
              </div>

              <div style={{ marginTop: '20px', padding: '16px 18px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#334155', marginBottom: '6px' }}>
                  📌 常见疑问：
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.7 }}>
                  <li>激活码在核销后即刻生效，若您已有会员，有效期将顺延增加。</li>
                  <li>每个激活码仅限核销一次，请妥善保管。</li>
                  <li>如未收到卡密或误输卡密，请联系曾先生导师微信或小红书客服协助解决。</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Discreet Admin Gating */}
        <div style={{
          borderTop: '1px solid #f1f5f9', background: '#fafafa', padding: '12px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#94a3b8'
        }}>
          <span>曾先生智慧私教系统 · 权威教材题库与启发式伴学</span>
          <button
            onClick={() => {
              setShowAdminPanel(!showAdminPanel);
              setAdminMsg({ type: '', text: '' });
            }}
            style={{
              background: 'none', border: 'none', color: '#94a3b8',
              cursor: 'pointer', fontSize: '0.78rem', textDecoration: 'underline'
            }}
          >
            {showAdminPanel ? '✕ 关闭发卡控制台' : '🔐 管理员通道'}
          </button>
        </div>
      </div>
    </div>
  );
}
