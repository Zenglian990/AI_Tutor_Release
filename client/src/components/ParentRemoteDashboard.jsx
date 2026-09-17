import React, { useState, useEffect } from 'react';

/**
 * ParentRemoteDashboard
 * 家长端微信/手机随身学情看板 (纯只读·零配置直连)
 * 供曾先生及家长在手机微信、企微、移动端随时随地查看孩子当日学情与思维进阶
 */
export default function ParentRemoteDashboard({ token: initialToken }) {
  const [token, setToken] = useState(() => {
    if (initialToken) return initialToken;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token') || '';
  });

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeProfile, setActiveProfile] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchRemoteData = async (targetToken, switchProfile = '') => {
    if (!targetToken) {
      setError('缺少家长专属访问令牌，请使用伴学电脑端扫码进入');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      let url = `/api/parent/remote-view?token=${encodeURIComponent(targetToken)}`;
      if (switchProfile) {
        url += `&switch_profile_id=${encodeURIComponent(switchProfile)}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || '获取学情档案失败，访问链接可能已过期');
      } else {
        setData(json);
        setActiveProfile(json.profileId);
      }
    } catch (err) {
      setError('网络连接异常，无法连接到伴学服务器');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRemoteData(token);
  }, [token]);

  const handleSwitchProfile = (pId) => {
    setActiveProfile(pId);
    fetchRemoteData(token, pId);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#475569'
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🎒</div>
        <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>正在同步名师伴学动态...</div>
        <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '6px' }}>实时解析今日动脑时长与考点攻坚</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
        <h3 style={{ color: '#0f172a', margin: '0 0 10px 0' }}>学情访问已失效</h3>
        <p style={{ color: '#64748b', fontSize: '0.95rem', maxWidth: '340px', lineHeight: '1.6' }}>
          {error}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '20px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            padding: '10px 24px',
            borderRadius: '12px',
            fontWeight: '600',
            fontSize: '0.95rem',
            cursor: 'pointer'
          }}
        >
          重新尝试刷新
        </button>
      </div>
    );
  }

  const {
    studentName = '曾练',
    date = new Date().toLocaleDateString('zh-CN'),
    todayStats = {},
    overallStats = {},
    radarData = {},
    weakTags = [],
    recentMistakes = [],
    memoContent = [],
    comfortScore = '98 (放心特优)',
    availableProfiles = []
  } = data || {};

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #eff6ff 0%, #f8fafc 180px, #f1f5f9 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", sans-serif',
      paddingBottom: '40px',
      color: '#0f172a'
    }}>
      {/* Top Banner & Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
        color: '#fff',
        padding: '28px 20px 24px 20px',
        borderBottomLeftRadius: '24px',
        borderBottomRightRadius: '24px',
        boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.25)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(8px)',
              border: '2px solid rgba(255, 255, 255, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.8rem'
            }}>
              🧑‍🎓
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: '800' }}>{studentName}</h2>
                <span style={{
                  background: 'rgba(255, 255, 255, 0.25)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: '600'
                }}>
                  {overallStats.rankTier || '青铜求知者'}
                </span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#bfdbfe', marginTop: '4px' }}>
                名师 1对1 伴学学情档案 · {date}
              </div>
            </div>
          </div>

          <button
            onClick={() => fetchRemoteData(token, activeProfile)}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              color: '#fff',
              fontSize: '1rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="刷新最新数据"
          >
            🔄
          </button>
        </div>

        {/* Multi-child family profile switch */}
        {availableProfiles.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '18px', overflowX: 'auto', paddingBottom: '4px' }}>
            {availableProfiles.map(pId => (
              <button
                key={pId}
                onClick={() => handleSwitchProfile(pId)}
                style={{
                  background: activeProfile === pId ? '#fff' : 'rgba(255, 255, 255, 0.15)',
                  color: activeProfile === pId ? '#1e3a8a' : '#fff',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '4px 12px',
                  fontSize: '0.8rem',
                  fontWeight: activeProfile === pId ? '700' : '500',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                👤 孩子档案 ({pId})
              </button>
            ))}
          </div>
        )}

        {/* Reassurance Banner */}
        <div style={{
          marginTop: '18px',
          background: 'rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(10px)',
          borderRadius: '14px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <span style={{ fontSize: '0.82rem', color: '#e0f2fe' }}>🛡️ 家长放心陪伴指数</span>
          <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#6ee7b7' }}>{comfortScore}</span>
        </div>
      </div>

      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* 1. Today's Key Metrics */}
        <div style={{
          background: '#fff',
          borderRadius: '20px',
          padding: '18px',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#334155', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⚡</span> 今日深度动脑实况
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center' }}>
            <div style={{ background: '#f8fafc', padding: '12px 8px', borderRadius: '14px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#2563eb' }}>{todayStats.activeMinutes || 0}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>专注时长 (分)</div>
            </div>
            <div style={{ background: '#f8fafc', padding: '12px 8px', borderRadius: '14px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#059669' }}>{todayStats.chatCount || 0}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>启发互动 (轮)</div>
            </div>
            <div style={{ background: '#f8fafc', padding: '12px 8px', borderRadius: '14px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#d97706' }}>{todayStats.mistakesSolved || 0}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>复盘清空 (题)</div>
            </div>
          </div>
        </div>

        {/* 2. Today's Teacher Reassuring Memo */}
        <div style={{
          background: '#fff',
          borderRadius: '20px',
          padding: '18px',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#1e40af', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>💌</span> 名师伴学晚间家访便签
          </div>
          <div style={{
            background: '#f8fafc',
            borderLeft: '4px solid #2563eb',
            padding: '12px 14px',
            borderRadius: '0 12px 12px 0',
            lineHeight: '1.6',
            fontSize: '0.88rem',
            color: '#334155',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {memoContent.map((paragraph, idx) => (
              <div key={idx}>{paragraph}</div>
            ))}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '10px', textAlign: 'right' }}>
            * 严格遵循不直接给答案原则，全程引导动脑书写草稿
          </div>
        </div>

        {/* 3. 5-Dimensional Cognitive Radar Breakdown */}
        <div style={{
          background: '#fff',
          borderRadius: '20px',
          padding: '18px',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#334155', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📊</span> 五维高阶思维素养
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { label: '概念透彻度 (底层定理推演)', score: radarData.conceptClarity || 85, color: '#3b82f6' },
              { label: '计算严谨度 (草稿验算习惯)', score: radarData.computationPrecision || 88, color: '#10b981' },
              { label: '逻辑推演度 (分步有据论证)', score: radarData.logicDeduction || 90, color: '#8b5cf6' },
              { label: '主动探究力 (反向挑战费曼)', score: radarData.activeFocus || 92, color: '#f59e0b' },
              { label: '错题清零度 (艾宾浩斯抗遗忘)', score: radarData.habitConsistency || 95, color: '#ec4899' }
            ].map(item => (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px' }}>
                  <span style={{ color: '#475569', fontWeight: '500' }}>{item.label}</span>
                  <span style={{ fontWeight: '700', color: item.color }}>{item.score} 分</span>
                </div>
                <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${item.score}%`,
                    height: '100%',
                    background: item.color,
                    borderRadius: '4px',
                    transition: 'width 0.8s ease-out'
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Targeted Weak Topics (考点雷达) */}
        {weakTags.length > 0 && (
          <div style={{
            background: '#fff',
            borderRadius: '20px',
            padding: '18px',
            boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#334155', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🎯</span> 靶向攻坚薄弱考点
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {weakTags.map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    background: idx === 0 ? 'rgba(239, 68, 68, 0.08)' : '#f8fafc',
                    border: `1px solid ${idx === 0 ? '#fca5a5' : '#e2e8f0'}`,
                    color: idx === 0 ? '#dc2626' : '#334155',
                    borderRadius: '12px',
                    padding: '6px 12px',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>{idx === 0 ? '🔥' : '📌'}</span>
                  <span>{t.tag}</span>
                  <span style={{
                    background: idx === 0 ? '#ef4444' : '#cbd5e1',
                    color: '#fff',
                    borderRadius: '8px',
                    padding: '1px 5px',
                    fontSize: '0.72rem'
                  }}>
                    {t.count} 次错因
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Recent Mistakes Review Stage */}
        {recentMistakes.length > 0 && (
          <div style={{
            background: '#fff',
            borderRadius: '20px',
            padding: '18px',
            boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#334155', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🧼</span> 艾宾浩斯抗遗忘清空进度
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentMistakes.map(m => (
                <div
                  key={m.id}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                    borderRadius: '12px',
                    padding: '12px',
                    fontSize: '0.82rem',
                    lineHeight: '1.5'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '600', color: '#1e40af' }}>{m.subject} · {m.grade}</span>
                    <span style={{
                      color: m.reviewCount >= 3 ? '#059669' : (m.isDue ? '#ef4444' : '#64748b'),
                      fontWeight: '600'
                    }}>
                      {m.reviewCount >= 3 ? '✅ 已完全掌握' : (m.isDue ? '⏰ 今日待复习' : `第 ${m.reviewCount + 1} 阶演练`)}
                    </span>
                  </div>
                  <div style={{ color: '#0f172a', fontWeight: '500' }}>
                    {m.snippet}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '4px' }}>
                    错因剖析：{m.reason}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Share & Tips */}
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <button
            onClick={handleCopyLink}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '12px',
              fontSize: '0.88rem',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
            }}
          >
            {copied ? '✅ 已复制本页微信查看链接' : '🔗 复制本页链接，发送给微信群'}
          </button>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '12px' }}>
            曾先生智慧私教系统 · 家校协同名师督学技术支持
          </div>
        </div>

      </div>
    </div>
  );
}
