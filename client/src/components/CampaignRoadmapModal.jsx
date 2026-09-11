import React, { useEffect, useState } from 'react';
import { authFetch, getApiUrl } from '../store/useStore';

/**
 * CampaignRoadmapModal
 * 长周期宏观战役沙盘与中考/期末预测推演
 */
export default function CampaignRoadmapModal({ isOpen, onClose, currentProfileId = 'default', grade = '7_up', subject = '数学' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      authFetch(`${getApiUrl()}/api/campaign/roadmap?profile_id=${encodeURIComponent(currentProfileId)}&grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}`)
        .then(res => res.json())
        .then(d => setData(d))
        .catch(e => console.warn('Roadmap fetch error:', e))
        .finally(() => setLoading(false));
    }
  }, [isOpen, currentProfileId, grade, subject]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#f8fafc',
        width: '92%',
        maxWidth: '840px',
        maxHeight: '90vh',
        borderRadius: '20px',
        padding: '24px',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#38bdf8' }}>
              🏛️ 曾练专属：长周期宏观战役沙盘
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
              从中考/期末宏观全局把控，告别走马观花，步步为营锁定核心分
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>正在推演宏观知识网格...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Score & Tier Banner */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(99, 102, 241, 0.15))',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '16px',
              padding: '18px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>当前战役阶段能力推演分</span>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#38bdf8', marginTop: '4px' }}>
                  {data?.simulatedScore || '92 / 120'}
                </div>
                <span style={{ fontSize: '0.82rem', background: '#2563eb', color: '#fff', padding: '2px 8px', borderRadius: '12px' }}>
                  {data?.scoreTier || '良好·中坚梯队'}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>知识网格已点亮</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#10b981', marginTop: '4px' }}>
                  {data?.coveragePercentage || 45}%
                </div>
                <span style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>
                  已通关 {data?.masteredCount || 0} / {data?.totalNodesCount || 10} 关键节点
                </span>
              </div>
            </div>

            {/* Strategic Advice */}
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '14px 18px', borderLeft: '4px solid #38bdf8' }}>
              <strong style={{ color: '#38bdf8' }}>🎯 名师战役指挥所建议：</strong>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.92rem', color: '#e2e8f0', lineHeight: '1.5' }}>
                {data?.strategicAdvice}
              </p>
            </div>

            {/* 4 Campaign Milestones */}
            <div>
              <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '1.05rem' }}>🚩 四大战役冲刺里程碑：</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {data?.milestones?.map(m => (
                  <div key={m.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: m.achieved ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                    border: m.achieved ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.2rem' }}>{m.achieved ? '✅' : '⏳'}</span>
                      <div>
                        <div style={{ fontWeight: '600', color: m.achieved ? '#34d399' : '#f1f5f9' }}>{m.title}</div>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>冲刺目标覆盖率：{m.targetPct}%</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.9rem', color: '#38bdf8', fontWeight: 'bold' }}>
                      保底 {m.scoreRange}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
