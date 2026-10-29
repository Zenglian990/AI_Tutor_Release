import React, { useState, useEffect } from 'react';
import { authFetch, useAppStore } from '../store/useStore';

export default function MembershipModal({ isOpen, onClose }) {
  const { currentProfile, membershipStatus, checkMembership } = useAppStore();
  const profileId = currentProfile?.id || 'default';

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'redeem'

  // Redeem states
  const [keyCodeInput, setKeyCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    if (isOpen) {
      checkMembership();
      setRedeemMsg({ type: '', text: '' });
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
              <span style={{ fontSize: '1.6rem' }}>🎓</span>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.02em' }}>
                曾练专属私教 · 纯净全功能开放说明
              </h2>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#c7d2fe', marginTop: '6px' }}>
              零商业化收费 · 专注打磨教学品质 · 1-9年级全学科教材真题永久畅享
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
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '14px 20px', border: 'none', background: 'none',
              fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer',
              color: activeTab === 'overview' ? '#4f46e5' : '#64748b',
              borderBottom: activeTab === 'overview' ? '2px solid #4f46e5' : '2px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            🌱 教学功能开放说明
          </button>
          <button
            onClick={() => setActiveTab('redeem')}
            style={{
              padding: '14px 20px', border: 'none', background: 'none',
              fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer',
              color: activeTab === 'redeem' ? '#4f46e5' : '#64748b',
              borderBottom: activeTab === 'redeem' ? '2px solid #4f46e5' : '2px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            🔑 教师特权码激活
          </button>
        </div>

        {/* Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
          {activeTab === 'overview' ? (
            /* Pure Free Educational Mode */
            <div>
              {/* Current Status Banner */}
              <div style={{
                background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                border: '1px solid #86efac',
                borderRadius: '12px', padding: '16px 20px', marginBottom: '20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.82rem', color: '#15803d' }}>
                    当前学员档案：<b>{currentProfile?.name || '默认学员'}</b>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span style={{
                      fontSize: '1.05rem', fontWeight: 'bold',
                      color: '#166534'
                    }}>
                      🌟 全功能纯净体验版（永久免费 · 无需付费）
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#166534' }}>
                  无互动限制 · 无商业广告
                </div>
              </div>

              {/* Free Educational Guarantee */}
              <div style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px',
                padding: '16px 20px', marginBottom: '20px'
              }}>
                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem', marginBottom: '6px' }}>
                  🌱 纯净教育承诺：零商业付费，100% 潜心打磨产品
                </div>
                <div style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 1.6 }}>
                  本系统核心定位于打磨最优质的 1-9 年级名师启发式 AI 私教体验。所有学科题库、动点几何、科学实验沙盘、苏格拉底启发引导与错题翻新打印功能均向全体学员永久免费开放，不设任何消费门槛或商业付费套餐。
                </div>
              </div>

              {/* Feature Privilege List */}
              <div style={{ marginBottom: '22px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#1e293b' }}>
                  ✨ 已开放核心教学功能一览
                </h4>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', fontSize: '0.84rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', background: '#f1f5f9', padding: '10px 14px', fontWeight: 'bold', color: '#475569' }}>
                    <span>教学特权与工具</span>
                    <span style={{ textAlign: 'center', color: '#16a34a' }}>开放状态</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>名师苏格拉底启发式辅导</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>✓ 无限次免费畅用</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>全国名校中考真卷库 (39,114+套题库)</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>✓ 完整开放</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>错题抹除红批 & 一键翻新空白卷重练</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>✓ 完整开放</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>动点几何沙盘 & 动态物理化学实验室</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>✓ 完整开放</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', padding: '10px 14px', borderTop: '1px solid #f1f5f9' }}>
                    <span>局域网 A4 真实打印机无线打印</span>
                    <span style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>✓ 完整开放</span>
                  </div>
                </div>
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
                  <li>系统所有教学工具与题库已全面开放，无需卡密即可无限制学习使用。</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid #f1f5f9', background: '#fafafa', padding: '12px 24px',
          display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '0.78rem', color: '#94a3b8'
        }}>
          <span>曾先生智慧私教系统 · 权威教材题库与启发式伴学</span>
        </div>
      </div>
    </div>
  );
}
