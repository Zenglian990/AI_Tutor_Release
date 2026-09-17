import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { authFetch, getApiUrl } from '../store/useStore';

/**
 * ParentMemoModal
 * 家长端每日名师家访便签 + 手机微信扫码直连看板
 */
export default function ParentMemoModal({ isOpen, onClose, currentProfileId = 'default', grade = '7_up', subject = '数学', studentName = '曾练' }) {
  const [memo, setMemo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [remoteToken, setRemoteToken] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showQrCard, setShowQrCard] = useState(false);
  const [showWebhookInput, setShowWebhookInput] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem('parent_webhook_url') || '');
  const [pushing, setPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      authFetch(`${getApiUrl()}/api/parent/daily-memo?profile_id=${encodeURIComponent(currentProfileId)}&grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}&student_name=${encodeURIComponent(studentName)}`)
        .then(res => res.json())
        .then(d => setMemo(d))
        .catch(e => console.warn('Parent memo fetch error:', e))
        .finally(() => setLoading(false));

      // Fetch remote token for WeChat QR scan
      authFetch(`${getApiUrl()}/api/parent/remote-token?profile_id=${encodeURIComponent(currentProfileId)}`)
        .then(res => res.json())
        .then(d => {
          if (d.success && d.token) {
            setRemoteToken(d.token);
            const shareUrl = `${window.location.origin}${window.location.pathname}?parent_view=1&token=${encodeURIComponent(d.token)}`;
            QRCode.toDataURL(shareUrl, { width: 160, margin: 1, color: { dark: '#1e3a8a', light: '#ffffff' } })
              .then(url => setQrDataUrl(url))
              .catch(err => console.warn('QR code gen error:', err));
          }
        })
        .catch(e => console.warn('Remote token fetch error:', e));
    }
  }, [isOpen, currentProfileId, grade, subject, studentName]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!memo) return;
    const fullText = `${memo.memoTitle}\n日期：${memo.date}\n\n${memo.memoContent?.join('\n\n')}\n\n家长放心指数：${memo.comfortScore}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePushWebhook = async () => {
    if (!webhookUrl || !webhookUrl.trim()) {
      alert('请先输入微信/企微/钉钉 Webhook 机器人链接');
      return;
    }
    setPushing(true);
    setPushStatus('');
    try {
      localStorage.setItem('parent_webhook_url', webhookUrl.trim());
      const res = await authFetch(`${getApiUrl()}/api/parent/push-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook_url: webhookUrl.trim(),
          memo_title: memo?.memoTitle,
          memo_content: memo?.memoContent,
          student_name: studentName,
          date_str: memo?.date,
          comfort_score: memo?.comfortScore
        })
      });
      const data = await res.json();
      if (data.success) {
        setPushStatus('✅ 已成功推送到微信机器人！');
        setTimeout(() => setPushStatus(''), 4000);
      } else {
        setPushStatus('❌ ' + (data.error || '推送失败'));
      }
    } catch (e) {
      setPushStatus('❌ 网络异常，推送失败');
    } finally {
      setPushing(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: '#fff',
        color: '#0f172a',
        width: '92%',
        maxWidth: '600px',
        maxHeight: '90vh',
        borderRadius: '20px',
        padding: '24px',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#1e3a8a', fontSize: '1.15rem' }}>
              💌 名师晚间家访便签（家长放心专区）
            </h3>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>真实学情透传 · 击穿焦虑 · 赋能家庭信任</span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>正在生成今日名师学情便签...</div>
        ) : (
          <>
            {/* Memo Body */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '16px',
              padding: '18px 20px',
              lineHeight: '1.6',
              fontSize: '0.92rem'
            }}>
              <div style={{ fontWeight: 'bold', color: '#1e40af', marginBottom: '10px' }}>
                {memo?.memoTitle}
              </div>
              <div style={{ display: 'flex', gap: '14px', marginBottom: '14px', fontSize: '0.82rem', color: '#64748b' }}>
                <span>📅 日期：{memo?.date}</span>
                <span>⏱️ 真动脑时长：约 {memo?.activeMinutes} 分钟</span>
                <span>💬 互动设问：{memo?.todayChatCount} 轮</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', color: '#334155' }}>
                {memo?.memoContent?.map((para, i) => (
                  <p key={i} style={{ margin: 0 }}>{para}</p>
                ))}
              </div>

              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 'bold' }}>
                  🛡️ 家长放心指数：{memo?.comfortScore}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{studentName}专属私教案头督学</span>
              </div>
            </div>

            {/* WeChat / DingTalk Webhook Direct Push Banner */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.05), rgba(16, 185, 129, 0.05))',
              border: '1px solid #bfdbfe',
              borderRadius: '12px',
              padding: '12px 16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#1e40af' }}>
                  📲 微信服务号 / 企微机器人无感直推
                </span>
                <button
                  onClick={() => setShowWebhookInput(!showWebhookInput)}
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  {showWebhookInput ? '收起设置 ▲' : '配置机器人链接 ▼'}
                </button>
              </div>

              {showWebhookInput && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="输入企微/钉钉/飞书 Webhook 机器人链接..."
                    value={webhookUrl}
                    onChange={e => setWebhookUrl(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: '8px',
                      border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    * 配置后，每日研学便签将自动推送到家长微信/钉钉群，实现无感陪伴。
                  </div>
                </div>
              )}

              {pushStatus && (
                <div style={{ marginTop: '8px', fontSize: '0.85rem', fontWeight: '600', color: pushStatus.startsWith('✅') ? '#059669' : '#dc2626' }}>
                  {pushStatus}
                </div>
              )}
            </div>

            {/* WeChat / Mobile H5 QR Code Section */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.04), rgba(59, 130, 246, 0.04))',
              border: '1px solid #cbd5e1',
              borderRadius: '16px',
              padding: '14px 16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📱</span> 手机微信扫码随身看 (学情专属微看板)
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                    无需账号密码，微信扫码即可免密只读查看今日真动脑时长、五维素养雷达与薄弱考点
                  </div>
                </div>
                <button
                  onClick={() => setShowQrCard(!showQrCard)}
                  style={{
                    background: showQrCard ? '#e2e8f0' : '#2563eb',
                    color: showQrCard ? '#334155' : '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {showQrCard ? '收起二维码' : '扫码看学情'}
                </button>
              </div>

              {showQrCard && (
                <div style={{
                  marginTop: '14px',
                  paddingTop: '12px',
                  borderTop: '1px dashed #cbd5e1',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  {qrDataUrl ? (
                    <div style={{
                      background: '#fff',
                      padding: '10px',
                      borderRadius: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center'
                    }}>
                      <img src={qrDataUrl} alt="家长端学情直连二维码" style={{ width: '160px', height: '160px', display: 'block' }} />
                      <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>微信扫一扫 · 30天免密有效</span>
                    </div>
                  ) : (
                    <div style={{ padding: '20px', color: '#94a3b8', fontSize: '0.85rem' }}>正在生成专属安全二维码...</div>
                  )}

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                      onClick={() => {
                        const shareUrl = `${window.location.origin}${window.location.pathname}?parent_view=1&token=${encodeURIComponent(remoteToken)}`;
                        navigator.clipboard.writeText(shareUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2500);
                      }}
                      style={{
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '0.82rem',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      {copiedLink ? '✅ 链接已复制到剪贴板' : '🔗 复制手机查看链接'}
                    </button>
                    <button
                      onClick={() => {
                        const shareUrl = `${window.location.origin}${window.location.pathname}?parent_view=1&token=${encodeURIComponent(remoteToken)}`;
                        window.open(shareUrl, '_blank');
                      }}
                      style={{
                        background: '#f1f5f9',
                        color: '#334155',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '0.82rem',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      🌐 在新标签页预览看板
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={handlePushWebhook}
                disabled={pushing}
                style={{
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: pushing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>{pushing ? '⏳ 推送中...' : '🚀 直推家长微信/钉钉'}</span>
              </button>
              <button
                onClick={handleCopy}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {copied ? '✅ 已复制到剪贴板' : '📋 一键复制家访便签'}
              </button>
              <button
                onClick={onClose}
                style={{
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                关闭
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
