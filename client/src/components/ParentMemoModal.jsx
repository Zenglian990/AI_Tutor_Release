import React, { useEffect, useState } from 'react';
import { authFetch, getApiUrl } from '../store/useStore';

/**
 * ParentMemoModal
 * 家长端每日名师家访便签
 */
export default function ParentMemoModal({ isOpen, onClose, currentProfileId = 'default', grade = '7_up', subject = '数学', studentName = '曾练' }) {
  const [memo, setMemo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      authFetch(`${getApiUrl()}/api/parent/daily-memo?profile_id=${encodeURIComponent(currentProfileId)}&grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}&student_name=${encodeURIComponent(studentName)}`)
        .then(res => res.json())
        .then(d => setMemo(d))
        .catch(e => console.warn('Parent memo fetch error:', e))
        .finally(() => setLoading(false));
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
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>曾练专属私教案头督学</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
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
