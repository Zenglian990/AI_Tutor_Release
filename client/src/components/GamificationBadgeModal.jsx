import React, { useState, useEffect } from 'react';
import { authFetch, getApiUrl } from '../store/useStore';

/**
 * GamificationBadgeModal
 * 学霸心智模型：段位勋章、连胜成长与多巴胺激励体系
 */
export default function GamificationBadgeModal({
  isOpen,
  onClose,
  currentProfileId,
  studentName = '曾练'
}) {
  if (!isOpen) return null;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function fetchGamification() {
      setLoading(true);
      try {
        const res = await authFetch(`/api/gamification/profile?profile_id=${encodeURIComponent(currentProfileId || 'default')}&student_name=${encodeURIComponent(studentName)}`);
        if (res.ok) {
          const json = await res.json();
          if (mounted) setData(json);
        }
      } catch (e) {
        console.warn('Failed to load gamification profile:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchGamification();
    return () => { mounted = false; };
  }, [currentProfileId, studentName]);

  const allBadgesCatalog = [
    { name: '初露锋芒', icon: '🌱', desc: '开启第一次 AI 名师伴学探索' },
    { name: '名师门徒', icon: '📜', desc: '践行苏格拉底分步引导不抄答案' },
    { name: '草稿大师', icon: '📝', desc: '在演练草稿纸上动手推导演算' },
    { name: '费曼小导师', icon: '🔄', desc: '成功向老师反向讲透一道题' },
    { name: '错题粉碎机', icon: '🛡️', desc: '艾宾浩斯复盘消灭 5 道以上错题' },
    { name: '黄金学者', icon: '🥇', desc: '学霸段位突破 600 分里程碑' }
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(10px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'var(--bg-secondary, #1e293b)',
        color: 'var(--text-primary, #f8fafc)',
        width: '90%',
        maxWidth: '680px',
        maxHeight: '90vh',
        borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid rgba(245, 158, 11, 0.3)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(234, 88, 12, 0.1))',
          borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '2rem' }}>👑</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24' }}>
                学霸心智段位与成长荣耀
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                激发内在自驱力 · 拒绝死记硬背 · 越学越上瘾
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              ⏳ 正在加载学霸段位数据...
            </div>
          ) : data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Rank Hero Banner */}
              <div style={{
                background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '20px',
                padding: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '20px',
                    background: 'radial-gradient(circle, rgba(245, 158, 11, 0.3), rgba(0,0,0,0.4))',
                    border: '2px solid #fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2.5rem'
                  }}>
                    {data.rankTier?.icon || '🥉'}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>当前学霸头衔</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: data.rankTier?.color || '#fbbf24' }}>
                      {data.rankTier?.name || '青铜·求知学童'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#38bdf8', marginTop: '2px' }}>
                      🔥 连续自律学习：<strong>{data.streakDays || 1}</strong> 天
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>总探索积分</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f8fafc' }}>
                    {data.rankPoints || 120} <span style={{ fontSize: '1rem', color: '#fbbf24' }}>EXP</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    距离下一段位还需：{Math.max((data.rankTier?.nextGoal || 300) - (data.rankPoints || 0), 0)} EXP
                  </div>
                </div>
              </div>

              {/* Badges Matrix */}
              <div>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#cbd5e1' }}>
                  🏅 已解锁成就勋章（真人名师教学法则）：
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  {allBadgesCatalog.map((b, idx) => {
                    const isUnlocked = Array.isArray(data.badges) && data.badges.includes(b.name);
                    return (
                      <div
                        key={idx}
                        style={{
                          background: isUnlocked ? 'rgba(245, 158, 11, 0.1)' : 'rgba(15, 23, 42, 0.4)',
                          border: `1px solid ${isUnlocked ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255, 255, 255, 0.05)'}`,
                          borderRadius: '14px',
                          padding: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          opacity: isUnlocked ? 1 : 0.45
                        }}
                      >
                        <span style={{ fontSize: '1.8rem' }}>{b.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: isUnlocked ? '#fbbf24' : '#94a3b8' }}>
                            {b.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                            {b.desc}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Growth Philosophy Footer */}
              <div style={{
                background: 'rgba(37, 99, 235, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '14px',
                padding: '14px 16px',
                fontSize: '0.88rem',
                color: '#93c5fd',
                lineHeight: '1.5'
              }}>
                🌟 <strong>名师心法提醒</strong>：真正的学霸不是做对了多少题，而是敢不敢在草稿纸上试错，能不能用自己的话把难题讲给别人听（费曼逆向挑战）！每一次动手推导都在为你积累段位能量！
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
