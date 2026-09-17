import React, { useState, useEffect } from 'react';
import { authFetch, useAppStore } from '../store/useStore';

export default function MembershipModal({ isOpen, onClose }) {
  const { currentProfile, membershipStatus, checkMembership } = useAppStore();
  const profileId = currentProfile?.id || 'default';

  const [tab, setTab] = useState('user'); // 'user' | 'admin'
  const [keyCodeInput, setKeyCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState({ type: '', text: '' });

  // Admin generator states
  const [adminPin, setAdminPin] = useState('');
  const [genCount, setGenCount] = useState(5);
  const [genDays, setGenDays] = useState(30);
  const [genBatch, setGenBatch] = useState('小红书精选推广批次');
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
      setRedeemMsg({ type: 'error', text: '请输入有效的 VIP 激活码' });
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
      // Create sha256 of adminPin if provided
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
      background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(6px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
      padding: '16px'
    }}>
      <div style={{
        width: '100%', maxWidth: '640px', maxHeight: '90vh', background: '#ffffff',
        borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b, #312e81)', color: '#ffffff',
          padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>👑</span>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>曾先生智慧私教 · 会员中心</h2>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#c7d2fe', marginTop: '4px' }}>
              解锁全国名校真题密卷、局域网物理打印与家长微信随身看板
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a5b4fc', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <button
            onClick={() => setTab('user')}
            style={{
              flex: 1, padding: '12px 0', border: 'none', background: 'none',
              fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
              color: tab === 'user' ? '#4f46e5' : '#64748b',
              borderBottom: tab === 'user' ? '2px solid #4f46e5' : 'none'
            }}
          >
            💎 我的 VIP 特权 & 激活兑换
          </button>
          <button
            onClick={() => setTab('admin')}
            style={{
              flex: 1, padding: '12px 0', border: 'none', background: 'none',
              fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
              color: tab === 'admin' ? '#4f46e5' : '#64748b',
              borderBottom: tab === 'admin' ? '2px solid #4f46e5' : 'none'
            }}
          >
            🛠️ 曾先生批量发卡后台 (搞钱变现)
          </button>
        </div>

        {/* Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {tab === 'user' ? (
            <div>
              {/* Current Status Banner */}
              <div style={{
                background: isVip ? 'linear-gradient(135deg, #eff6ff, #dbeafe)' : '#f8fafc',
                border: isVip ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                borderRadius: '12px', padding: '16px 20px', marginBottom: '20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>当前学生：<b>{currentProfile?.name || '学生'}</b></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span style={{
                      fontSize: '1.05rem', fontWeight: 'bold',
                      color: isVip ? '#1e40af' : '#475569'
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
                  {isVip ? `到期时间: ${new Date(membershipStatus.expire_at).toLocaleDateString()}` : '每天限额 5 次互动'}
                </div>
              </div>

              {/* Privileges Comparison */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#1e293b' }}>✨ VIP 会员核心权益清单</h4>
                <div style={{
                  border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', fontSize: '0.85rem'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', background: '#f1f5f9', padding: '10px 14px', fontWeight: 'bold', color: '#475569' }}>
                    <span>功能特权</span>
                    <span style={{ textAlign: 'center' }}>免费体验版</span>
                    <span style={{ textAlign: 'center', color: '#4f46e5' }}>VIP 尊享版</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>名师启发辅导与苏格拉底互动</span>
                    <span style={{ textAlign: 'center', color: '#94a3b8' }}>5次/天</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>无限畅学</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>全国名校中考真卷库 (海淀/黄冈等)</span>
                    <span style={{ textAlign: 'center', color: '#94a3b8' }}>基础卷</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>39,114+名校密卷</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>错题红批抹除 & 一键翻新空白卷</span>
                    <span style={{ textAlign: 'center', color: '#94a3b8' }}>✕</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>✓ 支持</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>家庭物理打印机局域网秒级出纸</span>
                    <span style={{ textAlign: 'center', color: '#94a3b8' }}>✕</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>✓ 支持</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>微信家长随身学情免密看板</span>
                    <span style={{ textAlign: 'center', color: '#94a3b8' }}>✕</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>✓ 30天免密实时查</span>
                  </div>
                </div>
              </div>

              {/* Redeem Form */}
              <div style={{
                background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '12px', padding: '18px 20px'
              }}>
                <div style={{ fontWeight: 'bold', color: '#6b21a8', fontSize: '0.95rem', marginBottom: '8px' }}>
                  🔑 输入卡密激活码兑换 VIP
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    value={keyCodeInput}
                    onChange={e => setKeyCodeInput(e.target.value)}
                    placeholder="输入格式如：VIP-XXXX-XXXX-XXXX"
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #c084fc',
                      fontSize: '0.95rem', fontFamily: 'monospace', textTransform: 'uppercase', outline: 'none'
                    }}
                  />
                  <button
                    disabled={redeeming}
                    onClick={handleRedeem}
                    style={{
                      background: 'linear-gradient(135deg, #7e22ce, #6b21a8)',
                      color: '#ffffff', border: 'none', padding: '0 22px', borderRadius: '8px',
                      fontWeight: 'bold', fontSize: '0.9rem', cursor: redeeming ? 'wait' : 'pointer'
                    }}
                  >
                    {redeeming ? '核销中...' : '立即兑换'}
                  </button>
                </div>
                {redeemMsg.text && (
                  <div style={{
                    marginTop: '10px', fontSize: '0.85rem',
                    color: redeemMsg.type === 'success' ? '#15803d' : '#b91c1c',
                    fontWeight: 500
                  }}>
                    {redeemMsg.text}
                  </div>
                )}
                <div style={{ fontSize: '0.78rem', color: '#7e22ce', marginTop: '8px' }}>
                  💡 还没有卡密？请向曾先生咨询或在微信专属交流群、小红书官方店购买激活码！
                </div>
              </div>
            </div>
          ) : (
            /* Admin Generator View */
            <div>
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '18px', fontSize: '0.85rem', color: '#92400e' }}>
                🛡️ <b>曾先生发卡专用控制台</b>：批量生成会员充值激活码，可直接复制发放给小红书、闲鱼、微店购课家长！
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#475569', marginBottom: '6px' }}>
                    发卡张数：
                  </label>
                  <select
                    value={genCount}
                    onChange={e => setGenCount(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="1">1 张</option>
                    <option value="5">5 张 (标准包)</option>
                    <option value="10">10 张 (批量销售)</option>
                    <option value="20">20 张 (活动推广)</option>
                    <option value="50">50 张 (大促批次)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#475569', marginBottom: '6px' }}>
                    VIP 有效期：
                  </label>
                  <select
                    value={genDays}
                    onChange={e => setGenDays(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="30">30 天 (月卡体验)</option>
                    <option value="90">90 天 (季度攻坚)</option>
                    <option value="365">365 天 (全年中考直通)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#475569', marginBottom: '6px' }}>
                  批次备注名称：
                </label>
                <input
                  type="text"
                  value={genBatch}
                  onChange={e => setGenBatch(e.target.value)}
                  placeholder="例如：小红书幼升小引流批次"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#475569', marginBottom: '6px' }}>
                  家长/管理员安全 PIN 码（如未设置可留空）：
                </label>
                <input
                  type="password"
                  value={adminPin}
                  onChange={e => setAdminPin(e.target.value)}
                  placeholder="输入家长安全 PIN"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <button
                disabled={generating}
                onClick={handleGenerateKeys}
                style={{
                  width: '100%', background: 'linear-gradient(135deg, #059669, #047857)',
                  color: '#ffffff', border: 'none', padding: '10px 0', borderRadius: '8px',
                  fontWeight: 'bold', fontSize: '0.92rem', cursor: generating ? 'wait' : 'pointer'
                }}
              >
                {generating ? '生成中...' : `🚀 立即生成 ${genCount} 张 ${genDays} 天 VIP 卡密`}
              </button>

              {adminMsg.text && (
                <div style={{
                  marginTop: '12px', fontSize: '0.85rem',
                  color: adminMsg.type === 'success' ? '#15803d' : '#b91c1c', fontWeight: 500
                }}>
                  {adminMsg.text}
                </div>
              )}

              {/* Generated Keys Listing */}
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
                        padding: '4px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 500
                      }}
                    >
                      {copySuccess ? '✓ 已复制到剪贴板' : '📋 一键复制全部卡密'}
                    </button>
                  </div>
                  <div style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
                    padding: '12px', maxHeight: '160px', overflowY: 'auto', fontFamily: 'monospace',
                    fontSize: '0.85rem', lineHeight: '1.6'
                  }}>
                    {generatedKeys.map((k, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{k}</span>
                        <span style={{ color: '#059669' }}>[{genDays}天VIP]</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
