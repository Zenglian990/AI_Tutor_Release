import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useStore';

export default function StreakModal({ isOpen, onClose }) {
  const { currentProfile, authFetch } = useAppStore();
  const [streakData, setStreakData] = useState(null);
  const [gamificationProfile, setGamificationProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimNotice, setClaimNotice] = useState('');

  const fetchStreak = async () => {
    try {
      setLoading(true);
      const pid = encodeURIComponent(currentProfile?.id || 'default');
      const [streakRes, profRes] = await Promise.all([
        authFetch(`/api/gamification/streak?profile_id=${pid}`),
        authFetch(`/api/gamification/profile?profile_id=${pid}&student_name=${encodeURIComponent(currentProfile?.name || '同学')}`)
      ]);
      if (streakRes.ok) {
        const json = await streakRes.json();
        setStreakData(json.streak);
      }
      if (profRes.ok) {
        const pJson = await profRes.json();
        setGamificationProfile(pJson);
      }
    } catch (e) {
      console.error('Failed to load streak info:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStreak();
      setClaimSuccess(false);
      setClaimNotice('');
    }
  }, [isOpen, currentProfile?.id]);

  const handleClaimFreeze = async () => {
    try {
      setClaiming(true);
      const res = await authFetch('/api/gamification/claim-freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: currentProfile?.id || 'default' })
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setStreakData(prev => prev ? { ...prev, streakFreezeCount: json.streakFreezeCount } : prev);
        setClaimSuccess(true);
        setClaimNotice('');
        setTimeout(() => setClaimSuccess(false), 3000);
      } else {
        setClaimNotice(json.error || '暂时无法领取连胜冰冻卡');
      }
    } catch (e) {
      console.error('Claim freeze error:', e);
      setClaimNotice('网络异常，请稍后重试');
    } finally {
      setClaiming(false);
    }
  };

  if (!isOpen) return null;

  const currentStreak = streakData?.currentStreak || 0;
  const longestStreak = streakData?.longestStreak || 0;
  const freezeCount = streakData?.streakFreezeCount ?? 2;
  const isTodayDone = streakData?.isTodayCompleted || false;
  const peer = {
    level: 1,
    title: '初识小同桌',
    currentXp: 0,
    nextLevelXp: 100,
    progressPercent: 0,
    perk: '好奇反问与基础辅导',
    ...(streakData?.peerIntimacy || {})
  };

  // Calculate 7-day view strictly in Beijing Time (UTC+8)
  const daysOfWeek = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const bjNowDate = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const todayIdx = (bjNowDate.getUTCDay() + 6) % 7; // 0=Mon, 6=Sun

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div 
        className="modal-content streak-modal streak-modal-card"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '460px',
          width: '90%',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: '20px',
          padding: '24px',
          border: '1px solid rgba(251, 146, 60, 0.3)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(249, 115, 22, 0.15)',
          color: '#f8fafc',
          position: 'relative'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '32px', filter: 'drop-shadow(0 0 10px rgba(249, 115, 22, 0.6))' }}>🔥</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#ffedd5' }}>
                连续学习连胜榜
              </h2>
              <span style={{ fontSize: '12px', color: '#fdba74' }}>
                多邻国式行为自驱 · 每天 1 题守护连胜
              </span>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Streak Big Number */}
        <div style={{
          textAlign: 'center',
          padding: '20px 10px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '16px',
          border: '1px solid rgba(251, 146, 60, 0.2)',
          marginBottom: '20px'
        }}>
          <div style={{ fontSize: '56px', fontWeight: '900', color: '#fb923c', lineHeight: 1, textShadow: '0 0 20px rgba(249, 115, 22, 0.4)' }}>
            {currentStreak}
            <span style={{ fontSize: '20px', marginLeft: '6px', color: '#fdba74' }}>天</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '13px', color: isTodayDone ? '#4ade80' : '#fbbf24', fontWeight: 'bold' }}>
            {isTodayDone ? '✨ 今日学习打卡已完成，连胜燃烧中！' : '⚡ 今天还没完成提问或做题，快来守护连胜！'}
          </p>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            历史最高记录：{longestStreak} 天
          </div>
        </div>

        {/* 7-Day Visual Mini Calendar (基于真实连胜天数/活跃日期渲染，绝不伪造历史打卡) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '22px' }}>
          {daysOfWeek.map((day, idx) => {
            const isToday = idx === todayIdx;
            const activeWeekDates = Array.isArray(streakData?.activeDatesWeek) ? streakData.activeDatesWeek : null;
            let isCompleted = false;
            if (activeWeekDates) {
              const targetDate = new Date(Date.now() + 8 * 60 * 60 * 1000 - (todayIdx - idx) * 24 * 60 * 60 * 1000);
              const iso = `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(2, '0')}-${String(targetDate.getUTCDate()).padStart(2, '0')}`;
              isCompleted = activeWeekDates.includes(iso);
            } else if (isToday) {
              isCompleted = isTodayDone;
            } else if (idx < todayIdx && currentStreak > 0) {
              const daysAgo = todayIdx - idx;
              const streakTailOffset = isTodayDone ? currentStreak - 1 : currentStreak;
              isCompleted = daysAgo <= streakTailOffset;
            }
            return (
              <div 
                key={day}
                style={{
                  flex: 1,
                  padding: '8px 2px',
                  borderRadius: '10px',
                  textAlign: 'center',
                  background: isCompleted 
                    ? 'linear-gradient(180deg, rgba(249, 115, 22, 0.3) 0%, rgba(234, 88, 12, 0.1) 100%)' 
                    : 'rgba(255, 255, 255, 0.04)',
                  border: isToday ? '1px solid #fb923c' : '1px solid rgba(255, 255, 255, 0.05)'
                }}
              >
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>{day}</div>
                <div style={{ fontSize: '16px' }}>{isCompleted ? '🔥' : '⚪'}</div>
              </div>
            );
          })}
        </div>

        {/* Streak Freeze Shield (Loss Aversion Protection) */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.05) 100%)',
          borderRadius: '14px',
          padding: '14px 16px',
          border: '1px solid rgba(96, 165, 250, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>🛡️</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#93c5fd' }}>
                连胜冰冻卡（保护罩）
              </div>
              <div style={{ fontSize: '12px', color: '#bfdbfe' }}>
                断卡或生病时自动抵扣，连胜不归零（剩余: {freezeCount} 张）
              </div>
            </div>
          </div>
          <button
            onClick={handleClaimFreeze}
            disabled={claiming || freezeCount >= 5}
            style={{
              background: freezeCount >= 5 ? 'rgba(255, 255, 255, 0.1)' : '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: freezeCount >= 5 ? 'not-allowed' : 'pointer'
            }}
          >
            {claimSuccess ? '已领取 ✓' : (freezeCount >= 5 ? '已满额' : '+补充')}
          </button>
        </div>
        {claimNotice && (
          <div style={{ fontSize: '12px', color: '#fbbf24', marginTop: '-12px', marginBottom: '14px', paddingLeft: '4px' }}>
            💡 {claimNotice}
          </div>
        )}

        {/* Phase 3: 真实错题消灭进度与勋章陈列（严格绑定 mistakes 表真实复盘/消灭数） */}
        {gamificationProfile && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.08)',
            borderRadius: '14px',
            padding: '12px 14px',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#34d399' }}>
                🏆 真实攻坚战绩 · {gamificationProfile.rankTier?.icon || '🥉'} {gamificationProfile.rankTier?.name || '求知学童'}
              </span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                已复盘 <strong>{gamificationProfile.reviewedMistakesCount || 0}</strong> 题 · 已消灭 <strong>{gamificationProfile.masteredMistakesCount || 0}</strong> 题
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(gamificationProfile.badges || ['初露锋芒']).map((b) => (
                <span key={b} style={{
                  fontSize: '11px',
                  padding: '3px 9px',
                  borderRadius: '999px',
                  background: b === '错题粉碎机' || b === '周末清零王' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  border: b === '错题粉碎机' || b === '周末清零王' ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid rgba(255, 255, 255, 0.14)',
                  color: b === '错题粉碎机' || b === '周末清零王' ? '#6ee7b7' : '#e2e8f0',
                  fontWeight: 600
                }}>
                  🏅 {b}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Virtual Peer Student Intimacy (同桌小明羁绊) */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: '14px',
          padding: '16px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '22px' }}>🧑‍🤝‍🧑</span>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#f1f5f9' }}>
                同桌小明羁绊：{peer.title}
              </span>
            </div>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              background: 'rgba(234, 179, 8, 0.2)',
              color: '#facc15',
              fontWeight: 'bold'
            }}>
              Lv.{peer.level}
            </span>
          </div>

          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>
            当前默契特权：{peer.perk}
          </div>

          {/* Progress Bar */}
          <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${peer.progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)',
              borderRadius: '4px',
              transition: 'width 0.4s ease'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
            <span>当前经验：{peer.currentXp} XP</span>
            <span>下一阶段：{peer.nextLevelXp} XP</span>
          </div>
        </div>

      </div>
    </div>
  );
}
